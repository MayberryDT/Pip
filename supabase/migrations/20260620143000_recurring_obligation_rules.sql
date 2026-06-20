create type public.recurring_obligation_rule_source as enum (
  'user_confirmed',
  'user_correction',
  'auto_detected'
);

create type public.recurring_obligation_rule_status as enum (
  'active',
  'ignored'
);

create table public.recurring_obligation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  expected_day integer check (expected_day between 1 and 31),
  cadence text not null default 'monthly' check (cadence = 'monthly'),
  source public.recurring_obligation_rule_source not null,
  status public.recurring_obligation_rule_status not null default 'active',
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index recurring_obligation_rules_user_status_idx
on public.recurring_obligation_rules(user_id, status);

grant select, insert, update, delete on public.recurring_obligation_rules to authenticated;
grant select, insert, update, delete on public.recurring_obligation_rules to service_role;

alter table public.recurring_obligation_rules enable row level security;

create policy "Users can view their recurring obligation rules."
on public.recurring_obligation_rules for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their recurring obligation rules."
on public.recurring_obligation_rules for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their recurring obligation rules."
on public.recurring_obligation_rules for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their recurring obligation rules."
on public.recurring_obligation_rules for delete
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
  delete from public.recurring_obligation_rules where user_id = current_user_id;
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
