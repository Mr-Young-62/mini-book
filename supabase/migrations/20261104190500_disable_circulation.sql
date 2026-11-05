DROP FUNCTION IF EXISTS public.borrow_book_atomic(UUID, UUID[], INT, UUID);
DROP FUNCTION IF EXISTS public.borrow_book_atomic(UUID, UUID[], INT);
DROP FUNCTION IF EXISTS public.return_book_atomic(TEXT, TEXT, TEXT);

DELETE FROM public.settings WHERE setting_key = 'circulation_rules';
UPDATE public.roles
SET description = 'Catalog and inventory management'
WHERE name = 'Librarian';

DROP POLICY IF EXISTS "Staff can manage borrow transactions" ON public.borrow_transactions;
DROP POLICY IF EXISTS "Staff can manage transaction items" ON public.borrow_transaction_items;
DROP POLICY IF EXISTS "Staff can manage returns" ON public.book_returns;

CREATE POLICY "Staff can view archived borrow transactions" ON public.borrow_transactions
FOR SELECT USING (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can view archived transaction items" ON public.borrow_transaction_items
FOR SELECT USING (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can view archived returns" ON public.book_returns
FOR SELECT USING (public.has_role('Administrator') OR public.has_role('Librarian'));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.borrow_transactions, public.borrow_transaction_items, public.book_returns
FROM anon, authenticated;
