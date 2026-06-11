alter table public.connected_institutions
  add column if not exists provider_institution_id text;

create index if not exists connected_institutions_user_provider_identity_idx
on public.connected_institutions(user_id, provider, provider_institution_id)
where provider_institution_id is not null;

alter table public.accounts
  add column if not exists active boolean not null default true;

create index if not exists accounts_user_id_active_idx
on public.accounts(user_id, active);

create table if not exists public.account_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  include_in_pip_cash boolean not null default true,
  is_protected_savings_override boolean,
  user_label text,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id)
);

grant select, insert, update, delete on public.account_preferences to authenticated;
grant select, insert, update, delete on public.account_preferences to service_role;

alter table public.account_preferences enable row level security;

create index if not exists account_preferences_user_id_idx
on public.account_preferences(user_id);

create index if not exists account_preferences_account_id_idx
on public.account_preferences(account_id);

create policy "Users can view their account preferences."
on public.account_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their account preferences."
on public.account_preferences for insert
to authenticated
with check (((select auth.uid()) = user_id)
  and exists (
    select 1
    from public.accounts
    where accounts.id = account_preferences.account_id
      and accounts.user_id = (select auth.uid())
  )
);

create policy "Users can update their account preferences."
on public.account_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check (((select auth.uid()) = user_id)
  and exists (
    select 1
    from public.accounts
    where accounts.id = account_preferences.account_id
      and accounts.user_id = (select auth.uid())
  )
);

create policy "Users can delete their account preferences."
on public.account_preferences for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.delete_current_user_financial_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.data_deletion_requests (user_id, completed_at, status)
  values (current_user_id, now(), 'completed');

  delete from public.product_events where user_id = current_user_id;
  delete from public.pip_cash_snapshots where user_id = current_user_id;
  delete from public.sync_runs where user_id = current_user_id;
  delete from public.missing_card_preferences where user_id = current_user_id;
  delete from public.account_preferences where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.accounts where user_id = current_user_id;
  delete from public.connected_institutions where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;
end;
$$;

grant execute on function public.delete_current_user_financial_data() to authenticated;
