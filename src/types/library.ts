export type UserRole = 'Owner' | 'Administrator' | 'Librarian' | 'Member';

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

export interface Book {
  id: string;
  owner_id?: string;
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
  deleted_at?: string;
  created_at: string;
  updated_at?: string;
  authors: Author[];
  categories: Category[];
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
  source: 'open_library' | 'google_books' | 'jakarta_library' | 'manual' | 'local_database' | 'merged';
}
