create table if not exists public.agent_model_gate_windows (
  id uuid primary key default gen_random_uuid(),
  scope_hash text not null,
  request_kind text not null,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_hash, request_kind, window_kind, window_start),
  check (char_length(scope_hash) between 32 and 128)
);

create table if not exists public.agent_model_gate_leases (
  id uuid primary key default gen_random_uuid(),
  scope_hash text not null,
  request_kind text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(scope_hash) between 32 and 128),
  check (expires_at > acquired_at),
  check (released_at is null or released_at >= acquired_at)
);

create index if not exists agent_model_gate_windows_scope_kind_idx
on public.agent_model_gate_windows(scope_hash, request_kind, window_kind, window_start desc);

create index if not exists agent_model_gate_leases_active_idx
on public.agent_model_gate_leases(expires_at, acquired_at)
where released_at is null;

create index if not exists agent_model_gate_leases_scope_kind_idx
on public.agent_model_gate_leases(scope_hash, request_kind, acquired_at desc);

alter table public.agent_model_gate_windows enable row level security;
alter table public.agent_model_gate_leases enable row level security;

revoke all on table public.agent_model_gate_windows from public, anon, authenticated;
revoke all on table public.agent_model_gate_leases from public, anon, authenticated;

grant select, insert, update, delete on public.agent_model_gate_windows to service_role;
grant select, insert, update, delete on public.agent_model_gate_leases to service_role;

drop policy if exists "Service role manages agent model gate windows."
on public.agent_model_gate_windows;

drop policy if exists "Service role manages agent model gate leases."
on public.agent_model_gate_leases;

create policy "Service role manages agent model gate windows."
on public.agent_model_gate_windows
for all
to service_role
using (true)
with check (true);

create policy "Service role manages agent model gate leases."
on public.agent_model_gate_leases
for all
to service_role
using (true)
with check (true);

create or replace function public.claim_agent_model_gate(
  p_scope_hash text,
  p_request_kind text,
  p_minute_limit integer,
  p_day_limit integer,
  p_global_concurrency_limit integer,
  p_lease_ttl_seconds integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  denial_reason text,
  retry_after_seconds integer,
  lease_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_start timestamptz := date_trunc('minute', p_now);
  v_day_start timestamptz := date_trunc('day', p_now);
  v_minute_count integer := 0;
  v_day_count integer := 0;
  v_active_lease_count integer := 0;
  v_retry_after_seconds integer := 1;
  v_lease_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('public.claim_agent_model_gate'));

  if p_scope_hash is null
    or char_length(p_scope_hash) < 32
    or char_length(p_scope_hash) > 128
    or p_request_kind is null
    or p_request_kind = ''
    or p_minute_limit < 1
    or p_day_limit < 1
    or p_global_concurrency_limit < 1
    or p_lease_ttl_seconds < 1 then
    return query select false, 'invalid_request'::text, 60, null::uuid;
    return;
  end if;

  update public.agent_model_gate_leases
  set released_at = coalesce(released_at, p_now),
      updated_at = p_now
  where released_at is null
    and expires_at <= p_now;

  select coalesce(request_count, 0)
  into v_minute_count
  from public.agent_model_gate_windows
  where scope_hash = p_scope_hash
    and request_kind = p_request_kind
    and window_kind = 'minute'
    and window_start = v_minute_start;

  if coalesce(v_minute_count, 0) >= p_minute_limit then
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_minute_start + interval '1 minute' - p_now)))::integer
    );
    return query select false, 'minute_rate_limited'::text, v_retry_after_seconds, null::uuid;
    return;
  end if;

  select coalesce(request_count, 0)
  into v_day_count
  from public.agent_model_gate_windows
  where scope_hash = p_scope_hash
    and request_kind = p_request_kind
    and window_kind = 'day'
    and window_start = v_day_start;

  if coalesce(v_day_count, 0) >= p_day_limit then
    v_retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_day_start + interval '1 day' - p_now)))::integer
    );
    return query select false, 'day_rate_limited'::text, v_retry_after_seconds, null::uuid;
    return;
  end if;

  select count(*)::integer
  into v_active_lease_count
  from public.agent_model_gate_leases
  where released_at is null
    and expires_at > p_now;

  if v_active_lease_count >= p_global_concurrency_limit then
    select greatest(1, ceil(extract(epoch from (min(expires_at) - p_now)))::integer)
    into v_retry_after_seconds
    from public.agent_model_gate_leases
    where released_at is null
      and expires_at > p_now;

    return query select false, 'global_concurrency_limited'::text, coalesce(v_retry_after_seconds, p_lease_ttl_seconds), null::uuid;
    return;
  end if;

  insert into public.agent_model_gate_windows (
    scope_hash,
    request_kind,
    window_kind,
    window_start,
    request_count,
    created_at,
    updated_at
  )
  values
    (p_scope_hash, p_request_kind, 'minute', v_minute_start, 1, p_now, p_now),
    (p_scope_hash, p_request_kind, 'day', v_day_start, 1, p_now, p_now)
  on conflict (scope_hash, request_kind, window_kind, window_start)
  do update
    set request_count = public.agent_model_gate_windows.request_count + 1,
        updated_at = p_now;

  insert into public.agent_model_gate_leases (
    scope_hash,
    request_kind,
    acquired_at,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_scope_hash,
    p_request_kind,
    p_now,
    p_now + make_interval(secs => p_lease_ttl_seconds),
    p_now,
    p_now
  )
  returning id into v_lease_id;

  return query select true, null::text, null::integer, v_lease_id;
end;
$$;

create or replace function public.release_agent_model_gate(
  p_lease_id uuid,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released_count integer := 0;
begin
  update public.agent_model_gate_leases
  set released_at = coalesce(released_at, p_now),
      updated_at = p_now
  where id = p_lease_id
    and released_at is null;

  get diagnostics v_released_count = row_count;

  return v_released_count > 0;
end;
$$;

revoke all on function public.claim_agent_model_gate(text, text, integer, integer, integer, integer, timestamptz)
from public, anon, authenticated;
revoke all on function public.release_agent_model_gate(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.claim_agent_model_gate(text, text, integer, integer, integer, integer, timestamptz)
to service_role;
grant execute on function public.release_agent_model_gate(uuid, timestamptz)
to service_role;
