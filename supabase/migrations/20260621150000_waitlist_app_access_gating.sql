alter table public.marketing_waitlist
  add column if not exists last_source_page text,
  add column if not exists last_referrer text,
  add column if not exists last_utm_source text,
  add column if not exists last_utm_medium text,
  add column if not exists last_utm_campaign text,
  add column if not exists app_waitlist_requested_at timestamptz,
  add column if not exists app_waitlist_last_requested_at timestamptz,
  add column if not exists app_waitlist_request_count integer not null default 0
    check (app_waitlist_request_count >= 0),
  add column if not exists auth_user_id uuid;

update public.marketing_waitlist
set
  last_source_page = coalesce(last_source_page, source_page),
  last_referrer = coalesce(last_referrer, referrer),
  last_utm_source = coalesce(last_utm_source, utm_source),
  last_utm_medium = coalesce(last_utm_medium, utm_medium),
  last_utm_campaign = coalesce(last_utm_campaign, utm_campaign)
where last_source_page is null;

create table if not exists public.app_access_grants (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null unique
    check (normalized_email = lower(trim(normalized_email)) and position('@' in normalized_email) > 1),
  display_email text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  source text not null default 'operator',
  note text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  first_accessed_at timestamptz,
  last_accessed_at timestamptz,
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

create index if not exists app_access_grants_status_granted_at_idx
  on public.app_access_grants(status, granted_at desc);

create index if not exists marketing_waitlist_app_requested_idx
  on public.marketing_waitlist(app_waitlist_last_requested_at desc)
  where app_waitlist_last_requested_at is not null;

alter table public.app_access_grants enable row level security;

comment on table public.app_access_grants is
  'Operator-managed app access grants keyed by verified OAuth email. Server routes write through service role; no direct public table policies.';

comment on column public.marketing_waitlist.app_waitlist_requested_at is
  'First time this email reached /app through verified OAuth before receiving app access.';
