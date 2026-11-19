-- Create a profile and least-privileged role for every newly registered user.
-- Role selection is never taken from client-provided user metadata.

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
        RAISE EXCEPTION 'Required Member role is missing';
    END IF;

    profile_name := LEFT(
        COALESCE(
            NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
            'Pengguna'
        ),
        100
    );

    INSERT INTO public.profiles (id, full_name, email)
    VALUES (NEW.id, profile_name, LOWER(NEW.email))
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, member_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Repair profile/role records for existing Auth users without changing any
-- existing staff assignments.
INSERT INTO public.profiles (id, full_name, email)
SELECT
    users.id,
    LEFT(
        COALESCE(
            NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(SPLIT_PART(COALESCE(users.email, ''), '@', 1), ''),
            'Pengguna'
        ),
        100
    ),
    LOWER(users.email)
FROM auth.users AS users
WHERE users.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id)
SELECT users.id, roles.id
FROM auth.users AS users
CROSS JOIN public.roles AS roles
WHERE users.email IS NOT NULL
  AND roles.name = 'Member'
  AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS existing
      WHERE existing.user_id = users.id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;
