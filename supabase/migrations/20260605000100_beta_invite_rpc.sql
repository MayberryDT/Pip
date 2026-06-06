create or replace function public.is_beta_invited(input_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beta_invites
    where email = lower(trim(input_email))
  );
$$;

revoke all on function public.is_beta_invited(text) from public;
grant execute on function public.is_beta_invited(text) to anon, authenticated;

create or replace function public.accept_current_user_invite()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower((select auth.jwt() ->> 'email'));
begin
  if current_user_id is null or current_email is null then
    raise exception 'Not authenticated';
  end if;

  update public.beta_invites
  set
    accepted_by_user_id = current_user_id,
    accepted_at = coalesce(accepted_at, now())
  where email = current_email;

  if not found then
    raise exception 'Invite not found';
  end if;
end;
$$;

revoke all on function public.accept_current_user_invite() from public;
grant execute on function public.accept_current_user_invite() to authenticated;
