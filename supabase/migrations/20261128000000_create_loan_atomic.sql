-- Atomic loan creation (bug: concurrent loans can exceed book stock).
--
-- The app previously checked availability client-side and inserted the loan in
-- a separate request, so two concurrent requests could both pass the stock
-- check for the last copy. This RPC serializes loan creation per book inside a
-- single transaction: it locks the book row (FOR UPDATE), recounts active
-- loans, verifies stock_count, and only then inserts the loan.
--
-- NOTE: applying this migration is a deployment step; it is created here for
-- review and is not applied automatically. The client calls this RPC when
-- available and falls back to a (non-atomic) insert if it is absent.

CREATE OR REPLACE FUNCTION public.create_loan_atomic(
  p_book_id UUID,
  p_item_name TEXT,
  p_borrower_name TEXT,
  p_borrowed_at DATE,
  p_due_date DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID := auth.uid();
  v_stock INTEGER;
  v_active INTEGER;
  v_loan public.loans;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_item_name IS NULL OR btrim(p_item_name) = '' THEN
    RAISE EXCEPTION 'item_name is required' USING ERRCODE = '22023';
  END IF;
  IF p_borrower_name IS NULL OR btrim(p_borrower_name) = '' THEN
    RAISE EXCEPTION 'borrower_name is required' USING ERRCODE = '22023';
  END IF;
  IF p_due_date < p_borrowed_at THEN
    RAISE EXCEPTION 'due_date must not be before borrowed_at' USING ERRCODE = '22023';
  END IF;

  -- Only books owned by the caller can back a stock-checked loan.
  IF p_book_id IS NOT NULL THEN
    SELECT b.stock_count INTO v_stock
    FROM public.books b
    WHERE b.id = p_book_id
      AND b.owner_id = v_owner
      AND b.deleted_at IS NULL
    FOR UPDATE;  -- serialize concurrent loan creation on this book

    IF FOUND THEN
      SELECT COUNT(*) INTO v_active
      FROM public.loans l
      WHERE l.book_id = p_book_id
        AND l.returned_at IS NULL;

      IF v_active >= v_stock THEN
        RAISE EXCEPTION 'insufficient stock for book %', p_book_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.loans (
    owner_id, book_id, item_name, borrower_name, borrowed_at, due_date, notes
  )
  VALUES (
    v_owner, p_book_id, btrim(p_item_name), btrim(p_borrower_name),
    p_borrowed_at, p_due_date, p_notes
  )
  RETURNING * INTO v_loan;

  RETURN v_loan;
END;
$$;

REVOKE ALL ON FUNCTION public.create_loan_atomic(UUID, TEXT, TEXT, DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_loan_atomic(UUID, TEXT, TEXT, DATE, DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_loan_atomic(UUID, TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
