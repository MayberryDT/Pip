create table if not exists public.marketing_waitlist (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null unique
    check (normalized_email = lower(trim(normalized_email)) and position('@' in normalized_email) > 1),
  display_email text not null,
  source_page text not null,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  consent_text_version text not null,
  status text not null default 'joined'
    check (status in ('joined', 'invited', 'unsubscribed')),
  created_at timestamptz not null default now(),
  last_submitted_at timestamptz not null default now()
);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null
    check (
      event_name in (
        'marketing_page_view',
        'marketing_cta_clicked',
        'waitlist_signup_submitted',
        'waitlist_signup_succeeded',
        'waitlist_signup_failed',
        'blog_article_viewed',
        'blog_cta_clicked',
        'outbound_app_link_clicked',
        'distribb_webhook_received'
      )
    ),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_content_drafts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  slug text,
  title text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'accepted', 'rejected', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_waitlist_created_at_idx
  on public.marketing_waitlist(created_at desc);

create index if not exists marketing_waitlist_source_page_idx
  on public.marketing_waitlist(source_page);

create index if not exists marketing_events_event_name_created_at_idx
  on public.marketing_events(event_name, created_at desc);

create index if not exists marketing_content_drafts_status_created_at_idx
  on public.marketing_content_drafts(status, created_at desc);

alter table public.marketing_waitlist enable row level security;
alter table public.marketing_events enable row level security;
alter table public.marketing_content_drafts enable row level security;

comment on table public.marketing_waitlist is
  'Anonymous marketing beta waitlist. Server routes write through service role; no direct public table policies.';

comment on table public.marketing_events is
  'Anonymous marketing telemetry with privacy-limited properties. Server routes write through service role.';

comment on table public.marketing_content_drafts is
  'Draft-only marketing content intake, including optional Distribb webhook payloads. Never auto-publishes content.';
