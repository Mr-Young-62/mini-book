-- Limit sensitive book copy data to authenticated staff.
--
-- The app requires a signed-in user, so anonymous (anon key) access to the
-- base table is unnecessary. The public view is owned by the migration role
-- (security definer semantics) and exposes only catalog-safe columns, which
-- lets Members see availability without acquisition price or source.

CREATE OR REPLACE VIEW public.book_copies_public AS
SELECT
  id,
  book_id,
  inventory_code,
  barcode,
  shelf_location,
  rack_number,
  condition,
  acquisition_date,
  status,
  created_at,
  updated_at
FROM public.book_copies;

REVOKE ALL ON public.book_copies_public FROM anon;
GRANT SELECT ON public.book_copies_public TO authenticated;

DROP POLICY IF EXISTS "Public can view copies" ON public.book_copies;

CREATE POLICY "Staff can view all copies" ON public.book_copies
FOR SELECT
USING (public.has_role('Administrator') OR public.has_role('Librarian'));

DROP POLICY IF EXISTS "Public can view settings" ON public.settings;

CREATE POLICY "Authenticated can view settings" ON public.settings
FOR SELECT
TO authenticated
USING (true);
