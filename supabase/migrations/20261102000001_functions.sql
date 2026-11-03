-- Stored Procedures and Transaction Functions for Atomic Operations

-- 1. Atomic Borrow Function
CREATE OR REPLACE FUNCTION public.borrow_book_atomic(
    p_member_id UUID,
    p_book_copy_ids UUID[],
    p_days_valid INT DEFAULT 14,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_member_status member_status_enum;
    v_member_name TEXT;
    v_tx_id UUID;
    v_tx_code TEXT;
    v_copy_id UUID;
    v_copy_status copy_status_enum;
    v_copy_code TEXT;
    v_due_date DATE;
    v_active_loans_count INT;
    v_max_loans INT := 5;
BEGIN
    -- Verify member exists and is Active
    SELECT status, full_name INTO v_member_status, v_member_name
    FROM public.members
    WHERE id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found.';
    END IF;

    IF v_member_status != 'Active' THEN
        RAISE EXCEPTION 'Member account is %, cannot borrow books.', v_member_status;
    END IF;

    -- Check active loan limits
    SELECT COUNT(*) INTO v_active_loans_count
    FROM public.borrow_transactions bt
    JOIN public.borrow_transaction_items bti ON bt.id = bti.transaction_id
    WHERE bt.member_id = p_member_id AND bti.status = 'Borrowed';

    IF (v_active_loans_count + array_length(p_book_copy_ids, 1)) > v_max_loans THEN
        RAISE EXCEPTION 'Borrow limit exceeded. Member currently has % active loans (max %).', v_active_loans_count, v_max_loans;
    END IF;

    -- Compute due date
    v_due_date := CURRENT_DATE + p_days_valid;
    v_tx_code := 'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Create transaction
    INSERT INTO public.borrow_transactions (
        transaction_code,
        member_id,
        borrowed_at,
        due_date,
        status,
        created_by
    ) VALUES (
        v_tx_code,
        p_member_id,
        NOW(),
        v_due_date,
        'Active',
        p_created_by
    ) RETURNING id INTO v_tx_id;

    -- Lock and process each book copy
    FOREACH v_copy_id IN ARRAY p_book_copy_ids
    LOOP
        SELECT status, inventory_code INTO v_copy_status, v_copy_code
        FROM public.book_copies
        WHERE id = v_copy_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Book copy % not found.', v_copy_id;
        END IF;

        IF v_copy_status != 'Available' THEN
            RAISE EXCEPTION 'Book copy % (%) is currently % and unavailable.', v_copy_code, v_copy_id, v_copy_status;
        END IF;

        -- Update copy status to Borrowed
        UPDATE public.book_copies
        SET status = 'Borrowed', updated_at = NOW()
        WHERE id = v_copy_id;

        -- Insert transaction item
        INSERT INTO public.borrow_transaction_items (
            transaction_id,
            book_copy_id,
            status
        ) VALUES (
            v_tx_id,
            v_copy_id,
            'Borrowed'
        );
    END LOOP;

    -- Log activity
    INSERT INTO public.activity_logs (
        user_id, action, entity_type, entity_id, description
    ) VALUES (
        p_created_by,
        'BORROW_CREATED',
        'borrow_transactions',
        v_tx_id,
        'Borrowed ' || array_length(p_book_copy_ids, 1)::TEXT || ' book(s) to ' || v_member_name || ' (Code: ' || v_tx_code || ')'
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'transaction_code', v_tx_code,
        'due_date', v_due_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Atomic Return Function
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
    v_due_date DATE;
    v_overdue_days INT := 0;
    v_late_fee NUMERIC(8,2) := 0.00;
    v_daily_fee_rate NUMERIC(8,2) := 0.50; -- $0.50 per day
    v_remaining_items INT;
BEGIN
    -- Find the copy
    SELECT id INTO v_copy_id
    FROM public.book_copies
    WHERE inventory_code = p_inventory_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Copy with inventory code % not found.', p_inventory_code;
    END IF;

    -- Find active loan item
    SELECT bti.id, bti.transaction_id, bt.due_date
    INTO v_item_id, v_tx_id, v_due_date
    FROM public.borrow_transaction_items bti
    JOIN public.borrow_transactions bt ON bti.transaction_id = bt.id
    WHERE bti.book_copy_id = v_copy_id AND bti.status = 'Borrowed'
    LIMIT 1
    FOR UPDATE OF bti;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active borrowing transaction found for copy %.', p_inventory_code;
    END IF;

    -- Calculate overdue fee
    IF CURRENT_DATE > v_due_date THEN
        v_overdue_days := CURRENT_DATE - v_due_date;
        v_late_fee := v_overdue_days * v_daily_fee_rate;
    END IF;

    -- Update transaction item
    UPDATE public.borrow_transaction_items
    SET returned_at = NOW(),
        condition_on_return = p_condition,
        late_fee = v_late_fee,
        status = 'Returned'
    WHERE id = v_item_id;

    -- Record return
    INSERT INTO public.book_returns (
        transaction_item_id,
        returned_at,
        condition_on_return,
        late_fee,
        notes
    ) VALUES (
        v_item_id,
        NOW(),
        p_condition,
        v_late_fee,
        p_notes
    );

    -- Update copy status back to Available (or Maintenance if damaged)
    UPDATE public.book_copies
    SET status = CASE WHEN p_condition IN ('Damaged', 'Lost') THEN 'Maintenance'::copy_status_enum ELSE 'Available'::copy_status_enum END,
        condition = p_condition,
        updated_at = NOW()
    WHERE id = v_copy_id;

    -- Check if all items in the transaction are now returned
    SELECT COUNT(*) INTO v_remaining_items
    FROM public.borrow_transaction_items
    WHERE transaction_id = v_tx_id AND status = 'Borrowed';

    IF v_remaining_items = 0 THEN
        UPDATE public.borrow_transactions
        SET status = 'Completed', returned_at = NOW()
        WHERE id = v_tx_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'inventory_code', p_inventory_code,
        'overdue_days', v_overdue_days,
        'late_fee', v_late_fee,
        'condition', p_condition
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
