-- Provider-derived financial rows are written by trusted server routes with the
-- service role after route-level user authentication. Browser-authenticated
-- clients keep read access only.
--
-- Emergency rollback: restore the dropped authenticated write policies from
-- 20260605000000_free_cash_foundation.sql and related snapshot migrations only
-- if production writes are broken and server write paths cannot be repaired
-- quickly. Prefer fixing the server/admin write path.

drop policy if exists "Users can create their institutions."
on public.connected_institutions;
drop policy if exists "Users can update their institutions."
on public.connected_institutions;
drop policy if exists "Users can delete their institutions."
on public.connected_institutions;

drop policy if exists "Users can create their accounts."
on public.accounts;
drop policy if exists "Users can update their accounts."
on public.accounts;
drop policy if exists "Users can delete their accounts."
on public.accounts;

drop policy if exists "Users can create their transactions."
on public.transactions;
drop policy if exists "Users can update their transactions."
on public.transactions;
drop policy if exists "Users can delete their transactions."
on public.transactions;

drop policy if exists "Users can create their sync runs."
on public.sync_runs;
drop policy if exists "Users can update their sync runs."
on public.sync_runs;
drop policy if exists "Users can delete their sync runs."
on public.sync_runs;

drop policy if exists "Users can create their Free Cash snapshots."
on public.pip_cash_snapshots;
drop policy if exists "Users can mark their Free Cash snapshots stale."
on public.pip_cash_snapshots;
drop policy if exists "Users can delete their Free Cash snapshots."
on public.pip_cash_snapshots;

drop policy if exists "Users can create their Pip Cash snapshots."
on public.pip_cash_snapshots;
drop policy if exists "Users can mark their Pip Cash snapshots stale."
on public.pip_cash_snapshots;
drop policy if exists "Users can delete their Pip Cash snapshots."
on public.pip_cash_snapshots;

revoke insert on public.connected_institutions from authenticated;
revoke update on public.connected_institutions from authenticated;
revoke delete on public.connected_institutions from authenticated;

revoke insert on public.accounts from authenticated;
revoke update on public.accounts from authenticated;
revoke delete on public.accounts from authenticated;

revoke insert on public.transactions from authenticated;
revoke update on public.transactions from authenticated;
revoke delete on public.transactions from authenticated;

revoke insert on public.sync_runs from authenticated;
revoke update on public.sync_runs from authenticated;
revoke delete on public.sync_runs from authenticated;

revoke insert on public.pip_cash_snapshots from authenticated;
revoke update on public.pip_cash_snapshots from authenticated;
revoke delete on public.pip_cash_snapshots from authenticated;

grant select on public.connected_institutions to authenticated;
grant select on public.accounts to authenticated;
grant select on public.transactions to authenticated;
grant select on public.sync_runs to authenticated;
grant select on public.pip_cash_snapshots to authenticated;

create or replace function public.delete_current_user_financial_data()
returns void
language plpgsql
security definer
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

  delete from public.ai_response_reports where user_id = current_user_id;
  delete from public.tester_feedback where user_id = current_user_id;
  delete from public.plaid_webhook_events
  where user_id = current_user_id
     or source_sync_job_id in (
    select id from public.pip_sync_jobs where user_id = current_user_id
  );
  delete from public.pip_reaction_events where user_id = current_user_id;
  delete from public.pip_sync_jobs where user_id = current_user_id;
  delete from public.agent_chat_turns where user_id = current_user_id;
  delete from public.product_events where user_id = current_user_id;
  delete from public.recurring_obligation_rules where user_id = current_user_id;
  delete from public.savings_goals where user_id = current_user_id;
  delete from public.pip_cash_snapshots where user_id = current_user_id;
  delete from public.sync_runs where user_id = current_user_id;
  delete from public.missing_card_preferences where user_id = current_user_id;
  delete from public.account_preferences where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.accounts where user_id = current_user_id;
  delete from public.connected_institutions where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;
end;
$$;

revoke all on function public.delete_current_user_financial_data() from public, anon;
grant execute on function public.delete_current_user_financial_data() to authenticated;
