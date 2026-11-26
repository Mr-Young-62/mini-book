ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loan_date DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS return_date DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loaned_at TIMESTAMPTZ;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

UPDATE public.loans
SET loaned_at = loan_date::timestamp with time zone
WHERE loaned_at IS NULL AND loan_date IS NOT NULL;

UPDATE public.loans
SET returned_at = return_date::timestamp with time zone
WHERE returned_at IS NULL AND return_date IS NOT NULL;

UPDATE public.loans
SET loan_date = loaned_at::date
WHERE loan_date IS NULL AND loaned_at IS NOT NULL;

UPDATE public.loans
SET return_date = returned_at::date
WHERE return_date IS NULL AND returned_at IS NOT NULL;

ALTER TABLE public.loans ALTER COLUMN loan_date SET DEFAULT now()::date;
ALTER TABLE public.loans ALTER COLUMN loan_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.loans'::regclass AND conname = 'loans_due_date_check'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_due_date_check CHECK (due_date >= loan_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.loans'::regclass AND conname = 'loans_return_date_check'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_return_date_check CHECK (return_date IS NULL OR return_date >= loan_date);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_loan_per_book
  ON public.loans (owner_id, book_id)
  WHERE return_date IS NULL;

CREATE INDEX IF NOT EXISTS loans_owner_due_date_idx
  ON public.loans (owner_id, due_date);

CREATE OR REPLACE FUNCTION public.sync_loans_date_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.loaned_at := NEW.loan_date::timestamp with time zone;
    IF NEW.return_date IS NOT NULL THEN
      NEW.returned_at := NEW.return_date::timestamp with time zone;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.loan_date IS DISTINCT FROM OLD.loan_date THEN
    NEW.loaned_at := NEW.loan_date::timestamp with time zone;
  END IF;
  IF NEW.return_date IS DISTINCT FROM OLD.return_date THEN
    NEW.returned_at := CASE
      WHEN NEW.return_date IS NULL THEN NULL
      ELSE NEW.return_date::timestamp with time zone
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_loans_date_columns ON public.loans;
CREATE TRIGGER sync_loans_date_columns
  BEFORE INSERT OR UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_loans_date_columns();

NOTIFY pgrst, 'reload schema';
