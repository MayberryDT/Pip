alter table public.marketing_waitlist
  add column if not exists newsletter_opt_in_at timestamptz,
  add column if not exists newsletter_unsubscribed_at timestamptz,
  add column if not exists newsletter_unsubscribe_reason text,
  add column if not exists email_suppressed_at timestamptz,
  add column if not exists email_suppression_reason text,
  add column if not exists email_provider_contact_id text,
  add column if not exists waitlist_confirmation_reserved_at timestamptz,
  add column if not exists waitlist_confirmation_sent_at timestamptz,
  add column if not exists app_waitlist_confirmation_reserved_at timestamptz,
  add column if not exists app_waitlist_confirmation_sent_at timestamptz,
  add column if not exists invite_email_reserved_at timestamptz,
  add column if not exists invite_email_sent_at timestamptz;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null
    check (normalized_email = lower(trim(normalized_email)) and position('@' in normalized_email) > 1),
  event_type text not null
    check (event_type in (
      'waitlist_confirmation',
      'app_waitlist_confirmation',
      'invite_granted',
      'newsletter_export',
      'newsletter_unsubscribe',
      'provider_bounce',
      'provider_complaint',
      'provider_delivery',
      'provider_duplicate'
    )),
  provider text not null default 'internal',
  provider_event_id text unique,
  provider_message_id text,
  status text not null
    check (status in ('queued', 'sent', 'skipped', 'failed', 'delivered', 'bounced', 'complained', 'processed', 'ignored')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_events_normalized_email_created_at_idx
  on public.email_events(normalized_email, created_at desc);

create index if not exists email_events_event_type_created_at_idx
  on public.email_events(event_type, created_at desc);

create index if not exists marketing_waitlist_newsletter_active_idx
  on public.marketing_waitlist(newsletter_opt_in_at, normalized_email)
  where newsletter_opt_in_at is not null
    and newsletter_unsubscribed_at is null
    and email_suppressed_at is null;

alter table public.email_events enable row level security;

comment on table public.email_events is
  'Provider-neutral email delivery and suppression event history. Server routes write through service role; no direct public table policies.';

comment on column public.marketing_waitlist.newsletter_opt_in_at is
  'Time the contact consented to waitlist/product update emails.';

comment on column public.marketing_waitlist.email_suppressed_at is
  'Set after hard bounce or complaint. Suppresses all future email delivery until manually cleared.';
