create index if not exists accounts_institution_id_idx
on public.accounts(institution_id);

create index if not exists beta_invites_accepted_by_user_id_idx
on public.beta_invites(accepted_by_user_id);

create index if not exists free_cash_snapshots_source_sync_run_id_idx
on public.free_cash_snapshots(source_sync_run_id);

create index if not exists sync_runs_institution_id_idx
on public.sync_runs(institution_id);
