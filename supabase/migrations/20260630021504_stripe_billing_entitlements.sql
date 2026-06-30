create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  normalized_email text not null
    check (normalized_email = lower(trim(normalized_email)) and position('@' in normalized_email) > 1),
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id) references public.billing_customers(user_id) on delete cascade,
  foreign key (stripe_customer_id) references public.billing_customers(stripe_customer_id) on delete cascade
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists billing_customers_normalized_email_idx
  on public.billing_customers(normalized_email);

create index if not exists billing_subscriptions_user_status_idx
  on public.billing_subscriptions(user_id, status, current_period_end desc);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on table public.billing_customers from public, anon, authenticated;
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on public.billing_customers to service_role;
grant select, insert, update, delete on public.billing_subscriptions to service_role;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;

comment on table public.billing_customers is
  'Server-owned Stripe customer mapping. No browser writes; app reads through server routes.';

comment on table public.billing_subscriptions is
  'Server-owned Stripe subscription state derived from signed Stripe webhooks.';

comment on table public.stripe_webhook_events is
  'Idempotency guard for signed Stripe webhook events.';
