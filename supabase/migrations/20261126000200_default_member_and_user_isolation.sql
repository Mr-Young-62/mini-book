CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  member_role_id UUID;
  profile_name TEXT;
BEGIN
  SELECT id INTO member_role_id
  FROM public.roles
  WHERE name = 'Member';

  IF member_role_id IS NULL THEN
    RAISE EXCEPTION 'Default Member role is missing; account profile setup failed.';
  END IF;

  profile_name := LEFT(
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'Pengguna'
    ),
    100
  );

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, profile_name, LOWER(NEW.email))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = CASE
        WHEN NULLIF(BTRIM(public.profiles.full_name), '') IS NULL THEN EXCLUDED.full_name
        ELSE public.profiles.full_name
      END;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, member_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx
  ON public.push_subscriptions (user_id, endpoint);

REVOKE ALL ON public.loans FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

REVOKE ALL ON public.activity_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

DROP POLICY IF EXISTS "Staff can insert activity logs" ON public.activity_logs;
CREATE POLICY "Users can insert own activity logs" ON public.activity_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own activity logs" ON public.activity_logs;
CREATE POLICY "Users can read own activity logs" ON public.activity_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());
