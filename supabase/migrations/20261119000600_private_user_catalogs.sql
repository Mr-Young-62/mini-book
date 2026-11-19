-- Move the bibliographic catalog from one shared library to per-user catalogs.
-- Existing rows are assigned to the earliest Administrator role assignment.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DO $$
DECLARE
  legacy_owner UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.books WHERE owner_id IS NULL) THEN
    SELECT ur.user_id
    INTO legacy_owner
    FROM public.user_roles AS ur
    JOIN public.roles AS r ON r.id = ur.role_id
    WHERE r.name = 'Administrator'
    ORDER BY ur.created_at, ur.user_id
    LIMIT 1;

    IF legacy_owner IS NULL THEN
      RAISE EXCEPTION 'Cannot assign existing books: create an Administrator role assignment before applying this migration.';
    END IF;

    UPDATE public.books
    SET owner_id = legacy_owner
    WHERE owner_id IS NULL;
  END IF;
END;
$$;

ALTER TABLE public.books
  ALTER COLUMN owner_id SET NOT NULL;

DROP INDEX IF EXISTS public.books_isbn13_active_key;
CREATE UNIQUE INDEX books_owner_isbn13_active_key
  ON public.books (owner_id, isbn_13)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_owner_id
  ON public.books (owner_id);

DROP POLICY IF EXISTS "Public can view catalog" ON public.books;
DROP POLICY IF EXISTS "Staff can manage books" ON public.books;
DROP POLICY IF EXISTS "Users can manage own books" ON public.books;
CREATE POLICY "Users can manage own books" ON public.books
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Public can view authors" ON public.authors;
DROP POLICY IF EXISTS "Staff can manage authors" ON public.authors;
CREATE POLICY "Users can view authors in own catalog" ON public.authors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_authors AS ba
      JOIN public.books AS b ON b.id = ba.book_id
      WHERE ba.author_id = authors.id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view publishers" ON public.publishers;
DROP POLICY IF EXISTS "Staff can manage publishers" ON public.publishers;
CREATE POLICY "Users can view publishers in own catalog" ON public.publishers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.books AS b
      WHERE b.publisher_id = publishers.id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
DROP POLICY IF EXISTS "Staff can manage categories" ON public.categories;
CREATE POLICY "Users can view categories in own catalog" ON public.categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_categories AS bc
      JOIN public.books AS b ON b.id = bc.book_id
      WHERE bc.category_id = categories.id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view book authors" ON public.book_authors;
DROP POLICY IF EXISTS "Staff can manage book authors" ON public.book_authors;
DROP POLICY IF EXISTS "Users can view own book authors" ON public.book_authors;
CREATE POLICY "Users can view own book authors" ON public.book_authors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.books AS b
      WHERE b.id = book_authors.book_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view book categories" ON public.book_categories;
DROP POLICY IF EXISTS "Staff can manage book categories" ON public.book_categories;
DROP POLICY IF EXISTS "Users can view own book categories" ON public.book_categories;
CREATE POLICY "Users can view own book categories" ON public.book_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.books AS b
      WHERE b.id = book_categories.book_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can view logs" ON public.activity_logs;
CREATE POLICY "Staff can view logs" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    (public.has_role('Administrator') OR public.has_role('Librarian'))
    AND (entity_type <> 'books' OR user_id = (SELECT auth.uid()))
  );

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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to add a book.';
    END IF;
    IF p_isbn_13 IS NULL OR p_isbn_13 !~ '^97[89][0-9]{10}$'
       OR NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'A valid ISBN-13 and book title are required.';
    END IF;

    IF NULLIF(TRIM(p_publisher), '') IS NOT NULL THEN
        INSERT INTO public.publishers (name)
        VALUES (TRIM(p_publisher))
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_publisher_id;
    END IF;

    INSERT INTO public.books AS current_book (
        owner_id, isbn_10, isbn_13, title, subtitle, description,
        publication_year, language, page_count, publisher_id, cover_url,
        metadata_source
    ) VALUES (
        auth.uid(), NULLIF(TRIM(p_isbn_10), ''), p_isbn_13, TRIM(p_title),
        NULLIF(TRIM(p_subtitle), ''), NULLIF(TRIM(p_description), ''),
        p_publication_year, COALESCE(NULLIF(TRIM(p_language), ''), 'en'),
        p_page_count, v_publisher_id, NULLIF(TRIM(p_cover_url), ''),
        COALESCE(NULLIF(TRIM(p_metadata_source), ''), 'manual')
    )
    ON CONFLICT (owner_id, isbn_13) WHERE deleted_at IS NULL DO UPDATE
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
            INSERT INTO public.authors (name) VALUES (v_author_name)
            RETURNING id INTO v_author_id;
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to edit a book.';
    END IF;

    v_isbn_13 := NULLIF(TRIM(p_isbn_13), '');
    IF p_book_id IS NULL OR v_isbn_13 IS NULL OR v_isbn_13 !~ '^97[89][0-9]{10}$'
       OR NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'A valid ISBN-13 and book title are required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.books
        WHERE id = p_book_id AND owner_id = auth.uid() AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Book not found or not owned by the current user.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.books
        WHERE owner_id = auth.uid() AND isbn_13 = v_isbn_13
          AND deleted_at IS NULL AND id <> p_book_id
    ) THEN
        RAISE EXCEPTION 'Another active book in your catalog already uses this ISBN.';
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
    WHERE id = p_book_id AND owner_id = auth.uid();

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

REVOKE ALL ON FUNCTION public.add_book_atomic(
    TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_book_atomic(
    TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_book_atomic(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_book_atomic(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) TO authenticated;
