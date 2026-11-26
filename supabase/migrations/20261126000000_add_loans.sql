-- Per-user book lending records. Loan status is calculated in the client from
-- due_date and return_date, preventing stale "overdue" data in the database.

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  borrower_name TEXT NOT NULL CHECK (NULLIF(BTRIM(borrower_name), '') IS NOT NULL),
  loan_date DATE NOT NULL,
  due_date DATE NOT NULL CHECK (due_date >= loan_date),
  return_date DATE CHECK (return_date IS NULL OR return_date >= loan_date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_loan_per_book
  ON public.loans (owner_id, book_id)
  WHERE return_date IS NULL;

CREATE INDEX IF NOT EXISTS loans_owner_due_date_idx
  ON public.loans (owner_id, due_date);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own loans" ON public.loans
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.books
      WHERE books.id = loans.book_id
        AND books.owner_id = (SELECT auth.uid())
        AND books.deleted_at IS NULL
    )
  );
