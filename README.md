# MeelieFont — Digital Library Management System
### Supabase Edition · Web & Android (Capacitor)

MeelieFont is a lightweight library management system for schools, community libraries, research labs, and personal collections. It scans ISBN barcodes with a device camera or webcam, fetches book metadata from public APIs, and manages a bibliographic catalog of titles.

> Audit progress, verification results, and the deployment checklist are tracked in [PROGRESS.md](./PROGRESS.md).

---

## 1. Core Architecture

```text
mini-book/
├── src/
│   ├── components/
│   │   └── scanner/         # ZXing camera scanner with targeting laser & beep
│   ├── layouts/             # MainLayout with Top Bar Contract & Role switcher
│   ├── pages/               # Dashboard, Bookshelf, Scanner, Reports, Settings
│   ├── services/
│   │   ├── isbnValidator.ts  # ISBN-10/13 checksum algorithms & normalization
│   │   ├── metadataService.ts# Metadata lookup via book-metadata Edge Function (single pipeline)
│   │   └── libraryService.ts # Local fallback and Supabase-backed library workflows
│   ├── lib/
│   │   └── supabase.ts      # Supabase client and runtime configuration
│   └── types/               # Bibliographic types and app roles
├── supabase/
│   ├── migrations/
│   │   ├── 20261102000000_initial_schema.sql    # Normalized PostgreSQL schema & RLS
│   │   ├── 20261102000001_functions.sql         # Historical procedures retained for migration history
│   │   ├── 20261104000000_circulation_logic.sql # Historical catalog and circulation procedures
│   │   ├── 20261104190500_disable_circulation.sql # Disables circulation operations and preserves history
│   │   ├── 20261119000100_remove_physical_copies.sql # Drops copy/circulation data model, adds add_book_atomic RPC
│   │   ├── 20261119000200_remove_members.sql # Drops patron records and membership enums
│   │   ├── 20261119000300_update_book_atomic.sql # Historical book edit RPC
│   │   ├── 20261119000400_auth_registration.sql # Profile and registration role on signup
│   │   ├── 20261119000500_profile_access_policies.sql # Own-profile/role RLS
│   │   ├── 20261119000600_private_user_catalogs.sql # Per-user book ownership and RLS
│   │   └── 20261119000700_auth_role_repair.sql # Role lookup repair, access requests, role management
│   ├── functions/           # Edge Functions for ISBN metadata and Web Push release notices
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
  - Server-side lookup: the **book-metadata** Edge Function searches **Open Library**, **Google Books**, then the **Perpustakaan Jakarta** catalog — the browser never calls those APIs directly.
  - One-click test barcodes for instant testing without webcam hardware (development builds only).
  - Mathematical checksum verification for ISBN-10 and ISBN-13 (EAN-13).
  - Normalization of ISBN-10 to standard ISBN-13.
- **Bibliographic Catalog**:
  - One record per title (ISBN, authors, publisher, subjects, cover, description), with date and time added shown in details.
  - Each account has a private book catalog; users can scan, edit, archive, and restore only their own titles.
- **Digital Bookshelf Visualization**:
  - Wooden bookshelf view with realistic 3D spines and covers.
  - Modern grid view and dense tabular catalog view.
- **Reporting & Analytics**:
  - Catalog summary by subject.
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
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_your_key_here"
VITE_AUTH_REDIRECT_URL="https://your-production-app.example"
```

Without Supabase credentials, the app uses browser `localStorage` with an empty library. In Supabase mode, the catalog and settings read/write to the cloud; the app requires an authenticated account with a role assigned in `public.user_roles`. Physical copies, circulation records, and patron records have been removed from the data model (`20261119000100_remove_physical_copies.sql`, `20261119000200_remove_members.sql`). Each book keeps its `created_at` timestamp, shown with date and time in the catalog, book details, and scanner confirmation.

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
The role selector shown without Supabase is only a UI preview; cloud permissions come from the authenticated user's `public.user_roles` record and RLS. Public email sign-ups receive `Administrator`; disable sign-ups in Supabase Dashboard if that is not intended.

### Email and Google authentication
Apply migrations `20261119000400_auth_registration.sql`, `20261119000500_profile_access_policies.sql`, `20261119000600_private_user_catalogs.sql`, and `20261119000700_auth_role_repair.sql` to the hosted project. Email/password registration uses Supabase `signUp`; confirmation mail is sent by Supabase Auth through the SMTP provider configured in **Supabase Dashboard → Authentication → SMTP Settings**. For Resend, use the Resend SMTP host and credentials and a sender address on a domain verified for that Resend key. The browser app does not call the Resend API directly and must not be given a Resend API key. Keep **Confirm email** enabled under **Authentication → Providers → Email** in the hosted project. Local Supabase config disables confirmation for development only. Registration creates the profile and `Administrator` role in a database trigger; client metadata cannot assign roles.

The sign-in screen also supports Google OAuth. Enable Google under **Authentication → Providers → Google** and configure its client ID and secret. In Google Cloud Console, allow the Supabase callback URL `https://<project-ref>.supabase.co/auth/v1/callback`; in Supabase **Authentication → URL Configuration → Redirect URLs**, allow the exact app origins for local development and production. Set `VITE_AUTH_REDIRECT_URL` to the production app origin in the hosting provider's build environment. If omitted, the current page origin is used. Google sign-in creates a Supabase session directly and does not request an additional email verification code.

Roles use the existing `public.roles` and `public.user_roles` tables: `Owner` (Super Admin / Owner), `Administrator` (Admin Perpustakaan), `Librarian` (Petugas), and `Member` (Anggota). New accounts receive `Administrator`; no migration assigns `Owner` automatically. The `current_user_role()` RPC uses `auth.uid()`, returns `NULL` when no role is assigned, and is granted to authenticated users only. Role-management RPCs are revoked from `authenticated` and callable only by `service_role`. Settings no longer exposes role management; an operator changes roles in the Supabase SQL Editor.

To establish the first Owner, a trusted project operator must explicitly promote the intended, verified account once in the Supabase SQL Editor after applying migrations. Replace the UUID with that account's Auth user ID:
```sql
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'AUTH_USER_UUID', id FROM public.roles WHERE name = 'Owner'
ON CONFLICT (user_id, role_id) DO NOTHING;
```
This is intentionally not performed by signup or migration. After the first Owner is established, role changes must be run by an operator in the Supabase SQL Editor.

The profile and role-assignment RLS policies allow authenticated users to read their own profile and role only; profile updates are limited to name, phone, and avatar. The book catalog is private by `owner_id`; row access and the atomic add/edit RPCs enforce ownership in the database, not just in the UI. Each signed-in user can scan and manage their own books. Existing catalog rows are assigned to the earliest Administrator role assignment when the private-catalog migration runs; other users' catalogs start empty. If existing rows are present but no Administrator role assignment exists, the migration stops and requires one to be created before retrying. Email verification delivery, SMTP credentials, OAuth secrets, and hosted redirect allowlists are Supabase/provider settings and must be configured outside this repository.

The email sender address and Resend SMTP API key are configured only in **Supabase Dashboard → Authentication → SMTP Settings**; they are not set in frontend code. The sender domain must be verified in Resend and authorized for that API key. Use the same verified domain for the Supabase sender address (for example, `noreply@kiluadev.my.id` only if `kiluadev.my.id` is verified and authorized).

### Authentication and ownership smoke test
1. With **Confirm email** enabled, register using a new email address. Confirm the success message names that same address, then inspect the Resend request log's `to` field. Try logging in before clicking the confirmation link and verify the app reports that the email is not verified.
2. Click the confirmation link, sign in with that email/password, and verify the app displays **Login berhasil** and opens the account's own bookshelf.
3. Use a separate Google test account and choose **Lanjutkan dengan Google**. Confirm that the Supabase callback returns to the app with a session and that no extra email-verification-code prompt appears.
4. Sign in as two different users. Add a book to the first user's catalog, sign out, then verify the second user's bookshelf and archived list do not show it. Add the same ISBN to the second account to verify ISBN uniqueness is per user.
5. Verify a signed-in account can read its own role and that direct calls to `set_library_user_role`, `list_library_role_assignments`, and `list_library_access_requests` are rejected for authenticated users.

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
Tagged releases build a signed APK with GitHub Actions, upload it to a public Google Cloud Storage bucket, verify the uploaded object, publish an update manifest (`latest.json`) to the same bucket, and send a Firebase Cloud Messaging (FCM) notification to Android devices subscribed to the update topic. The source repository can remain private. The manifest is the source of truth for version checks; FCM is only a best-effort signal that triggers a manifest check. The app checks the manifest on startup (throttled) and from Settings → Application Updates. A notification shows one in-app banner; tapping it opens update details and the APK download. Android still asks the user to confirm installation.

### Desktop updates (Windows and macOS)
The same tag also triggers `desktop-release.yml`: it builds the Tauri 2 app on `windows-latest` and `macos-latest` (Apple Silicon), signs the updater artifacts with the minisign key `TAURI_SIGNING_PRIVATE_KEY`, uploads the installers (`.exe`, `.nsis.zip`, `.dmg`, `.app.tar.gz` + `.sig`) to `gs://<bucket>/desktop/` with content-length verification, and only then publishes the Tauri updater manifest at `https://storage.googleapis.com/<bucket>/desktop/latest.json` (`scripts/generate-desktop-manifest.mjs`). The desktop app checks that manifest on startup and from Settings → Application Updates; `Perbarui` downloads, verifies the minisign signature against the public key pinned in `src-tauri/tauri.conf.json`, installs, and relaunches. The updater endpoint is injected at build time by `scripts/prepare-desktop-build.mjs` (the bucket is a CI secret), which also stamps the tag version into `tauri.conf.json` and `Cargo.toml` so version comparison stays monotonic. macOS builds are unsigned/notarized only if you add Apple signing — without an Apple Developer identity, Gatekeeper warns on first launch; Windows shows SmartScreen warnings without an Authenticode certificate.

### iOS / browser updates (PWA + Web Push)
iOS forbids apps from installing executables, so iOS uses the web app instead: open the site in Safari → **Share → Add to Home Screen**, then Settings → *Notifikasi Update (Web / iOS)* → *Aktifkan notifikasi update*. The browser subscribes to Web Push (VAPID), the subscription is stored in `push_subscriptions` (RLS: own rows only), and on every release tag `android-release.yml` calls the `send-update-push` Edge Function, which fans the notification out to all subscribers and deletes dead subscriptions (HTTP 404/410). Tapping the notification opens the app; the service worker (`public/sw.js`) deliberately has **no fetch handler** — nothing is cached, so opening always loads the latest deploy. Prerequisites: apply migration `20261119000000_push_subscriptions.sql`, deploy `send-update-push`, set the secrets below. Web Push requires iOS 16.4+ and a Home Screen install; desktop browsers with Web Push support get the same notifications.

**Release version identity.** `versionName` comes from the tag (`v1.2.3` → `1.2.3`). `versionCode` is computed deterministically as `MAJOR*1000000 + MINOR*1000 + PATCH` (`v1.2.3` → `1002003`) by `scripts/version-utils.mjs`, replacing the old `GITHUB_RUN_NUMBER` scheme, which was not monotonic when an old tag's workflow was re-run. MINOR and PATCH must be 0–999, pre-release suffixes (`v1.2.3-rc.1`) are rejected, and the workflow refuses to publish a `latest.json` whose `versionCode` is not strictly greater than the currently published one. The same computed values are injected into the web bundle as `VITE_APP_VERSION` / `VITE_APP_VERSION_CODE`, so the app can compare its own installed version against the manifest at runtime. CI also injects `VITE_UPDATE_MANIFEST_URL` from the `APK_STORAGE_BUCKET` secret; without it, the checker stays disabled.

**Update manifest.** After the APK upload is verified (HTTPS `content-length` must match the local file), CI generates `latest.json` (`scripts/generate-latest-manifest.mjs`) containing `schemaVersion`, `app` (`org.readowl.library`), `version`, `versionCode`, `releaseDate`, `downloadUrl` (HTTPS + host/path allowlist), `sha256`, `fileSize`, `changelog`, `forceUpdate`, and optionally `minimumSupportedVersionCode`. The manifest is published only after the APK and GitHub Release are in place, with `Cache-Control: public,max-age=60,must-revalidate` so clients never see it stale. The APK object keeps `Cache-Control: public,max-age=31536000,immutable` because release APK URLs are never reused for different content. The manifest is signed with Ed25519 (`scripts/sign-manifest.mjs`); CI signs it with the `UPDATER_SIGNING_PRIVATE_KEY` secret and the app pins the public key, so a tampered manifest is rejected before any download. See `READOWL-UPDATER-PLAN.md` for the in-app updater design that consumes this manifest.

Before creating a release:
1. Register an Android app in Firebase using the existing package ID `org.readowl.library`, download its `google-services.json`, and enable the Firebase Cloud Messaging API.
2. Create a dedicated Google Cloud Storage bucket for APKs, grant `allUsers` the **Storage Object Viewer** role and the workflow service account the **Storage Object User** role on that bucket only. Keep this bucket limited to public release APKs.
3. Create and securely back up a release signing key. Do not commit the keystore or share its passwords.
4. Add these repository **Actions secrets**:
   - `GOOGLE_SERVICES_JSON_BASE64`: Base64-encoded `google-services.json`.
    - `ANDROID_KEYSTORE_BASE64`: Base64-encoded release keystore. This secret is required for Android releases.
    - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. These secrets are required for Android releases.
   - `FIREBASE_SERVICE_ACCOUNT`: Firebase service-account JSON with permission to send FCM messages.
   - `FIREBASE_PROJECT_ID`: Firebase project ID.
   - `APK_STORAGE_BUCKET`: the dedicated public APK bucket name.
   - `UPDATER_SIGNING_PRIVATE_KEY`: raw 32-byte Ed25519 seed, base64url encoded. Generate with `node scripts/sign-manifest.mjs --gen-key --out-key private.b64 --out-pub public.b64`, store the private value as the secret, and pin the printed public key in `src/services/updateService.ts` (`UPDATER_PUBLIC_KEY_B64`).
    - `TAURI_SIGNING_PRIVATE_KEY`: desktop updater minisign private key (base64 content of the file written by `npx tauri signer generate -w <file> --ci`). Losing it means installed desktop apps can no longer verify updates, so back it up outside the repo; never commit it.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that key (empty when generated with `--ci` and no `-p`).
   - `SUPABASE_FUNCTIONS_URL`: Supabase functions base URL (`https://<project-ref>.supabase.co/functions/v1`).
   - `UPDATE_PUSH_SECRET`: shared secret for the `send-update-push` Edge Function (any long random string).
5. Set build/env values for Web Push and the web updater: `VITE_VAPID_PUBLIC_KEY` (Vercel + CI, public half of `npx web-push generate-vapid-keys`) and `VITE_UPDATE_MANIFEST_URL` (optional when `APK_STORAGE_BUCKET` is set, otherwise the full URL to `latest.json`). Set Supabase secrets `UPDATE_PUSH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` via `npx supabase secrets set` (same key pair). Vercel build sets `VITE_APP_VERSION_CODE` from the release tag automatically.
6. Push a version tag such as `v1.0.1`. `android-release.yml` uploads `MeelieFont-v1.0.1.apk`, verifies it, signs and publishes `latest.json`, notifies Android devices (FCM) and web/iOS subscribers (`send-update-push`); `desktop-release.yml` builds Windows/macOS, uploads them to `gs://<bucket>/desktop/`, and publishes the desktop updater manifest last.

When GCS, Vercel, or notification secrets are absent, the workflows skip those integrations and attach the available artifacts plus the update manifests directly to the GitHub Release. Android release signing secrets are mandatory, so an unsigned APK is never published. In that fallback mode, in-app updates and notification delivery stay disabled until the missing public URLs and secrets are configured. An unsigned `latest.json` is attached for manual inspection but the app rejects it.

The app asks Android for notification permission and subscribes to the `meeliefont-updates` FCM topic. Users must allow notifications and permit APK installation from their browser. Android does not allow silent APK installation. A device currently running a USB-installed debug APK may need that build uninstalled before the first release-signed APK can be installed; later updates work over the same signing key. The Android package ID is intentionally unchanged so installed copies remain eligible for in-place updates.

The desktop wrapper (`src-tauri/`) is a Tauri 2 app: run `npx tauri dev` for a local desktop window (requires the Rust toolchain and platform webview dependencies) and `npx tauri build` for installers. `@tauri-apps/api`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, and `@tauri-apps/cli` are declared in `package.json`; `src-tauri/Cargo.lock` is committed for reproducible CI builds.

---

## 6. License
Apache-2.0
