-- New registrations receive Administrator access. Existing Member accounts are
-- promoted once so the application has one default management role.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  administrator_role_id UUID;
  profile_name TEXT;
BEGIN
  SELECT id INTO administrator_role_id
  FROM public.roles
  WHERE name = 'Administrator';

  IF administrator_role_id IS NULL THEN
    RAISE EXCEPTION 'Default Administrator role is missing; account profile setup failed.';
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
    VALUES (NEW.id, administrator_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DELETE FROM public.user_roles AS member_assignment
USING public.roles AS member_role,
      public.roles AS administrator_role,
      public.user_roles AS administrator_assignment
WHERE member_assignment.role_id = member_role.id
  AND member_role.name = 'Member'
  AND administrator_role.name = 'Administrator'
  AND administrator_assignment.user_id = member_assignment.user_id
  AND administrator_assignment.role_id = administrator_role.id;

UPDATE public.user_roles AS assignments
SET role_id = administrator_role.id
FROM public.roles AS member_role
JOIN public.roles AS administrator_role ON administrator_role.name = 'Administrator'
WHERE assignments.role_id = member_role.id
  AND member_role.name = 'Member';
