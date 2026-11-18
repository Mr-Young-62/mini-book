# READOWL — Dokumentasi Arsitektur & Struktur Repository Aktual

> **Status dokumen: DONE (audit read-only selesai) + DIPERBARUI 18 November 2026 setelah Tahap A
> implementasi updater** (2 script baru di `scripts/`, alur rilis CI + konfigurasi versi diperbarui —
> ditandai "Tahap A"). Dokumen ini disusun dari pembacaan kode aktual repository, bukan dari asumsi
> atau informasi lama.
>
> Tanggal audit: 18 November 2026 · Branch `main` @ `ba4ab9f` · Remote `Mr-Young-62/mini-book`
> Kondisi proyek: **DEVELOPMENT / TESTING** — Security Remediation masih berlangsung
> (`SECURITY-REMEDIATION.md`). Audit ini **tidak mengubah satu baris kode pun** ( Tahap A = fitur
> updater terpisah, lihat `PROGRESS.md` §14).

---

## 1. Ringkasan stack

| Lapisan | Teknologi | Bukti di repo |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind 4 | `package.json` |
| State | React `useState`/`useEffect` + static class `LibraryService` + `localStorage` | **Tidak ada** Redux/Zustand/React Query, **tidak ada** folder `hooks/` |
| Backend | Supabase (PostgREST, Auth, Edge Functions) | `src/lib/supabase.ts`, `supabase/` |
| Mobile | Capacitor 8 (Android) | `capacitor.config.ts`, `android/` |
| Desktop | Tauri (**dorman** — ada folder, tidak ada script/npm deps) | `src-tauri/` |
| Scan barcode | `@zxing/library` | `src/components/scanner/BarcodeScanner.tsx` |
| Push update (lama) | Firebase Cloud Messaging via `@capacitor-firebase/messaging` | `src/components/UpdateNotifications.tsx` |
| CI/CD | GitHub Actions (1 workflow: rilis APK ber-tag) | `.github/workflows/android-release.yml` |
| Test | Vitest 5 (3 file, 18 test) | `src/**/*.test.ts` |

---

## 2. Struktur direktori aktual

```text
mini-book/
├── .env                    # Konfigurasi build lokal (REAL SECRET — ignored, ter-stage sebagai D)
├── .env.example            # Template placeholder (bersih)
├── .gitattributes          # EOL lf + binary (png/jar/jks/apk dst.)
├── .gitignore              # node_modules, dist, .env*, google-services.json, *.jks, supabase/.temp/
├── capacitor.config.ts     # Konfigurasi Capacitor (appId, webDir, server)
├── index.html              # Entry HTML + guard window.fetch
├── metadata.json           # Metadata AI Studio (requestFramePermissions: camera)
├── package.json            # Deps, scripts (dev/build/preview/clean/lint/test)
├── package-lock.json       # Lockfile npm (satu-satunya lockfile resmi)
├── PROGRESS.md             # Log progres & checklist deploy
├── README.md               # Dokumentasi utama (arsitektur, build, rilis Android)
├── screen.png              # Screenshot README
├── SECURITY-REMEDIATION.md # Checklist remediation keamanan (JANGAN DIHAPUS/DIUBAH)
├── tsconfig.json           # TS config (exclude: dist, supabase/functions)
├── vite.config.ts          # Vite + alias '@' + HMR env gate
│
├── .github/
│   └── workflows/
│       └── android-release.yml   # SATU-satunya workflow: tag v* → APK signed → GCS → GH Release → FCM
│
├── scripts/
│   ├── check-services.ps1        # Diagnostik koneksi Supabase/Google Books/hosting dari .env
│   ├── version-utils.mjs         # BARU (Tahap A): skema versionCode MAJOR*1e6+MINOR*1e3+PATCH + gate monoton
│   └── generate-latest-manifest.mjs # BARU (Tahap A): generator manifest update latest.json (allowlist URL, fail-closed)
│
├── src/                          # ===== FRONTEND =====
│   ├── main.tsx                  # Entry web: createRoot → <App />
│   ├── App.tsx                   # Router tab + auth state + role gate (235 baris)
│   ├── index.css                 # Tailwind + design system (457 baris)
│   ├── assets/
│   │   └── meeliefont-logo.png   # Logo brand
│   ├── components/
│   │   ├── UpdateNotifications.tsx   # Banner update via FCM push (124 baris) ← RELEVAN UPDATER
│   │   ├── scanner/BarcodeScanner.tsx# Scanner barcode @zxing (388 baris)
│   │   ├── DigitalBookReader.tsx     # ⚠ 0 BYTE (tidak direferensikan)
│   │   ├── EpubBookReader.tsx        # ⚠ 0 BYTE
│   │   └── PdfBookReader.tsx         # ⚠ 0 BYTE
│   ├── layouts/
│   │   └── MainLayout.tsx        # Sidebar + header + drawer mobile (132 baris)
│   ├── lib/
│   │   ├── supabase.ts           # Init client, guard service-role, override localStorage
│   │   ├── csv.ts                # Util CSV (47 baris)
│   │   └── csv.test.ts
│   ├── pages/
│   │   ├── AuthPage.tsx          # Login password (signInWithPassword)
│   │   ├── DashboardPage.tsx     # Ringkasan + aksi cepat
│   │   ├── BookshelfPage.tsx     # Katalog buku (786 baris, terbesar)
│   │   ├── ScannerPage.tsx       # Scan/input ISBN + katalogisasi
│   │   ├── MembersPage.tsx       # Manajemen anggota
│   │   ├── ReportsPage.tsx       # Laporan (⚠ lihat temuan F-6)
│   │   ├── InventoryPage.tsx     # Inventaris fisik
│   │   └── SettingsPage.tsx      # Konfigurasi Supabase + profil (306 baris) ← KANDIDAT UI UPDATER
│   ├── services/
│   │   ├── libraryService.ts     # Core domain: buku, copy, anggota, settings, log (727 baris)
│   │   ├── metadataService.ts    # Lookup metadata ISBN: Edge Function → Open Library → Google Books (463 baris)
│   │   ├── codeResolver.ts (+test) # Resolver kode inventaris
│   │   ├── isbnValidator.ts (+test)# Validasi ISBN-10/13
│   │   └── digitalBookService.ts # ⚠ 0 BYTE
│   └── types/
│       └── library.ts            # Semua tipe bersama (120 baris)
│
├── android/                      # ===== PROJEK NATIVE ANDROID =====
│   ├── build.gradle              # Root gradle (apply variables.gradle)
│   ├── variables.gradle          # minSdk 24, compile/target 36
│   ├── settings.gradle + capacitor.settings.gradle  # Include modul Capacitor
│   ├── gradle.properties, gradlew*, gradle/wrapper/
│   └── app/
│       ├── build.gradle          # versionCode/versionName dari ENV, signing dari ENV, google-services opsional
│       ├── capacitor.build.gradle# Generated: include capacitor-firebase-messaging + capacitor-browser
│       └── src/main/
│           ├── AndroidManifest.xml  # INTERNET + CAMERA; FileProvider terdaftar; ⚠ TANPA REQUEST_INSTALL_PACKAGES
│           ├── java/org/readowl/library/MainActivity.java  # BridgeActivity (kosong, plugin auto-register)
│           └── res/
│               ├── xml/file_paths.xml   # FileProvider paths: external-path + cache-path ← DASAR UPDATER
│               ├── values/strings.xml   # app_name = MeelieFont
│               ├── layout/activity_main.xml, values/styles.xml
│               ├── mipmap*/ + drawable*/ # Ikon launcher + splash
│           (androidTest/java/org/readowl/library/ + test/java/... : 2 template test, sudah dipindah ke paket benar)
│
├── supabase/                    # ===== BACKEND SUPABASE =====
│   ├── config.toml              # Konfigurasi project (tanpa section [functions.*] → verify_jwt default true)
│   ├── seed.sql                 # Seed data (branding MeelieFont)
│   ├── .temp/                   # ⚠ Linked project ref (jrlpwmsgptayfymguhnl) — gitignored
│   ├── functions/
│   │   └── book-metadata/index.ts   # SATU-satunya Edge Function lokal (admin/reports: staged deletion)
│   └── migrations/              # 11 file SQL (6 tracked di HEAD + 5 baru untracked)
│       ├── 20261102000000_initial_schema.sql      # ⚠ BOM UTF-8 + pernah dimodifikasi (drift, lihat T1 di PROGRESS.md)
│       ├── 20261102000001_functions.sql
│       ├── 20261104000000_circulation_logic.sql
│       ├── 20261104190500_disable_circulation.sql
│       ├── 20261105163600_rebrand_meeliefont.sql
│       ├── 20261105170000_digital_books.sql       # ⚠ 0 BYTE, selalu 0 byte sejak dibuat
│       └── 20261118000000..000400 (5 migrasi baru) # Belum di-push (db push DILARANG di tahap ini)
│
├── src-tauri/                   # Wrapper desktop Tauri — DORMAN
│   ├── tauri.conf.json          # version 1.0.0, identifier org.readowl.desktop
│   ├── Cargo.toml, src/main.rs  # Ada, tetapi package.json tidak punya script/deps Tauri
│
└── node_modules/                # (di-ignore)
```

---

## 3. Fungsi komponen utama

### 3.1 Frontend (`src/`)

| Komponen | Fungsi |
|---|---|
| `main.tsx` | Entry point **web**: `createRoot(document.getElementById('root'))` → render `<App />`. |
| `App.tsx` | Entry point **aplikasi** setelah mount: subscribe `onAuthStateChange`, ambil session, panggil RPC `current_user_role`, muat cloud settings, gate tab per role (`allowedTabs`), render `UpdateNotifications` di **semua** cabang render (termasuk saat loading/auth), routing tab → halaman. |
| `MainLayout.tsx` | Shell UI: sidebar (dashboard, scanner, members, books, settings — difilter per role), header (tombol Scan ISBN + Sign out), drawer mobile. **Tidak ada item nav `reports`.** |
| `LibraryService` (static) | Simpan/muat data via Supabase + fallback `localStorage` (prefix `readowl_*`), logging aktivitas, settings lokal. |
| `supabase.ts` | Inisialisasi client dari env build-time atau override `localStorage`; **menolak** service-role key di browser; export `isSupabaseConfigured`. |
| `metadataService.ts` | Urutan lookup ISBN: Edge Function `book-metadata` → fetch langsung Open Library → fetch langsung Google Books (**tanpa API key** di URL — key sudah dihapus dari bundle). |

### 3.2 Android (`android/`)

| Komponen | Fungsi |
|---|---|
| `MainActivity.java` | `class MainActivity extends BridgeActivity {}` — seluruh plugin Capacitor auto-register. Entry point Android. |
| `AndroidManifest.xml` | Izin: `INTERNET`, `CAMERA`. `allowBackup=false`. **FileProvider terdaftar** (authority `${applicationId}.fileprovider`, resource `@xml/file_paths`). **Belum ada** `REQUEST_INSTALL_PACKAGES`. |
| `file_paths.xml` | Path yang boleh dibagikan FileProvider: `external-path name="my_images" path="."` + `cache-path name="my_cache_images" path="."` (seluruh cache/external root). |
| `app/build.gradle` | `versionName = APP_VERSION ?: '1.0.0'`, `versionCode = APP_VERSION_CODE ?: 1` (**dari environment CI**); `signingConfigs.release` dari `ANDROID_KEYSTORE_*` env; terapkan plugin google-services **hanya jika** `google-services.json` ada (di CI disuntik dari secret). |
| `capacitor.build.gradle` (generated) | `implementation project(':capacitor-firebase-messaging')` + `':capacitor-browser'` — dua-satunya plugin native ekstra. |

### 3.3 Supabase (`supabase/`)

| Komponen | Fungsi |
|---|---|
| `functions/book-metadata` | Proxy lookup metadata ISBN dengan `GOOGLE_BOOKS_API_KEY` server-side (satu-satunya fungsi lokal; `admin` & `reports` staged deletion — risiko remote masih ter-deploy, lihat `SECURITY-REMEDIATION.md` §6). |
| `migrations/` | Skema: tabel, RPC, RLS. 5 migrasi `20261118*` **belum diterapkan** ke remote. |
| `config.toml` | Tidak ada `[functions.*]` → `verify_jwt` default `true`. |

---

## 4. Diagram arsitektur

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ DEVELOPER ( lokal )                                                     │
│  .env (VITE_*) → npm run build → dist/ → npx cap sync android          │
│  (build Android manual via Android Studio / CI)                         │
└─────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────  APK via CI  ────────────────────────────────┐
│ GitHub Actions (android-release.yml, trigger: push tag v*)              │
│  npm ci → build web → injeksi google-services.json + keystore (secrets) │
│  → cap sync android → gradlew app:assembleRelease                       │
│      (APP_VERSION = tag, APP_VERSION_CODE = GITHUB_RUN_NUMBER)          │
│  → unggah APK ke GCS bucket publik → GitHub Release → kirim FCM         │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────  APK terpasang di perangkat  ──────────────────────┐
│                                                                         │
│  MainActivity (BridgeActivity)                                          │
│       │ memuat                                                          │
│       ▼                                                                 │
│  WebView: index.html → main.tsx → App.tsx                               │
│       │                                                                 │
│       ├─ @capacitor/browser, @capacitor-firebase/messaging (native)     │
│       ├─ @zxing (scan barcode di WebView)                               │
│       │                                                                 │
│       ├────────── HTTPS (PostgREST / Auth / RPC) ──────────┐            │
│       │  supabase-js, session disimpan di localStorage      │            │
│       │                                                    ▼            │
│       │                                       ┌─────────────────────┐   │
│       │                                       │ SUPABASE            │   │
│       │                                       │  Auth (password)    │   │
│       │                                       │  Postgres + RLS     │   │
│       │                                       │  RPC (has_role dll) │   │
│       │                                       │  Edge Function:     │   │
│       │                                       │   book-metadata     │   │
│       │                                       └─────────────────────┘   │
│       │                                                                 │
│       └─ fetch langsung (fallback): Open Library, Google Books (tanpa key)│
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Alur 1–7 sesuai konteks

1. **Pengguna membuka aplikasi** → launcher memanggil `MainActivity` (package `org.readowl.library`).
2. **Frontend React dijalankan** → BridgeActivity memuat web bundle dari `android/app/src/main/assets/public/` (hasil `npx cap sync`; folder ini di-gitignore dan **belum ada** di checkout lokal) → `main.tsx` → `App.tsx`.
3. **Capacitor menghubungkan frontend dengan Android** → plugin `@capacitor/browser` (buka URL eksternal) dan `@capacitor-firebase/messaging` (FCM) tersedia sebagai API global di WebView; plugin lain auto-registered oleh `BridgeActivity`.
4. **Frontend berkomunikasi dengan Supabase** → `supabase-js` via HTTPS; URL+key dari `import.meta.env.VITE_*` (build-time) atau override `localStorage readowl_supabase_*`.
5. **Supabase menangani auth/DB/Edge Functions** → `signInWithPassword` → session persist → RPC `current_user_role` → RLS menentukan data yang boleh dibaca; Edge Function `book-metadata` untuk metadata ISBN.
6. **Android menghasilkan APK** → CI pada tag `v*` (atau lokal: `gradlew app:assembleRelease` dengan env signing).
7. **APK didistribusikan** → CI mengunggah ke **GCS bucket publik** (`https://storage.googleapis.com/<bucket>/MeelieFont-vX.Y.Z.apk`) + GitHub Release + notifikasi FCM ke topic `meeliefont-updates`.

### 4.2 Titik entry

| Entry | File |
|---|---|
| Web | `index.html` → `src/main.tsx` → `src/App.tsx` |
| Android | `android/app/src/main/java/org/readowl/library/MainActivity.java` |
| Build web | `npm run build` (script di `package.json`) → `dist/` |
| Build APK (CI) | `.github/workflows/android-release.yml` |
| Build APK (lokal) | `npx cap sync android` + Android Studio / `gradlew` |

### 4.3 Konfigurasi environment

| Sumber | Isi | Sifat |
|---|---|---|
| `.env` (lokal) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `APP_URL` | Build-time, **berisi real secret**, di-ignore |
| `.env.example` | Template placeholder | Aman, tracked |
| `localStorage readowl_supabase_*` | Override koneksi runtime | Klien |
| `supabase secrets` | `GOOGLE_BOOKS_API_KEY` (server-side) | Remote |
| GitHub Actions secrets | `GOOGLE_SERVICES_JSON_BASE64`, `ANDROID_KEYSTORE_*` (3), `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `APK_STORAGE_BUCKET` | CI — **tidak boleh masuk repo** |
| Env saat gradle | `APP_VERSION`, `APP_VERSION_CODE`, `ANDROID_KEYSTORE_PATH` | Di-set CI |

### 4.4 Autentikasi

- Satu mekanisme: **Supabase Auth `signInWithPassword`** (`AuthPage.tsx:25`). **Tidak ada** `signUp` di klien (`enable_signup=false` di dashboard).
- Session persist otomatis (`persistSession: true`) di localStorage → **selamat saat APK di-update** (data tidak terhapus selama signing certificate sama).
- Otorisasi: RPC `current_user_role` → `Administrator` / `Librarian` / `Member` → `allowedTabs` di `App.tsx` + RLS `has_role()` di database.
- **Local sandbox mode**: `handleUseLocalMode` di `App.tsx` memutus Supabase dan jalan lokal murni.

### 4.5 Mekanisme komunikasi API

1. **PostgREST** (`supabase.from(...).select/insert/update`) — data utama.
2. **RPC** (`supabase.rpc('current_user_role' | 'add_book_with_copies_atomic' | ...)`) — operasi bertransaksi/role.
3. **Edge Function** (`metadataClient.functions.invoke('book-metadata')`).
4. **Fetch langsung pihak ketiga** (Open Library, Google Books) — fallback, tanpa key, timeout 7 dtk.

### 4.6 Build & release

```text
git tag v1.2.3 && git push --tags
  → android-release.yml
  → npm ci
  → npm run build (Vite) + injeksi VITE_APP_VERSION / VITE_APP_VERSION_CODE   ← Tahap A (F-1)
  → injeksi secret (google-services.json, keystore) — dibersihkan di akhir job (if: always)
  → npx cap sync android
  → gradlew app:assembleRelease (signed)
  → validasi tag regex ^vMAJOR.MINOR.PATCH + hitung APP_VERSION_CODE dari tag  ← Tahap A (F-2)
  → gcloud storage cp → gs://<bucket>/MeelieFont-v1.2.3.apk (cache immutable 1 tahun)
  → verifikasi unggahan: HEAD content-length wajib = ukuran file lokal        ← Tahap A
  → GitHub Release (auto release notes)
  → generate latest.json (sha256 + size + gate monoton vs manifest terbit)    ← Tahap A
    → unggah latest.json (Cache-Control: public,max-age=60,must-revalidate)
  → job notify-devices: kirim FCM {version, apkUrl} ke topic meeliefont-updates (pelengkap)
```

> Aturan urutan: `latest.json` hanya diterbitkan **setelah** APK terunggah, terverifikasi, dan
> GitHub Release terbit — manifest tidak pernah menunjuk APK yang belum tersedia.

### 4.7 Lokasi konfigurasi versi

| Lokasi | Nilai saat ini | Keterangan |
|---|---|---|
| `package.json` `"version"` | **`0.0.0`** | Tidak dipakai aplikasi mana pun — `versionName` resmi = git tag (keputusan Tahap A) |
| `android/app/build.gradle` | dari env `APP_VERSION` / `APP_VERSION_CODE` | Default fallback `1.0.0` / `1`; **tidak diubah** Tahap A (sudah env-driven) |
| CI `android-release.yml` (step Build web + Build APK) | `APP_VERSION = tag (v1.2.3→1.2.3)`, `APP_VERSION_CODE = MAJOR*1e6+MINOR*1e3+PATCH` via `scripts/version-utils.mjs` (**menggantikan `GITHUB_RUN_NUMBER`**, Tahap A) | **Sumber versi efektif APK** |
| Bundle web (hasil build CI) | `import.meta.env.VITE_APP_VERSION` / `VITE_APP_VERSION_CODE` — disuntik CI dari tag (Tahap A) | Versi runtime app; build lokal tanpa env → kosong → checker nonaktif (F-1 selesai untuk build rilis) |
| Manifest `latest.json` di bucket GCS | `version` + `versionCode` + `sha256` + … (Tahap A) | **Sumber kebenaran versi untuk updater** |
| `src-tauri/tauri.conf.json` | `1.0.0` | Desktop dorman |

---

## 5. Komponen yang relevan untuk pengembangan updater

### 5.1 Inventaris: apa yang SUDAH ada

| Kebutuhan | Status | Bukti |
|---|---|---|
| Version management | **Lengkap (Tahap A)** — versi = git tag; versionCode deterministik `MAJOR*1e6+MINOR*1e3+PATCH` (gate monoton di generator); bundle web disuntik `VITE_APP_VERSION*` oleh CI. Sisa: konsumsi runtime oleh app (Tahap B) | §4.7, `scripts/version-utils.mjs` |
| Update checker | **TIDAK ADA** yang membandingkan versi. Yang ada hanya **notifikasi push FCM** | `UpdateNotifications.tsx` |
| Update notification | **ADA** — FCM topic `meeliefont-updates`, banner toast "Pembaruan MeelieFont tersedia" + tombol Nanti/Unduh APK | `UpdateNotifications.tsx`, CI `notify-devices` |
| Download manager | **TIDAK ADA** in-app — `Browser.open(apkUrl)` membuka **browser eksternal**, unduhan ditangani browser | `UpdateNotifications.tsx:35` |
| Native FileProvider | **ADA** — `androidx.core.content.FileProvider`, authority `${applicationId}.fileprovider`, path external + cache | `AndroidManifest.xml:27-35`, `file_paths.xml` |
| Permission instalasi APK | **TIDAK ADA** — `REQUEST_INSTALL_PACKAGES` tidak ada di manifest | `AndroidManifest.xml` |
| Membuka Package Installer | **TIDAK ADA** — tidak ada kode `Intent ACTION_VIEW`/`ACTION_INSTALL_PACKAGE` sama sekali | grep 0 kecocokan |
| Release metadata / manifest | **ADA (Tahap A)** — `latest.json` di bucket GCS (dihasilkan + diverifikasi CI, urutan terakhir), di samping GitHub Release notes (auto) + objek APK. Belum ditandatangani Ed25519 (Tahap E) | `scripts/generate-latest-manifest.mjs`, step CI "Publish update manifest" |
| Validasi URL update (existing) | **ADA** — pola ketat: `https:` + host `storage.googleapis.com` + path `/<bucket>/MeelieFont-*.apk` | `UpdateNotifications.tsx:28` |
| Cache metadata versi | **TIDAK ADA** | — |
| Cek versi manual (Settings/About) | **TIDAK ADA** — `SettingsPage` tidak memuat info versi | `SettingsPage.tsx` |

### 5.2 Cara kerja mekanisme update lama (FCM)

```text
CI selesai build → FCM kirim pesan {version, apkUrl} ke topic meeliefont-updates
  → App (Android) menerima notification → parseUpdate() memvalidasi URL
  → banner muncul → pengguna ketuk "Unduh APK"
  → Browser.open(apkUrl) → browser mengunduh → pengguna instal via prompt sistem
```

**Keterbatasan mekanisme lama (dasar rancangan baru):**

1. **Bukan pengecekan versi** — tidak ada perbandingan `versionCode`; perangkat lama yang tidak menerima push tidak pernah tahu ada update.
2. **Butuh Firebase aktif** — `google-services.json` hanya ada di CI; build lokal/berbeda FCM-nya mati diam-diam (error ditelan `try/catch`).
3. **Tidak ada verifikasi integritas** — tidak ada SHA-256; kepercayaan penuh pada URL dari payload push.
4. **Unduhan di luar aplikasi** — tidak ada progress, resume, atau status gagal yang terkontrol.
5. **Tidak ada instalasi terintegrasi** — semuanya diserahkan ke browser + prompt sistem.

> Mekanisme FCM **boleh tetap ada** sebagai pelengkap (notifikasi), tetapi **manifest-based checker**
> harus menjadi jalur utama karena andal tanpa Firebase.

### 5.3 Temuan & potensi masalah (audit struktur)

| # | Temuan | Level |
|---|---|---|
| F-1 | **Web app tidak punya akses ke versinya sendiri** (`package.json` = `0.0.0`, versi hanya ada di tag/env CI). Updater butuh `versionCode`+`versionName` di runtime WebView → perlu injeksi build (mis. Vite `define` dari env CI). → **RESOLVED untuk build rilis oleh Tahap A** (CI menyuntik `VITE_APP_VERSION`/`VITE_APP_VERSION_CODE`); build lokal/dev tetap tanpa versi → checker nonaktif by design. Sisa: konsumsi env di `src/` (Tahap B) | ✅ Tahap A — sisa di Tahap B |
| F-2 | **`versionCode = GITHUB_RUN_NUMBER`** — monoton per-workflow, tapi menjalankan ulang workflow untuk tag LAMA menghasilkan angka LEBIH BESAR untuk versi LEBIH TUA → updater berbasis `versionCode` bisa salah banding. Perlu skema deterministik (mis. `MAJOR*1e6+MINOR*1e3+PATCH`). → **RESOLVED oleh Tahap A**: CI memakai `scripts/version-utils.mjs` + gate monoton fail-closed di generator manifest | ✅ Tahap A |
| F-3 | **Manifest & APK (nanti) berada di bucket yang sama** — penulis-beracun bucket mengalahkan SHA-256 di manifest. Perlu signature manifest (Ed25519) atau pemisahan host. | WARNING (lihat updater plan §keamanan) |
| F-4 | `file_paths.xml` meng-`export` **seluruh** `external-path` dan `cache-path` (`path="."`) — luas; path APK nanti sebaiknya disubdirektori khusus. | WARNING |
| F-5 | **Belum ada `REQUEST_INSTALL_PACKAGES`** — tanpa ini, instalasi in-app (Android 8+) tidak bisa memicu installer dari aplikasi. | INFO (akan ditambah di Tahap D) |
| F-6 | **`ReportsPage` tampak orphan**: `App.tsx` merutekan tab `reports`, tetapi `MainLayout.navItems` tidak memuat item `reports` dan tidak ada `onNavigate('reports')` di seluruh `src/`. Halaman tidak tercapai lewat nav normal. | INFO — **perlu konfirmasi user** (sengaja disembunyikan atau lupa?) |
| F-7 | 5 file **0 byte** (`3 reader`, `digitalBookService`, migrasi `digital_books`) — belum diputuskan (lanjut/hapus), tercatat di `SECURITY-REMEDIATION.md` §7. | WARNING (belum diputuskan) |
| F-8 | Dependensi `firebase@12.19` membawa **11 advisori high** (rantai `@grpc/grpc-js`) — jika updater manifest-based menggantikan FCM, dependensi ini kandidat dihapus (**butuh persetujuan user**, terkait `SECURITY-REMEDIATION.md` W4). | WARNING |
| F-9 | `metadataService` fallback Google Books kini fetch **tanpa API key** (key sudah dihapus dari bundle) → kena kuota publik/anonim; jalur utama tetap Edge Function. | INFO |
| F-10 | `src-tauri/` dorman — jangan tertukar saat menyusun release plan desktop. | INFO |

---

## 6. Batasan dokumen ini

- Audit **read-only**: tidak ada kode, konfigurasi, migrasi, credential, atau commit yang diubah.
- Status keamanan berjalan terpisah di `SECURITY-REMEDIATION.md` (JANGAN DIHAPUS/DIUBAH).
- Rancangan updater ada di [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) — **belum diimplementasikan**.
