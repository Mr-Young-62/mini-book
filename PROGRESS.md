# Progres Audit & Perbaikan MeelieFont

Terakhir diperbarui: **18 November 2026**
Repo: `Mr-Young-62/mini-book`
Branch: `main`
HEAD saat audit dimulai: `ba4ab9f` (`update v0.8`)
Status: **perubahan belum di-commit dan belum di-push.**

Dokumen ini merangkum hasil audit, perbaikan yang sudah dikerjakan, verifikasi, serta pekerjaan yang masih tertunda.

---

## 1. Ringkasan

Fondasi database dan RLS sudah cukup baik, tetapi ada beberapa masalah kritis:

- Edge Function `admin` memungkinkan privilege escalation.
- `.env` pernah ter-commit dan key Google ikut masuk ke bundle produksi.
- Edge Function `reports` tidak memeriksa pemanggil.
- Beberapa policy RLS terlalu terbuka.
- Ekspor CSV rusak dan rawan formula injection.

Per 18 November 2026, seluruh temuan kritis dan sebagian besar temuan tinggi sudah diperbaiki di kode. Beberapa langkah masih memerlukan akses eksternal: rotasi key, penghapusan fungsi yang masih ter-deploy, penerapan migrasi, dan pembersihan riwayat git.

---

## 2. Status per temuan audit

| # | Temuan | Status | Catatan |
|---|---|---|---|
| 1 | `admin` tidak memeriksa role | **Selesai (kode)** | Fungsi dihapus dari repo. Fungsi yang masih ter-deploy harus dihapus manual. |
| 2 | Secret di riwayat git | **Sebagian** | `.env` sudah di-untrack dan `.env.example` dibersihkan. Rotasi key dan rewrite history belum dilakukan. |
| 3 | Key Google di bundle browser | **Selesai (kode)** | Key tidak lagi dibaca dari `VITE_*`; fallback Custom Search dihapus. Key lama tetap harus dirotasi. |
| 4 | `reports` tanpa autentikasi | **Selesai (kode)** | Fungsi dihapus dari repo. Fungsi yang masih ter-deploy harus dihapus manual. |
| 5 | Staf bisa memalsukan audit log | **Selesai (kode)** | Policy baru mensyaratkan `user_id = auth.uid()`. Migrasi belum diterapkan. |
| 6 | CSV rusak dan rawan injeksi | **Selesai** | Helper CSV baru, diuji manual untuk `C#`, formula, dan kutip. |
| 7 | Data pribadi anggota diunduh untuk dihitung | **Selesai** | Reports memakai `count: 'exact', head: true`. |
| 8 | Kolom sensitif terbuka untuk anon | **Selesai (kode)** | View `book_copies_public` + policy staff-only. Migrasi belum diterapkan. |
| 9 | `has_role` tanpa `search_path` | **Selesai (kode)** | `ALTER FUNCTION ... SET search_path`. Migrasi belum diterapkan. |
| 10 | `book-metadata` tanpa validasi/rate limit | **Selesai (kode)** | Validasi tipe, regex ISBN, checksum, `encodeURIComponent`, + rate limit 20 req/menit per user/IP (429 + `Retry-After`). Fungsi belum di-deploy ulang. |
| 11 | URL/kunci Supabase bisa diarahkan ke host sembarang | **Selesai** | Host dibatasi + konfirmasi domain di Settings. |
| 12 | Hapus buku menghapus riwayat akuisisi | **Selesai (kode)** | Buku dengan copy diarsipkan (`deleted_at`), copy dan acquisition record dipertahankan. Migrasi belum diterapkan. |
| 13 | Akses member bergantung klaim email JWT | **Belum** | Perlu migrasi `members.user_id` dan policy baru. |
| 14 | CSP dan workaround `window.fetch` | **Selesai** | Workaround inline dihapus; CSP allowlist ditaruh di `index.html`. |
| 15 | `android:allowBackup="true"` | **Selesai (kode)** | Sudah `false`. APK perlu di-build ulang. |
| 16 | Dua modul ISBN berbeda perilaku | **Selesai** | `isbnTools.ts` dihapus; semua pemakai memakai `isbnValidator.ts`; unit test ditambahkan. |
| 17 | Pipeline metadata diduplikasi | **Selesai** | Fallback klien dihapus; `metadataService` hanya memanggil Edge Function `book-metadata`. CSP `connect-src` disempit (tanpa `openlibrary.org`/`*.googleapis.com`). |
| 18 | Fitur digital book belum selesai | **Belum** | 4 file dan 1 migrasi masih 0 byte. Perlu keputusan lanjut atau hapus. |
| 19 | Dependensi/tooling berantakan | **Selesai** | 8 dependensi tak terpakai dihapus, `bun.lock` dihapus, script `clean` diperbaiki, Vitest dan 18 unit test ditambahkan. |
| 20 | Branding/lokalisasi tidak konsisten | **Sebagian** | Config, seed, dan label mata uang diperbaiki. Label UI masih campur Inggris/Indonesia. |
| 21 | Bug simpan `SettingsPage` | **Selesai** | Pengaturan perpustakaan ikut tersimpan saat koneksi berubah. |
| 22 | Tombol uji barcode di produksi | **Selesai** | Hanya tampil saat `import.meta.env.DEV`. |
| 23 | CI/CD belum di-hardening | **Selesai (kode)** | Action dipin ke commit SHA, izin `contents: write` hanya per job rilis, material signing dibersihkan dengan `if: always()`. Workflow belum dijalankan ulang. |
| 24 | Hygiene repository | **Sebagian** | `.gitattributes` ditambahkan, `.env` dan `supabase/.temp/` di-untrack. Riwayat git belum dibersihkan. |
| 25 | Sisa template | **Selesai** | Test Android dipindah ke `org.readowl.library` dan assertion diperbaiki. `proguard-rules.pro` dibersihkan dari komentar template. |
| 26 | Komponen terlalu besar | **Belum** | `ScannerPage`, `BookshelfPage`, dan `libraryService` belum dipecah. |
| 27 | RPC katalog rusak setelah soft delete | **Selesai (kode)** | `ON CONFLICT` diarahkan ke partial unique index `WHERE deleted_at IS NULL`. Migrasi baru belum diterapkan. |

Keterangan status:

- **Selesai** — sudah diperbaiki dan diverifikasi di kode.
- **Selesai (kode)** — kode sudah benar, tetapi migrasi/deploy/rotasi masih diperlukan.
- **Sebagian** — sebagian item sudah dikerjakan.
- **Belum** — belum disentuh.

---

## 3. Perubahan yang sudah dilakukan

### 3.1 Secret dan bundle browser

- `.env` dihapus dari git index dengan `git rm --cached`; file lokal tetap ada.
- `.env.example` dibersihkan:
  - `GEMINI_API_KEY` dihapus.
  - `VITE_GOOGLE_BOOKS_API_KEY` dihapus.
  - Ditambahkan catatan bahwa `GOOGLE_BOOKS_API_KEY` adalah server-only secret.
- `src/services/metadataService.ts` tidak lagi membaca key Google dari `import.meta.env`.
- Fallback Google Custom Search di klien dihapus.
- Google Books fallback klien sekarang tanpa API key.
- `scripts/check-services.ps1` hanya memakai `GOOGLE_BOOKS_API_KEY` dan tidak lagi memeriksa Gemini.
- `dist/` lama yang mengandung key sudah dihapus. Build ulang diverifikasi tidak mengandung key.

### 3.2 Edge Functions

- `supabase/functions/admin/` dihapus.
- `supabase/functions/reports/` dihapus.
- `README.md` diperbarui dengan instruksi `functions delete` untuk project remote.
- `book-metadata` diperketat:
  - Input wajib string.
  - Validasi ISBN-10/ISBN-13 dan checksum di server.
  - `encodeURIComponent` untuk semua URL keluar.
  - Ternary redundant dihapus.
  - Error non-string tidak lagi menghasilkan 500.

### 3.3 Database dan RLS

Migrasi baru:

1. `20261118000000_security_hardening.sql`
   - `has_role` memakai `SET search_path`.
   - Policy audit log mensyaratkan `user_id = auth.uid()`.
2. `20261118000100_public_copy_view.sql`
   - View `book_copies_public` hanya berisi kolom katalog yang aman.
   - `acquisition_price`, `acquisition_source`, dan `notes` tidak diekspos.
   - Anon tidak punya akses.
   - `settings` hanya bisa dibaca user terautentikasi.
3. `20261118000200_branding_localization.sql`
   - Mengganti placeholder alamat/telepon/currency US hanya jika nilainya masih default.
   - Tidak menimpa edit asli pengguna.
4. `20261118000300_soft_delete_books.sql`
   - Menambah `books.deleted_at`.
   - Unique ISBN menjadi partial unique index untuk record aktif.
   - Buku dengan copy diarsipkan, bukan dihapus.
   - Index tambahan untuk pencarian dan pengecekan copy.
5. `20261118000400_fix_book_upsert_soft_delete.sql`
   - Memperbaiki `add_book_with_copies_atomic` agar `ON CONFLICT` menargetkan partial unique index `WHERE deleted_at IS NULL`.
   - ISBN yang sudah diarsipkan dapat dikatalogkan lagi sebagai record aktif baru.

### 3.4 Frontend

- `src/lib/csv.ts` baru:
  - Escape `"` menjadi `""`.
  - Prefix `'` untuk nilai yang diawali `= + - @`.
  - `Blob` + `URL.createObjectURL`, bukan `encodeURI`.
  - BOM UTF-8 untuk Excel.
- `ReportsPage` dan `InventoryPage` memakai helper CSV baru.
- `ReportsPage` memakai `countMembers()` sehingga data pribadi anggota tidak diunduh.
- `SettingsPage` menyimpan pengaturan perpustakaan dalam submit yang sama saat koneksi Supabase berubah.
- `SettingsPage` menampilkan konfirmasi jika domain Supabase berubah.
- `ScannerPage` menyembunyikan tombol ISBN contoh di production.
- Label harga memakai currency dari settings, bukan hardcoded `$`.
- `App.tsx` diperbaiki agar sesuai props `DashboardPage` (`onNavigate`).
- `android:allowBackup` diubah menjadi `false`.

### 3.5 Branding dan cleanup

- `supabase/config.toml`: `project_id = "meeliefont-library"`.
- `supabase/seed.sql`: alamat/telepon kosong, currency `IDR`.
- `defaultSettings`: alamat/telepon kosong, currency `IDR`.
- Placeholder telepon anggota menjadi format Indonesia.
- `package.json`:
  - Nama menjadi `meeliefont-mini-library`.
  - Script `clean` diperbaiki agar cross-platform.
  - Dependensi dihapus: `@google/genai`, `dotenv`, `express`, `motion`, `autoprefixer`, `esbuild`, `tsx`, `@types/express`, `epubjs`.
- `bun.lock` dihapus; hanya `package-lock.json` yang dipakai.
- `npm install` membersihkan 152 paket tidak terpakai.

### 3.6 Hygiene repository

- `.gitattributes` baru dengan `* text=auto eol=lf` dan aturan binary.
- `supabase/.temp/` di-untrack dan masuk `.gitignore`.
- `.env*` tetap di `.gitignore`.

### 3.7 Re-audit dan perbaikan lanjutan

- RPC `add_book_with_copies_atomic` diperbaiki agar tidak gagal setelah unique ISBN menjadi partial index. Isi fungsi diverifikasi identik dengan versi lama kecuali target `ON CONFLICT`.
- Pencarian buku di mode lokal tidak lagi memakai record yang sudah diarsipkan, sehingga ISBN lama dapat dikatalogkan ulang tanpa menimpa arsip.
- `metadata.json` tidak lagi mendeklarasikan `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`.
- Catatan `GOOGLE_CUSTOM_SEARCH_*` yang sudah tidak dipakai dihapus dari `.env.example`.
- Modul ganda `src/services/isbnTools.ts` dihapus; `codeResolver.ts` memakai `isbnValidator.ts`.
- Test Android dipindah ke package `org.readowl.library`; assertion instrumented test sekarang memakai `applicationId` yang benar.
- Vitest ditambahkan (`npm test`):
  - `src/services/isbnValidator.test.ts`
  - `src/services/codeResolver.test.ts`
  - `src/lib/csv.test.ts`
- CI Android:
  - Semua action dipin ke commit SHA.
  - Izin global menjadi `contents: read`; `contents: write` hanya untuk job rilis.
  - Keystore dan `google-services.json` dihapus dengan `if: always()`.
- Label harga di Reports dan Inventory memakai currency dari settings.
- `src/lib/supabase.ts` menolak key `service_role` dan `sb_secret_*` di browser.
- `vite.config.ts` memakai `import.meta.dirname` dan komentar encoding diperbaiki.

---

## 4. File yang berubah

### File baru

- `.gitattributes`
- `PROGRESS.md`
- `android/app/src/androidTest/java/org/readowl/library/ExampleInstrumentedTest.java`
- `android/app/src/test/java/org/readowl/library/ExampleUnitTest.java`
- `src/lib/csv.ts`
- `src/lib/csv.test.ts`
- `src/services/codeResolver.test.ts`
- `src/services/isbnValidator.test.ts`
- `supabase/migrations/20261118000000_security_hardening.sql`
- `supabase/migrations/20261118000100_public_copy_view.sql`
- `supabase/migrations/20261118000200_branding_localization.sql`
- `supabase/migrations/20261118000300_soft_delete_books.sql`
- `supabase/migrations/20261118000400_fix_book_upsert_soft_delete.sql`

### File dihapus dari git

- `.env`
- `bun.lock`
- `src/services/isbnTools.ts`
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`
- `supabase/.temp/*`
- `supabase/functions/admin/index.ts`
- `supabase/functions/reports/index.ts`

### File diubah

- `.env.example`
- `.gitignore`
- `.github/workflows/android-release.yml`
- `README.md`
- `android/app/src/main/AndroidManifest.xml`
- `metadata.json`
- `package.json`
- `package-lock.json`
- `scripts/check-services.ps1`
- `src/App.tsx`
- `src/lib/supabase.ts`
- `src/pages/BookshelfPage.tsx`
- `src/pages/InventoryPage.tsx`
- `src/pages/MembersPage.tsx`
- `src/pages/ReportsPage.tsx`
- `src/pages/ScannerPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/services/codeResolver.ts`
- `src/services/libraryService.ts`
- `src/services/metadataService.ts`
- `src/types/library.ts`
- `supabase/config.toml`
- `supabase/functions/book-metadata/index.ts`
- `supabase/seed.sql`
- `vite.config.ts`

---

## 5. Verifikasi yang sudah dijalankan

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | Lulus |
| `vite build` | Lulus |
| `npm test` (Vitest) | 3 file, 18 test lulus |
| Scan key Google di `dist/assets/*.js` | 0 kecocokan |
| Uji CSV (`node` + `src/lib/csv.ts`) | `C# Programming` utuh, `=SUM(1,1)` dan `-5` diberi prefix `'`, kutip menjadi `""` |
| Perbandingan RPC lama vs baru | Identik kecuali target `ON CONFLICT` |
| `npm run clean` | Berhasil |
| `git diff --check` | Bersih (hanya warning konversi CRLF→LF dari `.gitattributes`) |
| `git grep` referensi fungsi admin/reports | Tidak ada referensi tersisa |
| `git grep` key Google/Gemini di source | Tidak ada pembacaan client-side |

Catatan: `vite build` masih memberi warning ukuran chunk > 500 kB. Itu bukan error.

---

## 6. Checklist deploy

Urutan yang disarankan:

```bash
# 1. Terapkan semua migrasi baru
npx supabase db push

# 2. Deploy ulang Edge Function metadata
npx supabase functions deploy book-metadata

# 3. Hapus fungsi berbahaya yang mungkin masih ter-deploy
npx supabase functions delete admin
npx supabase functions delete reports
```

Penting:

- **Migrasi harus diterapkan sebelum frontend baru di-deploy.** Frontend memakai `book_copies_public` dan `books.deleted_at`.
- APK yang sudah beredar masih mengandung key Google lama. Setelah key dirotasi, build dan distribusikan APK baru.

---

## 7. Pekerjaan yang masih memerlukan akses/aksi eksternal

1. **Rotasi key**
   - `GEMINI_API_KEY` (sudah tidak dipakai kode).
   - Google Books API key.
   - Key Google lain yang pernah ada di `.env`.
   - Pertimbangkan rotasi Supabase publishable key jika ada indikasi penyalahgunaan.

2. **Bersihkan riwayat git**
   ```bash
   git filter-repo --path .env --invert-paths
   git push --force-with-lease
   ```
   Ini destruktif dan memaksa semua clone/CI melakukan re-clone.

3. **Supabase Auth remote**
   - Pastikan public sign-up nonaktif.
   - Pastikan konfirmasi email aktif.

4. **Deploy function**
   - `book-metadata` versi terbaru.
   - Hapus `admin` dan `reports` yang masih ter-deploy.

5. **Rebuild APK**
   - Setelah `allowBackup=false` dan key dirotasi.

---

## 8. Pekerjaan yang belum dikerjakan

- Migrasi `members.user_id` untuk mengganti pencocokan email JWT.
- Keputusan fitur digital book: lanjut atau hapus.
- Meninjau 11 advisory `npm audit` pada rantai `firebase`/`@grpc/grpc-js`; perbaikan otomatis memerlukan downgrade besar.
- Menjalankan workflow Android sekali untuk memvalidasi pin SHA dan cleanup.
- Pecah `ScannerPage`, `BookshelfPage`, dan `libraryService`.

Selesai 19 November 2026 (lihat §18–§23): CSP + penghapusan workaround `window.fetch`, rate limit `book-metadata`, cleanup `proguard-rules.pro`, tombol restore buku arsip, pipeline metadata tunggal via Edge Function.

---

## 9. Catatan kompatibilitas

Beberapa identifier lama sengaja dipertahankan:

- **`org.readowl.library`** — sesuai README, agar aplikasi Android yang sudah terpasang tidak dianggap aplikasi berbeda.
- **Key `localStorage` `readowl_*`** — agar konfigurasi dan sesi pengguna lama tidak hilang.
- **Prefix inventaris `RDW`** — agar inventory code dan barcode yang sudah ada tetap valid.
- **Nama sequence `readowl_inventory_code_seq`** — bagian dari skema historis.
- **View `book_copies_public`** — memakai security-definer semantics agar Member bisa melihat copy tanpa kolom harga. Ini disengaja; Supabase advisor mungkin memberi catatan.
- **Currency default `IDR`** — hanya untuk instalasi/seed baru. Data lama hanya diubah jika masih memakai placeholder US.

---

## 10. Log update

### 18 November 2026 — Batch 1: verifikasi dan temuan kritis

- Verifikasi repo, riwayat `.env`, fungsi yang tidak dipakai, dan file digital book 0 byte.
- `.env` di-untrack.
- `admin` dan `reports` dihapus.
- Key Google dihapus dari bundle.
- `book-metadata` divalidasi.
- Migrasi hardening RLS dibuat.
- CSV, Settings, member count, dan tombol test barcode diperbaiki.
- `allowBackup` dimatikan.
- `.gitattributes` dan untrack `supabase/.temp/`.

### 18 November 2026 — Batch 2: pembatasan data anon

- View `book_copies_public` dibuat.
- Policy `book_copies` dan `settings` diperketat.
- Frontend membaca copy dari view aman.
- URL Supabase dibatasi dan diberi konfirmasi domain.

### 18 November 2026 — Batch 3: branding dan cleanup

- `project_id` dan seed diperbarui.
- Currency label menjadi dinamis.
- Dependensi tak terpakai dihapus.
- `bun.lock` dihapus.
- `package.json` dan script `clean` diperbaiki.

### 18 November 2026 — Batch 4: soft delete

- Kolom `books.deleted_at` dan migrasi terkait dibuat.
- Buku dengan copy diarsipkan.
- Copy dan acquisition record dipertahankan.
- UI konfirmasi diperbarui.
- README diperbarui.

### 18 November 2026 — Batch 5: re-audit dan Phase 1

- Re-audit schema/RLS, alur service frontend, pipeline metadata, konfigurasi Android, dan workflow CI.
- Regresi `ON CONFLICT` pada RPC katalog ditemukan dan diperbaiki lewat migrasi `20261118000400`.
- Pencarian ISBN lokal tidak lagi memakai buku yang diarsipkan.
- Modul `isbnTools.ts` dihapus dan digabung ke `isbnValidator.ts`.
- Vitest dan 18 unit test untuk ISBN, resolver kode, dan CSV ditambahkan.
- Test Android dipindah ke package `org.readowl.library`.
- Action CI dipin ke SHA, izin dipersempit, dan material signing dibersihkan.
- Capability Gemini di `metadata.json` dan catatan Custom Search lama dihapus.
- Label currency Reports/Inventory dan komentar encoding `vite.config.ts` diperbaiki.
- Verifikasi ulang: `tsc`, `vite build`, `npm test`, scan secret bundle, dan `git diff --check` lulus.

### 18 November 2026 — Dokumentasi

- `PROGRESS.md` dibuat sebagai log progres dan checklist deploy.

### 18 November 2026 — Tahap persiapan keamanan & production (audit read-only)

- Audit dampak kebocoran credential di `.env` dan seluruh riwayat Git.
- Audit remote Supabase Edge Functions (`admin`, `reports`) — terblokir tanpa token.
- Pemeriksaan 5 migrasi berurutan terhadap schema production.
- Verifikasi branch, remote, staged diff, dan jaminan `.env` tidak masuk commit.
- **Tidak ada perubahan kode, credential, migrasi, atau commit pada tahap ini.**

### 18 November 2026 — Security Remediation Planning

- Menyetujui hasil audit persiapan keamanan & production.
- Membuat `SECURITY-REMEDIATION.md` (checklist 9 bagian, seluruhnya **IN PROGRESS**).
- Audit tambahan: drift `initial_schema.sql`, file migrasi 0 byte, kebutuhan secret Edge Function.
- Percobaan `supabase migration list --remote` → terblokir `AccessTokenRequiredError`.
- **Tidak ada rotasi, penghapusan fungsi, migrasi, rewrite history, commit, atau Phase 1.**

### 18 November 2026 — Audit struktur & perancangan In-App APK Updater

- Audit read-only seluruh struktur repository (frontend, Android, Supabase, CI, dokumentasi).
- Membuat `READOWL-ARCHITECTURE.md` (struktur aktual + arsitektur + temuan F-1…F-10).
- Membuat `READOWL-UPDATER-PLAN.md` (rancangan Custom In-App APK Updater — **perencanaan saja**).
- Keputusan: distribusi APK langsung via link/website resmi, **bukan Play Store**.
- **Tidak ada perubahan kode, konfigurasi Android, build APK, migrasi, commit, push, atau Phase 1.**

### 18 November 2026 — Implementasi Tahap A: fondasi updater

- Persetujuan implementasi diterima (distribusi APK langsung; manifest = sumber kebenaran versi; FCM tetap sebagai notifikasi tambahan; Ed25519 = Tahap E).
- Membuat `scripts/version-utils.mjs` (skema versionCode `MAJOR*1e6+MINOR*1e3+PATCH`, gate monoton).
- Membuat `scripts/generate-latest-manifest.mjs` (generator `latest.json` + allowlist URL + fail-closed).
- CI: injeksi `VITE_APP_VERSION`/`VITE_APP_VERSION_CODE`, ganti `GITHUB_RUN_NUMBER`, verifikasi unggahan APK, step **Publish update manifest**.
- Dokumentasi: `README.md` §5, `.env.example`, npm scripts `release:*`; `PROGRESS.md` section 14.
- Verifikasi: tsc 0 · 18/18 test · build PASS · diff-check 0 · YAML/bash valid · secret scan 0.
- **Tidak ada commit, push, deploy, upload APK/manifest produksi, migrasi, rotasi, atau Phase 1.**

### 18 November 2026 — Dokumentasi rekapitulasi

- Menambahkan `PROGRESS.md` **section 16**: ikhtisar rapi seluruh perubahan dari awal sampai Tahap A — timeline 10 tahap, daftar kumulatif file baru/ubah/hapus per tahap, file yang tidak pernah disentuh, verifikasi gabungan, status akhir (DONE/IN PROGRESS/BLOCKED/WARNING), dan angka ringkas.
- Riwayat lama dipertahankan utuh (semua 10 entri log + section 1–15 tidak diubah isi).
- **Tidak ada perubahan kode/konfigurasi pada langkah ini.**

### 18 November 2026 — Audit read-only sebelum commit (branch `security/hardening-and-updater-stage-a`)

- Audit 5 fokus: `bun.lock`, `src/services/isbnTools.ts`, `package.json`, staging, dokumentasi.
- **Bun**: 0 pemakaian di kode/CI/scripts/dokumentasi (hanya sebutan di `PROGRESS.md` sendiri) → `bun.lock` **SAFE TO COMMIT**.
- **isbnTools**: semua 7 ekspor HEAD ada di `isbnValidator.ts`, referensi kode tersisa **0**, satu-satunya importer (`codeResolver`) kini dari `./isbnValidator` → **SAFE TO COMMIT**.
- **package.json**: 9 dependensi dihapus (log Batch 3 menyebut 8 — selisih dicatat di §17), pemakaian di source **0**, `package-lock.json` konsisten penuh → `npm ci` aman.
- **Staging**: 14 penghapusan persis rencana §16.4; **2 script updater masih untracked** → wajib ikut commit yang sama (NEEDS REVIEW atomisitas).
- Verifikasi: tsc 0 · 18/18 test · `git diff --check` 0 (staged & unstaged) · CI YAML/bash valid · secret scan 0.
- **Tidak ada `git add`/`restore`/`reset`/`commit`/`push`, staging tidak diubah, tidak ada perubahan kode** (hanya `PROGRESS.md` ini).

### 19 November 2026 — Lanjutan item kode aman

- Workaround `window.fetch` dihapus; CSP allowlist ditambahkan di `index.html`.
- Rate limit 20 req/menit per user/IP ditambahkan ke `book-metadata` + 3 unit test.
- `proguard-rules.pro` dibersihkan dari komentar template.
- Tombol "Arsip" + "Pulihkan" ditambahkan: `getArchivedBooks()` / `restoreBook()` di `libraryService` dan panel arsip di `BookshelfPage`.
- Verifikasi: tsc 0 · 21/21 test · build PASS · diff-check 0.
- **Tidak ada commit/push/deploy/migrasi/rotasi.**

### 19 November 2026 — Tahap B: update checker

- `updateService.ts` + 11 unit test: validasi manifest V1–V10, allowlist URL, throttle 6–24 jam, cache 24 jam, retry 1x, evaluate/force/dismiss.
- `useAppUpdater.ts`: cek otomatis di Android setelah 3 detik, cek manual, dismiss, sinyal FCM.
- `UpdateBanner.tsx` + `UpdateDialog.tsx`; `UpdateNotifications.tsx` jadi pemicu cek saja (anti banner kembar).
- `App.tsx` mount checker/banner/dialog; `SettingsPage` section "Application Updates".
- CI menyuntik `VITE_UPDATE_MANIFEST_URL` dari `APK_STORAGE_BUCKET`; `.env.example` + README diperbarui.
- Verifikasi: tsc 0 · 32/32 test · build PASS · YAML/bash valid · diff-check 0.
- **Tidak ada commit/push/deploy/APK/migrasi/rotasi.**

### 19 November 2026 — Tahap C: APK downloader

- Plugin native `AppUpdaterPlugin` (Java): unduh HTTPS via `HttpURLConnection`, progress, resume `Range`, batal, cleanup >7 hari, verifikasi ukuran + SHA-256, cache `cacheDir/updates`.
- `MainActivity` mendaftarkan plugin. Bridge `updaterBridge.ts` + tipe `src/types/updater.ts`.
- `useAppUpdater` mengelola state unduhan; `UpdateDialog` menampilkan progress/batal + fallback browser.
- Verifikasi: tsc 0 · 32/32 test · build PASS · javac PASS (stub Capacitor) · diff-check 0.
- **Tidak ada build APK, commit, deploy, instalasi otomatis, atau perubahan Android permission.**

### 19 November 2026 — Tahap D: APK installer

- `REQUEST_INSTALL_PACKAGES` ditambahkan ke `AndroidManifest`.
- `AppUpdaterPlugin.install`: validasi file, cek `canRequestPackageInstalls()` (API 24+ fallback ke `getPackageInfo`), `ACTION_VIEW` + FileProvider `org.readowl.library.fileprovider`, flag `FLAG_GRANT_READ_URI_PERMISSION`.
- `openSettings`: `ACTION_MANAGE_UNKNOWN_APP_SOURCES` (API 26+) / `ACTION_APPLICATION_SETTINGS` (API 24).
- Hook `installApk`/`openInstallerSettings` + `installError`; `UpdateDialog` tombol "Instal APK" + pesan error + link buka pengaturan.
- Verifikasi: tsc 0 · 32/32 test · build PASS · javac PASS (stub Capacitor) · diff-check 0.
- **Tidak ada build APK, commit, deploy, atau perubahan keystore.**

### 19 November 2026 — Tahap E: security & testing

- `scripts/sign-manifest.mjs`: generate keypair Ed25519 + tanda tangan manifest (canonical JSON).
- `updateService.ts`: publik key di-pin + `verifyManifestSignature` (Web Crypto Ed25519) → manifest tanpa signature valid ditolak.
- `AppUpdaterPlugin.install`: S5 validasi package id + S6 banding signature APK vs app terpasang.
- CI: langkah sign `latest.json` dengan secret `UPDATER_SIGNING_PRIVATE_KEY`.
- Verifikasi: tsc 0 · 35/35 test · build PASS · javac PASS · YAML/bash valid · roundtrip sign→verify PASS · diff-check 0.
- **Tidak ada commit, push, deploy, build APK, atau perubahan keystore.**

### 19 November 2026 — Pipeline metadata tunggal

- `metadataService.ts` dipangkas: hanya memanggil Edge Function `book-metadata`; fetch langsung Open Library/Google Books dihapus dari klien.
- CSP `connect-src` disempit (hapus `openlibrary.org` + `*.googleapis.com`).
- Dokumentasi README §struktur/§fitur dan `READOWL-ARCHITECTURE.md` disesuaikan.
- Verifikasi: tsc 0 · 35/35 test · build PASS · diff-check 0.
- **Tidak ada commit, deploy, atau perubahan Edge Function.**

### 19 November 2026 — Konfigurasi Vercel (services)

- `vercel.json` dibuat: mode services, satu service `app` (Vite, root `.`), rewrite catch-all `/(.*) → app`.
- Audit: `src-tauri` dimasukkan sebagai kandidat service tapi **dikecualikan** (shell desktop Tauri, tanpa `build.rs`/`icons`, tanpa HTTP handler — bukan server); **0 binding** karena tidak ada panggilan antar-service (app hanya memanggil Supabase via env build-time); tidak ada perubahan kode routing (app di `/`, tanpa prefix).
- Dikonfirmasi user: nama service `app` saja · publik hanya `app` di `/` · tanpa binding.
- JSON valid, `git diff --check` 0. **Tidak ada commit/push/deploy.**

### 19 November 2026 — Tahap F: desktop updater (Windows + macOS)

- `src-tauri` diaktifkan: `build.rs`, `capabilities/default.json`, plugin `updater`+`process` (Cargo + main.rs), ikon dari logo (`tauri icon`), `createUpdaterArtifacts`, pubkey minisign di-pin.
- Keypair minisign dihasilkan (`tauri signer generate --ci`); private key di `/tmp/opencode/tauri-desktop.key` (luar repo) → wajib disimpan sebagai secret `TAURI_SIGNING_PRIVATE_KEY`.
- Script CI: `prepare-desktop-build.mjs` (versi tag → tauri.conf/Cargo.toml + endpoint updater dari bucket) dan `generate-desktop-manifest.mjs` (manifest Tauri v2, fail-closed).
- Workflow `desktop-release.yml`: build signed di windows + macos (arm64) → stage artifact → job publish: upload GCS `desktop/` + verifikasi content-length → `desktop/latest.json` terbit terakhir.
- Frontend: cek desktop via `@tauri-apps/plugin-updater` (startup 3 dtk + manual Settings) + `DesktopUpdateBanner` + relaunch via plugin-process.
- Repo **private** → endpoint updater memakai GCS publik, bukan GitHub Releases.
- Verifikasi: `cargo check` PASS · tsc 0 · 35/35 test · web build PASS · `tauri info` parse OK · YAML + `bash -n` OK · uji 2 script (positif + fail-closed) PASS · roundtrip signer PASS · diff-check 0.
- **Tidak ada commit/push/tag/build rilis nyata.**

### 19 November 2026 — Tahap G: iOS via PWA + Web Push

- Keputusan user: jalur **PWA + Web Push** (tanpa akun Apple); App Store ditunda.
- PWA: `public/manifest.webmanifest`, meta iOS di `index.html`, ikon 180/192/512 dari logo.
- `public/sw.js`: handler push + notificationclick (focus/klik → reload bila app terbuka); **tanpa fetch handler** = tanpa cache, selalu load deploy terbaru.
- `pushService.ts` + 3 test: subscribe/unsubscribe (VAPID decode), simpan/hapus subscription ke tabel `push_subscriptions` (RLS own-row).
- Section Settings "Notifikasi Update (Web / iOS)" + hint Add-to-Home-Screen untuk iOS browser; `App.tsx` daftar SW + listener reload.
- Migrasi `20261119000000_push_subscriptions.sql` (file saja — `db push` tetap dilarang).
- Edge Function `send-update-push`: secret header, kirim via `npm:web-push`, hapus subscription mati (404/410); `deno check` PASS.
- CI `notify-devices`: step baru kirim push web setelah FCM (butuh secret `SUPABASE_FUNCTIONS_URL` + `UPDATE_PUSH_SECRET`).
- Verifikasi: tsc 0 · 38/38 test · build PASS · deno check PASS · diff-check 0.
- **Tidak ada commit/push/deploy/migrasi berjalan.**

### 19 November 2026 — Tahap H: hapus seluruh data model physical copy

- Permintaan user: hapus fitur/menu "Physical Inventory" di detail buku → dikonfirmasi lanjut **hapus semua data model**.
- Migrasi destruktif `20261119000100_remove_physical_copies.sql`: buat RPC `add_book_atomic` pengganti → drop `add_book_with_copies_atomic`, borrow/return functions, view `book_copies_public`, 5 tabel (copy/borrow/return/acquisition), enum, sequence, setting `inventory_config`+`circulation_rules`. Soft-delete buku & tabel `members` tetap.
- Kode: hapus tipe `BookCopy`/`CopyStatus`/`Book.copies`/`inventory_config`; `addBookWithCopies` → `addBook` (RPC baru); hapus method copy; hilangkan copy hydration di getBooks/getBookByIsbn/getArchivedBooks; `deleteBook` selalu arsipkan.
- UI: hapus `InventoryPage`, blok detail buku (sebelumnya), form copy ScannerPage + resolver kode inventaris; bersihkan filter/ribbon/metrik copy di Bookshelf/Dashboard; ReportsPage ditulis ulang jadi laporan katalog+anggota.
- Test: asersi kode inventaris `codeResolver.test.ts` → `unknown`.
- Docs: README + arsitektur disesuaikan (riwayat migrasi lama tetap tercatat sebagai histori).
- Verifikasi: tsc 0 · 38/38 test · build PASS · diff-check 0.
- **Tidak ada commit/push/migrasi dijalankan — migrate = penghapusan data permanen.**

### 19 November 2026 — Tahap I: hapus member/patron + tanggal & jam buku

- Permintaan user: hapus fitur, menu, dan DB member; tambahkan tanggal + jam saat buku ditambahkan.
- `20261119000200_remove_members.sql`: drop tabel `public.members` + enum `membership_type_enum`/`member_status_enum`. **Peran aplikasi 'Member' (RBAC) tidak dihapus.**
- Kode: hapus tipe `Member`/`MembershipType`/`MemberStatus`, `MembersPage`, nav/route `members`, 4 method member di `LibraryService`, KPI anggota di ReportsPage.
- Tanggal/jam: helper `src/lib/datetime.ts` (`formatAddedAt`, `created_at` yang sudah ada). Dipakai di banner sukses Scanner, kolom "Ditambahkan" tabel Bookshelf, detail buku, dan daftar buku terbaru Dashboard. 2 test baru.
- Verifikasi: tsc 0 · 40/40 test · build PASS · diff-check 0.
- **Tidak ada commit/push/migrasi dijalankan.**

---

## 11. Tahap Persiapan Keamanan & Production — 18 November 2026

> Status tahap ini: **audit selesai (read-only). Implementasi ditunda sampai review disetujui.**

### 11.1 Tujuan pekerjaan

Menilai kesiapan keamanan dan production sebelum Phase 1 dimulai, khususnya:

1. Dampak kebocoran credential di `.env` dan Git history.
2. Kesiapan rotasi key (Google/Gemini dan Supabase).
3. Kondisi remote Supabase Edge Functions.
4. Kelayakan 5 migrasi terhadap schema production.
5. Integritas branch/remote/staged diff sebelum commit.
6. Urutan eksekusi yang aman untuk seluruh pekerjaan.

### 11.2 Pemeriksaan yang dilakukan

| # | Pemeriksaan | Metode | Hasil |
|---|---|---|---|
| 1 | Riwayat `.env` | `git log --all -- .env` | Hanya 1 commit: `c64df66` (`update v0.4`), aksi `A` (add). Belum pernah dihapus dari riwayat. |
| 2 | Seluruh object riwayat | Scan 321 object via `git rev-list --all --objects` + `cat-file` | Secret-shaped string hanya di `.env`. |
| 3 | Dokumen (`README.md`, `.env.example`, `PROGRESS.md`, `config.toml`) | Pola `sb_publishable_`/`AIza`/JWT | Semua **placeholder** (`sb_publishable_your_key_here`), false positive. |
| 4 | Remote Edge Functions | `npx supabase functions list` | **Terblokir**: `AccessTokenRequiredError`. |
| 5 | Source Edge Functions | `git show HEAD:supabase/functions/{admin,reports}/index.ts` | Dibaca dari riwayat (read-only). |
| 6 | 5 migrasi berurutan | Read + cross-check ke `initial_schema.sql` & `circulation_logic.sql` | Detail di 11.5. |
| 7 | Branch / remote / staged | `git branch -vv`, `git remote -v`, `git diff --cached --diff-filter=A` | Detail di 11.6. |

### 11.3 File atau komponen yang terdampak

**Tidak ada file project yang diubah pada tahap ini.** Yang dibaca saja:

- `.env` (lokal, tidak di-track), `.env.example`, `README.md`, `PROGRESS.md`
- `supabase/migrations/20261118000000` … `20261118000400` (5 file)
- `supabase/migrations/20261102000000_initial_schema.sql`, `20261104000000_circulation_logic.sql`, `20261105163600_rebrand_meeliefont.sql`, `20261105170000_digital_books.sql`
- `supabase/functions/admin/index.ts`, `supabase/functions/reports/index.ts` (dari HEAD)
- `supabase/config.toml`, `supabase/.temp/project-ref`, `supabase/.temp/linked-project.json`
- `src/App.tsx`, `src/services/libraryService.ts`

Script audit disimpan di luar repo (`%TEMP%\opencode\`), bukan di project.

### 11.4 Perubahan yang benar-benar dilakukan

**TIDAK ADA.** Tahap ini murni read-only:

- ❌ Tidak ada commit / push
- ❌ Tidak ada `supabase db push` atau migrasi dijalankan
- ❌ Tidak ada credential diubah / dirotasi
- ❌ Tidak ada Git history di-rewrite
- ❌ Tidak ada Edge Function dihapus / di-deploy
- ❌ Phase 1 belum dimulai

### 11.5 Temuan keamanan dan risiko

#### A. Kebocoran credential (temuan kritis — belum ditangani)

`.env` masuk riwayat di `c64df66` dan **masih ada di history sampai sekarang**. Key terdampak (nilai tidak ditampilkan):

| Key | Tipe | Status |
|---|---|---|
| `VITE_SUPABASE_URL` | Endpoint project (`jrlpwmsgptayfymguhnl`) | **Terdampak** — bukan secret ketat, tapi mengidentifikasi project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (46 char) | **Terdampak** — memang publik untuk klien, tapi wajar ditinjau |
| `VITE_GOOGLE_BOOKS_API_KEY` | `AIzaSy…` (39 char) | **Terdampak — wajib dirotasi** |
| `GEMINI_API_KEY` | `AQ.…` (53 char) | **Terdampak — wajib dirotasi**; kode sudah tidak memakainya |
| `APP_URL` | Placeholder `MY_APP_URL` | Aman |

Catatan: `.env` **masih ada di disk** (882 byte, nilai asli) dan sudah ter-ignore (`.gitignore:7`), ter-stage sebagai penghapusan (`D `). File `.env.example` berisi placeholder bersih.

#### B. Remote Edge Functions — status UNKNOWN (terblokir)

| Fungsi | Lokal (repo) | Di HEAD | Remote | Endpoint (bila ter-deploy) | Autentikasi | Risiko |
|---|---|---|---|---|---|---|
| `book-metadata` | ✅ ada | ✅ | **Tidak bisa dicek** | `…/functions/v1/book-metadata` | JWT default (`verify_jwt=true`), input tervalidasi | Rendah |
| `admin` | ❌ dihapus | **masih ada** | **Tidak bisa dicek** | `…/functions/v1/admin` | Hanya `auth.getUser` — **tidak cek role** | **KRITIS** — `assign_role` memakai `SUPABASE_SERVICE_ROLE_KEY`; user login mana pun bisa jadi Administrator |
| `reports` | ❌ dihapus | **masih ada** | **Tidak bisa dicek** | `…/functions/v1/reports` | **Tidak ada pemeriksaan pemanggil** | **TINGGI** — bocorkan jumlah anggota, valuasi, jumlah copy via anon key |

- Tidak ada section `[functions.*]` di `config.toml` → `verify_jwt` memakai default `true`.
- `admin` dan `reports` **masih di HEAD** karena penghapusan belum di-commit (sesuai batasan).
- **Risiko utama: celah privilege escalation bisa masih aktif di production.**

#### C. Risiko migrasi (belum dijalankan)

| # | Risiko | Level |
|---|---|---|
| M1 | `20261105170000_digital_books.sql` **0 byte** dan posisinya **sebelum** 5 migrasi baru. Jika belum terpasang di remote, `db push` bisa gagal atau no-op dan menggagalkan seluruh batch. | **WARNING** |
| M2 | `DROP CONSTRAINT IF EXISTS books_isbn_13_key` — nama asumsi dari konvensi PostgreSQL atas `isbn_13 VARCHAR(13) NOT NULL UNIQUE`. Jika di production nama constraint berbeda, DROP diam-diam no-op → partial index baru dibuat tapi constraint lama aktif → katalog ulang ISBN terarsip gagal. | **WARNING** |
| M3 | State migrasi production **tidak bisa diverifikasi** tanpa akses DB. Belum diketahui apakah 5 migrasi ini, atau migrasi lama, sudah pernah diterapkan sebagian. | **WARNING** |
| M4 | `20261118000100` mencabut policy `Public can view copies` dan `Public can view settings`. Frontend sudah aman (`getBooks`/`getBookByIsbn` baca `book_copies_public`; `loadCloudSettings` hanya dipanggil setelah `current_user_role` sukses). | Rendah |

**Cross-check yang lolos:**

- `ALTER FUNCTION public.has_role(text)` cocok dengan `has_role(p_role TEXT)` di `initial_schema.sql:264`.
- Semua `DROP POLICY IF EXISTS` menunjuk nama policy yang memang ada (`Staff can insert activity logs`, `Public can view copies`, `Public can view settings`, `Public can view catalog`).
- `20261118000400` identik dengan fungsi asli kecuali **1 baris** `ON CONFLICT` (sudah diverifikasi per-band sebelumnya).
- `20261118000200` = UPDATE bersyarat, tidak menimpa edit user.
- Urutan timestamp 5 migrasi berurutan benar (`000000` → `000400`).

#### D. Integritas repo sebelum commit

| Pemeriksaan | Hasil |
|---|---|
| Branch | `main` @ `ba4ab9f` (`update v0.8`), tracking `origin/main` |
| Remote | `https://github.com/Mr-Young-62/mini-book.git` |
| Staged | 14 entri, **semuanya penghapusan (`D`)** |
| `git diff --cached --diff-filter=A` | **Kosong** — tidak ada file ditambahkan ke index |
| `.env` di index | Tidak ada (`git ls-files --stage .env` kosong); status `D ` |
| `git check-ignore .env` | `.gitignore:7:.env*` |
| Artefak build | `dist/` sudah dibangun lalu dihapus; `node_modules`/`build` ter-ignore |

**Kesimpulan: `.env` tidak akan masuk sebagai file baru dalam commit apa pun, termasuk `git add -A`.**

### 11.6 Hasil test dan verifikasi

Dijalankan ulang pada tahap ini (aman, tanpa database):

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0** — PASS |
| `vite build` | **0** — PASS (warning chunk >500kB, non-fatal) |
| `vitest run` | **3 file / 18 test lulus** — PASS |
| `git diff --check` | **0** — PASS (hanya warning CRLF→LF) |
| `npm install --package-lock-only --dry-run` | `up to date` — `npm ci` aman — PASS |
| Scan key Google/Gemini di bundle | **0 kecocokan** — PASS |
| Scan 13 file untracked | **0 secret** — PASS |
| Riwayat Git (321 object) | Secret hanya di `.env` — terkonfirmasi |

### 11.7 Keputusan yang sudah disetujui

1. ✅ **Phase 0 disetujui** oleh user (implementasi Phase 0 diterima).
2. ✅ **Phase 1 belum boleh dimulai** — menunggu tahap persiapan ini disetujui.
3. ✅ Seluruh tahap ini **read-only**; rotasi, migrasi, commit, push, rewrite history, dan penghapusan fungsi remote **dilarang** tanpa instruksi eksplisit.
4. ✅ Semua 54 entri `git status` dinyatakan aman untuk commit, dengan `.env` sebagai satu-satunya eksklusi eksplisit (jangan pernah `git add -f .env`).
5. ✅ Key publishable Supabase di bundle dianggap **by design**, bukan kebocoran.

### 11.8 Pekerjaan yang masih tertunda

| Status | Pekerjaan | Penanggung jawab |
|---|---|---|
| **DONE** | Audit dampak credential + identifikasi key terdampak | Audit selesai, terverifikasi |
| **DONE** | Audit 5 migrasi terhadap schema produksi (cross-check lokal) | Selesai |
| **DONE** | Verifikasi branch, remote, staged diff, jaminan `.env` | Selesai, PASS |
| **DONE** | Test & verifikasi ulang (tsc/build/test/diff/lockfile) | Selesai, PASS |
| **IN PROGRESS** | Menyusun checklist rotasi (dokumen) — belum ditulis ke file | Menunggu persetujuan |
| **IN PROGRESS** | Menetapkan urutan eksekusi aman (lihat 11.9) | Menunggu persetujuan |
| **BLOCKED** | Audit remote Edge Functions (`admin`/`reports` status, endpoint aktif) | Butuh `supabase login` / `SUPABASE_ACCESS_TOKEN` — **aksi user** |
| **BLOCKED** | Verifikasi state migrasi & constraint produksi (risiko M2/M3) | Butuh akses read-only DB — **aksi user** |
| **BLOCKED** | Rotasi `GEMINI_API_KEY`, Google Books API key | **Aksi user** di Google Cloud Console / AI Studio |
| **BLOCKED** | Rotasi/tinjau Supabase publishable key | **Aksi user** di Supabase Dashboard |
| **BLOCKED** | Bersihkan riwayat Git (`git filter-repo`) | **Aksi user** — destruktif, butuh konfirmasi |
| **BLOCKED** | Hapus fungsi `admin`/`reports` yang masih ter-deploy | **Aksi user** — butuh konfirmasi eksplisit |
| **BLOCKED** | Terapkan 5 migrasi (`npx supabase db push`) | **Aksi user** — urutan setelah M1 ditangani |
| **TERTUNDA** | Phase 1 (perbaikan low-risk) | Menunggu persetujuan tahap ini |
| **TERTUNDA** | Keputusan 5 file digital-book 0 byte (lanjut/hapus) | Keputusan user |

### 11.9 Urutan eksekusi yang aman

Tahap ini belum dijalankan — disusun untuk persetujuan.

```text
TAHAP A — Persiapan (tanpa dampak production)
  A1. User: supabase login  → memberi akses audit remote
  A2. Audit remote: functions list → catat status admin/reports
  A3. User: verifikasi state migrasi produksi (read-only SQL)
  A4. User: tangani migrasi 0 byte 20261105170000 (putuskan: isi atau hapus)
  A5. Susun & review checklist rotasi

TAHAP B — Rotasi credential (AFTER A, SEBELUM C)
  B1. Rotate GEMINI_API_KEY
  B2. Rotate Google Books API key → set sebagai secret Edge Function
  B3. Tinjau/rotate Supabase publishable key bila dianggap perlu
  B4. Verifikasi app masih jalan dengan key baru

TAHAP C — Bersihkan riwayat (AFTER B)
  C1. git filter-repo hapus .env dari seluruh history
  C2. Force-push dengan --force-with-lease (butuh konfirmasi)
  C3. Re-clone / koordinasi semua clone & CI

TAHAP D — Commit & push kode (AFTER A, boleh paralel B)
  D1. Review git diff final
  D2. git add -A  (JANGAN git add -f .env)
  D3. git commit
  D4. git push ke main

TAHAP E — Database & Edge Functions (AFTER D, SETELAH review)
  E1. npx supabase db push  → 5 migrasi
  E2. Verifikasi RPC add_book_with_copies_atomic jalan
  E3. npx supabase functions deploy book-metadata
  E4. npx supabase functions delete admin
  E5. npx supabase functions delete reports

TAHAP F — Deploy frontend & APK (AFTER E)
  F1. Deploy frontend (WAJIB setelah E1)
  F2. Rebuild & distribusi APK baru
  F3. Mulai Phase 1
```

**Prinsip kunci:** migrasi (**E1**) **harus** sebelum deploy frontend (**F1**), karena frontend baru butuh `book_copies_public` dan `books.deleted_at`. Rotasi (**B**) harus sebelum bersihkan riwayat (**C**), agar key lama sudah tidak berlaku saat history dibuka.

---

## 12. Security Remediation Planning - 18 November 2026

> **Status tahap ini: IN PROGRESS. Belum ada satu pun tindakan remediation yang dijalankan.**
> Checklist lengkap ada di [`SECURITY-REMEDIATION.md`](./SECURITY-REMEDIATION.md).

### 12.1 Tujuan pekerjaan

Menyusun rencana remediation keamanan yang terstruktur dan siap dijalankan, disesuaikan dengan
kondisi proyek: **Supabase ReadOwl masih DEVELOPMENT / TESTING, belum production nyata.**

Prioritas yang ditetapkan user:

1. Rotasi credential yang terekspos.
2. Pengamanan dan pembersihan Edge Functions lama.
3. Pembersihan Git history **setelah** credential lama tidak aktif.
4. Verifikasi migrasi dan database testing.
5. Finalisasi Phase 0 sebelum Phase 1.

### 12.2 File yang dibuat

| File | Isi | Status |
|---|---|---|
| `SECURITY-REMEDIATION.md` | Checklist 9 bagian (§1–§9) + tabel status §10 + batasan §11 | **DIBUAT** — seluruh checklist **IN PROGRESS** |

Isi checklist: identifikasi credential · prosedur revoke/generate · pemindahan Google key ke Edge
secret · verifikasi app · backup & rewrite Git history · verifikasi deployment Edge Functions ·
penanganan migrasi 0 byte · verifikasi migration history remote · finalisasi Phase 0.

### 12.3 Pemeriksaan tambahan yang dilakukan (read-only)

| # | Pemeriksaan | Hasil |
|---|---|---|
| 1 | `npx supabase migration list` | Gagal — mencoba local stack `127.0.0.1:54322`, Docker mati (`ECONNREFUSED`) |
| 2 | `npx supabase migration list --remote` | Gagal — **`AccessTokenRequiredError`** → **BLOCKED** |
| 3 | File migrasi 0 byte: riwayat semua versi | **Selalu 0 byte sejak dibuat** (`f625636`), tidak pernah berisi konten |
| 4 | Referensi kode ke `digital_books` / `digitalBook` | **0 kecocokan** — tak direferensikan mana pun |
| 5 | Daftar file 0 byte di HEAD | **5 file** (4 sumber digital book + 1 migrasi), semua blob `e69de29` |
| 6 | Migrasi di HEAD vs working tree | HEAD **6** · working tree **11** (5 baru untracked) |
| 7 | Apakah 6 migrasi lama berubah dari HEAD | **Tidak ada perubahan** (`git diff` kosong) |
| 8 | Commit yang memodifikasi migrasi | **1**: `c64df66` |
| 9 | `Deno.env.get` di Edge Functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (admin+reports), `GOOGLE_BOOKS_API_KEY` (book-metadata) |
| 10 | Pemakaian `SUPABASE_SERVICE_ROLE_KEY` | `admin:19`, `reports:19` — **keduanya** |
| 11 | CORS di ketiga fungsi | `Access-Control-Allow-Origin: *` |
| 12 | Pemakaian `uuid_generate_v4` | **0** — sudah diganti `gen_random_uuid()` semua |
| 13 | BOM di `initial_schema.sql` | **Ada** — `EF BB BF` (UTF-8 BOM) |

### 12.4 Temuan keamanan dan risiko BARU

#### T1 — Drift migrasi `initial_schema.sql` (WARNING)

`20261102000000_initial_schema.sql` **diubah setelah dibuat** di `c64df66` — **commit yang sama
memuat `.env`**. Perubahan 19 baris:

- `uuid_generate_v4()` → `gen_random_uuid()` di 18 tempat
- BOM UTF-8 (`EF BB BF`) ditambahkan di awal file

**Dampak:** bila migrasi ini sudah terpasang di remote **sebelum** `c64df66`, remote memakai versi
LAMA dan perubahan file **tidak diterapkan ulang** (Supabase mencatat migrasi per nama, bukan per
checksum isi). Perlu verifikasi read-only ke remote (§8.4 H4).

#### T2 — `uuid-ossp` jadi extension mati (INFO)

`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` masih ada (`initial_schema.sql:5`) tetapi
`uuid_generate_v4` sudah tak dipakai di mana pun. Declaration jadi dead code.

#### T3 — BOM UTF-8 di `initial_schema.sql` (INFO)

BOM bisa mengganggu tooling/parser SQL tertentu. Perlu dipertimbangkan saat menyentuh file ini —
tapi **mengubah file migrasi yang sudah terpasang justru menambah drift**, jadi jangan diedit sembarangan.

#### T4 — Migrasi 0 byte sebelum batch baru (WARNING, sudah ada di M1)

`20261105170000_digital_books.sql` 0 byte, **selalu 0 byte sejak dibuat**, posisi **sebelum** 5
migrasi `20261118*`. Jika belum terpasang di remote, `db push` bisa no-op atau **menggagalkan
seluruh batch**. Butuh keputusan user (isi / hapus / biarkan).

#### T5 — Audit remote masih terblokir (BLOCKED)

`functions list` dan `migration list --remote` keduanya gagal `AccessTokenRequiredError`.
**Belum diketahui:** fungsi mana yang benar-benar ter-deploy, dan migrasi mana yang sudah terpasang.

### 12.5 Perubahan yang benar-benar dilakukan

**HANYA satu:** membuat file `SECURITY-REMEDIATION.md`.

**TIDAK ADA:**

- ❌ Rotasi key
- ❌ Penghapusan / deploy Edge Functions
- ❌ Menjalankan migrasi atau `db push`
- ❌ Rewrite Git history
- ❌ Commit atau push
- ❌ Memulai Phase 1
- ❌ Menghapus / mereset database testing

### 12.6 Hasil test dan verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0** — PASS |
| `vitest run` | **18/18 lulus** — PASS |
| `git diff --check` | **0** — PASS |
| Scan secret di `SECURITY-REMEDIATION.md` | **0** — PASS (tidak ada nilai credential) |

### 12.7 Keputusan yang sudah disetujui

1. ✅ **Hasil audit persiapan keamanan & production DISETUJUI** oleh user.
2. ✅ Strategi remediation disesuaikan untuk kondisi **DEVELOPMENT / TESTING** (bukan production).
3. ✅ Prioritas 1–5 ditetapkan (lihat 12.1).
4. ✅ **Backup wajib** sebelum tindakan destruktif — terutama rewrite Git history dan migrasi DB.
5. ✅ Database testing **tidak boleh dihapus/di-reset** tanpa persetujuan.
6. ✅ Semua checklist ditandai **IN PROGRESS, bukan DONE**.
7. ✅ **Tidak ada tindakan destruktif atau perubahan remote tanpa persetujuan eksplisit.**
8. ✅ `PROGRESS.md` diperbarui setiap tahap selesai, dengan dokumentasi keputusan dan hasil verifikasi.

### 12.8 Pekerjaan yang masih tertunda

| Status | Pekerjaan | Penanggung jawab |
|---|---|---|
| **IN PROGRESS** | Seluruh 9 checklist di `SECURITY-REMEDIATION.md` (§1–§9) | Menunggu akses + persetujuan |
| **IN PROGRESS** | Identifikasi credential terdampak (§1) | Audit selesai, remediasi belum |
| **IN PROGRESS** | Prosedur revoke/generate key (§2) | **Aksi user** |
| **IN PROGRESS** | Pindah Google key ke Edge secret (§3) | Butuh §2 |
| **IN PROGRESS** | Verifikasi app pakai credential baru (§4) | Butuh §2, §3 |
| **IN PROGRESS** | Backup + rewrite Git history (§5) | Butuh §2 + **persetujuan destruktif** |
| **IN PROGRESS** | Verifikasi deployment Edge Functions (§6) | **BLOCKED: token Supabase** |
| **IN PROGRESS** | Penanganan migrasi 0 byte (§7) | **BLOCKED: keputusan user** |
| **IN PROGRESS** | Verifikasi migration history remote (§8) | **BLOCKED: token Supabase** |
| **IN PROGRESS** | Finalisasi Phase 0 (§9) | Butuh §2, §5–§8 |
| **TERTUNDA** | Phase 1 | Butuh finalisasi Phase 0 + persetujuan |

**Blokir utama:** (a) `supabase login` untuk membuka §6 & §8, (b) keputusan user atas migrasi 0 byte,
(c) persetujuan rotasi, (d) persetujuan tindakan destruktif (rewrite history, hapus fungsi remote, `db push`).

---

## 13. Audit Struktur ReadOwl & Perancangan In-App APK Updater - 18 November 2026

> **Status tahap ini: audit struktur DONE (read-only) · rancangan updater IN PROGRESS
> (dokumen selesai, implementasi BELUM dimulai).**
> Dokumen: [`READOWL-ARCHITECTURE.md`](./READOWL-ARCHITECTURE.md) · [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md)

### 13.1 Tujuan pekerjaan

1. Audit seluruh struktur repository berbasis **kode aktual** (bukan informasi lama) → dokumentasi arsitektur.
2. Merancang **Custom In-App APK Updater** untuk distribusi APK langsung (bukan Play Store).
3. Tidak mengganggu Security Remediation yang sedang berjalan.

### 13.2 File yang dibuat / diperbarui

| File | Status |
|---|---|
| `READOWL-ARCHITECTURE.md` | **DIBUAT** — struktur direktori aktual, fungsi komponen, diagram arsitektur, alur 1–7, entry point, env, auth, API, build/release, lokasi versi, inventaris komponen updater, temuan F-1…F-10 |
| `READOWL-UPDATER-PLAN.md` | **DIBUAT** — rancangan updater lengkap: keputusan distribusi, skema manifest, checker, downloader, keamanan (S1–S9), UI/UX 10 state, arsitektur release, roadmap Tahap A–E |
| `PROGRESS.md` | **DIPERBARUI** — entri log + section 13 ini (riwayat lama dipertahankan utuh) |
| `SECURITY-REMEDIATION.md` | **TIDAK DIUBAH** — keputusan tercatat tetap berlaku |

### 13.3 Pemeriksaan yang dilakukan (read-only)

| # | Pemeriksaan | Hasil |
|---|---|---|
| 1 | Root + seluruh tree `src/`, `android/`, `supabase/`, `.github/`, `scripts/`, `src-tauri/` | Terinventarisasi lengkap (lihat `READOWL-ARCHITECTURE.md` §2) |
| 2 | Entry point & alur app (`main.tsx`, `App.tsx`, `MainActivity.java`, `capacitor.config.ts`) | Terpetakan; app ID `org.readowl.library`, webDir `dist`, `cleartext: false` |
| 3 | Auth & API (`AuthPage`, `supabase.ts`, `metadataService.ts`) | `signInWithPassword` saja; session persist localStorage; lookup: Edge Function → Open Library → Google Books (tanpa key) |
| 4 | CI release (`android-release.yml` 148 baris) | Tag `v*` → build → signed APK → unggah GCS → GitHub Release → FCM `meeliefont-updates` |
| 5 | Versi (`package.json`, `build.gradle`, CI, `tauri.conf.json`) | `0.0.0` / env CI / `GITHUB_RUN_NUMBER` / `1.0.0` — **web tak punya versi runtime** |
| 6 | Komponen update yang ada (`UpdateNotifications.tsx`) | FCM-push saja: banner + `Browser.open` ke GCS — **bukan version checker**, tanpa unduh/verifikasi/install in-app |
| 7 | Kapabilitas native installer | FileProvider **ADA** + `file_paths.xml` (external+cache); **TIDAK ADA** `REQUEST_INSTALL_PACKAGES`; tidak ada kode Package Installer |
| 8 | Struktur UI untuk penempatan updater | `SettingsPage` (306 baris, section Library Profile + Form Actions) — kandidat section "Pembaruan"; banner global meniru pola `UpdateNotifications` yang sudah di-mount di semua render `App.tsx` |
| 9 | Dependensi terkait update | `@capacitor/firebase/messaging`, `@capacitor/browser`, `firebase` (⚠ 11 advisori high) — belum ada downloader/plugin native updater |
| 10 | File 0 byte & nav UI | 5 file 0 byte dikonfirmasi; `ReportsPage` ditemukan **orphan** (F-6) |

### 13.4 Keputusan yang tercatat

1. ✅ **Distribusi: APK langsung via link/website resmi — bukan Google Play Store; Play In-App Updates tidak dipakai.**
2. ✅ Manifest update: `latest.json` (skema `schemaVersion: 1`, field `app` + `versionCode` + `sha256` + `minimumSupportedVersionCode` + `forceUpdate` dll).
3. ✅ Perbandingan versi berbasis **`versionCode` integer**, bukan banding string semver.
4. ✅ Prinsip keamanan berlapis: HTTPS → allowlist host → validasi manifest → SHA-256+fileSize → validasi paket `org.readowl.library` → validasi signing certificate → (opsional) signature manifest Ed25519.
5. ✅ Instalasi **selalu** via Android Package Installer resmi + konfirmasi pengguna (bukan instalasi diam-diam); `forceUpdate` hanya memaksa UI.
6. ⏳ **Menunggu persetujuan**: skema versionCode baru, lokasi manifest (GCS bucket), Opsi A plugin native, signature Ed25519, masa depan FCM (`firebase` advisories), nasib `ReportsPage` (F-6), persempit `file_paths.xml` (F-4).

### 13.5 Temuan audit (detail di READOWL-ARCHITECTURE.md §5.3)

| # | Temuan | Level |
|---|---|---|
| F-1 | Web app tak punya akses versi runtime (`package.json` 0.0.0) — perlu injeksi `VITE_APP_VERSION*` | WARNING |
| F-2 | `versionCode = GITHUB_RUN_NUMBER` tidak monoton antar-tag lama | WARNING |
| F-3 | Manifest + APK di satu bucket — SHA-256 sendirian tidak cukup → rekomendasi signature manifest | WARNING |
| F-4 | `file_paths.xml` mengekspor seluruh external+cache path (`path="."`) | WARNING |
| F-5 | `REQUEST_INSTALL_PACKAGES` belum ada (wajib untuk Tahap D) | INFO |
| F-6 | `ReportsPage` orphan — tak ada nav/`onNavigate('reports')` | INFO (perlu jawaban user) |
| F-7 | 5 file 0 byte (belum diputuskan — terkait `SECURITY-REMEDIATION.md` §7) | WARNING |
| F-8 | `firebase` = 11 advisori high; kandidat dihapus bila FCM diganti updater manifest | WARNING |
| F-9 | Fallback Google Books kini tanpa API key (kuota publik) | INFO |
| F-10 | `src-tauri/` dorman | INFO |

### 13.6 Perubahan yang dilakukan

**Hanya pembuatan 2 file dokumentasi + update `PROGRESS.md` ini.**

- ❌ Tidak ada perubahan source code / konfigurasi Android
- ❌ Tidak ada plugin updater / build APK
- ❌ Tidak ada perubahan database / migrasi / deploy / hapus Edge Function
- ❌ Tidak ada rotasi credential / rewrite Git history / commit / push
- ❌ Tidak ada Phase 1 / tindakan destruktif / perubahan production

### 13.7 Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0** — PASS |
| `vitest run` | **18/18 lulus** — PASS |
| `git diff --check` | **0** — PASS (warning CRLF→LF non-fatal) |
| Scan secret di 2 file dokumentasi baru | **0** — PASS (hanya nama-nama env/field) |
| Riwayat log lama `PROGRESS.md` | **9/9 entri utuh** — PASS |

### 13.8 Status pekerjaan tahap ini

| Status | Pekerjaan |
|---|---|
| **DONE** | Audit struktur repository (read-only, berbasis kode aktual) |
| **DONE** | `READOWL-ARCHITECTURE.md` dibuat |
| **DONE** | `READOWL-UPDATER-PLAN.md` dibuat (rancangan) |
| **DONE** | `PROGRESS.md` diperbarui, riwayat dipertahankan |
| **IN PROGRESS** | Security Remediation (section 12 — tidak berubah statusnya) |
| **TERTUNDA** | Implementasi updater Tahap A–E — **menunggu persetujuan user** |
| **TERTUNDA** | Keputusan-keputusan di 13.4 poin 6 |
| **BLOCKED** | Sama seperti section 12: audit remote Edge Functions & migrasi (butuh token Supabase) |
| **BLOCKED** | F-6 (`ReportsPage`) — butuh jawaban user |

---

## 14. Implementasi Tahap A — Fondasi In-App APK Updater - 18 November 2026

> **Status tahap ini: DONE (implementasi + verifikasi selesai) — menunggu review/approval sebelum Tahap B.**
> Rancangan: [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) §10 Tahap A · Audit: [`READOWL-ARCHITECTURE.md`](./READOWL-ARCHITECTURE.md)
> Persetujuan implementasi diterima 18 November 2026 (distribusi APK langsung, bukan Play Store).

### 14.1 Tahap yang dikerjakan

**Tahap A — Fondasi**: version management (skema versionCode deterministik + versi runtime di bundle web), generator manifest `latest.json`, dan integrasi release workflow CI. **Tanpa** plugin native, tanpa perubahan Android, tanpa perubahan frontend (`src/`).

### 14.2 Implementasi yang dilakukan

| # | Implementasi | Detail |
|---|---|---|
| 1 | **Skema versionCode baru** | `MAJOR*1.000.000 + MINOR*1.000 + PATCH` (v1.2.3 → 1002003); MINOR/PATCH 0–999; tolak suffix pre-release; batas Android 2.100.000.000. Menggantikan `GITHUB_RUN_NUMBER` (temuan F-2) |
| 2 | **Gate monoton** | `assertNextVersionCode`: manifest publikasi berikutnya wajib **>** yang terbit; manifest terbit tidak terbaca/JSON rusak/salah app id → **fail closed**; belum ada yang terbit → bootstrap rilis pertama |
| 3 | **Generator manifest** | `generate-latest-manifest.mjs` mengisi 11 field skema §3.2 (sha256+size dihitung dari file via `--apk`, atau eksplisit); `--url` wajib lolos allowlist yang **sama persis** dengan aturan klien (https + host `storage.googleapis.com` + pola `/<bucket>/MeelieFont-vX.Y.Z.apk`); field `app` dikunci `org.readowl.library` |
| 4 | **Injeksi versi ke bundle web (F-1)** | Step CI `Build web assets` mengekspor `VITE_APP_VERSION` + `VITE_APP_VERSION_CODE` (hasil `version-utils.mjs`) sebelum `npm run build` → app tahu versinya sendiri saat runtime. Build lokal tanpa env → `versionCode` kosong/0 → checker nonaktif (aman, tidak ada update palsu) |
| 5 | **CI: APK memakai skema baru** | `APP_VERSION_CODE` dihitung dari tag dengan modul yang sama → APK dan `latest.json` **tidak mungkin berbeda**; `versionName` tetap dari tag |
| 6 | **CI: verifikasi unggahan** | Setelah `gcloud storage cp`, HEAD ke URL publik → `content-length` wajib = ukuran file lokal; gagal → seluruh rilis berhenti (manifest tidak pernah terbit) |
| 7 | **CI: step Publish update manifest** | Baru, **urutan terakhir** urutan publikasi: APK terunggah+terverifikasi → GitHub Release → baru `latest.json` diunggah (`Cache-Control: public,max-age=60,must-revalidate`; APK tetap `immutable`). Mengambil manifest terbit sebagai pembanding monoton (bootstrap bila 404), changelog best-effort dari git log sejak tag sebelumnya |
| 8 | **Dokumentasi** | `README.md` §5 (skema versi + alur manifest), `.env.example` (var build versi, non-secret, dikomentari), npm scripts `release:version-code` / `release:manifest` |

### 14.3 File yang dibuat / diubah

| File | Aksi | Catatan |
|---|---|---|
| `scripts/version-utils.mjs` | **BARU** | Modul + CLI skema versionCode (zero-dependency, builtins saja) |
| `scripts/generate-latest-manifest.mjs` | **BARU** | Generator `latest.json` dengan validasi ketat |
| `.github/workflows/android-release.yml` | **DIUBAH (aditif)** | 3 edit: injeksi versi build web · versionCode baru + verifikasi unggahan · step manifest. **Hardening yang belum di-commit (SHA-pinning, `permissions` scoped) dipertahankan utuh** |
| `README.md` | **DIUBAH** | §5 diperbarui (2 paragraf + item rilis) — edit lama tidak dihapus |
| `.env.example` | **DIUBAH** | Tambah blok opsional `VITE_APP_VERSION*` (komentari, non-secret) |
| `package.json` | **DIUBAH** | Tambah 2 script `release:*` — edit lama dipertahankan |
| `PROGRESS.md` | **DIPERBARUI** | Section ini + entri log ke-10 (riwayat utuh) |
| `READOWL-UPDATER-PLAN.md` / `READOWL-ARCHITECTURE.md` | **DIPERBARUI** | Status Tahap A + struktur/versi terkini |
| `SECURITY-REMEDIATION.md`, `src/`, `android/`, `supabase/` | **TIDAK DISENTUH** | — |

### 14.4 Hasil TypeScript, unit test, dan build

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0 error** — PASS |
| `vitest run` | **18/18 lulus** — PASS (tidak ada test yang diubah/dihapus) |
| `vite build` (dengan `VITE_APP_VERSION=1.2.3`, `VITE_APP_VERSION_CODE=1002003`) | **PASS** (682 ms; warning chunk >500 kB sudah ada sebelumnya) |
| `git diff --check` | **0** — PASS (warning CRLF→LF non-fatal, sudah ada sebelumnya) |
| Unit test script updater (harness sementara di `%TEMP%\opencode`, **bukan** di repo) | **36/36 PASS**: konversi versi, penolakan suffix/oversize, field manifest, `--apk` auto-hash, monoton naik ✅ / turun ❌ / bootstrap ✅ / JSON rusak fail-closed ❌, allowlist (http/host/pola path ditolak), sha256/format/min-version-code/force |

### 14.5 Hasil pemeriksaan keamanan & CI

| Pemeriksaan | Hasil |
|---|---|
| Parse YAML penuh (`PyYAML`) | **OK** — jobs `build-and-release` (13 step) + `notify-devices` (2 step), urutan step benar |
| Sintaks semua blok `run:` (`bash -n`, 5 blok) | **0 error** |
| Struktur workflow | 0 masalah: tidak ada tab, langkah wajib ada & berurutan, `GITHUB_RUN_NUMBER` sebagai versionCode sudah **hilang**, `latest.json` hadir |
| Secret scan (2 script baru + 4 file diubah) | **0 hit** |
| Keystore/`.env`/secret | **Tidak disentuh** — tidak ada secret baru di repo/CI; manifest & APK hanya memakai `APK_STORAGE_BUCKET` yang sudah ada |
| Izin CI | Tidak ada permission/secret GitHub baru; `permissions` hasil hardening lama dipertahankan |

### 14.6 Git status (belum di-commit — sesuai batasan)

- **Tidak ada commit / push / reset / checkout buang / force.**
- File Tahap A: `M .env.example`, `M README.md`, `M package.json`, `M .github/workflows/android-release.yml`, `?? scripts/version-utils.mjs`, `?? scripts/generate-latest-manifest.mjs`.
- Perubahan uncommitted sebelumnya **tetap utuh** (termasuk hardening workflow, hapus `bun.lock`/`isbnTools`, staging `.env` sebagai `D`, `SECURITY-REMEDIATION.md` `??`).
- Catatan: stage ini **mengubah** `android-release.yml`, `README.md`, `package.json`, `.env.example` yang memang sudah berstatus `M` — edit bersifat **surgical/aditif**, tidak menimpa perubahan lama.

### 14.7 Risiko, blocker, dan catatan

| # | Item | Level |
|---|---|---|
| R-1 | **Verifikasi unggahan butuh bucket benar-benar publik** — jika bucket belum `allUsers: Storage Object Viewer`, step HEAD gagal → rilis berhenti. Sebenarnya prasyarat distribusi yang memang sudah didokumentasikan README, jadi kegagalan = sinyal jujur, bukan regresi | WARNING |
| R-2 | **Changelog best-effort**: `actions/checkout` fetch-depth 1 → tag sebelumnya sering tidak tersedia → bootstrap pakai 50 commit terakhir. Kosong/berisik ≠ rusak (changelog opsional) | INFO |
| R-3 | Tag pertama belum ada (`git tag` kosong) → bootstrap `latest.json` **belum pernah diuji end-to-end di CI asli** (butuh push tag = aksi user, dilarang di tahap ini) | WARNING |
| R-4 | Pembatasan MINOR/PATCH ≤ 999 + penolakan suffix pre-release = perubahan aturan rilis; tag `v1.2.3-rc.1` kini ditolak sejak step build web (gagal cepat + pesan jelas) | INFO |
| R-5 | Local build tanpa env → versi runtime 0 → **checker off** (by design) | INFO |
| R-6 | `latest.json` masih **tanpa signature Ed25519** — sengaja: dijadwalkan Tahap E **sebelum** updater dirilis ke pengguna (sesuai approval) | WARNING (rencana) |
| B-1 | **Tidak ada blocker** untuk Tahap A | — |
| B-2 | Blocker lama tidak berubah: audit remote (butuh token Supabase), rotasi/rewrite/history (butuh approval per `SECURITY-REMEDIATION.md`) | BLOCKED |

### 14.8 Status pekerjaan tahap ini

| Status | Pekerjaan |
|---|---|
| **DONE** | Tahap A: skema versionCode, generator manifest, integrasi CI, dokumentasi |
| **DONE** | Verifikasi Tahap A (tsc, 18/18 test, build, diff-check, YAML/bash, secret scan, 36/36 uji script) |
| **IN PROGRESS** | Security Remediation (section 12 — tidak berubah) |
| **IN PROGRESS** | Rancangan updater (Tahap B–E belum dikerjakan) |
| **WARNING** | R-1/R-3: verifikasi bucket publik & bootstrap manifest butuh rilis CI asli (aksi user) |
| **BLOCKED** | Sama seperti section 12 (token Supabase) · tanpa commit/push sampai diizinkan |
| **TERTUNDA** | Tahap B — **menunggu approval Tahap A** |

### 14.9 Rekomendasi tahap berikutnya

**Tahap B — Update checker** (`updateService.ts` + test, hook state app, banner/dialog, tombol cek di Settings, koordinasi dengan banner FCM agar tidak kembar). Syarat: approval Tahap A. Tahap C–E berurutan setelah B terverifikasi; signature Ed25519 (Tahap E) **wajib selesai** sebelum updater dirilis ke pengguna.

---

## 15. Status commit

Belum ada commit untuk seluruh perubahan di dokumen ini.

Untuk melihat ringkasan:

```bash
git status
git diff --stat
```

Setelah siap:

```bash
git add -A
git commit -m "security: harden RLS, secrets, CSV, and soft delete"
```

> Catatan: `git add -A` **tidak boleh** memasukkan `.env` (sudah di-untrack dan masuk `.gitignore`); pastikan `git status` tidak menampilkan `.env` sebelum commit.

---

## 16. Rekapitulasi seluruh perubahan dari awal - 18 November 2026

> **Tujuan section ini:** ikhtisar rapi dan lengkap **semua** yang berubah dari pekerjaan pertama
> sampai Tahap A updater — satu tempat, tanpa menghapus/mengubah riwayat di section 1–15
> (semua log asli tetap utuh: 10 entri log, 15 section sebelumnya).
> Seluruh rangkaian berjalan pada 18 November 2026 · branch `main` @ `ba4ab9f` · **belum ada satu pun commit**.

### 16.1 Timeline tahap (10 entri log → 9 kelompok pekerjaan)

| # | Tahap | Output utama | Status | Rujukan |
|---|---|---|---|---|
| 1 | **Batch 1** — verifikasi & temuan kritis | `.env` di-untrack · Edge Functions `admin`/`reports` dihapus dari repo · key Google dibuang dari bundle · migrasi hardening RLS · CSV/Settings/`allowBackup` diperbaiki · `.gitattributes` | **DONE (kode)** — deploy/rotasi belum | Log §10 · §2 temuan 1–6, 15, 24 |
| 2 | **Batch 2** — pembatasan data anon | View `book_copies_public` · policy `book_copies`/`settings` diperketat · frontend baca dari view aman · URL Supabase dibatasi | **DONE (kode)** — migrasi belum diterapkan | Log §10 · §2 temuan 8, 11 |
| 3 | **Batch 3** — branding & cleanup | `project_id` + seed diperbarui · label mata uang dinamis · 8 dependensi tak terpakai dihapus · `bun.lock` dihapus · script `clean` diperbaiki | **DONE** | Log §10 · §2 temuan 19, 20 |
| 4 | **Batch 4** — soft delete | Kolom `books.deleted_at` + migrasi · buku ber-copy diarsipkan, copy & akuisisi dipertahankan · UI konfirmasi · README | **DONE (kode)** — migrasi belum diterapkan | Log §10 · §2 temuan 12 |
| 5 | **Batch 5** — re-audit & Phase 1 | Regresi `ON CONFLICT` → migrasi `…000400` · `isbnTools.ts` digabung ke `isbnValidator.ts` · **Vitest + 18 unit test** · test Android pindah paket · CI dipin SHA + izin dipersempit + signing dibersihkan · `metadata.json`/`vite.config.ts` dirapikan | **DONE** — verifikasi lulus | Log §10 · §2 temuan 16, 23, 25, 27 |
| 6 | **Dokumentasi** | `PROGRESS.md` dibuat (log progres + checklist deploy) | **DONE** | Log §10 |
| 7 | **Tahap persiapan keamanan** (audit read-only) | Audit dampak kebocoran `.env` di seluruh riwayat Git · audit remote Edge Functions (terblokir tanpa token) · 5 migrasi vs schema production · verifikasi branch/remote/staged | **DONE (read-only)** | Log §10 · §11 |
| 8 | **Security Remediation Planning** | `SECURITY-REMEDIATION.md` (9 bagian, semua IN PROGRESS) · temuan baru: drift `initial_schema.sql` (BOM + 19 baris), 5 file migrasi 0 byte, `SUPABASE_SERVICE_ROLE_KEY` di `admin`/`reports`, CORS `*`, HEAD hanya 6/11 migrasi | **DONE (dokumen)** · remediasi **IN PROGRESS** · audit remote **BLOCKED** | Log §10 · §12 |
| 9 | **Audit struktur & rancangan updater** | `READOWL-ARCHITECTURE.md` (struktur aktual + temuan F-1…F-10) · `READOWL-UPDATER-PLAN.md` (skema manifest, checker, downloader, keamanan S1–S9, UI/UX, roadmap A–E) · keputusan: **APK langsung, bukan Play Store** | **DONE (read-only)** · rancangan menunggu approval → kini disetujui | Log §10 · §13 |
| 10 | **Implementasi Tahap A** (fondasi updater) | 2 script baru · CI: injeksi versi + versionCode deterministik + verifikasi unggahan + step `latest.json` · README/`.env.example`/npm scripts · dokumentasi terupdate | **DONE (terverifikasi)** — Tahap B menunggu approval | Log §10 · §14 |

### 16.2 File yang **dibuat** (kumulatif per tahap)

**Batch 1–5 (perbaikan kode & basis data):**

| File | Tahap |
|---|---|
| `.gitattributes` | Batch 1 |
| `src/lib/csv.ts` | Batch 1 |
| `supabase/migrations/20261118000000_security_hardening.sql` | Batch 1 |
| `supabase/migrations/20261118000100_public_copy_view.sql` | Batch 2 |
| `supabase/migrations/20261118000200_branding_localization.sql` | Batch 3 |
| `supabase/migrations/20261118000300_soft_delete_books.sql` | Batch 4 |
| `supabase/migrations/20261118000400_fix_book_upsert_soft_delete.sql` | Batch 5 |
| `src/lib/csv.test.ts` · `src/services/codeResolver.test.ts` · `src/services/isbnValidator.test.ts` (Vitest, 18 test) | Batch 5 |
| `android/app/src/{androidTest,test}/java/org/readowl/library/Example*.java` (pindah dari `com.getcapacitor.myapp`) | Batch 5 |
| `PROGRESS.md` | Dokumentasi |

**Tahap perencanaan (dokumen):**

| File | Tahap |
|---|---|
| `SECURITY-REMEDIATION.md` | Security Remediation Planning |
| `READOWL-ARCHITECTURE.md` | Audit struktur · **diperbarui** setelah Tahap A |
| `READOWL-UPDATER-PLAN.md` | Audit struktur · **diperbarui** setelah Tahap A (status Tahap A DONE, keputusan 1–9 ✅) |

**Tahap A (fondasi updater):**

| File | Isi |
|---|---|
| `scripts/version-utils.mjs` | Skema versionCode `MAJOR*1e6+MINOR*1e3+PATCH` + gate monoton fail-closed + CLI |
| `scripts/generate-latest-manifest.mjs` | Generator `latest.json` (11 field, allowlist URL identik klien, `--apk` auto sha256/size) |

### 16.3 File yang **diubah** (kumulatif; tahap ditandai bila tercatat di log)

| File | Tahap yang menyentuh | Inti perubahan |
|---|---|---|
| `.env.example` | Batch 1 + **Tahap A** | Dibersihkan dari key nyata → + blok opsional `VITE_APP_VERSION*` (non-secret) |
| `.gitignore` | Batch 1 | Ignore `.env*` (dengan pengecualian `.env.example`), `google-services.json`, `*.jks`, `supabase/.temp/` |
| `.github/workflows/android-release.yml` | Batch 5 + **Tahap A** | Pin action ke SHA, izin `contents: write` per job, bersihkan signing `if: always()` → **+ injeksi `VITE_APP_VERSION*`, `APP_VERSION_CODE` deterministik, verifikasi unggahan, step "Publish update manifest"** |
| `README.md` | Batch 4 + Batch 5 + **Tahap A** | Dokumentasi soft delete + rilis → **+ §5: skema versi & alur `latest.json`** |
| `android/app/src/main/AndroidManifest.xml` | Batch 1 | `allowBackup="false"` (FileProvider tetap terdaftar; `REQUEST_INSTALL_PACKAGES` masih belum ada — rencana Tahap D) |
| `metadata.json` | Batch 5 | Capability Gemini dihapus |
| `package.json` | Batch 3 + Batch 5 + **Tahap A** | Script `clean` → + devDeps Vitest/test → **+ `release:version-code` & `release:manifest`** |
| `package-lock.json` | Batch 3 + Batch 5 | Sinkron setelah dependensi ditambah/dihapus |
| `scripts/check-services.ps1` | Batch 1–5 | Perbaikan penyempurnaan (lihat log Batch) |
| `src/App.tsx` | Batch 1–5 | Role gate, settings, perbaikan halaman |
| `src/lib/supabase.ts` | Batch 2 | Batasi host URL + konfirmasi domain + guard service-role |
| `src/pages/*.tsx` (6 halaman) | Batch 1–5 | CSV/Settings/member count, UI konfirmasi soft delete, label currency |
| `src/services/libraryService.ts`, `metadataService.ts`, `codeResolver.ts`, `src/types/library.ts` | Batch 1–5 | Validasi metadata, risolv er kode, pencarian tanpa arsip, tipe |
| `supabase/config.toml` | Batch 3 | `project_id` |
| `supabase/functions/book-metadata/index.ts` | Batch 1 | Validasi tipe/regex ISBN/checksum/`encodeURIComponent` |
| `supabase/seed.sql` | Batch 3 | Branding MeelieFont |
| `vite.config.ts` | Batch 5 | Komentar encoding dirapikan |

### 16.4 File yang **dihapus dari git** (tidak ada yang dihapus paksa/`-f`)

| File | Tahap | Alasan |
|---|---|---|
| `.env` | Batch 1 | Berisi secret nyata → di-untrack (staged `D`), masuk `.gitignore`; **riwayat & rotasi = SECURITY-REMEDIATION §3–§4** |
| `supabase/functions/admin/index.ts` · `supabase/functions/reports/index.ts` | Batch 1 | Privilege escalation / tanpa auth (deploy remote masih harus dihapus manual — BLOCKED) |
| `supabase/.temp/*` (8 file) | Batch 1 | Artefak CLI berisi project ref |
| `bun.lock` | Batch 3 | npm = lockfile tunggal |
| `src/services/isbnTools.ts` | Batch 5 | Duplikat → digabung ke `isbnValidator.ts` |
| `android/app/src/{androidTest,test}/java/com/getcapacitor/myapp/Example*.java` | Batch 5 | Sisa template → diganti paket `org.readowl.library` |

### 16.5 File yang **tidak pernah disentuh** sepanjang seluruh rangkaian

- **`.env` isi aslinya** (tidak dibaca ke dokumentasi, tidak di-force-add, tidak di-commit) — isinya tidak pernah diekspos ke file baru.
- **`SECURITY-REMEDIATION.md`** — keputusan/urutan remediation tetap; hanya **status** yang menyala IN PROGRESS.
- **`android/app/build.gradle`**, `capacitor.config.ts`, `MainActivity.java`, seluruh `google-services.json`/`*.jks` — tidak diubah (signing/keystore tak tersentuh).
- **`supabase/migrations/` yang sudah ada** — tidak ada migrasi yang dimodifikasi/dijalankan/dipush (drift `initial_schema.sql` **didokumentasikan**, tidak diperbaiki diam-diam).
- **Database & Edge Functions remote** — tidak ada `db push`, deploy, delete, atau rotasi secret.

### 16.6 Verifikasi gabungan (dijalankan berulang tiap tahap; terakhir saat Tahap A)

| Pemeriksaan | Hasil terakhir | Riwayat |
|---|---|---|
| `tsc --noEmit` | **0** | 0 di Batch 5, §11, §12, §13, §14 |
| `vitest run` | **18/18 lulus** | ditambahkan Batch 5; lulus terus tiap tahap |
| `vite build` | **PASS** | PASS di Batch 5 & Tahap A (dengan env versi) |
| `git diff --check` | **0** | 0 tiap tahap (warning CRLF→LF non-fatal sudah ada sebelumnya) |
| Secret scan dokumentasi/workflow/script baru | **0 hit** | dilakukan di §11–§14 + Tahap A |
| Uji unit script updater (harness `%TEMP%`) | **36/36 PASS** | Tahap A |
| Validasi CI (PyYAML parse + `bash -n` 5 blok + struktur) | **OK / 0 error** | Tahap A |

### 16.7 Status akhir semua lini kerja

| Status | Lini kerja |
|---|---|
| **DONE** | Batch 1–5 (kode diperbaiki & diverifikasi) · Dokumentasi · Tahap persiapan (audit) · Perencanaan (3 dokumen) · **Tahap A updater** |
| **IN PROGRESS** | Security Remediation (`SECURITY-REMEDIATION.md` §2–§9) · Rancangan/roadmap updater (Tahap B–E) |
| **BLOCKED** | Audit remote Edge Functions + `migration list --remote` (butuh `supabase login`/token) · hapus fungsi remote · `db push` 5 migrasi · rotasi key · rewrite riwayat git · semua commit/push (butuh approval Anda per tahap) |
| **WARNING** | Bucket harus publik untuk verifikasi unggahan (R-1 Tahap A) · bootstrap `latest.json` belum teruji CI asli (R-3) · `latest.json` belum ditandatangani Ed25519 sampai Tahap E (syarat sebelum rilis) · 5 file 0 byte (D2) · `firebase` 11 advisori high (W4, sengaja dipertahankan: FCM = notifikasi tambahan) |
| **TERTUNDA** | Tahap B–E updater · keputusan terpisah: `ReportsPage` (F-6, **biarkan**) · persempit `file_paths.xml` (F-4, Tahap D) |

### 16.8 Angka ringkas

- **10** entri log (9 riwayat asli utuh + 1 baru) · **16** section · **0** commit.
- **File baru: 18** — 12 dari Batch 1–5 (`.gitattributes`, `csv.ts`, 3 file test, 2 test Android, 5 migrasi) + `PROGRESS.md` + **3 dokumen** (`SECURITY-REMEDIATION`, `READOWL-ARCHITECTURE`, `READOWL-UPDATER-PLAN`) + **2 script updater** (Tahap A).
- **File diubah: 25** (daftar §4; Tahap A menyentuh 4 di antaranya: `.env.example`, `README.md`, `package.json`, `android-release.yml` — edit aditif/surgical).
- **Dihapus/di-untrack: 8 entri git (~15 file, termasuk 8 `supabase/.temp/*`)** — tidak ada yang dihapus paksa/`-f`.
- **5** migrasi SQL dibuat (**belum diterapkan** ke remote — `db push` butuh approval).
- **0** commit · **0** push · **0** deploy · **0** rotasi credential · **0** build APK · **0** upload manifest/APK produksi · **0** Phase 1 · **0** perubahan `SECURITY-REMEDIATION.md`.

---

## 17. Audit Read-Only Sebelum Commit - 18 November 2026

> **Status tahap ini: DONE (audit read-only).** Satu-satunya file yang ditulis: `PROGRESS.md` ini.
> Target: branch `security/hardening-and-updater-stage-a` (belum dibuat/di-commit — aksi user).
> **Staging TIDAK diubah** · tanpa `git add`/`restore`/`reset`/`commit`/`push` · tanpa perubahan kode.
> Verifikasi otomatis memakai harness sementara di `%TEMP%\opencode` (tidak masuk repo).

### 17.1 Temuan per status

#### Fokus 1 — `bun.lock`

| # | Pemeriksaan | Hasil | Status |
|---|---|---|---|
| 1a | Seluruh repo (130 file teks: kode, CI, scripts, docs, config — tanpa `node_modules`/`.git`/`dist`) dari pemakaian Bun (`bun`, `bun.lock`, `bunfig`, `setup-bun`, `bun install/run`) | **0 pemakaian nyata** — 7 hit semuanya di `PROGRESS.md` (dokumentasi penghapusan itu sendiri) | **SAFE TO COMMIT** |
| 1b | Field `packageManager`, file `bun.lockb`/`bunfig.toml`, `.npmrc` | Tidak ada (HEAD & worktree) · `package-lock.json` ada · workflow memakai `npm ci` | **SAFE TO COMMIT** |
| 1c | Penghapusan dari index (`D bun.lock`, 647 baris) | Hanya lockfile alternatif; npm = manajer paket tunggal, tak ada yang bergantung padanya | **SAFE TO COMMIT** |

#### Fokus 2 — `src/services/isbnTools.ts`

| # | Pemeriksaan | Hasil | Status |
|---|---|---|---|
| 2a | Referensi `isbnTools` di worktree (kode/CI/scripts) | **0** (7 hit hanya di `PROGRESS.md`) — tidak ada import yatim | **SAFE TO COMMIT** |
| 2b | 7 ekspor HEAD (`cleanIsbn`, `isValidIsbn10`, `isValidIsbn13`, `isValidIsbn`, `isbn10To13`, `isbn13To10`, `normalizeToIsbn13`) vs `isbnValidator.ts` | **7/7 PRESENT** + 3 ekspor tambahan (`formatIsbn`, `extractIsbnCandidate`, `convertIsbn10To13`) — modul superset | **SAFE TO COMMIT** |
| 2c | Pemakai HEAD → import sekarang | Satu-satunya importer HEAD `codeResolver.ts` kini `from './isbnValidator'` (import multi-baris baris 1–8, lengkap dgn `extractIsbnCandidate`); `ScannerPage`/`libraryService`/`metadataService`/`BookshelfPage`/`DashboardPage` juga dari `isbnValidator` | **SAFE TO COMMIT** |
| 2d | Perilaku vs HEAD | Rumus check-digit **identik**; selisih = superset/lebih aman: `cleanIsbn` kini memangkas add-on harga 2/5 digit (sesuai komentar tujuan file lama), `isValidIsbn10/13` + `isbn10To13` membersihkan input lebih dulu, `isbn10To13` ada guard panjang. **Tidak ada fungsi hilang, tidak ada regresi algoritmik** | **SAFE TO COMMIT** |
| 2e | Coverage test | `isbnValidator.test.ts` menutup **6/7** — `normalizeToIsbn13` belum ditest | **NEEDS REVIEW** (minor; tidak memblokir — tsc 0 & 18/18 lulus) |
| 2f | `book-metadata` (Edge Function) | Helper lokal sendiri (`cleanIsbn`/`isValidIsbn` didefinisikan di file), **tidak** merujuk `isbnTools` — perilaku remote tak berubah oleh commit ini | **SAFE TO COMMIT** |

#### Fokus 3 — `package.json`

| # | Pemeriksaan | Hasil | Status |
|---|---|---|---|
| 3a | Dependency dihapus HEAD→worktree | **9**: `@google/genai`, `dotenv`, `epubjs`, `express`, `motion`, `@types/express`, `autoprefixer`, `esbuild`, `tsx` · **Ditambah**: `vitest` — *catatan: log Batch 3 menyebut **8**; selisih 1 tercatat di §17.2 (riwayat lama tidak diubah)* | **NEEDS REVIEW** (akurasi dokumentasi saja, bukan kode) |
| 3b | Pemakaian ke-9 dependency di source/config/CI/docs | **0 nyata**: hanya `PROGRESS.md:144` (daftar kami); hit `esbuild`/`tsx` di lock = **peerDependencies textual milik `vite`** (bukan terpasang); `index.html:35` = `main.tsx` (false positive); `server.js` tidak ada di HEAD/worktree | **SAFE TO COMMIT** |
| 3c | Konsistensi `package.json` ↔ `package-lock.json` | lockfileVersion 3 · dep root identik (**0** hilang, **0** lebih, **0** selisih range) · **0** entry lock hilang · **0** sisa dependency terhapus di lock → `npm ci` di CI **tidak akan gagal** | **SAFE TO COMMIT** |
| 3d | Script baru `release:version-code` / `release:manifest` | File target **ada**; sudah diuji 36/36 (Tahap A); tidak menyentuh `npm ci`/`npm run build`/`npx cap sync` — pipeline Android release utuh | **SAFE TO COMMIT** |
| 3e | `vitest` (dependency baru) | Ada di lock dgn range cocok; `npm test` = `vitest run` → 18/18 | **SAFE TO COMMIT** |

#### Fokus 4 — Staging (hanya diperiksa, **tidak diubah**)

| # | Pemeriksaan | Hasil | Status |
|---|---|---|---|
| 4a | Isi index saat ini | **14 penghapusan saja** = persis rencana §16.4: `.env`, `bun.lock`, `isbnTools.ts`, **9** file `supabase/.temp/*`, `functions/admin`, `functions/reports` · tidak ada modifikasi/add ter-stage · **tidak ada konflik (`U`)** | **SAFE TO COMMIT** |
| 4b | Unstaged + untracked | 27 `M` + 2 `D` (template android) + 19 untracked — semuanya terdaftar di rencana §16.2/16.3; tak ada file asing tak terdokumentasi | **SAFE TO COMMIT** |
| 4c | `.env` | Staged sebagai **penghapusan saja** (konten tidak ikut ke commit baru); file lokal **tetap ada di disk (882 B)** → dev lokal tak terganggu. Pembersihan riwayat/rotasi tetap jalur terpisah `SECURITY-REMEDIATION.md` §3–§4 | **SAFE TO COMMIT** |
| 4d | **Atomisitas rilis** | `android-release.yml` (modified) memanggil `scripts/version-utils.mjs` + `scripts/generate-latest-manifest.mjs` yang **MASIH UNTRACKED** → jika ter-commit tanpa keduanya, pipeline rilis tag akan **gagal** | **NEEDS REVIEW** — wajib ikut dalam commit yang sama (`git add -A` / add eksplisit keduanya) |

#### Fokus 5 — Dokumentasi

| # | Pemeriksaan | Hasil | Status |
|---|---|---|---|
| 5a | Scan secret pada file yang akan ter-commit (modifikasi + seluruh untracked) | **0 hit** | **SAFE TO COMMIT** |
| 5b | Selisih dokumen lama vs data riil | (1) Batch 3 menulis "8 dependensi" → aktual **9**; (2) §16.4 menulis "`supabase/.temp/*` (8 file)" → aktual **9 file** | **NEEDS REVIEW** (dicatat di sini; **riwayat lama tidak diubah**) |
| 5c | `README.md`, `SECURITY-REMEDIATION.md`, dokumen rancangan | Konsisten, tak ada instruksi basi yang bertentangan dgn isi commit | **SAFE TO COMMIT** |

### 17.2 Hasil verifikasi teknis (dijalankan ulang saat audit)

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **0** — PASS |
| `vitest run` | **18/18** — PASS |
| `git diff --check` (unstaged) · `git diff --cached --check` (staged) | **0 / 0** — PASS |
| Struktur workflow + `bash -n` 5 blok `run:` | **0 isu** — PASS |
| Secret scan file ter-commit | **0** — PASS |

### 17.3 Ringkasan status

| Status | Temuan |
|---|---|
| **SAFE TO COMMIT** | `bun.lock` dihapus (1a–1c) · `isbnTools.ts` dihapus dgn jaminan pindah lengkap (2a–2d, 2f) · dependency cleanup + konsistensi lock + script baru (3b–3e) · seluruh isi staging & daftar file (4a–4c) · dokumentasi/secret (5a, 5c) |
| **NEEDS REVIEW** | **4d — atomisitas 2 script updater dengan workflow** (syarat wajib sebelum commit) · 3a & 5b — 2 selisih dokumentasi minor (9 vs 8 dependensi; 9 vs 8 file `.temp`) · 2e — test `normalizeToIsbn13` belum ada |
| **BLOCKED** | **Tidak ada BLOCKED baru untuk commit ini.** BLOCKED lama tetap berlaku terpisah: rotasi key, hapus fungsi remote, `db push`, rewrite riwayat git (butuh approval + token — **tidak** disentuh oleh commit/push branch ini) |

### 17.4 Kesimpulan

**Seluruh perubahan yang ter-stage + yang akan ter-commit dinyatakan aman**, dengan **satu syarat wajib**: pastikan `scripts/version-utils.mjs` dan `scripts/generate-latest-manifest.mjs` ikut di-commit bersama `android-release.yml` (commit atomik). Tidak ada secret, dependensi yatim, file tak terencana, maupun konflik staging. Audit ini murni read-only — staging, kode, dan git history tidak diubah.

---

## 18. Lanjutan Item Kode Aman — 19 November 2026

> **Status: DONE (implementasi + verifikasi).** Branch `security/hardening-and-updater-stage-a` @ `534a3ac`.
> Riwayat section 1–17 tidak diubah isinya, kecuali status temuan 10/14/25, daftar §8, dan entri log §10.

### 18.1 Yang dikerjakan

| # | Item | Perubahan |
|---|---|---|
| 1 | CSP + workaround `window.fetch` | Blok inline script di `index.html` dihapus. Meta CSP ditambahkan: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src` + `img-src` untuk font/cover, `connect-src` untuk `*.supabase.co`, `openlibrary.org`, `*.googleapis.com`, `storage.googleapis.com`, FCM, serta localhost untuk dev. `object-src 'none'`, `base-uri/form-action 'self'`. |
| 2 | Rate limit `book-metadata` | Modul baru `supabase/functions/book-metadata/rateLimit.ts`: fixed window 60 detik, maks 20 request per kunci. Kunci = `sub` JWT bila ada, jika tidak `x-forwarded-for` / `x-real-ip`. 429 + header `Retry-After`; preflight `OPTIONS` tidak dihitung. Map dibersihkan saat melebihi 1000 entri. |
| 3 | `proguard-rules.pro` | Komentar template diganti satu baris ringkas. Perilaku build tidak berubah. |
| 4 | Tombol restore buku arsip | `libraryService.getArchivedBooks()` + `restoreBook()` (Supabase: update `deleted_at = NULL`, konflik ISBN aktif → `false`; lokal: cek ISBN aktif + rollback). `BookshelfPage` dapat panel "Arsip" untuk Staff (tidak untuk Member) dengan tombol "Pulihkan"; aksi menulis log `BOOK_RESTORED`. |

### 18.2 File

**Baru:** `supabase/functions/book-metadata/rateLimit.ts`, `supabase/functions/book-metadata/rateLimit.test.ts`.

**Diubah:** `index.html`, `src/services/libraryService.ts`, `src/pages/BookshelfPage.tsx`, `supabase/functions/book-metadata/index.ts`, `android/app/proguard-rules.pro`, `PROGRESS.md`.

### 18.3 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | **21/21** (18 lama + 3 rate limiter) — PASS |
| `vite build` | PASS; `dist/index.html` memuat meta CSP, tanpa inline script |
| `git diff --check` | 0 — PASS |
| Scan `eval(` / `new Function(` di bundle | 0 kecocokan — PASS |
| Dev server | Injeksi inline Vite/react-refresh muncul **sebelum** meta CSP — dev tidak terblokir |

### 18.4 Catatan

- CSP memakai meta tag (bukan header): portable untuk hosting statis, tetapi tidak bisa memakai `frame-ancestors`/`report-uri`. `style-src` sengaja mengizinkan `'unsafe-inline'` karena React memakai inline `style`.
- Rate limiter berbasis memori isolate Edge Function: proteksi dasar per instance, bukan state global lintas region. Untuk limit global antar-instance diperlukan tabel/counter Supabase — tidak ditambahkan sekarang.
- Restore hanya untuk Staff. RLS tidak berubah: policy "Staff can manage books" (FOR ALL) sudah mengizinkan SELECT/UPDATE baris terarsip; Member tetap terfilter oleh `deleted_at IS NULL`.
- Deploy ulang `book-metadata` dan penerapan perubahan frontend tetap menunggu approval (lihat §7/§12).

---

## 19. Tahap B — Update Checker — 19 November 2026

> **Status: DONE (implementasi + verifikasi) — Tahap C menunggu approval.**
> Spesifikasi: [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) §3–§4, §8, §10 Tahap B.
> Section 1–18 dipertahankan; hanya status temuan, §8, dan log §10 yang disentuh di §18.

### 19.1 Implementasi

| # | Bagian | Detail |
|---|---|---|
| 1 | `src/services/updateService.ts` | Validasi manifest V1–V10 (`schemaVersion`, `app`, `versionCode`, `releaseDate`, allowlist URL APK, `sha256`, `fileSize`, `minimumSupportedVersionCode`, `forceUpdate`, `changelog`). Banding versi memakai integer `versionCode`. Timeout 10 dtk + 1 retry. Throttle 6/12/24 jam sesuai jumlah kegagalan, cache manifest 24 jam, guard satu flight. Dismiss per `versionCode`. `openDownloadUrl` memakai allowlist yang sama. |
| 2 | `src/services/updateService.test.ts` | 11 test: manifest valid/invalid, allowlist, keputusan versi (up-to-date/available/forced/dismissed), build lokal → checker nonaktif. |
| 3 | `src/hooks/useAppUpdater.ts` | Cek startup Android setelah 3 dtk (bukan di platform lain), cek manual, dismiss, `notifyFromPush` untuk FCM. |
| 4 | UI | `UpdateBanner` + `UpdateDialog` baru (info versi, changelog, force tanpa "Nanti", fallback unduh via browser). `UpdateNotifications` sekarang hanya sinyal → satu banner in-app. |
| 5 | Integrasi | `App.tsx` mount checker + banner + dialog di semua cabang render; `SettingsPage` section "Application Updates" dengan tombol "Periksa pembaruan". |
| 6 | Build/CI | `VITE_UPDATE_MANIFEST_URL` disuntik dari secret `APK_STORAGE_BUCKET`. Tanpa env versi/URL → checker nonaktif (aman untuk dev). `.env.example` + README §5 diperbarui. |

### 19.2 File

**Baru:** `src/services/updateService.ts`, `src/services/updateService.test.ts`, `src/hooks/useAppUpdater.ts`, `src/components/updater/UpdateBanner.tsx`, `src/components/updater/UpdateDialog.tsx`.

**Diubah:** `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/components/UpdateNotifications.tsx`, `.github/workflows/android-release.yml`, `.env.example`, `README.md`, `PROGRESS.md`.

### 19.3 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | **32/32** (21 sebelumnya + 11 updateService) — PASS |
| `vite build` | PASS; bundle rilis mengandung versi, versionCode, URL manifest, key cache |
| Parse YAML + `bash -n` step Build web assets | OK / 0 — PASS |
| `npm ci --dry-run` / `npm ci` | PASS — `package.json` + `package-lock.json` dikembalikan ke HEAD setelah ditemukan downgrade `firebase`/`@capacitor-firebase/messaging` yang tidak disengaja dan memicu `ERESOLVE` |
| `git diff --check` | 0 — PASS |

### 19.4 Batasan Tahap B

- Belum ada downloader/instalator dalam aplikasi — tombol dialog masih membuka browser (Tahap C/D).
- `latest.json` belum ditandatangani Ed25519 (Tahap E, wajib sebelum rilis pengguna).
- FCM hanya memicu cek; notifikasi sistem OS tetap muncul (tidak bisa dihilangkan dari WebView).
- Checker otomatis hanya di Android dan hanya setelah auth/role selesai; build lokal tanpa env → nonaktif.
- Perubahan CI butuh satu kali rilis tag asli untuk memvalidasi injeksi `VITE_UPDATE_MANIFEST_URL` end-to-end (aksi user).

---

## 20. Tahap C — APK Downloader — 19 November 2026

> **Status: DONE (implementasi + verifikasi) — Tahap D menunggu approval.**
> Spesifikasi: [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) §5, §10 Tahap C.

### 20.1 Implementasi

| # | Bagian | Detail |
|---|---|---|
| 1 | `AppUpdaterPlugin.java` | Plugin Capacitor `AppUpdater` dengan `@PluginMethod` `download`, `cancel`, `cleanup`. `HttpURLConnection` + timeout 15/30 dtk, tanpa redirect. Allowlist native (https + `storage.googleapis.com` + pola path APK) identik dengan klien. Unduh ke `cacheDir/updates/readowl-<versionCode>.apk.part`, resume via `Range`, digest SHA-256 saat streaming, cek ukuran vs `fileSize`, rename ke `.apk`. Progress event `downloadProgress` (maks ~4x/detik) lewat `runOnUiThread`. |
| 2 | `MainActivity.java` | `registerPlugin(AppUpdaterPlugin.class)` sebelum `super.onCreate`. |
| 3 | `updaterBridge.ts` + `types/updater.ts` | `registerPlugin` dengan `download`, `cancel`, `cleanup`, `addListener`. Guard `Capacitor.getPlatform() === 'android'`. |
| 4 | `useAppUpdater.ts` | State unduhan (`idle`/`downloading`/`ready`/`error`), listener progress, start/cancel, cleanup otomatis saat mount. Di non-Android, tombol unduh jatuh ke browser. |
| 5 | `UpdateDialog.tsx` | Bar progress + MB + persen, tombol Batal, pesan sukses/error, fallback "Unduh via browser". |

### 20.2 File

**Baru:** `android/app/src/main/java/org/readowl/library/updater/AppUpdaterPlugin.java`, `src/services/updaterBridge.ts`, `src/types/updater.ts`.

**Diubah:** `android/app/src/main/java/org/readowl/library/MainActivity.java`, `src/hooks/useAppUpdater.ts`, `src/components/updater/UpdateDialog.tsx`, `src/App.tsx`, `PROGRESS.md`.

### 20.3 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 32/32 — PASS |
| `vite build` | PASS |
| `javac` plugin + MainActivity (stub API Capacitor di `%TEMP%`, android.jar SDK) | 0 error — PASS |
| `git diff --check` | 0 — PASS |

### 20.4 Batasan Tahap C

- Gradle `:app:compileDebugJavaWithJavac` belum bisa dijalankan karena `capacitor-cordova-android-plugins` belum di-generate (`npx cap sync android` belum dijalankan). Pengecekan Java memakai stub API, bukan build APK penuh.
- Belum ada instalasi APK / izin `REQUEST_INSTALL_PACKAGES` (Tahap D). Setelah unduh, UI hanya mengatakan APK siap.
- Belum ada validasi paket/signature (Tahap E) dan tanda tangan manifest Ed25519 (Tahap E).
- `file_paths.xml` tidak diubah; jalur cache sudah tercakup oleh `cache-path`.
- Perlu build APK + uji di perangkat nyata untuk memvalidasi plugin, progress, resume, dan penyimpanan cache (aksi user).

---

## 21. Tahap D — APK Installer — 19 November 2026

> **Status: DONE (implementasi + verifikasi) — Tahap E menunggu approval.**
> Spesifikasi: [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) §2, §7, §10 Tahap D.

### 21.1 Implementasi

| # | Bagian | Detail |
|---|---|---|
| 1 | `REQUEST_INSTALL_PACKAGES` | Ditambahkan ke `AndroidManifest.xml`. Tanpa izin ini, Android 8+ tidak akan mengizinkan instalasi APK dari aplikasi. |
| 2 | `AppUpdaterPlugin.install` | Validasi path + file ada. Cek `canRequestPackageInstalls()` (API 26+); API 24 fallback `getPackageInfo("com.android.packageinstaller")`. Jika tidak diizinkan → resolve dengan `action: openSettings`. Buat `FileProvider` URI (`org.readowl.library.fileprovider`), `ACTION_VIEW` + `application/vnd.android.package-archive`, flag `FLAG_GRANT_READ_URI_PERMISSION` + `FLAG_ACTIVITY_NEW_TASK`. |
| 3 | `AppUpdaterPlugin.openSettings` | `ACTION_MANAGE_UNKNOWN_APP_SOURCES` (API 26+) / `ACTION_APPLICATION_SETTINGS` (API 24). |
| 4 | `useAppUpdater` | `installApk` + `openInstallerSettings` + state `installError`. |
| 5 | `UpdateDialog` | Tombol "Instal APK" (hanya saat `ready`), pesan error, link "Izin tidak diberikan? Buka Pengaturan". |

### 21.2 File

**Diubah:** `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/org/readowl/library/updater/AppUpdaterPlugin.java`, `src/services/updaterBridge.ts`, `src/hooks/useAppUpdater.ts`, `src/components/updater/UpdateDialog.tsx`, `src/App.tsx`, `PROGRESS.md`.

### 21.3 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 32/32 — PASS |
| `vite build` | PASS |
| `javac` plugin + MainActivity (stub API Capacitor di `%TEMP%`, android.jar SDK) | 0 error — PASS |
| `git diff --check` | 0 — PASS |

### 21.4 Batasan Tahap D

- Instalasi **selalu** melalui Android Package Installer resmi + konfirmasi pengguna (tidak ada instalasi senyap).
- `file_paths.xml` tidak diubah; APK di `cacheDir/updates/` sudah tercakup oleh `cache-path`.
- Belum ada validasi signature APK (S6) dan tanda tangan manifest Ed25519 (S7) — Tahap E.
- `minSdkVersion = 24` (Android 7) → "Unknown sources" global; API 26+ per-app permission.
- Perlu build APK + uji di perangkat nyata (Android 7 vs 8+) untuk memvalidasi izin, FileProvider, dan alur permission UX (aksi user).

---

## 22. Tahap E — Security & Testing — 19 November 2026

> **Status: DONE (implementasi + verifikasi) — updater A–E selesai dikerjakan.**
> Spesifikasi: [`READOWL-UPDATER-PLAN.md`](./READOWL-UPDATER-PLAN.md) §6, §10 Tahap E.

### 22.1 Implementasi

| # | Bagian | Detail |
|---|---|---|
| 1 | `scripts/sign-manifest.mjs` | Dua mode: `--gen-key` (generate keypair Ed25519, tulis seed base64url + publik) dan `--in/--key/--out` (tanda tangan canonical JSON, tambah field `signature` base64url 64 byte). |
| 2 | Verifikasi manifest (S7) | `updateService.ts`: publik key di-pin (`UPDATER_PUBLIC_KEY_B64`), `verifySignatureWithKey` via Web Crypto `Ed25519`. Gagal verifikasi → manifest ditolak (fail closed) → cek jatuh ke cache/tidak ada update. |
| 3 | S5/S6 di plugin | `verifyArchive`: `getPackageArchiveInfo` → package id wajib `org.readowl.library`, signature byte APK wajib sama dengan app terpasang. Gagal → reject sebelum installer dibuka. |
| 4 | CI | Step publish manifest menyimpan `UPDATER_SIGNING_PRIVATE_KEY` ke file sementara, menandatangani `latest.json`, lalu menghapus file. Secret baru: `UPDATER_SIGNING_PRIVATE_KEY`. |
| 5 | Dokumentasi | README: cara generate keypair, pin publik key, daftar secret CI. npm script `release:sign-manifest`. |

### 22.2 File

**Baru:** `scripts/sign-manifest.mjs`.

**Diubah:** `src/services/updateService.ts`, `src/services/updateService.test.ts`, `android/app/src/main/java/org/readowl/library/updater/AppUpdaterPlugin.java`, `.github/workflows/android-release.yml`, `README.md`, `package.json`, `PROGRESS.md`.

### 22.3 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | **35/35** (32 + 3 signature) — PASS |
| `vite build` | PASS |
| `javac` plugin (stub API Capacitor + android.jar) | 0 error — PASS |
| Parse YAML + `bash -n` step Publish manifest | OK / 0 — PASS |
| Roundtrip `sign-manifest.mjs` → verifikasi node | PASS |
| `git diff --check` | 0 — PASS |

### 22.4 Catatan & aksi user

- **Publik key di app** (`UPDATER_PUBLIC_KEY_B64` di `src/services/updateService.ts`) sudah diisi dengan keypair contoh. Untuk produksi: jalankan `node scripts/sign-manifest.mjs --gen-key --out-key private.b64 --out-pub public.b64`, simpan nilai private sebagai secret `UPDATER_SIGNING_PRIVATE_KEY`, dan ganti `UPDATER_PUBLIC_KEY_B64` dengan nilai public yang tercetak. **Private key tidak boleh masuk repo.**
- Rilis pertama setelah perubahan ini **wajib** memakai manifest bertanda tangan; tanpa signature valid, app menolak manifest (checker tetap aman: tidak ada update palsu, hanya tidak ada update).
- Belum ada test matrix perangkat nyata (Android 7 vs 8+, offline, download terputus, hash gagal) — butuh build APK + perangkat (aksi user).

---

## 23. Pipeline Metadata Tunggal — 19 November 2026

> **Status: DONE (kode) — temuan 17 selesai.** Fungsi Edge Function `book-metadata` yang sudah diperketat (validasi + rate limit, §18) tetap harus di-deploy ulang (aksi user).

### 23.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | `src/services/metadataService.ts` | Pipeline klien (Open Library → Google Books → merge) dihapus. Alur kini: validasi ISBN → cache → `metadataClient.functions.invoke('book-metadata')` → mapping. Gagal jaringan → `network_error`; 429 → `rate_limited`; respons tak cocok → `not_found` + pesan arahkan deploy Edge Function. |
| 2 | CSP `index.html` | `connect-src` kehilangan `https://openlibrary.org` dan `https://*.googleapis.com` — klien tak lagi memanggil API pihak ketiga langsung. |
| 3 | Dokumentasi | README (struktur file + fitur scanner), `READOWL-ARCHITECTURE.md` (inventaris, tabel service, diagram alur, daftar sumber API). |

### 23.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 35/35 — PASS |
| `vite build` | PASS |
| `git grep` pemanggilan langsung `openlibrary`/`googleapis` di `src/` | 0 (hanya allowlist updater `storage.googleapis.com`) — PASS |
| `git diff --check` | 0 — PASS |

### 23.3 Catatan

- Parser tipe `MetadataErrorType` tetap dipertahankan (`timeout`, `rate_limited`, dll) agar UI `ScannerPage` tak berubah; error dipetakan ke tipe tersebut.
- Ketergantungan baru: tanpa Edge Function ter-deploy, pencarian metadata otomatis mati (pengguna tetap bisa isi manual). Deploy `book-metadata` jadi prasyarat setelah migrasi/rotasi (§7).
- Cache in-memory per sesi dipertahankan; tidak ada perubahan perilaku simpan buku.

---

## 24. Tahap F — Desktop Updater (Windows + macOS) — 19 November 2026

> **Status: DONE (kode + CI + docs) — belum commit, belum rilis tag nyata.** Keputusan user: (1) platform Windows + macOS dulu, (2) notif via **in-app check** (bukan webhook), (3) nama service Vercel `app` saja / publik `/` / tanpa binding (lihat log §10).

### 24.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | `src-tauri/` (aktif) | `build.rs`, `capabilities/default.json` (core/opener/updater/process), `Cargo.toml` + plugin `tauri-plugin-updater`/`process`, `main.rs` registrasi plugin, ikon dari logo (`tauri icon`), `bundle.createUpdaterArtifacts`, pubkey minisign di `plugins.updater.pubkey`. `Cargo.lock` di-commit; `target/`+`gen/` di-gitignore. |
| 2 | Keypair minisign | `npx tauri signer generate --ci` — private key di `/tmp/opencode/tauri-desktop.key` (**luar repo**), publik di-pin di `tauri.conf.json`. Password kosong (uji roundtrip signer PASS). |
| 3 | `scripts/prepare-desktop-build.mjs` | Injeksi versi tag → `tauri.conf.json` + `Cargo.toml`; endpoint updater `https://storage.googleapis.com/<bucket>/desktop/latest.json` divalidasi (https + host GCS + path `/latest.json`). Tanpa endpoint, checker desktop fail-closed. |
| 4 | `scripts/generate-desktop-manifest.mjs` | Perakit manifest Tauri v2 (`version`/`notes`/`pub_date`/`platforms`), signature = isi `.sig`, fail-closed bila `windows-x86_64` atau `darwin-aarch64` hilang. |
| 5 | `.github/workflows/desktop-release.yml` | `build` (windows-latest + macos-latest arm64): npm ci → prepare → `npx tauri build` bertanda tangan → stage `bundle/*`+`.sig`. `publish` (ubuntu): download artefak → gcloud upload `gs://<bucket>/desktop/` + verifikasi content-length → manifest terbit **terakhir** (`max-age=60`). Repo private → endpoint wajib GCS publik, bukan GitHub Releases. |
| 6 | `useAppUpdater.ts` | Deteksi Tauri (`__TAURI_INTERNALS__`), cek `plugin-updater.check()` saat startup (3 dtk) + manual; `startDesktopUpdate` = `downloadAndInstall` + `relaunch`; dismiss persist per versi; `platform` di ekspor. |
| 7 | `DesktopUpdateBanner.tsx` + `App.tsx` + `SettingsPage.tsx` | Banner desktop (Perbarui/Nanti/downloading/error); `App` render banner via fallback `updaterUi`; Settings: blok status desktop + "Versi terbaru" dari manifest desktop. |
| 8 | `package.json` | deps: `@tauri-apps/api`, `plugin-updater`, `plugin-process`; devDep: `@tauri-apps/cli` (2.12.6). |
| 9 | Docs | README §5 desktop updates + 2 secret baru; `READOWL-ARCHITECTURE.md` (stack, struktur, §4.6 alur desktop, §4.7, inventaris §5.1, F-10 RESOLVED); `.gitignore`. |

### 24.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `cargo check` (src-tauri) | PASS (tauri 2.12.7, plugin-updater 2.14.1) |
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 35/35 — PASS |
| `vite build` (+ env versi) | PASS |
| `npx tauri info` (parse config) | PASS |
| Uji `prepare-desktop-build.mjs` (positif + host salah + tag prerelease) | PASS / ditolak / ditolak |
| Uji `generate-desktop-manifest.mjs` (positif + SIG hilang) | PASS / fail-closed |
| Roundtrip `tauri signer sign` (password kosong) | PASS |
| YAML + `bash -n` seluruh `run:` di `desktop-release.yml` | PASS |
| `git diff --check` | 0 — PASS |

### 24.3 Aksi user (di luar repo)

1. **Simpan private key** `/tmp/opencode/tauri-desktop.key` ke tempat aman — `/tmp` bisa hilang. Hilang = desktop lama tak bisa verifikasi update baru (regenerasi = ganti pubkey + rilis ulang).
2. Buat secret GitHub: `TAURI_SIGNING_PRIVATE_KEY` = isi file key; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = kosong.
3. Tag rilis uji (`v1.2.3` dst.) untuk menjalankan dua workflow end-to-end.

### 24.4 Batasan / belum dikerjakan

- **iOS**: belum saat Tahap F → **diselesaikan Tahap G (§25)** — PWA + Web Push; App Store tetap ditunda.
- **Notif push desktop**: tidak ada (FCM-style) — pilihan user in-app check; webhook/Telegram opsional nanti.
- **macOS**: build unsigned — Gatekeeper warning; perlu akun Apple Developer untuk signing/notarisasi. **Intel Mac** belum di-build (baru `aarch64`).
- **Windows**: SmartScreen warning tanpa Authenticode.
- Tidak ada commit/push/tag; artefak rilis nyata belum pernah dijalankan.

---

## 25. Tahap G — iOS via PWA + Web Push — 19 November 2026

> **Status: DONE (kode + CI + docs) — belum commit, belum deploy function, belum jalan migrasi.** Keputusan user: jalur **PWA + Web Push** (tanpa akun Apple); App Store ditunda.

### 25.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | PWA shell | `public/manifest.webmanifest` (standalone, ikon 192/512), `public/apple-touch-icon.png` 180px, meta `apple-mobile-web-app-*` + `theme-color` + link manifest di `index.html`. |
| 2 | `public/sw.js` | Handler `push` (showNotification + payload title/body/url) dan `notificationclick` (focus window + postMessage `UPDATE_AVAILABLE` → app reload, atau `openWindow`). **Tanpa fetch handler** → tanpa cache, buka = deploy terbaru. |
| 3 | `src/services/pushService.ts` + test | `isWebPushSupported`/`isIosDevice`/`isIosStandalone`, decode VAPID (`urlBase64ToUint8Array`), register SW, `subscribeToPush`/`unsubscribeFromPush`, simpan/hapus row via Supabase (wajib login). 3 test (decode base64url + support). |
| 4 | UI | Section Settings **"Notifikasi Update (Web / iOS)"**: status, aktifkan/nonaktifkan, hint iOS browser (Bagikan → Tambahkan ke Layar Utama). `App.tsx`: daftar SW saat mount + listener reload dari SW. |
| 5 | Migrasi | `20261119000000_push_subscriptions.sql`: tabel + RLS insert/select/update/delete own-row + index. **File saja** — `db push` tetap dilarang (§7). |
| 6 | Edge Function | `supabase/functions/send-update-push/`: autentikasi `Bearer UPDATE_PUSH_SECRET` (perbandingan konstan-waktu), validasi `version`, kirim `npm:web-push` VAPID ke semua subscription, hapus yang 404/410, balas `{sent, failed, removed}`. |
| 7 | CI | `android-release.yml` job `notify-devices`: step baru setelah FCM → `POST <SUPABASE_FUNCTIONS_URL>/send-update-push` dengan tag versi; fail-closed bila secret hilang/tag salah. |
| 8 | Env/docs | `.env.example` (VITE_VAPID_PUBLIC_KEY + server secrets), README (seksi iOS + prasyarat + 2 secret CI baru), arsitektur. |

### 25.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 38/38 — PASS |
| `vite build` | PASS |
| `deno check` `send-update-push` (npm:web-push 3.6.7) | PASS |
| `git diff --check` | 0 — PASS |

### 25.3 Aksi user (di luar repo)

1. `npx supabase db push` (atau jalankan migrasi) — tabel `push_subscriptions`.
2. Deploy function: `npx supabase functions deploy send-update-push`.
3. `npx supabase secrets set UPDATE_PUSH_SECRET=<panjang> VAPID_PUBLIC_KEY=<pub> VAPID_PRIVATE_KEY=<priv>` (pasangan dari `npx web-push generate-vapid-keys`; pub yang sama untuk `VITE_VAPID_PUBLIC_KEY` di Vercel).
4. Secret GitHub: `SUPABASE_FUNCTIONS_URL` = `https://<ref>.supabase.co/functions/v1`, `UPDATE_PUSH_SECRET` = nilai sama dengan di Supabase.
5. Deploy ulang `book-metadata` (prasyarat lama, §23) masih berlaku.

### 25.4 Batasan

- Web Push iOS butuh **iOS 16.4+** dan app dari **Layar Utama** (bukan tab Safari biasa).
- Notif hanya terkirim kalau ada yang subscribe + function ter-deploy + secret cocok; gagal = job notify merah (setelah APK/manifest terbit).
- Tanpa `fetch handler`, app tidak bisa dipakai offline (keputusan sadar — selalu versi terbaru).
- App Store (APNs asli) tetap ditunda — butuh akun Apple Developer.
- Belum ada commit/push/deploy nyata.

---

## 26. Hapus Seluruh Data Model Physical Copy — 19 November 2026

> **Status: DONE (kode + migrasi file + docs) — belum commit, migrasi BELUM dijalankan.** Keputusan user: (1) hapus blok Physical Inventory di detail buku, (2) lanjut hapus **semua** data model physical copy. Migrasi bersifat **destruktif** — data copy/acquisition/circulation yang ada akan hilang saat diterapkan.

### 26.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | `20261119000100_remove_physical_copies.sql` | RPC pengganti `add_book_atomic` (logika bibliografis + soft-delete-safe upsert identik, tanpa parameter copy). Drop: 6 fungsi lama (`add_book_with_copies_atomic`, 2 signature `borrow_book_atomic`, `return_book_atomic`), view `book_copies_public`, tabel `book_returns`/`borrow_transaction_items`/`acquisition_records`/`borrow_transactions`/`book_copies`, enum `copy_status_enum`/`borrow_status_enum`, sequence `readowl_inventory_code_seq`, setting `inventory_config`+`circulation_rules`. |
| 2 | `src/types/library.ts` | Hapus `CopyStatus`, `BookCopy`, `Book.copies`, `LibrarySettings.inventory_config`. |
| 3 | `src/services/libraryService.ts` | `addBookWithCopies` → `addBook` (RPC `add_book_atomic`, return `{book}`); hapus `getCopies`/`getCopyByInventoryCode`/`updateCopyStatus`; hilangkan query `book_copies_public` di `getBooks`/`getBookByIsbn`/`getArchivedBooks`; `deleteBook` kini selalu arsipkan (soft-delete dipertahankan); settings hanya `library_info`. |
| 4 | `codeResolver.ts` + `BarcodeScanner.tsx` + test | Hapus kind `internal`, pola `COPY_BARCODE`/`INVENTORY_CODE`, cabang URL inventory; test kode RDW kini diharapkan `unknown`. ISBN/EAN add-on tetap. |
| 5 | Halaman | Hapus `InventoryPage.tsx` (orphan). `ScannerPage`: form copy + state + alur internal dihapus, pakai `addBook`. `BookshelfPage`: filter status, ribbon copy, kolom tabel, teks related-copy dihapus (blok detail dihapus lebih awal). `DashboardPage`: metrik copy/badge availability dihapus, sisa "Total titles". `ReportsPage`: ditulis ulang jadi laporan katalog menurut subject + jumlah anggota + CSV. |
| 6 | `supabase/seed.sql` | Hapus seed `inventory_config`; deskripsi peran Librarian disesuaikan. |
| 7 | Docs | README & arsitektur disesuaikan; migrasi lama tetap tercatat sebagai histori, bukan dihapus dari riwayat. |

### 26.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 38/38 — PASS |
| `vite build` | PASS |
| `git grep` referensi copy di `src/` | 0 (kecuali nama test yang mendokumentasikan penghapusan) — PASS |
| `git diff --check` | 0 — PASS |

### 26.3 Aksi user (berbahaya)

1. **Backup database** sebelum `npx supabase db push` — migrasi menghapus semua baris copy/acquisition/circulation secara permanen.
2. Pastikan aplikasi versi baru (tanpa query `book_copies_public`) di-deploy **bersamaan atau sebelum** migrasi — jika tidak, 3 method pembacaan buku akan error.
3. Setelah migrasi: verifikasi RPC `add_book_atomic` bisa dipanggil oleh Administrator/Librarian, dan katalogisasi lewat Scanner berhasil.

### 26.4 Batasan

- Riwayat `activity_logs` lama (aksi `COPY_UPDATED`, `BORROW_*`, dll) **tidak dihapus** — hanya jejak historis, tidak bergantung pada tabel yang di-drop.
- Soft-delete buku (Arsip/Pulihkan) tetap dipertahankan karena bukan bagian dari model copy.
- `members` tetap saat Tahap H → **dihapus Tahap I (§27)** atas permintaan user berikutnya.
- Belum ada commit/push; migrasi belum dijalankan ke Supabase lokal maupun remote.

---

## 27. Hapus Member/Patron + Tanggal & Jam Buku — 19 November 2026

> **Status: DONE (kode + migrasi file + docs) — belum commit, migrasi BELUM dijalankan.** Dua permintaan user sekaligus: (1) hapus fitur/menu/DB member/patron, (2) tampilkan tanggal dan jam saat buku ditambahkan.

### 27.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | `20261119000200_remove_members.sql` | `DROP TABLE public.members` + enum `membership_type_enum`, `member_status_enum`. **Tidak menyentuh** Supabase Auth, `public.user_roles`, `has_role`, `current_user_role`, atau peran aplikasi `'Member'` — itu otorisasi, bukan patron. Semua tabel sirkulasi yang dulu mereferensikan members sudah dihapus Tahap H. |
| 2 | `src/types/library.ts` | Hapus `Member`, `MembershipType`, `MemberStatus`; `UserRole` tetap. |
| 3 | `src/services/libraryService.ts` | Hapus `getMembers`, `countMembers`, `addMember`, `updateMember`, konstanta storage & initial state terkait. |
| 4 | UI | `MembersPage.tsx` dihapus; item nav `Members` (`MainLayout`), import/route `members` (`App`) dihapus; `ReportsPage` tanpa KPI anggota. Pemeriksaan `userRole === 'Member'` di Dashboard/Bookshelf/MainLayout **dipertahankan** (RBAC). |
| 5 | Tanggal & jam | `src/lib/datetime.ts` → `formatAddedAt()` memformat `created_at` (sudah ada di DB/local state) menjadi tanggal + jam (`id-ID`). Dipakai di: banner sukses `ScannerPage`, kolom **Ditambahkan** tabel `BookshelfPage`, metadata detail buku, dan daftar buku terbaru `DashboardPage`. 2 test baru (`datetime.test.ts`). |
| 6 | Docs | README/arsitektur disesuaikan; §26.4 diperbarui. |

### 27.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 40/40 — PASS |
| `vite build` | PASS |
| `rg member` di `src/` | hanya peran RBAC `'Member'` — PASS |
| `git diff --check` | 0 — PASS |

### 27.3 Aksi user

- Backup DB sebelum `npx supabase db push` — migrasi menghapus semua data patron permanen.
- Deploy client baru bersamaan dengan migrasi.
- Tanggal/jam bersifat otomatis dari `created_at` saat katalogisasi; tidak ada input manual.

### 27.4 Batasan

- Riwayat log bertema `MEMBER_*` tidak dihapus (jejak historis, tidak bergantung tabel).
- Belum ada commit/push; migrasi belum dijalankan.

---

## 28. Edit Buku di Bookshelf & Catalog — 19 November 2026

> **Status: DONE (kode + RPC migration file + docs) — belum commit, migrasi BELUM dijalankan.**

### 28.1 Perubahan

| # | Bagian | Detail |
|---|---|---|
| 1 | `BookshelfPage.tsx` | Tombol **Edit Record** di modal detail (Administrator/Librarian; peran `Member` hanya baca). Form: judul, subjudul, penulis, penerbit, ISBN-10/13, tahun, halaman, bahasa, kategori, URL cover, deskripsi. Validasi ISBN + judul; mode simpan menampilkan status. |
| 2 | `libraryService.ts` | `updateBook(book, metadata)` — RPC `update_book_atomic` di mode Supabase; patch `readowl_data_books` + rollback di mode lokal; log `BOOK_UPDATED` (lokal), RPC mencatat log (cloud). |
| 3 | `20261119000300_update_book_atomic.sql` | RPC staff-only: validasi peran/ISBN/duplikat, update field buku + `metadata_source`, replace relasi penulis/kategori, tulis activity log. |
| 4 | Docs | README feature + migration tree, arsitektur service. |

### 28.2 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 — PASS |
| `vitest run` | 40/40 — PASS |
| `vite build` | PASS |
| `git diff --check` | 0 — PASS |

### 28.3 Aksi user

- Jalankan `npx supabase db push` **setelah** backup — migration H, I, dan 28.3 baru akan aktif bersamaan.
- Deploy client baru di setelah migrasi RPC (edit gagal di cloud kalau RPC belum ada).
- Edit tidak mengubah `created_at`; hanya `updated_at`.

---

## 29. Audit kode baru + perbaikan bug B1–B4/B8 & ErrorBoundary — 25 November 2026

> **Status: SELESAI (kode + docs) — belum commit.** Verifikasi eksekusi (tsc/test/build) **belum bisa dijalankan** karena shell `pwsh.exe` pada sesi ini terblokir `Access is denied (os error 5)`; perbaikan hanya diverifikasi lewat pembacaan ulang diff/file. Perubahan UI milik user (12 file termodifikasi di working tree) **tidak disentuh**.

### 29.1 Konteks

User melaporkan dua bug: (1) layar blank/putih setelah input buku lalu pindah menu; (2) metadata ISBN `9786026210470` ("Mahir Bahasa Inggris dari Nol") tidak ditemukan, padahal valid. Audit read-only juga menemukan B1–B8 (lihat summary percakapan sebelumnya).

**Console browser (dari user):** tidak ada error React — hanya pesan ekstensi Firefox XrayWrapper dan log normal Vite HMR. Ini berarti layar putih **bukan crash JS** yang langsung terlihat; kemungkinan besar render error yang tak tertangkap (dan repo sebelumnya tidak punya ErrorBoundary).

### 29.2 Perbaikan yang diterapkan

| # | File | Perubahan | Alasan |
|---|---|---|---|
| B1 | `supabase/functions/book-metadata/index.ts` | Tambah `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";` (baris 4). | `serve(...)` dipanggil baris 181 tapi tidak pernah di-import → `ReferenceError` saat deploy. Gaya disamakan dengan `send-update-push/index.ts`. |
| B2 | `src/services/libraryService.ts` | Satu `coverFileName = \`${Date.now()}-${metadata.isbn13}.jpg\`` dipakai untuk `upload`, `getPublicUrl`, dan fallback path. | Sebelumnya `Date.now()` dipanggil 3× → URL publik menunjuk file yang tidak pernah di-upload (cover 404). |
| B3 | `src/services/libraryService.ts`, `BookshelfPage.tsx`, `DashboardPage.tsx`, `ReportsPage.tsx` | Tambah `LibraryService.getAllBooks(pageSize=200)` yang mem-page lewat `getBooks` dengan guard `seen` (anti-duplikat / anti-skip-diabaikan) dan `maxPages`; ganti 3 call site `{limit:20,skip:0}` → `getAllBooks()`. Rapikan indentasi `getBooks`. | Buku ke-21+ tidak pernah tampil di Discover, Book Shelf, maupun Reports. |
| B4 | `.github/workflows/ci.yml` | Pin `actions/checkout` dan `actions/setup-node` ke SHA yang sama dengan `android-release.yml`/`desktop-release.yml`; samakan `node-version: '22'` untuk lint+test. | Action unpinned melanggar kebijakan hardening Batch 5; node 22/24 mismatch tidak perlu. |
| B8 | `src/components/scanner/BarcodeScanner.tsx` | Hapus `useEffect` duplikat yang mereset scan state saat `handleDecoded` berubah (dipicu `isProcessing`). Rapikan indentasi baris 118 dan 125. | Effect duplikat memanggil `resetScanState()` di tengah scan, berpotensi menghapus state deteksi secara acak. |
| — | `src/components/ErrorBoundary.tsx` (baru), `src/main.tsx` | Tambah `ErrorBoundary` root yang menampilkan pesan error + `componentStack` + tombol Muat ulang/Coba lagi. | Repo sebelumnya tidak punya ErrorBoundary; satu render error = layar putih tanpa petunjuk. Ini defensif — membantu mendiagnosis bug blank yang dilaporkan user. |

### 29.3 Temuan yang **tidak** diubah (dengan alasan)

| # | Temuan | Keputusan |
|---|---|---|
| Bug metadata ISBN 9786026210470 | **Bukan bug kode lookup.** Open Library (by ISBN & by title) mengembalikan kosong untuk buku ini; Google Books API mengembalikan **429 quota `0`** karena `GOOGLE_BOOKS_API_KEY` tidak diset. | Butuh secret server-side `GOOGLE_BOOKS_API_KEY` (Supabase) dan/atau fallback pencarian by judul (belum disetujui). B1 sudah diperbaiki agar deploy berikutnya tidak `ReferenceError`. |
| B5 `enable_signup=true` | **Bukan bug.** README baris 111–114 mendokumentasikan alur registrasi Member yang memang disengaja + trigger DB. | Biarkan. |
| B6 commit messages kosong / PROGRESS belum tercatat | Entri ini menambahkan pencatatan. | Commit message butuh keputusan user saat commit. |
| B7 npm audit 5 high (firebase chain) | Tidak disentuh. | Perlu keputusan upgrade; bisa punya breaking change. |
| Bug blank putih (runtime) | **Belum terkonfirmasi akar penyebabnya.** Console user bersih dari error React; ErrorBoundary baru akan menampilkan pesan jika terjadi render error. | Menunggu user reproduksi ulang dengan build ini (atau kirim screenshot ErrorBoundary / console baru). Shell terblokir, jadi browser repro otomatis tidak bisa dijalankan. |
| 12 file UI user (`git status` dirty) | **Tidak disentuh.** | Perubahan milik user. |

### 29.4 Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | **Belum dijalankan** — `pwsh.exe` Access denied |
| `vitest run` | **Belum dijalankan** — `pwsh.exe` Access denied |
| `vite build` | **Belum dijalankan** — `pwsh.exe` Access denied |
| Pembacaan ulang diff/file yang diedit | PASS (B1 import ada, B2 satu filename, B3 call site terganti + `getAllBooks` ada, B4 SHA pinned, B8 effect duplikat hilang, ErrorBoundary terpasang di `main.tsx`) |

### 29.5 Aksi user / langkah berikutnya

1. **Coba ulang bug blank putih** dengan kode ini. Jika masih blank, ErrorBoundary seharusnya menampilkan pesan error merah — kirim screenshot/pesan itu.
2. **Perbaiki metadata**: set `GOOGLE_BOOKS_API_KEY` di Supabase secrets, lalu deploy `book-metadata` (setelah B1). Untuk buku yang memang tak ada di OL/GB, pertimbangkan fallback pencarian judul.
3. Jalankan verifikasi saat shell normal: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run`, `node node_modules/vite/bin/vite.js build`.
4. Commit — staging harus **selektif** karena 12 file UI Anda juga termodifikasi; jangan ikut commit file UI kecuali memang mau. Juga pastikan `.env` tidak ikut.
