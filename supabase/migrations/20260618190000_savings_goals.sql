create type public.savings_goal_status as enum ('active', 'paused', 'completed', 'archived');

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  target_amount_cents integer not null check (target_amount_cents > 0),
  target_date date,
  starting_amount_cents integer not null default 0 check (starting_amount_cents >= 0),
  current_amount_cents integer not null default 0 check (current_amount_cents >= 0),
  monthly_contribution_cents integer not null default 0 check (monthly_contribution_cents >= 0),
  include_in_spendable_cash boolean not null default false,
  status public.savings_goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_id_status_idx
on public.savings_goals(user_id, status);

grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.savings_goals to service_role;

alter table public.savings_goals enable row level security;

create policy "Users can view their savings goals."
on public.savings_goals for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their savings goals."
on public.savings_goals for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their savings goals."
on public.savings_goals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their savings goals."
on public.savings_goals for delete
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

  delete from public.ai_response_reports where user_id = current_user_id;
  delete from public.tester_feedback where user_id = current_user_id;
  delete from public.plaid_webhook_events
  where user_id = current_user_id
     or source_sync_job_id in (
    select id from public.pip_sync_jobs where user_id = current_user_id
  );
  delete from public.pip_reaction_events where user_id = current_user_id;
  delete from public.pip_sync_jobs where user_id = current_user_id;
  delete from public.agent_chat_turns where user_id = current_user_id;
  delete from public.product_events where user_id = current_user_id;
  delete from public.savings_goals where user_id = current_user_id;
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
