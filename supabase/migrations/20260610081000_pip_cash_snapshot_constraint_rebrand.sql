do $$
begin
  if to_regclass('public.pip_cash_snapshots') is null then
    raise notice 'public.pip_cash_snapshots does not exist; skipping Pip Cash snapshot constraint rename.';
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'free_cash_snapshots_pkey'
      and conrelid = 'public.pip_cash_snapshots'::regclass
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'pip_cash_snapshots_pkey'
      and conrelid = 'public.pip_cash_snapshots'::regclass
  ) then
    alter table public.pip_cash_snapshots
    rename constraint free_cash_snapshots_pkey to pip_cash_snapshots_pkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'free_cash_snapshots_user_id_fkey'
      and conrelid = 'public.pip_cash_snapshots'::regclass
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'pip_cash_snapshots_user_id_fkey'
      and conrelid = 'public.pip_cash_snapshots'::regclass
  ) then
    alter table public.pip_cash_snapshots
    rename constraint free_cash_snapshots_user_id_fkey to pip_cash_snapshots_user_id_fkey;
  end if;
end $$;
