create index if not exists agent_chat_turns_created_at_idx
on public.agent_chat_turns(created_at);

create or replace function public.purge_agent_chat_turns(p_retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 3650 then
    raise exception 'Invalid retention window';
  end if;

  delete from public.agent_chat_turns
  where created_at < now() - make_interval(days => p_retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_agent_chat_turns(integer) from public, anon, authenticated;
grant execute on function public.purge_agent_chat_turns(integer) to service_role;
