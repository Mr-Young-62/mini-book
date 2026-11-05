DROP FUNCTION IF EXISTS public.borrow_book_atomic(UUID, UUID[], INT, UUID);
DROP FUNCTION IF EXISTS public.return_book_atomic(TEXT, TEXT, TEXT);

INSERT INTO public.roles (name, description) VALUES
    ('Administrator', 'Full system access and configuration control'),
    ('Librarian', 'Catalog, borrowing, return, and inventory management'),
    ('Member', 'Browse the public catalog')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.settings (setting_key, setting_value) VALUES
    ('library_info', '{"name":"Readowl Community Library","code":"RDW-01","address":"452 Bookkeeper Way, Alexandria, VA","phone":"+1 (555) 234-5678","email":"contact@readowl.library","currency":"$"}'::JSONB),
    ('circulation_rules', '{"default_loan_days":14,"max_loans_per_member":5,"daily_late_fee":0.5,"allow_renewals":true,"max_renewals":2}'::JSONB),
    ('inventory_config', '{"code_prefix":"RDW","barcode_format":"CODE128","default_shelf":"Main Floor","default_rack":"A-01"}'::JSONB)
ON CONFLICT (setting_key) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.readowl_inventory_code_seq;

SELECT setval(
    'public.readowl_inventory_code_seq',
    GREATEST(COALESCE(MAX(SUBSTRING(inventory_code FROM '([0-9]+)$')::BIGINT), 0) + 1, 1),
    false
)
FROM public.book_copies;

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
    ON CONFLICT (isbn_13) DO UPDATE
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

CREATE OR REPLACE FUNCTION public.borrow_book_atomic(
    p_member_id UUID,
    p_book_copy_ids UUID[],
    p_days_valid INT DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
    v_member_status member_status_enum;
    v_member_name TEXT;
    v_membership_expiration DATE;
    v_tx_id UUID;
    v_tx_code TEXT;
    v_copy_id UUID;
    v_copy_status copy_status_enum;
    v_copy_code TEXT;
    v_item_id UUID;
    v_due_date DATE;
    v_active_loans_count INT;
    v_max_loans INT := 5;
    v_requested_count INT;
    v_found_count INT;
    v_processed_count INT := 0;
    v_items JSONB := '[]'::JSONB;
BEGIN
    IF NOT (public.has_role('Administrator') OR public.has_role('Librarian')) THEN
        RAISE EXCEPTION 'Only library staff can issue loans.';
    END IF;
    IF p_book_copy_ids IS NULL OR cardinality(p_book_copy_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one book copy.';
    END IF;
    IF cardinality(p_book_copy_ids) <> (
        SELECT COUNT(DISTINCT copy_id) FROM unnest(p_book_copy_ids) AS copies(copy_id)
    ) THEN
        RAISE EXCEPTION 'A book copy cannot be selected more than once.';
    END IF;
    IF p_days_valid IS NULL OR p_days_valid < 1 OR p_days_valid > 365 THEN
        RAISE EXCEPTION 'Loan duration must be between 1 and 365 days.';
    END IF;
    SELECT status, full_name, membership_expiration_date
    INTO v_member_status, v_member_name, v_membership_expiration
    FROM public.members
    WHERE id = p_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found.';
    END IF;
    IF v_member_status <> 'Active' THEN
        RAISE EXCEPTION 'Member account is %, cannot borrow books.', v_member_status;
    END IF;
    IF v_membership_expiration IS NOT NULL AND v_membership_expiration < CURRENT_DATE THEN
        RAISE EXCEPTION 'Member membership has expired.';
    END IF;

    SELECT COUNT(*) INTO v_active_loans_count
    FROM public.borrow_transactions bt
    JOIN public.borrow_transaction_items bti ON bt.id = bti.transaction_id
    WHERE bt.member_id = p_member_id AND bti.status = 'Borrowed';

    v_requested_count := cardinality(p_book_copy_ids);
    SELECT COALESCE((setting_value->>'max_loans_per_member')::INT, 5)
    INTO v_max_loans
    FROM public.settings
    WHERE setting_key = 'circulation_rules';
    v_max_loans := GREATEST(COALESCE(v_max_loans, 5), 1);

    IF v_active_loans_count + v_requested_count > v_max_loans THEN
        RAISE EXCEPTION 'Borrow limit exceeded. Member currently has % active loans (max %).',
            v_active_loans_count, v_max_loans;
    END IF;

    SELECT COUNT(*) INTO v_found_count
    FROM public.book_copies
    WHERE id = ANY(p_book_copy_ids);
    IF v_found_count <> v_requested_count THEN
        RAISE EXCEPTION 'One or more selected book copies could not be found.';
    END IF;

    v_due_date := CURRENT_DATE + p_days_valid;
    v_tx_code := 'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

    INSERT INTO public.borrow_transactions (
        transaction_code, member_id, borrowed_at, due_date, status, created_by
    ) VALUES (
        v_tx_code, p_member_id, NOW(), v_due_date, 'Active', auth.uid()
    ) RETURNING id INTO v_tx_id;

    FOR v_copy_id, v_copy_status, v_copy_code IN
        SELECT id, status, inventory_code
        FROM public.book_copies
        WHERE id = ANY(p_book_copy_ids)
        ORDER BY id
        FOR UPDATE
    LOOP
        v_processed_count := v_processed_count + 1;
        IF v_copy_status <> 'Available' THEN
            RAISE EXCEPTION 'Book copy % is currently % and unavailable.', v_copy_code, v_copy_status;
        END IF;

        UPDATE public.book_copies
        SET status = 'Borrowed', updated_at = NOW()
        WHERE id = v_copy_id;

        INSERT INTO public.borrow_transaction_items (transaction_id, book_copy_id, status)
        VALUES (v_tx_id, v_copy_id, 'Borrowed')
        RETURNING id INTO v_item_id;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'id', v_item_id,
            'book_copy_id', v_copy_id
        ));
    END LOOP;
    IF v_processed_count <> v_requested_count THEN
        RAISE EXCEPTION 'One or more selected book copies changed during the borrow operation.';
    END IF;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (
        auth.uid(),
        'BORROW_CREATED',
        'borrow_transactions',
        v_tx_id,
        'Borrowed ' || v_requested_count::TEXT || ' book(s) to ' || v_member_name || ' (Code: ' || v_tx_code || ')'
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'transaction_code', v_tx_code,
        'due_date', v_due_date,
        'items', v_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.return_book_atomic(
    p_inventory_code TEXT,
    p_condition TEXT DEFAULT 'Good',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_copy_id UUID;
    v_item_id UUID;
    v_tx_id UUID;
    v_tx_code TEXT;
    v_due_date DATE;
    v_overdue_days INT := 0;
    v_late_fee NUMERIC(8,2) := 0.00;
    v_remaining_items INT;
    v_match_count INT;
    v_copy_status copy_status_enum;
    v_daily_fee_rate NUMERIC := 0.50;
BEGIN
    IF NOT (public.has_role('Administrator') OR public.has_role('Librarian')) THEN
        RAISE EXCEPTION 'Only library staff can process returns.';
    END IF;
    IF NULLIF(TRIM(p_inventory_code), '') IS NULL THEN
        RAISE EXCEPTION 'Inventory code is required.';
    END IF;
    IF p_condition IS NULL OR p_condition NOT IN ('Good', 'Like New', 'Fair', 'Worn', 'Damaged', 'Lost') THEN
        RAISE EXCEPTION 'Unsupported return condition: %.', p_condition;
    END IF;

    SELECT COALESCE((setting_value->>'daily_late_fee')::NUMERIC, 0.50)
    INTO v_daily_fee_rate
    FROM public.settings
    WHERE setting_key = 'circulation_rules';
    v_daily_fee_rate := GREATEST(COALESCE(v_daily_fee_rate, 0.50), 0);

    SELECT COUNT(*) INTO v_match_count
    FROM public.book_copies
    WHERE UPPER(inventory_code) = UPPER(TRIM(p_inventory_code))
       OR UPPER(COALESCE(barcode, '')) = UPPER(TRIM(p_inventory_code));
    IF v_match_count = 0 THEN
        RAISE EXCEPTION 'Copy with inventory code % not found.', p_inventory_code;
    ELSIF v_match_count > 1 THEN
        RAISE EXCEPTION 'Barcode % matches more than one copy.', p_inventory_code;
    END IF;

    SELECT id INTO v_copy_id
    FROM public.book_copies
    WHERE UPPER(inventory_code) = UPPER(TRIM(p_inventory_code))
       OR UPPER(COALESCE(barcode, '')) = UPPER(TRIM(p_inventory_code))
    FOR UPDATE;

    SELECT bti.id, bti.transaction_id, bt.due_date, bt.transaction_code
    INTO v_item_id, v_tx_id, v_due_date, v_tx_code
    FROM public.borrow_transaction_items bti
    JOIN public.borrow_transactions bt ON bt.id = bti.transaction_id
    WHERE bti.book_copy_id = v_copy_id AND bti.status = 'Borrowed'
    LIMIT 1
    FOR UPDATE OF bti, bt;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active borrowing transaction found for copy %. ', p_inventory_code;
    END IF;

    IF CURRENT_DATE > v_due_date THEN
        v_overdue_days := CURRENT_DATE - v_due_date;
        v_late_fee := ROUND(v_overdue_days * v_daily_fee_rate, 2);
    END IF;

    UPDATE public.borrow_transaction_items
    SET returned_at = NOW(),
        condition_on_return = p_condition,
        late_fee = v_late_fee,
        status = 'Returned'
    WHERE id = v_item_id;

    INSERT INTO public.book_returns (
        transaction_item_id, returned_at, condition_on_return, late_fee, notes
    ) VALUES (
        v_item_id, NOW(), p_condition, v_late_fee, p_notes
    );

    v_copy_status := CASE
        WHEN p_condition = 'Lost' THEN 'Lost'::copy_status_enum
        WHEN p_condition = 'Damaged' THEN 'Maintenance'::copy_status_enum
        ELSE 'Available'::copy_status_enum
    END;
    UPDATE public.book_copies
    SET status = v_copy_status, condition = p_condition, updated_at = NOW()
    WHERE id = v_copy_id;

    SELECT COUNT(*) INTO v_remaining_items
    FROM public.borrow_transaction_items
    WHERE transaction_id = v_tx_id AND status = 'Borrowed';

    IF v_remaining_items = 0 THEN
        UPDATE public.borrow_transactions
        SET status = 'Completed', returned_at = NOW()
        WHERE id = v_tx_id;
    END IF;

    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (
        auth.uid(),
        'BOOK_RETURNED',
        'borrow_transactions',
        v_tx_id,
        'Returned ' || p_inventory_code || ' with condition ' || p_condition ||
        '. Overdue: ' || v_overdue_days::TEXT || ' day(s); late fee: ' || v_late_fee::TEXT
    );

    RETURN jsonb_build_object(
        'success', true,
        'inventory_code', p_inventory_code,
        'transaction_code', v_tx_code,
        'overdue_days', v_overdue_days,
        'late_fee', v_late_fee,
        'condition', p_condition
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT r.name
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
    ORDER BY CASE r.name
        WHEN 'Administrator' THEN 1
        WHEN 'Librarian' THEN 2
        WHEN 'Member' THEN 3
        ELSE 4
    END
    LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = pg_catalog, public, auth, pg_temp;

CREATE POLICY "Staff can manage authors" ON public.authors FOR ALL
USING (public.has_role('Administrator') OR public.has_role('Librarian'))
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can manage publishers" ON public.publishers FOR ALL
USING (public.has_role('Administrator') OR public.has_role('Librarian'))
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can manage categories" ON public.categories FOR ALL
USING (public.has_role('Administrator') OR public.has_role('Librarian'))
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can manage book authors" ON public.book_authors FOR ALL
USING (public.has_role('Administrator') OR public.has_role('Librarian'))
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can manage book categories" ON public.book_categories FOR ALL
USING (public.has_role('Administrator') OR public.has_role('Librarian'))
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));
CREATE POLICY "Staff can insert activity logs" ON public.activity_logs FOR INSERT
WITH CHECK (public.has_role('Administrator') OR public.has_role('Librarian'));

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
