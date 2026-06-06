revoke all on function public.is_beta_invited(text) from public, anon, authenticated;
revoke all on function public.accept_current_user_invite() from public, anon, authenticated;

grant execute on function public.is_beta_invited(text) to service_role;
grant execute on function public.accept_current_user_invite() to service_role;
