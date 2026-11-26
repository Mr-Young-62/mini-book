REVOKE ALL ON FUNCTION public.set_library_user_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_library_role_assignments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_library_access_requests() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_library_user_role(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_library_role_assignments() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_library_access_requests() TO service_role;

NOTIFY pgrst, 'reload schema';
