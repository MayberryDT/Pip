create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create type public.account_kind as enum (
  'checking',
  'savings',
  'credit_card',
  'loan',
  'other'
);

create type public.transaction_kind as enum (
  'income',
  'purchase',
  'rent',
  'credit_card_payment',
  'transfer',
  'refund',
  'fee',
  'unknown'
);

create type public.financial_provider as enum (
  'mock',
  'teller',
  'plaid'
);

create type public.connection_status as enum (
  'connected',
  'mocked',
  'stale',
  'failed',
  'revoked'
);

create type public.sync_status as enum (
  'started',
  'succeeded',
  'failed'
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  protected_savings_monthly_cents integer not null default 20000
    check (protected_savings_monthly_cents >= 0),
  manual_refresh_only boolean not null default true,
  invite_accepted_at timestamptz,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connected_institutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.financial_provider not null,
  institution_name text not null,
  status public.connection_status not null default 'connected',
  last_successful_sync_at timestamptz,
  stale_after timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.provider_credentials (
  institution_id uuid primary key references public.connected_institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.financial_provider not null,
  teller_enrollment_id text,
  plaid_item_id text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  certificate_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references public.connected_institutions(id) on delete cascade,
  provider_account_id text not null,
  name text not null,
  institution_name text not null,
  kind public.account_kind not null,
  balance_cents integer not null,
  available_balance_cents integer,
  last_four text,
  is_protected_savings boolean not null default false,
  raw_provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_account_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_transaction_id text not null,
  date date not null,
  description text not null,
  merchant_name text,
  amount_cents integer not null,
  category text,
  kind public.transaction_kind,
  pending boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  raw_provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_transaction_id)
);

create table public.free_cash_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of_date date not null,
  free_cash_today_cents integer not null,
  rolling_net_cents integer not null,
  income_total_cents integer not null,
  spending_total_cents integer not null,
  refund_total_cents integer not null,
  protected_savings_monthly_cents integer not null,
  result jsonb not null,
  stale boolean not null default false,
  source_sync_run_id uuid,
  created_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references public.connected_institutions(id) on delete set null,
  provider public.financial_provider not null,
  status public.sync_status not null default 'started',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  account_count integer not null default 0,
  transaction_count integer not null default 0,
  balance_count integer not null default 0,
  error_code text,
  error_message text
);

alter table public.free_cash_snapshots
  add constraint free_cash_snapshots_source_sync_run_id_fkey
  foreign key (source_sync_run_id) references public.sync_runs(id) on delete set null;

create table public.missing_card_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issuer_name text not null,
  suppressed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, issuer_name)
);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'completed'
);

create table public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_at timestamptz not null default now(),
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);

create index user_settings_user_id_idx on public.user_settings(user_id);
create index connected_institutions_user_id_idx on public.connected_institutions(user_id);
create index accounts_user_id_idx on public.accounts(user_id);
create index accounts_user_id_institution_id_idx on public.accounts(user_id, institution_id);
create index transactions_user_id_idx on public.transactions(user_id);
create index transactions_account_id_date_idx on public.transactions(account_id, date desc);
create index transactions_user_id_date_idx on public.transactions(user_id, date desc);
create index free_cash_snapshots_user_id_created_at_idx on public.free_cash_snapshots(user_id, created_at desc);
create index sync_runs_user_id_started_at_idx on public.sync_runs(user_id, started_at desc);
create index missing_card_preferences_user_id_idx on public.missing_card_preferences(user_id);
create index product_events_user_id_created_at_idx on public.product_events(user_id, created_at desc);
create index data_deletion_requests_user_id_idx on public.data_deletion_requests(user_id);
create index provider_credentials_user_id_idx on private.provider_credentials(user_id);

alter table public.user_settings enable row level security;
alter table public.connected_institutions enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.free_cash_snapshots enable row level security;
alter table public.sync_runs enable row level security;
alter table public.missing_card_preferences enable row level security;
alter table public.product_events enable row level security;
alter table public.data_deletion_requests enable row level security;
alter table public.beta_invites enable row level security;
alter table private.provider_credentials enable row level security;

create policy "Users can view their settings."
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their settings."
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their settings."
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their settings."
on public.user_settings for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their institutions."
on public.connected_institutions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their institutions."
on public.connected_institutions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their institutions."
on public.connected_institutions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their institutions."
on public.connected_institutions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their accounts."
on public.accounts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their accounts."
on public.accounts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their accounts."
on public.accounts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their accounts."
on public.accounts for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their transactions."
on public.transactions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their transactions."
on public.transactions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their transactions."
on public.transactions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their transactions."
on public.transactions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their Free Cash snapshots."
on public.free_cash_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their Free Cash snapshots."
on public.free_cash_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their Free Cash snapshots."
on public.free_cash_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their sync runs."
on public.sync_runs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their sync runs."
on public.sync_runs for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their sync runs."
on public.sync_runs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view their missing-card preferences."
on public.missing_card_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their missing-card preferences."
on public.missing_card_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their missing-card preferences."
on public.missing_card_preferences for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their product events."
on public.product_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can view their product events."
on public.product_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can request their data deletion."
on public.data_deletion_requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can view their data deletion requests."
on public.data_deletion_requests for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their accepted invite."
on public.beta_invites for select
to authenticated
using (accepted_by_user_id = (select auth.uid()));

create policy "Service role manages provider credentials."
on private.provider_credentials
for all
to service_role
using (true)
with check (true);

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
  delete from public.free_cash_snapshots where user_id = current_user_id;
  delete from public.sync_runs where user_id = current_user_id;
  delete from public.missing_card_preferences where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.accounts where user_id = current_user_id;
  delete from public.connected_institutions where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;
end;
$$;

grant execute on function public.delete_current_user_financial_data() to authenticated;
