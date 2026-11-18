-- Fix book cataloging after the soft-delete migration.
--
-- 20261118000300_soft_delete_books.sql replaced the books_isbn_13_key unique
-- constraint with a partial unique index on active rows. A plain
-- ON CONFLICT (isbn_13) can no longer infer that index, so
-- add_book_with_copies_atomic would fail with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- Target the partial index explicitly. An archived ISBN is outside the index,
-- so cataloging it again inserts a fresh active book record while the archived
-- record and its copies stay intact.

CREATE OR REPLACE FUNCTION public.add_book_with_copies_atomic(
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
    p_categories TEXT[],
    p_copy_count INT,
    p_shelf_location TEXT,
    p_rack_number TEXT,
    p_condition TEXT,
    p_acquisition_price NUMERIC,
    p_acquisition_source TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_book_id UUID;
    v_publisher_id UUID;
    v_author_id UUID;
    v_category_id UUID;
    v_author_name TEXT;
    v_category_name TEXT;
    v_prefix TEXT;
    v_copy_number BIGINT;
    v_copy_id UUID;
    v_copies JSONB := '[]'::JSONB;
BEGIN
    IF NOT (public.has_role('Administrator') OR public.has_role('Librarian')) THEN
        RAISE EXCEPTION 'Only library staff can catalog books.';
    END IF;
    IF p_isbn_13 IS NULL OR p_isbn_13 !~ '^97[89][0-9]{10}$' OR NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'A valid ISBN-13 and book title are required.';
    END IF;
    IF p_condition IS NULL OR p_condition NOT IN ('Like New', 'Good', 'Fair', 'Worn') THEN
        RAISE EXCEPTION 'Unsupported book condition: %.', p_condition;
    END IF;
    IF p_copy_count IS NULL OR p_copy_count < 1 OR p_copy_count > 20 THEN
        RAISE EXCEPTION 'Copy count must be between 1 and 20.';
    END IF;
    IF NULLIF(TRIM(p_shelf_location), '') IS NULL OR NULLIF(TRIM(p_rack_number), '') IS NULL THEN
        RAISE EXCEPTION 'Shelf location and rack number are required.';
    END IF;
    IF p_acquisition_price IS NULL OR p_acquisition_price < 0 THEN
        RAISE EXCEPTION 'Acquisition price cannot be negative.';
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

    SELECT setting_value->>'code_prefix' INTO v_prefix
    FROM public.settings WHERE setting_key = 'inventory_config';
    v_prefix := REGEXP_REPLACE(COALESCE(NULLIF(TRIM(v_prefix), ''), 'RDW'), '[^A-Za-z0-9]+', '-', 'g');
    PERFORM pg_advisory_xact_lock(hashtext('readowl_inventory_code_seq'));
    FOR v_copy_number IN 1..p_copy_count
    LOOP
        INSERT INTO public.book_copies (
            book_id, inventory_code, barcode, shelf_location, rack_number, condition,
            acquisition_date, acquisition_price, acquisition_source, status
        ) VALUES (
            v_book_id,
            v_prefix || '-' || LPAD(NEXTVAL('public.readowl_inventory_code_seq')::TEXT, 6, '0'),
            p_isbn_13 || '-' || CURRVAL('public.readowl_inventory_code_seq')::TEXT,
            TRIM(p_shelf_location), TRIM(p_rack_number), COALESCE(NULLIF(TRIM(p_condition), ''), 'Good'),
            CURRENT_DATE, p_acquisition_price, NULLIF(TRIM(p_acquisition_source), ''), 'Available'
        ) RETURNING id INTO v_copy_id;

        v_copies := v_copies || jsonb_build_array(jsonb_build_object(
            'id', v_copy_id,
            'inventory_code', v_prefix || '-' || LPAD(CURRVAL('public.readowl_inventory_code_seq')::TEXT, 6, '0'),
            'barcode', p_isbn_13 || '-' || CURRVAL('public.readowl_inventory_code_seq')::TEXT
        ));
    END LOOP;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (
        auth.uid(),
        'BOOK_ADDED',
        'books',
        v_book_id,
        'Cataloged "' || TRIM(p_title) || '" (' || p_isbn_13 || ') with ' || p_copy_count::TEXT || ' physical copy(ies)'
    );

    RETURN jsonb_build_object('book_id', v_book_id, 'copies', v_copies);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp;
