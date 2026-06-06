create policy "Users can mark their Free Cash snapshots stale."
on public.free_cash_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
