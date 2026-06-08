create table public.agent_chat_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  conversation_id text not null,
  user_message text not null,
  assistant_message text,
  error_message text,
  response_mode text,
  used_tools text[] not null default array[]::text[],
  card_types text[] not null default array[]::text[],
  prompt_chips jsonb not null default '[]'::jsonb,
  client_action text,
  model text,
  transport text,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_chat_turns_user_id_created_at_idx
on public.agent_chat_turns(user_id, created_at desc);

create index agent_chat_turns_conversation_id_created_at_idx
on public.agent_chat_turns(conversation_id, created_at desc);

alter table public.agent_chat_turns enable row level security;

create policy "Users can view their own agent chat turns."
on public.agent_chat_turns for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Service role manages agent chat turns."
on public.agent_chat_turns
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

  delete from public.agent_chat_turns where user_id = current_user_id;
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
