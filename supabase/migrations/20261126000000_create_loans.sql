-- Loans (Pinjaman) table for tracking borrowed books and items per user.

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  borrower_name TEXT NOT NULL,
  borrowed_at DATE NOT NULL,
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT loans_due_after_borrowed CHECK (due_date >= borrowed_at)
);

CREATE INDEX IF NOT EXISTS idx_loans_owner_id
  ON public.loans (owner_id, created_at DESC);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own loans" ON public.loans;
CREATE POLICY "Users can manage own loans" ON public.loans
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
