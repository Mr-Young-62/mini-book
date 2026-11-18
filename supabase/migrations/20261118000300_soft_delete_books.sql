-- Preserve acquisition and inventory history when a catalogued book is removed.
--
-- Books with physical copies are archived (deleted_at) instead of hard-deleted,
-- so book_copies and acquisition_records survive. Books without copies can
-- still be deleted permanently.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Allow a new active record for an ISBN after the old one was archived.
ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_isbn_13_key;

CREATE UNIQUE INDEX IF NOT EXISTS books_isbn13_active_key
  ON public.books (isbn_13)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_deleted_at
  ON public.books (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Speeds up the "does this book still have copies?" check before archiving.
CREATE INDEX IF NOT EXISTS idx_book_copies_book_id
  ON public.book_copies (book_id);

-- Anonymous and Member catalog reads only see active records.
-- Staff still see every row through "Staff can manage books" (FOR ALL).
DROP POLICY IF EXISTS "Public can view catalog" ON public.books;

CREATE POLICY "Public can view catalog" ON public.books
FOR SELECT
USING (deleted_at IS NULL);
