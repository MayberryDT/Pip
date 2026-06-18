create table if not exists public.ai_response_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  message_id text not null,
  reason text not null check (
    reason in (
      'inaccurate_financial_explanation',
      'unsafe_or_offensive',
      'privacy_concern',
      'confusing_or_misleading',
      'other'
    )
  ),
  details text,
  response_excerpt text,
  platform text not null default 'web',
  app_version text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_response_reports_user_id_created_at_idx
  on public.ai_response_reports(user_id, created_at desc);

create index if not exists ai_response_reports_status_created_at_idx
  on public.ai_response_reports(status, created_at desc);

create table if not exists public.tester_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  message text not null,
  platform text not null default 'web',
  app_version text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tester_feedback_user_id_created_at_idx
  on public.tester_feedback(user_id, created_at desc);

create index if not exists tester_feedback_status_created_at_idx
  on public.tester_feedback(status, created_at desc);

alter table public.ai_response_reports enable row level security;
alter table public.tester_feedback enable row level security;

grant select, insert, delete on public.ai_response_reports to authenticated;
grant select, insert, delete on public.tester_feedback to authenticated;

drop policy if exists "Users can create their AI response reports." on public.ai_response_reports;
create policy "Users can create their AI response reports."
on public.ai_response_reports for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their AI response reports." on public.ai_response_reports;
create policy "Users can view their AI response reports."
on public.ai_response_reports for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their AI response reports." on public.ai_response_reports;
create policy "Users can delete their AI response reports."
on public.ai_response_reports for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their tester feedback." on public.tester_feedback;
create policy "Users can create their tester feedback."
on public.tester_feedback for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their tester feedback." on public.tester_feedback;
create policy "Users can view their tester feedback."
on public.tester_feedback for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their tester feedback." on public.tester_feedback;
create policy "Users can delete their tester feedback."
on public.tester_feedback for delete
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
