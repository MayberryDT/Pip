create policy "Users can delete their sync runs."
on public.sync_runs for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete their product events."
on public.product_events for delete
to authenticated
using ((select auth.uid()) = user_id);
