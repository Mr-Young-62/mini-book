-- Staff-only bibliographic edit RPC for active books.
--
-- A single call replaces the book's editable fields and its author/category
-- links. The RPC is needed because the public catalog policies are SELECT-only
-- for non-staff, and because the relation tables must stay consistent.

CREATE OR REPLACE FUNCTION public.update_book_atomic(
    p_book_id UUID,
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
    v_isbn_13 TEXT;
    v_publisher_id UUID;
    v_related_id UUID;
    v_name TEXT;
BEGIN
    IF NOT (public.has_role('Administrator') OR public.has_role('Librarian')) THEN
        RAISE EXCEPTION 'Only library staff can edit books.';
    END IF;

    v_isbn_13 := NULLIF(TRIM(p_isbn_13), '');
    IF p_book_id IS NULL OR v_isbn_13 IS NULL OR v_isbn_13 !~ '^97[89][0-9]{10}$'
       OR NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'A valid ISBN-13 and book title are required.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.books WHERE id = p_book_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Book not found or archived.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.books
        WHERE isbn_13 = v_isbn_13 AND deleted_at IS NULL AND id <> p_book_id
    ) THEN
        RAISE EXCEPTION 'Another active book already uses this ISBN.';
    END IF;

    IF NULLIF(TRIM(p_publisher), '') IS NOT NULL THEN
        INSERT INTO public.publishers (name)
        VALUES (TRIM(p_publisher))
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_publisher_id;
    END IF;

    UPDATE public.books
    SET isbn_10 = NULLIF(TRIM(p_isbn_10), ''),
        isbn_13 = v_isbn_13,
        title = TRIM(p_title),
        subtitle = NULLIF(TRIM(p_subtitle), ''),
        description = NULLIF(TRIM(p_description), ''),
        publication_year = p_publication_year,
        language = COALESCE(NULLIF(TRIM(p_language), ''), 'en'),
        page_count = p_page_count,
        publisher_id = v_publisher_id,
        cover_url = NULLIF(TRIM(p_cover_url), ''),
        metadata_source = COALESCE(NULLIF(TRIM(p_metadata_source), ''), 'manual'),
        metadata_retrieved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_book_id;

    DELETE FROM public.book_authors WHERE book_id = p_book_id;
    FOREACH v_name IN ARRAY COALESCE(p_authors, ARRAY[]::TEXT[])
    LOOP
        v_name := NULLIF(TRIM(v_name), '');
        IF v_name IS NULL THEN CONTINUE; END IF;

        SELECT id INTO v_related_id FROM public.authors
        WHERE LOWER(name) = LOWER(v_name) LIMIT 1;
        IF v_related_id IS NULL THEN
            INSERT INTO public.authors (name) VALUES (v_name) RETURNING id INTO v_related_id;
        END IF;
        INSERT INTO public.book_authors (book_id, author_id)
        VALUES (p_book_id, v_related_id)
        ON CONFLICT (book_id, author_id) DO NOTHING;
        v_related_id := NULL;
    END LOOP;

    DELETE FROM public.book_categories WHERE book_id = p_book_id;
    FOREACH v_name IN ARRAY COALESCE(p_categories, ARRAY[]::TEXT[])
    LOOP
        v_name := NULLIF(TRIM(v_name), '');
        IF v_name IS NULL THEN CONTINUE; END IF;

        INSERT INTO public.categories (name)
        VALUES (v_name)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_related_id;
        INSERT INTO public.book_categories (book_id, category_id)
        VALUES (p_book_id, v_related_id)
        ON CONFLICT (book_id, category_id) DO NOTHING;
        v_related_id := NULL;
    END LOOP;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (
        auth.uid(),
        'BOOK_UPDATED',
        'books',
        p_book_id,
        'Updated "' || TRIM(p_title) || '" (' || v_isbn_13 || ')'
    );

    RETURN jsonb_build_object('book_id', p_book_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp;
