ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS stock_count INTEGER NOT NULL DEFAULT 1 CHECK (stock_count >= 1);

NOTIFY pgrst, 'reload schema';
