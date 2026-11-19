-- Remove the physical-copy / circulation data model (Tahap H).
--
-- Books, members, roles, activity logs and soft-delete stay. Everything that
-- existed only to track individual physical copies is dropped: the copy table
-- and public view, acquisition/borrow/return tables, their enums and sequence,
-- the inventory/circulation settings rows, and the copy-aware cataloging RPC.
-- `add_book_atomic` replaces `add_book_with_copies_atomic` with the exact same
-- bibliographic logic (including the soft-delete-safe partial-index upsert).
--
-- DESTRUCTIVE: existing copy, acquisition and circulation rows are deleted.
-- Apply the client code update in the same release — the app must stop querying
-- book_copies_public before this migration runs.

-- 1. Book-only cataloging RPC (replaces the copy-aware one).
CREATE OR REPLACE FUNCTION public.add_book_atomic(
    p_isbn_10 TEXT,
    p_isbn_13 TEXT,
    p_title TEXT,
    p_subtitle TEXT,
    p_description TEXT,
    p_publication_year INT,
    p_language TEXT,
    p_page_count INT,
    p_publisher TEXT,
    p_cover_url TEXT,
    p_metadata_source TEXT,
    p_authors TEXT[],
    p_categories TEXT[]
)
RETURNS JSONB AS $$
DECLARE
    v_book_id UUID;
    v_publisher_id UUID;
    v_author_id UUID;
    v_category_id UUID;
    v_author_name TEXT;
    v_category_name TEXT;
BEGIN
    IF NOT (public.has_role('Administrator') OR public.has_role('Librarian')) THEN
        RAISE EXCEPTION 'Only library staff can catalog books.';
    END IF;
    IF p_isbn_13 IS NULL OR p_isbn_13 !~ '^97[89][0-9]{10}$' OR NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'A valid ISBN-13 and book title are required.';
    END IF;

    IF NULLIF(TRIM(p_publisher), '') IS NOT NULL THEN
        INSERT INTO public.publishers (name)
        VALUES (TRIM(p_publisher))
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_publisher_id;
    END IF;

    INSERT INTO public.books AS current_book (
        isbn_10, isbn_13, title, subtitle, description, publication_year,
        language, page_count, publisher_id, cover_url, metadata_source
    ) VALUES (
        NULLIF(TRIM(p_isbn_10), ''), p_isbn_13, TRIM(p_title), NULLIF(TRIM(p_subtitle), ''),
        NULLIF(TRIM(p_description), ''), p_publication_year, COALESCE(NULLIF(TRIM(p_language), ''), 'en'),
        p_page_count, v_publisher_id, NULLIF(TRIM(p_cover_url), ''), COALESCE(NULLIF(TRIM(p_metadata_source), ''), 'manual')
    )
    ON CONFLICT (isbn_13) WHERE deleted_at IS NULL DO UPDATE
    SET cover_url = COALESCE(current_book.cover_url, EXCLUDED.cover_url),
        publisher_id = COALESCE(current_book.publisher_id, EXCLUDED.publisher_id),
        updated_at = NOW()
    RETURNING id INTO v_book_id;

    FOREACH v_author_name IN ARRAY COALESCE(p_authors, ARRAY[]::TEXT[])
    LOOP
        v_author_name := NULLIF(TRIM(v_author_name), '');
        IF v_author_name IS NULL THEN CONTINUE; END IF;

        SELECT id INTO v_author_id
        FROM public.authors
        WHERE LOWER(name) = LOWER(v_author_name)
        LIMIT 1;
        IF v_author_id IS NULL THEN
            INSERT INTO public.authors (name) VALUES (v_author_name) RETURNING id INTO v_author_id;
        END IF;

        INSERT INTO public.book_authors (book_id, author_id)
        VALUES (v_book_id, v_author_id)
        ON CONFLICT (book_id, author_id) DO NOTHING;
        v_author_id := NULL;
    END LOOP;

    FOREACH v_category_name IN ARRAY COALESCE(p_categories, ARRAY[]::TEXT[])
    LOOP
        v_category_name := NULLIF(TRIM(v_category_name), '');
        IF v_category_name IS NULL THEN CONTINUE; END IF;

        INSERT INTO public.categories (name)
        VALUES (v_category_name)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_category_id;
        INSERT INTO public.book_categories (book_id, category_id)
        VALUES (v_book_id, v_category_id)
        ON CONFLICT (book_id, category_id) DO NOTHING;
    END LOOP;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (
        auth.uid(),
        'BOOK_ADDED',
        'books',
        v_book_id,
        'Cataloged "' || TRIM(p_title) || '" (' || p_isbn_13 || ')'
    );

    RETURN jsonb_build_object('book_id', v_book_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp;

-- 2. Old copy/circulation functions (both historical signatures).
DROP FUNCTION IF EXISTS public.add_book_with_copies_atomic(
    TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT,
    TEXT[], TEXT[], INT, TEXT, TEXT, TEXT, NUMERIC, TEXT
);
DROP FUNCTION IF EXISTS public.borrow_book_atomic(UUID, UUID[], INT);
DROP FUNCTION IF EXISTS public.borrow_book_atomic(UUID, UUID[], INT, UUID);
DROP FUNCTION IF EXISTS public.return_book_atomic(TEXT, TEXT, TEXT);

-- 3. Public view first (depends on book_copies).
DROP VIEW IF EXISTS public.book_copies_public;

-- 4. Tables, child-first for foreign keys. Policies/indexes drop with them.
DROP TABLE IF EXISTS public.book_returns;
DROP TABLE IF EXISTS public.borrow_transaction_items;
DROP TABLE IF EXISTS public.acquisition_records;
DROP TABLE IF EXISTS public.borrow_transactions;
DROP TABLE IF EXISTS public.book_copies;

-- 5. Types and inventory sequence now have no dependents.
DROP TYPE IF EXISTS public.copy_status_enum;
DROP TYPE IF EXISTS public.borrow_status_enum;
DROP SEQUENCE IF EXISTS public.readowl_inventory_code_seq;

-- 6. Settings rows that only described the removed model.
DELETE FROM public.settings WHERE setting_key IN ('inventory_config', 'circulation_rules');
