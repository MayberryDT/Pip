drop policy if exists "Users can insert their own agent chat turns."
on public.agent_chat_turns;

create policy "Users can insert their own agent chat turns."
on public.agent_chat_turns for insert
to authenticated
with check ((select auth.uid()) = user_id);
