-- Repair role lookup, guarantee the least-privileged role exists, and add
-- administrator-mediated access requests and role assignment.

INSERT INTO public.roles (name, description) VALUES
  ('Owner', 'Super Admin / Owner'),
  ('Administrator', 'Admin Perpustakaan'),
  ('Librarian', 'Petugas'),
  ('Member', 'Anggota')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;

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
        WHEN NULLIF(BTRIM(public.profiles.full_name), '') IS NULL
          THEN EXCLUDED.full_name
        ELSE public.profiles.full_name
      END;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
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

-- Repair missing profiles and assign only Member to users who have no role.
-- Existing staff assignments are never replaced or elevated.
INSERT INTO public.profiles (id, full_name, email)
SELECT
  users.id,
  LEFT(
    COALESCE(
      NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(users.raw_user_meta_data ->> 'name'), ''),
      NULLIF(SPLIT_PART(COALESCE(users.email, ''), '@', 1), ''),
      'Pengguna'
    ),
    100
  ),
  LOWER(users.email)
FROM auth.users AS users
WHERE users.email IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = CASE
      WHEN NULLIF(BTRIM(public.profiles.full_name), '') IS NULL
        THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END;

INSERT INTO public.user_roles (user_id, role_id)
SELECT users.id, roles.id
FROM auth.users AS users
CROSS JOIN public.roles AS roles
WHERE users.email IS NOT NULL
  AND roles.name = 'Member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles AS existing
    WHERE existing.user_id = users.id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    JOIN public.roles AS r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND CASE LOWER(BTRIM(p_role))
        WHEN 'administrator' THEN LOWER(r.name) IN ('owner', 'super admin', 'administrator', 'admin perpustakaan')
        WHEN 'librarian' THEN LOWER(r.name) IN ('owner', 'super admin', 'administrator', 'admin perpustakaan', 'librarian', 'petugas')
        WHEN 'member' THEN LOWER(r.name) IN ('member', 'anggota')
        WHEN 'owner' THEN LOWER(r.name) IN ('owner', 'super admin')
        ELSE LOWER(r.name) = LOWER(BTRIM(p_role))
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT CASE LOWER(r.name)
    WHEN 'owner' THEN 'Owner'
    WHEN 'super admin' THEN 'Owner'
    WHEN 'administrator' THEN 'Administrator'
    WHEN 'admin perpustakaan' THEN 'Administrator'
    WHEN 'librarian' THEN 'Librarian'
    WHEN 'petugas' THEN 'Librarian'
    WHEN 'member' THEN 'Member'
    WHEN 'anggota' THEN 'Member'
    ELSE NULL
  END
  FROM public.user_roles AS ur
  JOIN public.roles AS r ON r.id = ur.role_id
  WHERE auth.uid() IS NOT NULL
    AND ur.user_id = auth.uid()
  ORDER BY CASE LOWER(r.name)
    WHEN 'owner' THEN 1
    WHEN 'super admin' THEN 1
    WHEN 'administrator' THEN 2
    WHEN 'admin perpustakaan' THEN 2
    WHEN 'librarian' THEN 3
    WHEN 'petugas' THEN 3
    WHEN 'member' THEN 4
    WHEN 'anggota' THEN 4
    ELSE 5
  END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.has_role(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE TABLE IF NOT EXISTS public.access_requests (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own access request" ON public.access_requests;
CREATE POLICY "Users can view own access request" ON public.access_requests
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role('Administrator')
  );

GRANT SELECT ON public.access_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.access_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_library_access()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before requesting library access.';
  END IF;
  IF public.current_user_role() IS NOT NULL THEN
    RAISE EXCEPTION 'This account already has a library role.';
  END IF;

  INSERT INTO public.access_requests (user_id, status, requested_at, reviewed_at, reviewed_by)
  VALUES (auth.uid(), 'pending', NOW(), NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'pending',
      requested_at = NOW(),
      reviewed_at = NULL,
      reviewed_by = NULL;

  RETURN 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.list_library_access_requests()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  requested_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('Administrator') THEN
    RAISE EXCEPTION 'Only library administrators can view access requests.';
  END IF;

  RETURN QUERY
  SELECT ar.user_id, p.full_name, p.email, ar.requested_at, ar.status
  FROM public.access_requests AS ar
  JOIN public.profiles AS p ON p.id = ar.user_id
  WHERE ar.status = 'pending'
  ORDER BY ar.requested_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_library_role_assignments()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  role_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('Administrator') THEN
    RAISE EXCEPTION 'Only library administrators can view role assignments.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    CASE LOWER(r.name)
      WHEN 'owner' THEN 'Owner'
      WHEN 'super admin' THEN 'Owner'
      WHEN 'administrator' THEN 'Administrator'
      WHEN 'admin perpustakaan' THEN 'Administrator'
      WHEN 'librarian' THEN 'Librarian'
      WHEN 'petugas' THEN 'Librarian'
      WHEN 'member' THEN 'Member'
      WHEN 'anggota' THEN 'Member'
      ELSE NULL
    END
  FROM public.profiles AS p
  LEFT JOIN LATERAL (
    SELECT roles.name
    FROM public.user_roles AS ur
    JOIN public.roles AS roles ON roles.id = ur.role_id
    WHERE ur.user_id = p.id
    ORDER BY CASE LOWER(roles.name)
      WHEN 'owner' THEN 1
      WHEN 'super admin' THEN 1
      WHEN 'administrator' THEN 2
      WHEN 'admin perpustakaan' THEN 2
      WHEN 'librarian' THEN 3
      WHEN 'petugas' THEN 3
      WHEN 'member' THEN 4
      WHEN 'anggota' THEN 4
      ELSE 5
    END
    LIMIT 1
  ) AS r ON TRUE
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_library_user_role(p_user_id UUID, p_role_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  requested_role_id UUID;
  target_is_owner BOOLEAN;
  owner_count BIGINT;
BEGIN
  IF NOT public.has_role('Administrator') THEN
    RAISE EXCEPTION 'Only library administrators can change roles.';
  END IF;
  IF p_user_id IS NULL OR p_role_name NOT IN ('Owner', 'Administrator', 'Librarian', 'Member') THEN
    RAISE EXCEPTION 'A valid user and library role are required.';
  END IF;
  IF NOT public.has_role('Owner') AND p_role_name = 'Owner' THEN
    RAISE EXCEPTION 'Only an Owner can assign the Owner role.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User profile not found; role was not changed.';
  END IF;

  SELECT id INTO requested_role_id
  FROM public.roles
  WHERE name = p_role_name;
  IF requested_role_id IS NULL THEN
    RAISE EXCEPTION 'Requested role is not configured.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    JOIN public.roles AS r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND LOWER(r.name) IN ('owner', 'super admin')
  ) INTO target_is_owner;

  IF target_is_owner AND p_role_name <> 'Owner' THEN
    IF NOT public.has_role('Owner') THEN
      RAISE EXCEPTION 'Only an Owner can change an Owner account.';
    END IF;
    SELECT COUNT(DISTINCT ur.user_id) INTO owner_count
    FROM public.user_roles AS ur
    JOIN public.roles AS r ON r.id = ur.role_id
    WHERE LOWER(r.name) IN ('owner', 'super admin');
    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'The last Owner cannot be demoted.';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (p_user_id, requested_role_id);

  UPDATE public.access_requests
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = auth.uid()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_library_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_library_access() TO authenticated;
REVOKE ALL ON FUNCTION public.list_library_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_library_access_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.list_library_role_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_library_role_assignments() TO authenticated;
REVOKE ALL ON FUNCTION public.set_library_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_library_user_role(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
