do $$
begin
  if not exists (select 1 from pg_type where typname = 'plaid_webhook_verification_status') then
    create type public.plaid_webhook_verification_status as enum (
      'verified',
      'bypassed_dev',
      'failed'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plaid_webhook_processing_status') then
    create type public.plaid_webhook_processing_status as enum (
      'received',
      'ignored',
      'enqueued',
      'failed'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pip_sync_job_reason') then
    create type public.pip_sync_job_reason as enum (
      'plaid_webhook',
      'scheduled',
      'app_open',
      'manual',
      'repair',
      'account_selection',
      'settings_change',
      'account_change'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pip_sync_job_status') then
    create type public.pip_sync_job_status as enum (
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pip_reaction_trigger') then
    create type public.pip_reaction_trigger as enum (
      'plaid_webhook',
      'scheduled_sync',
      'app_open_refresh',
      'manual_refresh',
      'account_change',
      'settings_change',
      'repair',
      'account_selection'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pip_reaction_type') then
    create type public.pip_reaction_type as enum (
      'small_lift',
      'big_lift',
      'small_drop',
      'big_drop',
      'shortfall',
      'recovered',
      'data_issue',
      'connection_repaired',
      'cash_tight',
      'low_confidence'
    );
  end if;
end $$;

create table if not exists public.plaid_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  item_id text,
  webhook_type text not null,
  webhook_code text not null,
  environment text,
  payload jsonb not null,
  body_sha256 text,
  verification_status public.plaid_webhook_verification_status not null default 'failed',
  processing_status public.plaid_webhook_processing_status not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create table if not exists public.pip_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.financial_provider not null,
  institution_id uuid references public.connected_institutions(id) on delete cascade,
  reason public.pip_sync_job_reason not null,
  status public.pip_sync_job_status not null default 'pending',
  source_webhook_event_id uuid references public.plaid_webhook_events(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  priority integer not null default 100,
  dedupe_key text,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  account_count integer not null default 0,
  transaction_count integer not null default 0,
  balance_count integer not null default 0,
  created_reaction_type public.pip_reaction_type,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plaid_webhook_events
  add column if not exists source_sync_job_id uuid references public.pip_sync_jobs(id) on delete set null;

alter table public.plaid_webhook_events
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists public.pip_reaction_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_snapshot_id uuid references public.pip_cash_snapshots(id) on delete set null,
  current_snapshot_id uuid references public.pip_cash_snapshots(id) on delete set null,
  previous_state text,
  current_state text not null,
  spendable_delta_cents integer not null default 0,
  behavior_adjustment_delta_cents integer not null default 0,
  shortfall_delta_cents integer not null default 0,
  cash_reality_adjustment_delta_cents integer not null default 0,
  confidence_change text,
  trigger public.pip_reaction_trigger not null,
  reaction_type public.pip_reaction_type not null,
  intensity integer not null check (intensity between 1 and 3),
  summary text,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists plaid_webhook_events_item_received_idx
on public.plaid_webhook_events(item_id, received_at desc);

create index if not exists plaid_webhook_events_processing_idx
on public.plaid_webhook_events(processing_status, received_at);

create index if not exists plaid_webhook_events_source_sync_job_idx
on public.plaid_webhook_events(source_sync_job_id);

create index if not exists plaid_webhook_events_user_received_idx
on public.plaid_webhook_events(user_id, received_at desc);

create index if not exists pip_sync_jobs_pending_idx
on public.pip_sync_jobs(status, available_at, priority, created_at);

create index if not exists pip_sync_jobs_user_created_idx
on public.pip_sync_jobs(user_id, created_at desc);

create index if not exists pip_sync_jobs_source_webhook_idx
on public.pip_sync_jobs(source_webhook_event_id);

create unique index if not exists pip_sync_jobs_dedupe_pending_idx
on public.pip_sync_jobs(dedupe_key)
where status in ('pending', 'running') and dedupe_key is not null;

create index if not exists pip_reaction_events_user_created_idx
on public.pip_reaction_events(user_id, created_at desc);

create index if not exists pip_reaction_events_user_unseen_idx
on public.pip_reaction_events(user_id, seen_at, created_at desc);

alter table public.plaid_webhook_events enable row level security;
alter table public.pip_sync_jobs enable row level security;
alter table public.pip_reaction_events enable row level security;

grant select, insert, update, delete on public.plaid_webhook_events to service_role;
grant select, insert, update, delete on public.pip_sync_jobs to service_role;
grant select, insert, update, delete on public.pip_reaction_events to service_role;
grant select, update(seen_at) on public.pip_reaction_events to authenticated;

drop policy if exists "Users can view their Pip reaction events." on public.pip_reaction_events;
drop policy if exists "Users can mark their Pip reactions seen." on public.pip_reaction_events;

create policy "Users can view their Pip reaction events."
on public.pip_reaction_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can mark their Pip reactions seen."
on public.pip_reaction_events for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

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
