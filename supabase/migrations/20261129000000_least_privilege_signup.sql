-- Security fix: open self-registration must NOT grant Administrator.
--
-- `20261126000300_default_administrator_for_registration.sql` redefined
-- `handle_new_auth_user` to assign the `Administrator` role to every newly
-- registered user (and auto-promote), which lets anyone who can reach signup
-- gain admin. `PRE-PUSH-AUDIT` flagged this. Redefine the trigger to assign
-- the least-privileged `Member` role, like `20261119000400`, and never
-- auto-grant Administrator. Staff roles must be assigned by an admin via
-- `set_library_user_role`, or via `request_library_access` review.
--
-- This does NOT demote existing accounts (safer); review/adjust manually.
-- `set_library_user_role` / `lock_library_role_rpcs` still guard assignment.

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
        RAISE EXCEPTION 'Required Member role is missing; account profile setup failed.';
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

    -- Only assign a role if the user has none; always Member, never Administrator.
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

NOTIFY pgrst, 'reload schema';
