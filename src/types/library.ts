export type CopyStatus = 'Available' | 'Borrowed' | 'Reserved' | 'Damaged' | 'Lost' | 'Maintenance';
export type MembershipType = 'Standard' | 'Student' | 'Faculty' | 'VIP';
export type MemberStatus = 'Active' | 'Suspended' | 'Expired' | 'Deactivated';
export type TransactionStatus = 'Active' | 'Completed' | 'Overdue' | 'Cancelled';
export type UserRole = 'Administrator' | 'Librarian' | 'Member';

export interface Author {
  id: string;
  name: string;
}

export interface Publisher {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface BookCopy {
  id: string;
  book_id: string;
  inventory_code: string; // e.g. RDW-000001
  barcode: string;
  shelf_location: string;
  rack_number: string;
  condition: string;
  acquisition_date: string;
  acquisition_price: number;
  acquisition_source?: string;
  status: CopyStatus;
  notes?: string;
  created_at: string;
  updated_at?: string;
  book?: Book;
}

export interface Book {
  id: string;
  isbn_10?: string;
  isbn_13: string;
  title: string;
  subtitle?: string;
  description?: string;
  publication_year?: number;
  language?: string;
  page_count?: number;
  publisher_id?: string;
  publisher?: Publisher;
  cover_url?: string;
  metadata_source?: string;
  metadata_retrieved_at?: string;
  created_at: string;
  updated_at?: string;
  authors: Author[];
  categories: Category[];
  copies?: BookCopy[];
}

export interface Member {
  id: string;
  member_code: string;
  full_name: string;
  email: string;
  phone?: string;
  address?: string;
  registration_date: string;
  membership_expiration_date?: string;
  membership_type: MembershipType;
  status: MemberStatus;
  profile_photo_url?: string;
  active_loans_count?: number;
  created_at: string;
}

export interface BorrowTransactionItem {
  id: string;
  transaction_id: string;
  book_copy_id: string;
  returned_at?: string;
  condition_on_return?: string;
  late_fee: number;
  status: 'Borrowed' | 'Returned';
  copy?: BookCopy;
}

export interface BorrowTransaction {
  id: string;
  transaction_code: string;
  member_id: string;
  member?: Member;
  borrowed_at: string;
  due_date: string;
  returned_at?: string;
  status: TransactionStatus;
  created_by?: string;
  created_at: string;
  items: BorrowTransactionItem[];
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  description: string;
  created_at: string;
}

export interface LibrarySettings {
  library_info: {
    name: string;
    code: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
  };
  circulation_rules: {
    default_loan_days: number;
    max_loans_per_member: number;
    daily_late_fee: number;
    allow_renewals: boolean;
    max_renewals: number;
  };
  inventory_config: {
    code_prefix: string;
    barcode_format: string;
    default_shelf: string;
    default_rack: string;
  };
}

export interface ScannedBookMetadata {
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  isbn10?: string;
  isbn13: string;
  description?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  alternateCoverUrl?: string;
  categories: string[];
  source: 'open_library' | 'google_books' | 'manual' | 'local_database' | 'merged';
}
