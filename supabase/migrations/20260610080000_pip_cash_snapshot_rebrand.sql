alter table if exists public.free_cash_snapshots
rename to pip_cash_snapshots;

alter table if exists public.pip_cash_snapshots
rename column free_cash_today_cents to pip_cash_today_cents;

alter table if exists public.pip_cash_snapshots
rename constraint free_cash_snapshots_source_sync_run_id_fkey to pip_cash_snapshots_source_sync_run_id_fkey;

alter index if exists free_cash_snapshots_user_id_created_at_idx
rename to pip_cash_snapshots_user_id_created_at_idx;

alter index if exists free_cash_snapshots_source_sync_run_id_idx
rename to pip_cash_snapshots_source_sync_run_id_idx;

create index if not exists pip_cash_snapshots_source_sync_run_id_idx
on public.pip_cash_snapshots(source_sync_run_id);

alter table public.pip_cash_snapshots enable row level security;

drop policy if exists "Users can view their Free Cash snapshots." on public.pip_cash_snapshots;
drop policy if exists "Users can create their Free Cash snapshots." on public.pip_cash_snapshots;
drop policy if exists "Users can delete their Free Cash snapshots." on public.pip_cash_snapshots;
drop policy if exists "Users can mark their Free Cash snapshots stale." on public.pip_cash_snapshots;

create policy "Users can view their PIP cash snapshots."
on public.pip_cash_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their PIP cash snapshots."
on public.pip_cash_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can mark their PIP cash snapshots stale."
on public.pip_cash_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their PIP cash snapshots."
on public.pip_cash_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);

update public.product_events
set event_name = 'pip_cash_viewed'
where event_name = 'free_cash_viewed';

update public.product_events
set event_name = 'negative_pip_cash_follow_up'
where event_name = 'negative_free_cash_follow_up';

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

  delete from public.agent_chat_turns where user_id = current_user_id;
  delete from public.product_events where user_id = current_user_id;
  delete from public.pip_cash_snapshots where user_id = current_user_id;
  delete from public.sync_runs where user_id = current_user_id;
  delete from public.missing_card_preferences where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.accounts where user_id = current_user_id;
  delete from public.connected_institutions where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;
end;
$$;
