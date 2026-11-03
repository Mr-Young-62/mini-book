# Readowl — Mini Digital Library Management System
### Supabase Edition · Web, Desktop (Tauri 2) & Mobile (Capacitor)

Readowl is a modern, lightweight digital library management system designed for schools, small community libraries, research labs, and personal collections. It eliminates manual bibliographic entry by scanning ISBN barcodes with a device camera or webcam, automatically fetching authentic metadata from public APIs (Open Library & Google Books), and managing physical inventory copies independently.

---

## 1. Core Architecture

```text
readowl/
├── src/
│   ├── components/
│   │   └── scanner/         # ZXing camera scanner with targeting laser & beep
│   ├── layouts/             # MainLayout with Top Bar Contract & Role switcher
│   ├── pages/               # Dashboard, Bookshelf, Scanner, Inventory, Circulation, Members, Reports, Settings
│   ├── services/
│   │   ├── isbnValidator.ts  # ISBN-10/13 checksum algorithms & normalization
│   │   ├── metadataService.ts# Open Library + Google Books fallback pipeline
│   │   └── libraryService.ts # Unified persistent data & circulation engine
│   ├── lib/
│   │   └── supabase.ts      # Supabase client with live/offline sandbox fallback
│   └── types/               # Bibliographic, physical copy, loan, and member types
├── supabase/
│   ├── migrations/
│   │   ├── 20261102000000_initial_schema.sql  # Normalized PostgreSQL schema & RLS
│   │   └── 20261102000001_functions.sql       # Atomic borrow & return procedures
│   ├── functions/
│   │   ├── book-metadata/   # Edge Function for server-side ISBN lookup
│   │   ├── reports/         # Edge Function for circulation aggregation
│   │   └── admin/           # Edge Function for administrative tasks
│   ├── seed.sql             # Real bibliographic & copy seed data
│   └── config.toml          # Local Supabase CLI configuration
├── src-tauri/               # Tauri 2 Desktop configuration (Windows & Linux)
├── capacitor.config.ts      # Capacitor Android & iOS configuration
└── .env.example             # Environment variables template
```

---

## 2. Key Features

- **Smart ISBN Barcode Scanner**:
  - Live video camera scanning via `@zxing/library` with real-time targeting laser and audio feedback.
  - Multi-API fallback: Queries **Open Library Books API** first; if no match, falls back to **Google Books API**.
  - One-click test barcodes for instant testing without webcam hardware.
  - Mathematical checksum verification for ISBN-10 and ISBN-13 (EAN-13).
  - Normalization of ISBN-10 to standard ISBN-13.
- **Bibliographic vs. Physical Inventory Separation**:
  - One bibliographic record (Title, ISBN, Author, Publisher) links to $N$ physical copies.
  - Each copy has a unique inventory code (`RDW-000001`, `RDW-000002`, etc.), individual barcode, shelf location, rack number, and condition state.
- **Atomic Circulation (Borrow & Return)**:
  - Member borrowing limit checks ($N \le 5$ books max).
  - Configurable loan duration (default 14 days).
  - Automated return processor with overdue day counting and daily late fee calculation ($0.50/day).
- **Digital Bookshelf Visualization**:
  - Wooden bookshelf view with realistic 3D spines, covers, and availability ribbons.
  - Modern grid view and dense tabular view.
- **Patron Management**:
  - Full patron records with digital library ID cards and printable badges.
- **Reporting & Ledgers**:
  - Capital valuation report by category.
  - Overdue debt ledger.
  - CSV export for spreadsheets and printable summary reports.
- **Role-Based Access Control**:
  - Administrator, Librarian, and Member permission boundaries.

---

## 3. Supabase Database Setup & Migrations

### Running Migrations with Supabase CLI
```bash
# 1. Login to Supabase CLI
npx supabase login

# 2. Link your remote Supabase project
npx supabase link --project-ref your-project-id

# 3. Push schema migrations & stored functions
npx supabase db push

# 4. (Optional) Apply development seed data
npx supabase db reset --seed
```

### Environment Variables
Configure your `.env` file based on `.env.example`:
```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sbp_your_publishable_key_here"
```

*Note: If credentials are not provided initially, Readowl automatically activates its resilient local storage engine with pre-seeded data, ensuring full zero-config evaluation out of the box!*

---

## 4. Supabase Edge Functions Deployment

Deploy edge functions directly using Supabase CLI:
```bash
# Deploy ISBN metadata edge function
npx supabase functions deploy book-metadata

# Deploy aggregated reporting function
npx supabase functions deploy reports

# Deploy admin operations function
npx supabase functions deploy admin
```

---

## 5. Cross-Platform Builds

### Desktop (Windows & Linux with Tauri 2)
```bash
# Development mode
npm run tauri dev

# Production build
npm run tauri build
```

### Android APK (Capacitor)
```bash
# Build web assets
npm run build

# Add Android platform
npx cap add android

# Sync web assets to native container
npx cap sync android

# Open in Android Studio to build APK
npx cap open android
```

---

## 6. License
Apache-2.0
