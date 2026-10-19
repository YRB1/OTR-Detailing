-- Only signed-in users ever need to ask "am I the owner?"; RLS policies that
-- use is_admin() are all scoped to the authenticated role.
revoke execute on function public.is_admin() from anon;
