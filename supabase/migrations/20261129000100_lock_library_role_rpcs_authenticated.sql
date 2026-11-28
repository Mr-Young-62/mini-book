-- Fix: app `SettingsPage` calls `supabase.rpc(...)` with an `authenticated`
-- session (NOT service_role; the client rejects service-role keys). But
-- `20261126000500_lock_library_role_rpcs.sql` revoked these from `authenticated`
-- and granted only `service_role`, so authenticated admins got
-- `42501 permission denied for function`.
--
-- These are SECURITY DEFINER and self-protect internally:
--   set_library_user_role      -> has_role('Administrator'), Owner checks, no last-Owner demotion
--   list_library_role_assignments -> has_role('Administrator')
--   list_library_access_requests  -> has_role('Administrator')
-- So granting `authenticated` does NOT expose them; anon remains revoked.

GRANT EXECUTE ON FUNCTION public.set_library_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_library_role_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_library_access_requests() TO authenticated;

NOTIFY pgrst, 'reload schema';
