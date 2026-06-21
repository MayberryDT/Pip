do $$
begin
  create type public.account_deletion_request_status as enum (
    'requested',
    'data_deleted',
    'auth_deleted',
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status public.account_deletion_request_status not null default 'requested',
  last_error_code text,
  requested_at timestamptz not null default now(),
  data_deleted_at timestamptz,
  auth_deleted_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists account_deletion_requests_status_updated_idx
on public.account_deletion_requests(status, updated_at desc);

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

drop policy if exists "Service role manages account deletion requests."
on public.account_deletion_requests;

create policy "Service role manages account deletion requests."
on public.account_deletion_requests
for all
to service_role
using (true)
with check (true);
