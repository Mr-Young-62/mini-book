-- Remove the library-patron member model (Tahap I).
--
-- This drops patron records (public.members) and their enums. It does NOT touch
-- Supabase Auth users, roles (public.user_roles / has_role / current_user_role),
-- or the in-app 'Member' role — those are authentication/authorization and
-- remain in use by Bookshelf and Dashboard. All circulation tables that used
-- to reference members were already dropped by
-- 20261119000100_remove_physical_copies.sql.
--
-- DESTRUCTIVE: existing patron records are deleted. Apply the client code
-- update together with this migration.

DROP TABLE IF EXISTS public.members;
DROP TYPE IF EXISTS public.membership_type_enum;
DROP TYPE IF EXISTS public.member_status_enum;
