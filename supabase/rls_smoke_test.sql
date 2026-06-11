-- Rollback-only RLS smoke test for the private-beta financial tables.
--
-- Run this in the Supabase SQL editor or through the Supabase connector after
-- migrations are applied. The expected result is one visible row per table for
-- user A, zero visible rows for user B, and zero cross-user mutations.

begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-00000000a101',
    'authenticated',
    'authenticated',
    'rls-a@example.invalid',
    now(),
    now(),
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-00000000b202',
    'authenticated',
    'authenticated',
    'rls-b@example.invalid',
    now(),
    now(),
    false,
    false
  );

insert into public.user_settings (user_id, protected_savings_monthly_cents)
values
  ('00000000-0000-0000-0000-00000000a101', 20000),
  ('00000000-0000-0000-0000-00000000b202', 30000);

insert into public.connected_institutions (id, user_id, provider, institution_name, status)
values
  (
    '00000000-0000-0000-0000-00000000c101',
    '00000000-0000-0000-0000-00000000a101',
    'plaid',
    'RLS Bank A',
    'connected'
  ),
  (
    '00000000-0000-0000-0000-00000000d202',
    '00000000-0000-0000-0000-00000000b202',
    'plaid',
    'RLS Bank B',
    'connected'
  );

insert into public.accounts (
  id,
  user_id,
  institution_id,
  provider_account_id,
  name,
  institution_name,
  kind,
  balance_cents
)
values
  (
    '00000000-0000-0000-0000-00000000e101',
    '00000000-0000-0000-0000-00000000a101',
    '00000000-0000-0000-0000-00000000c101',
    'rls-account-a',
    'Checking A',
    'RLS Bank A',
    'checking',
    10000
  ),
  (
    '00000000-0000-0000-0000-00000000f202',
    '00000000-0000-0000-0000-00000000b202',
    '00000000-0000-0000-0000-00000000d202',
    'rls-account-b',
    'Checking B',
    'RLS Bank B',
    'checking',
    20000
  );

insert into public.transactions (
  user_id,
  account_id,
  provider_transaction_id,
  date,
  description,
  amount_cents,
  kind
)
values
  (
    '00000000-0000-0000-0000-00000000a101',
    '00000000-0000-0000-0000-00000000e101',
    'rls-tx-a',
    current_date,
    'Visible A',
    -1000,
    'purchase'
  ),
  (
    '00000000-0000-0000-0000-00000000b202',
    '00000000-0000-0000-0000-00000000f202',
    'rls-tx-b',
    current_date,
    'Hidden B',
    -2000,
    'purchase'
  );

insert into public.sync_runs (
  id,
  user_id,
  institution_id,
  provider,
  status,
  completed_at,
  duration_ms,
  account_count,
  transaction_count,
  balance_count
)
values
  (
    '00000000-0000-0000-0000-000000001101',
    '00000000-0000-0000-0000-00000000a101',
    '00000000-0000-0000-0000-00000000c101',
    'plaid',
    'succeeded',
    now(),
    10,
    1,
    1,
    1
  ),
  (
    '00000000-0000-0000-0000-000000002202',
    '00000000-0000-0000-0000-00000000b202',
    '00000000-0000-0000-0000-00000000d202',
    'plaid',
    'succeeded',
    now(),
    20,
    1,
    1,
    1
  );

insert into public.pip_cash_snapshots (
  user_id,
  as_of_date,
  pip_cash_today_cents,
  rolling_net_cents,
  income_total_cents,
  spending_total_cents,
  refund_total_cents,
  protected_savings_monthly_cents,
  result,
  source_sync_run_id
)
values
  (
    '00000000-0000-0000-0000-00000000a101',
    current_date,
    1000,
    30000,
    40000,
    10000,
    0,
    20000,
    '{}'::jsonb,
    '00000000-0000-0000-0000-000000001101'
  ),
  (
    '00000000-0000-0000-0000-00000000b202',
    current_date,
    2000,
    60000,
    80000,
    20000,
    0,
    30000,
    '{}'::jsonb,
    '00000000-0000-0000-0000-000000002202'
  );

insert into public.missing_card_preferences (user_id, issuer_name)
values
  ('00000000-0000-0000-0000-00000000a101', 'Issuer A'),
  ('00000000-0000-0000-0000-00000000b202', 'Issuer B');

insert into public.product_events (user_id, event_name, properties)
values
  ('00000000-0000-0000-0000-00000000a101', 'pip_cash_viewed', '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000b202', 'pip_cash_viewed', '{}'::jsonb);

insert into public.data_deletion_requests (user_id, completed_at, status)
values
  ('00000000-0000-0000-0000-00000000a101', now(), 'completed'),
  ('00000000-0000-0000-0000-00000000b202', now(), 'completed');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a101';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}';

with attempted_cross_user_account_update as (
  update public.accounts
  set balance_cents = 99999
  where user_id = '00000000-0000-0000-0000-00000000b202'
  returning id
),
attempted_cross_user_transaction_delete as (
  delete from public.transactions
  where user_id = '00000000-0000-0000-0000-00000000b202'
  returning id
),
attempted_cross_user_event_delete as (
  delete from public.product_events
  where user_id = '00000000-0000-0000-0000-00000000b202'
  returning id
)
select
  current_user as acting_role,
  (select auth.uid()) as acting_user_id,
  (select count(*) from public.user_settings) as visible_user_settings,
  (select count(*) from public.connected_institutions) as visible_connected_institutions,
  (select count(*) from public.accounts) as visible_accounts,
  (select count(*) from public.transactions) as visible_transactions,
  (select count(*) from public.sync_runs) as visible_sync_runs,
  (select count(*) from public.pip_cash_snapshots) as visible_pip_cash_snapshots,
  (select count(*) from public.missing_card_preferences) as visible_missing_card_preferences,
  (select count(*) from public.product_events) as visible_product_events,
  (select count(*) from public.data_deletion_requests) as visible_data_deletion_requests,
  (select count(*) from public.accounts where user_id = '00000000-0000-0000-0000-00000000b202') as visible_other_user_accounts,
  (select count(*) from public.transactions where user_id = '00000000-0000-0000-0000-00000000b202') as visible_other_user_transactions,
  (select count(*) from attempted_cross_user_account_update) as cross_user_account_updates,
  (select count(*) from attempted_cross_user_transaction_delete) as cross_user_transaction_deletes,
  (select count(*) from attempted_cross_user_event_delete) as cross_user_event_deletes;

rollback;
