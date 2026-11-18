# MeelieFont — Digital Library Management System
### Supabase Edition · Web & Android (Capacitor)

MeelieFont is a lightweight library management system for schools, community libraries, research labs, and personal collections. It scans ISBN barcodes with a device camera or webcam, fetches book metadata from public APIs, and tracks physical copies separately from bibliographic records.

> Audit progress, verification results, and the deployment checklist are tracked in [PROGRESS.md](./PROGRESS.md).

---

## 1. Core Architecture

```text
mini-book/
├── src/
│   ├── components/
│   │   └── scanner/         # ZXing camera scanner with targeting laser & beep
│   ├── layouts/             # MainLayout with Top Bar Contract & Role switcher
│   ├── pages/               # Dashboard, Bookshelf, Scanner, Inventory, Members, Reports, Settings
│   ├── services/
│   │   ├── isbnValidator.ts  # ISBN-10/13 checksum algorithms & normalization
│   │   ├── metadataService.ts# Open Library + Google Books fallback pipeline
│   │   └── libraryService.ts # Local fallback and Supabase-backed library workflows
│   ├── lib/
│   │   └── supabase.ts      # Supabase client and runtime configuration
│   └── types/               # Bibliographic, physical copy, and member types
├── supabase/
│   ├── migrations/
│   │   ├── 20261102000000_initial_schema.sql    # Normalized PostgreSQL schema & RLS
│   │   ├── 20261102000001_functions.sql         # Historical procedures retained for migration history
│   │   ├── 20261104000000_circulation_logic.sql # Historical catalog and circulation procedures
│   │   └── 20261104190500_disable_circulation.sql # Disables circulation operations and preserves history
│   ├── functions/
│   │   └── book-metadata/   # Edge Function for server-side ISBN lookup
│   ├── seed.sql             # Development role and settings seeds
│   └── config.toml          # Local Supabase CLI configuration
├── src-tauri/               # Desktop wrapper configuration (no package build script yet)
├── capacitor.config.ts      # Capacitor Android & iOS configuration
└── package.json             # Web scripts and dependencies
```

---

## 2. Key Features

- **Smart ISBN Barcode Scanner**:
  - Live video camera scanning via `@zxing/library` with real-time targeting laser and audio feedback.
  - Multi-source fallback: searches **Open Library** and **Google Books**, then the **Perpustakaan Jakarta** catalog for ISBN records missing from global APIs.
  - One-click test barcodes for instant testing without webcam hardware (development builds only).
  - Mathematical checksum verification for ISBN-10 and ISBN-13 (EAN-13).
  - Normalization of ISBN-10 to standard ISBN-13.
- **Bibliographic vs. Physical Inventory Separation**:
  - One bibliographic record (Title, ISBN, Author, Publisher) links to $N$ physical copies.
  - Each copy has a unique inventory code (`RDW-000001`, `RDW-000002`, etc.), individual barcode, shelf location, rack number, and condition state.
  - Removing a book that still has physical copies archives its catalog record instead of deleting the copies, preserving acquisition history.
- **Digital Bookshelf Visualization**:
  - Wooden bookshelf view with realistic 3D spines, covers, and availability ribbons.
  - Modern grid view and dense tabular view.
- **Patron Management**:
  - Full patron records with digital library ID cards and printable badges.
- **Reporting & Analytics**:
  - Capital valuation report by category.
  - CSV export for spreadsheets and printable summary reports.
- **Role-Based Access Control**:
  - Supabase sign-in and database role checks for Administrator, Librarian, and Member.
  - The role selector in local mode is only a UI preview; it is not authentication.

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
To use Supabase from the web app, add these values to a root `.env` file:
```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sbp_your_publishable_key_here"
```

Without Supabase credentials, the app uses browser `localStorage` with an empty library. In Supabase mode, catalog, members, copies, and settings read/write to the cloud; the app requires an authenticated account with a role assigned in `public.user_roles`. Borrowing and return workflows are disabled; existing circulation tables and records are retained as historical data.

### Create a staff account
After applying migrations, create or invite a user from **Supabase Dashboard → Authentication → Users**. Then assign a role using the user's Auth UUID:
```sql
INSERT INTO public.profiles (id, full_name, email)
VALUES ('AUTH_USER_UUID', 'Library Admin', 'admin@example.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role_id)
SELECT 'AUTH_USER_UUID', id FROM public.roles WHERE name = 'Administrator'
ON CONFLICT (user_id, role_id) DO NOTHING;
```
The user signs in to MeelieFont with that email and password. Never put a Supabase `service_role` key in the browser app.
The role selector shown without Supabase is only a UI preview; cloud permissions come from the authenticated user's `public.user_roles` record and RLS.
For a remote project, disable public email sign-ups in Supabase Auth; the app only provides staff sign-in.

---

## 4. Supabase Edge Functions Deployment

Deploy the ISBN metadata edge function directly using Supabase CLI:
```bash
# Deploy ISBN metadata edge function
npx supabase functions deploy book-metadata

# Set the server-side Google Books key (never expose it to the browser)
npx supabase secrets set GOOGLE_BOOKS_API_KEY=your_key_here
```

The `reports` and `admin` functions were removed from this repository because the app never called them: `reports` exposed aggregate data without an authentication check, and `admin` allowed any signed-in user to assign roles through the service role key. If either is still deployed in a remote Supabase project, delete it with:
```bash
npx supabase functions delete reports
npx supabase functions delete admin
```

The `book-metadata` function fetches the Jakarta catalog server-side because that site does not allow browser cross-origin requests. It verifies the requested ISBN against the catalog detail record before returning metadata. The Jakarta fallback therefore requires a configured Supabase project and a deployed, current `book-metadata` function.

---

## 5. Cross-Platform Builds

### Android APK (Capacitor)
```bash
# Build web assets
npm run build

# Sync web assets to native container
npx cap sync android

# Open in Android Studio to build APK
npx cap open android
```

### Android updates without USB
Tagged releases build a signed APK with GitHub Actions, upload it to a public Google Cloud Storage bucket, verify the uploaded object, publish an update manifest (`latest.json`) to the same bucket, and send a Firebase Cloud Messaging (FCM) notification to Android devices subscribed to the update topic. The source repository can remain private. The manifest is the source of truth for version checks; FCM is only a best-effort notification. When tapped, the notification opens the APK download; Android still asks the user to confirm installation.

**Release version identity.** `versionName` comes from the tag (`v1.2.3` → `1.2.3`). `versionCode` is computed deterministically as `MAJOR*1000000 + MINOR*1000 + PATCH` (`v1.2.3` → `1002003`) by `scripts/version-utils.mjs`, replacing the old `GITHUB_RUN_NUMBER` scheme, which was not monotonic when an old tag's workflow was re-run. MINOR and PATCH must be 0–999, pre-release suffixes (`v1.2.3-rc.1`) are rejected, and the workflow refuses to publish a `latest.json` whose `versionCode` is not strictly greater than the currently published one. The same computed values are injected into the web bundle as `VITE_APP_VERSION` / `VITE_APP_VERSION_CODE`, so the app can compare its own installed version against the manifest at runtime.

**Update manifest.** After the APK upload is verified (HTTPS `content-length` must match the local file), CI generates `latest.json` (`scripts/generate-latest-manifest.mjs`) containing `schemaVersion`, `app` (`org.readowl.library`), `version`, `versionCode`, `releaseDate`, `downloadUrl` (HTTPS + host/path allowlist), `sha256`, `fileSize`, `changelog`, `forceUpdate`, and optionally `minimumSupportedVersionCode`. The manifest is published only after the APK and GitHub Release are in place, with `Cache-Control: public,max-age=60,must-revalidate` so clients never see it stale. The APK object keeps `Cache-Control: public,max-age=31536000,immutable` because release APK URLs are never reused for different content. See `READOWL-UPDATER-PLAN.md` for the in-app updater design that consumes this manifest.

Before creating a release:
1. Register an Android app in Firebase using the existing package ID `org.readowl.library`, download its `google-services.json`, and enable the Firebase Cloud Messaging API.
2. Create a dedicated Google Cloud Storage bucket for APKs, grant `allUsers` the **Storage Object Viewer** role and the workflow service account the **Storage Object User** role on that bucket only. Keep this bucket limited to public release APKs.
3. Create and securely back up a release signing key. Do not commit the keystore or share its passwords.
4. Add these repository **Actions secrets**:
   - `GOOGLE_SERVICES_JSON_BASE64`: Base64-encoded `google-services.json`.
   - `ANDROID_KEYSTORE_BASE64`: Base64-encoded release keystore.
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
   - `FIREBASE_SERVICE_ACCOUNT`: Firebase service-account JSON with permission to send FCM messages.
   - `FIREBASE_PROJECT_ID`: Firebase project ID.
   - `APK_STORAGE_BUCKET`: the dedicated public APK bucket name.
5. Push a version tag such as `v1.0.1`. The workflow uploads `MeelieFont-v1.0.1.apk`, verifies it, publishes `latest.json`, and notifies subscribed devices.

The app asks Android for notification permission and subscribes to the `meeliefont-updates` FCM topic. Users must allow notifications and permit APK installation from their browser. Android does not allow silent APK installation. A device currently running a USB-installed debug APK may need that build uninstalled before the first release-signed APK can be installed; later updates work over the same signing key. The Android package ID is intentionally unchanged so installed copies remain eligible for in-place updates.

The desktop wrapper directory is present, but this package does not currently define Tauri scripts or dependencies.

---

## 6. License
Apache-2.0
