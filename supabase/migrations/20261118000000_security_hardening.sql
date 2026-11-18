-- Security hardening for MeelieFont.
-- 1) Pin search_path on the SECURITY DEFINER role helper.
-- 2) Prevent staff from forging activity log entries on behalf of another user.

ALTER FUNCTION public.has_role(text)
  SET search_path = pg_catalog, public, auth, pg_temp;

DROP POLICY IF EXISTS "Staff can insert activity logs" ON public.activity_logs;

CREATE POLICY "Staff can insert activity logs" ON public.activity_logs FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (public.has_role('Administrator') OR public.has_role('Librarian'))
);
