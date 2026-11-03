-- Readowl Mini Digital Library Schema
-- Initial Migration: Schema, Tables, Constraints, Indexes, Functions, and RLS Policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. AUTHENTICATION & ACCESS CONTROL (PROFILES & ROLES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

-- ============================================================================
-- 2. BIBLIOGRAPHIC METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.publishers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isbn_10 VARCHAR(10),
    isbn_13 VARCHAR(13) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    publication_year INTEGER,
    language VARCHAR(10) DEFAULT 'en',
    page_count INTEGER,
    publisher_id UUID REFERENCES public.publishers(id) ON DELETE SET NULL,
    cover_url TEXT,
    metadata_source TEXT DEFAULT 'open_library',
    metadata_retrieved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.book_authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
    UNIQUE(book_id, author_id)
);

CREATE TABLE IF NOT EXISTS public.book_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    UNIQUE(book_id, category_id)
);

-- ============================================================================
-- 3. PHYSICAL INVENTORY
-- ============================================================================

CREATE TYPE copy_status_enum AS ENUM (
    'Available',
    'Borrowed',
    'Reserved',
    'Damaged',
    'Lost',
    'Maintenance'
);

CREATE TABLE IF NOT EXISTS public.book_copies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    inventory_code VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(100),
    shelf_location VARCHAR(100) NOT NULL,
    rack_number VARCHAR(50) NOT NULL,
    condition VARCHAR(50) DEFAULT 'Good',
    acquisition_date DATE DEFAULT CURRENT_DATE,
    acquisition_price NUMERIC(10,2) DEFAULT 0.00,
    acquisition_source VARCHAR(150),
    status copy_status_enum DEFAULT 'Available',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. MEMBER MANAGEMENT
-- ============================================================================

CREATE TYPE membership_type_enum AS ENUM ('Standard', 'Student', 'Faculty', 'VIP');
CREATE TYPE member_status_enum AS ENUM ('Active', 'Suspended', 'Expired', 'Deactivated');

CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_code VARCHAR(50) NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone VARCHAR(30),
    address TEXT,
    registration_date DATE DEFAULT CURRENT_DATE,
    membership_expiration_date DATE,
    membership_type membership_type_enum DEFAULT 'Standard',
    status member_status_enum DEFAULT 'Active',
    profile_photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. CIRCULATION: BORROWING & RETURNING
-- ============================================================================

CREATE TYPE borrow_status_enum AS ENUM ('Active', 'Completed', 'Overdue', 'Cancelled');

CREATE TABLE IF NOT EXISTS public.borrow_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_code VARCHAR(50) NOT NULL UNIQUE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
    borrowed_at TIMESTAMPTZ DEFAULT NOW(),
    due_date DATE NOT NULL,
    returned_at TIMESTAMPTZ,
    status borrow_status_enum DEFAULT 'Active',
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.borrow_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.borrow_transactions(id) ON DELETE CASCADE,
    book_copy_id UUID NOT NULL REFERENCES public.book_copies(id) ON DELETE RESTRICT,
    returned_at TIMESTAMPTZ,
    condition_on_return VARCHAR(50),
    late_fee NUMERIC(8,2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'Borrowed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.book_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_item_id UUID NOT NULL REFERENCES public.borrow_transaction_items(id) ON DELETE CASCADE,
    returned_at TIMESTAMPTZ DEFAULT NOW(),
    condition_on_return VARCHAR(50) DEFAULT 'Good',
    late_fee NUMERIC(8,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. ACQUISITIONS, AUDIT LOGS & SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.acquisition_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_copy_id UUID NOT NULL REFERENCES public.book_copies(id) ON DELETE CASCADE,
    acquisition_date DATE DEFAULT CURRENT_DATE,
    acquisition_price NUMERIC(10,2) NOT NULL,
    acquisition_source VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON public.books(isbn_13);
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books(title);
CREATE INDEX IF NOT EXISTS idx_book_copies_inventory_code ON public.book_copies(inventory_code);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON public.book_copies(status);
CREATE INDEX IF NOT EXISTS idx_members_code ON public.members(member_code);
CREATE INDEX IF NOT EXISTS idx_borrow_tx_status ON public.borrow_transactions(status);
CREATE INDEX IF NOT EXISTS idx_borrow_tx_member ON public.borrow_transactions(member_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check user role
CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND r.name = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public can read books, authors, publishers, categories, and available copies
CREATE POLICY "Public can view catalog" ON public.books FOR SELECT USING (true);
CREATE POLICY "Public can view authors" ON public.authors FOR SELECT USING (true);
CREATE POLICY "Public can view publishers" ON public.publishers FOR SELECT USING (true);
CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public can view book authors" ON public.book_authors FOR SELECT USING (true);
CREATE POLICY "Public can view book categories" ON public.book_categories FOR SELECT USING (true);
CREATE POLICY "Public can view copies" ON public.book_copies FOR SELECT USING (true);

-- Staff (Administrator & Librarian) can manage books and inventory
CREATE POLICY "Staff can manage books" ON public.books FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);
CREATE POLICY "Staff can manage copies" ON public.book_copies FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);

-- Member management restricted to Staff
CREATE POLICY "Staff can manage members" ON public.members FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);

-- Members can view their own profile and borrow history
CREATE POLICY "Members can view own profile" ON public.members FOR SELECT USING (
    email = auth.jwt() ->> 'email' OR has_role('Administrator') OR has_role('Librarian')
);

CREATE POLICY "Staff can manage borrow transactions" ON public.borrow_transactions FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);

CREATE POLICY "Staff can manage transaction items" ON public.borrow_transaction_items FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);

CREATE POLICY "Staff can manage returns" ON public.book_returns FOR ALL USING (
    has_role('Administrator') OR has_role('Librarian')
);

CREATE POLICY "Staff can view logs" ON public.activity_logs FOR SELECT USING (
    has_role('Administrator') OR has_role('Librarian')
);

CREATE POLICY "Admin can manage settings" ON public.settings FOR ALL USING (
    has_role('Administrator')
);
CREATE POLICY "Public can view settings" ON public.settings FOR SELECT USING (true);
