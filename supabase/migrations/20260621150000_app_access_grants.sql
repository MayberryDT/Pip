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

alter table public.app_access_grants enable row level security;

revoke all on table public.app_access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.app_access_grants to service_role;

comment on table public.app_access_grants is
  'Server-owned app access grants keyed by verified OAuth email. No browser writes.';
