# Security Remediation Plan — MeelieFont (mini-book)

> **Status dokumen: IN PROGRESS — menunggu persetujuan sebelum tindakan production apa pun.**
>
> Dibuat: 18 November 2026 · Repo `Mr-Young-62/mini-book` · Branch `main` @ `ba4ab9f`
>
> **Kondisi proyek:** Supabase ReadOwl masih dalam tahap **DEVELOPMENT / TESTING** dan belum
> digunakan sebagai production oleh pengguna sungguhan. Strategi remediation disesuaikan dengan
> kondisi ini: prioritas adalah menutup celah yang terbuka, bukan menjaga uptime layanan.
>
> **Aturan emas:** tidak ada tindakan destruktif atau perubahan remote tanpa persetujuan eksplisit.
> Database testing **tidak** boleh dihapus atau di-reset tanpa persetujuan.

---

## 0. Ringkasan prioritas

| # | Prioritas | Terkait | Status |
|---|---|---|---|
| 1 | Rotasi credential yang terekspos | §1, §2, §3, §4 | **IN PROGRESS** |
| 2 | Pengamanan dan pembersihan Edge Functions lama | §6 | **IN PROGRESS** |
| 3 | Pembersihan Git history setelah credential lama tidak aktif | §5 | **IN PROGRESS** |
| 4 | Verifikasi migrasi dan database testing | §7, §8 | **IN PROGRESS** |
| 5 | Finalisasi Phase 0 sebelum Phase 1 | §9 | **IN PROGRESS** |

**Urutan wajib:** rotasi (§2–4) → **setelah key lama mati** → bersihkan riwayat (§5) → migrasi (§7–8) → Phase 1 (§9).

> **Catatan status:** seluruh item di bawah berstatus **IN PROGRESS**. Hasil audit read-only yang
> sudah dilakukan dicatat pada kolom *"Hasil audit pendukung"* sebagai bahan dasar perencanaan —
> audit ≠ remediation. Belum ada satu pun tindakan remediation yang dijalankan.

---

## 1. Identifikasi credential terdampak

**Status: IN PROGRESS** — audit selesai, remediasi belum dimulai.

### 1.1 Sumber kebocoran

| Fakta | Nilai |
|---|---|
| File | `.env` |
| Commit yang memperkenalkan | `c64df66` (`update v0.4`), aksi `A` (add) |
| Pernah dihapus dari riwayat? | **Belum** — masih ada sampai sekarang |
| Object riwayat ter-scan | 321 |
| File lain dengan secret-shaped string | **Tidak ada** |

### 1.2 Key terdampak (nilai tidak ditampilkan)

| Key | Tipe | Panjang | Terpapar di | Prioritas rotasi |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Server-side AI key | 53 | `.env` + riwayat Git | **P1 — wajib** |
| `VITE_GOOGLE_BOOKS_API_KEY` | Google Cloud API key | 39 | `.env` + riwayat Git + **bundle browser lama** | **P1 — wajib** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (`sb_publishable_…`) | 46 | `.env` + riwayat Git + bundle | P2 — tinjau |
| `VITE_SUPABASE_URL` | Endpoint project | 40 | `.env` + riwayat Git + bundle | P3 — bukan secret ketat |
| `APP_URL` | Placeholder | 10 | `.env` | Aman |

### 1.3 Catatan penting

- **Nilai asli `.env` masih ada di disk** (882 byte). File sudah ter-ignore (`.gitignore:7`) dan
  ter-stage sebagai penghapusan (`D `), tetapi file fisiknya belum dihapus.
- `sb_publishable_…` memang dirancang publik untuk klien Supabase — kebocoran bukan insiden tersendiri,
  tetapi tetap masuk daftar tinjauan karena ikut ter-commit.
- Key Google **ikut masuk ke bundle browser/APK lama** (Vite menanam semua `VITE_*`). APK yang sudah
  beredar di bucket GCS publik masih membawa key ini → **rotasi juga menutup celah ini**.

---

## 2. Prosedur revoke dan generate key baru

**Status: IN PROGRESS — belum ada rotasi dijalankan.** *(Dilarang tanpa persetujuan.)*

### 2.1 Google Books API key (`VITE_GOOGLE_BOOKS_API_KEY`)

```text
[ ] B1. Buka Google Cloud Console → APIs & Services → Credentials
[ ] B2. IDENTIFY key terdampak (jangan tampilkan nilai di chat/log)
[ ] B3. Buat key BARU dulu (jangan hapus yang lama sebelum verifikasi)
[ ] B4. Restrict key baru:
        - API: Google Books API saja
        - Restrict referrer: domain hosting yang valid
        - (Jika hanya dipakai server) batasi ke IP / jangan izinkan browser
[ ] B5. Verifikasi key baru berfungsi (uji dari server, bukan browser)
[ ] B6. DELETE/revoke key LAMA setelah B5 lolos
[ ] B7. Catat waktu revoke (untuk bukti remediation)
```

### 2.2 Gemini API key (`GEMINI_API_KEY`)

```text
[ ] G1. Buka Google AI Studio → API keys
[ ] G2. IDENTIFY key terdampak
[ ] G3. Generate key baru
[ ] G4. Verifikasi tidak ada kode yang memakainya (audit: SUDAH terkonfirmasi tidak ada)
[ ] G5. DELETE key lama
[ ] G6. Catat waktu revoke
```

> **Temuan pendukung:** kode sumber sudah **tidak memakai Gemini** sama sekali —
> `metadata.json` tidak lagi menyebut `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`,
> `.env.example` sudah bersih, `scripts/check-services.ps1` sudah tidak memeriksa Gemini.
> Jadi rotasi Gemini murni menutup key yang bocor di riwayat, bukan memperbaiki fungsi.

### 2.3 Supabase publishable key

```text
[ ] S1. Tinjau di Supabase Dashboard → Settings → API
[ ] S2. Putuskan: apakah rotasi diperlukan?
        - Key ini memang publik untuk klien → rotasi OPSIONAL
        - Lakukan hanya jika ada indikasi penyalahgunaan
[ ] S3. Jika dirotasi: update VITE_SUPABASE_PUBLISHABLE_KEY di CI/deploy
[ ] S4. Jangan rotasi service_role key tanpa alasan kuat — dan JANGAN PERNAH
        meletakkannya di klien
```

### 2.4 Setelah rotasi

```text
[ ] V1. Jalankan §4 (verifikasi aplikasi memakai credential baru)
[ ] V2. Pastikan app masih jalan normal
[ ] V3. BARU setelah B6+G5 selesai → lanjut §5 (bersihkan riwayat)
```

---

## 3. Pemindahan Google Books API Key ke Edge Function secret

**Status: IN PROGRESS — belum dipindahkan.**

### 3.1 Kondisi saat ini

| Lokasi | Nilai | Status |
|---|---|---|
| `supabase/functions/book-metadata/index.ts:275` | `Deno.env.get("GOOGLE_BOOKS_API_KEY")` | ✅ **Sudah server-side** |
| `.env.example:17` | Hanya komentar `# GOOGLE_BOOKS_API_KEY used by…` | ✅ Bersih |
| `README.md:120` | `npx supabase secrets set GOOGLE_BOOKS_API_KEY=your_key_here` | ✅ Placeholder |
| `scripts/check-services.ps1:65` | Membaca `GOOGLE_BOOKS_API_KEY` (bukan `VITE_*`) | ✅ Benar |
| Klien `metadataService.ts` | Tidak membaca key Google lagi | ✅ Bersih |
| Bundle browser / APK lama | **Masih membawa key lama** | ❌ Ditutup lewat rotasi (§2.1) |

**Kesimpulan:** pemindahan ke server sudah selesai di kode. Yang tersisa adalah **memasukkan key baru**
sebagai secret dan **memastikan key lama mati**.

### 3.2 Checklist

```text
[ ] M1. Setelah key baru dibuat (§2.1 B3):
        npx supabase secrets set GOOGLE_BOOKS_API_KEY=<nilai_baru>
        (jalankan DI SINI saja — jangan catat nilainya di dokumen ini)
[ ] M2. Verifikasi key tercatat:
        npx supabase secrets list
[ ] M3. Deploy ulang book-metadata agar secret terbaca:
        npx supabase functions deploy book-metadata
[ ] M4. Uji lookup ISBN dari aplikasi → pastikan sumber Google Books aktif
[ ] M5. Konfirmasi TIDAK ada key dengan prefix VITE_ tersisa di secret:
        npx supabase secrets list   → pastikan tidak ada VITE_GOOGLE_*
```

---

## 4. Verifikasi aplikasi menggunakan credential baru

**Status: IN PROGRESS — belum bisa dijalankan (menunggu rotasi).**

```text
[ ] A1. Bundle build baru tidak mengandung key lama:
        node node_modules/vite/bin/vite.js build
        lalu scan dist/assets/*.js untuk pola key LAMA
        → harus 0 kecocokan (selain sb_publishable_ yang memang publik)
[ ] A2. Scan seluruh repo untuk key lama:
        (pola AIza..., AQ....) → harus 0 selain di .env lokal
[ ] A3. Uji Edge Function book-metadata dengan ISBN valid
        → pastikan mengembalikan data dari Google Books
[ ] A4. Uji aplikasi penuh: sign-in → scan ISBN → katalog → laporan
[ ] A5. Jalankan seluruh test:
        node node_modules/typescript/bin/tsc --noEmit
        node node_modules/vitest/vitest.mjs run
        git diff --check
[ ] A6. Catat hasil di PROGRESS.md
```

**Baseline audit pendukung (sudah lulus, sebelum rotasi):**

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | 0 |
| `vitest run` | 18/18 |
| `vite build` | 0 |
| Scan key Google/Gemini di bundle | 0 |
| `git diff --check` | 0 |

---

## 5. Backup dan prosedur Git history rewrite

**Status: IN PROGRESS — BELUM BOLEH DIJALANKAN.** *(Menunggu §2 selesai + persetujuan eksplisit.)*

### 5.1 Prasyarat wajib

```text
[ ] P1. §2 rotasi SELESAI — key lama sudah di-revoke/di-delete
[ ] P2. Persetujuan eksplisit user untuk force-push
[ ] P3. Backup dibuat (lihat 5.2)
```

> **Alasan urutan ini:** membersihkan riwayat sebelum key dirotasi hanya menyembunyikan key yang
> masih hidup. Key yang sudah mati baru aman dibuka riwayatnya.

### 5.2 Backup sebelum tindakan destruktif

```text
[ ] B1. Clone mirror penuh (backup riwayat utuh):
        git clone --mirror https://github.com/Mr-Young-62/mini-book.git
        mini-book-backup-<tanggal>.git
[ ] B2. Simpan backup di LOKASI TERPISAH (di luar folder kerja)
[ ] B3. Backup file .env lokal (terenkripsi/di tempat aman) — berisi key
        yang SUDAH mati setelah §2
[ ] B4. Backup database testing (EXPORT, BUKAN reset):
        npx supabase db dump --db-url "<connection_string>" > backup-<tanggal>.sql
        ⚠ JANGAN `db reset` / `db drop` tanpa persetujuan
[ ] B5. Catat SHA sebelum rewrite: git rev-parse HEAD   → saat ini ba4ab9f
[ ] B6. Verifikasi backup bisa dibuka: git -C mini-book-backup-<tanggal>.git fsck
```

### 5.3 Prosedur rewrite (setelah P1–P3 terpenuhi)

```text
[ ] R1. Instal filter-repo (sekali)
[ ] R2. Jalankan pada CLONE, bukan working copy aktif:
        git filter-repo --path .env --invert-paths
[ ] R3. Verifikasi .env tidak ada di riwayat baru:
        git log --all --oneline -- .env          → harus kosong
        git rev-list --all --objects | grep '\.env$'  → hanya .env.example
[ ] R4. Verifikasi repo utuh:
        git fsck
        node node_modules/typescript/bin/tsc --noEmit
[ ] R5. Tambahkan remote & force-push (HANYA setelah persetujuan):
        git push --force-with-lease origin main
[ ] R6. Koordinasi: semua clone harus re-clone; CI harus re-clone
[ ] R7. Verifikasi remote: clone baru → cek .env tidak ada
[ ] R8. Catat waktu rewrite di PROGRESS.md
```

### 5.4 Cadangan bila rewrite ditunda

```text
[ ] C1. Minimal: pastikan pre-commit hook gitleaks/secret scanning terpasang
[ ] C2. Catat residual risk: key lama masih terbaca siapa pun dengan akses repo
        → INI ALASAN ROTASI (§2) TIDAK BOLEH DITUNDA
```

---

## 6. Verifikasi deployment Edge Functions

**Status: IN PROGRESS — audit remote TERBLOKIR tanpa token.**

### 6.1 Prasyarat akses

```text
[ ] E0a. supabase login          (atau set SUPABASE_ACCESS_TOKEN)
[ ] E0b. Verifikasi akses:
        npx supabase functions list --project-ref jrlpwmsgptayfymguhnl
```

> **Hasil audit pendukung (read-only, dari source di HEAD):**

| Fungsi | Di repo | Di HEAD | Remote | Autentikasi | `service_role` | Risiko |
|---|---|---|---|---|---|---|
| `book-metadata` | ✅ | ✅ | ❓ terblokir | JWT default + validasi input ISBN | Tidak | Rendah |
| `admin` | ❌ dihapus | **masih ada** | ❓ terblokir | Hanya `auth.getUser`, **tanpa cek role** | **Ya** | **KRITIS** |
| `reports` | ❌ dihapus | **masih ada** | ❓ terblokir | **Tidak ada pemeriksaan sama sekali** | **Ya** | **TINGGI** |

Endpoint: `https://jrlpwmsgptayfymguhnl.supabase.co/functions/v1/{nama}`
Tidak ada section `[functions.*]` di `config.toml` → `verify_jwt` memakai default `true`.
CORS `Access-Control-Allow-Origin: *` dipakai ketiga fungsi.

### 6.2 Audit yang harus dijalankan setelah akses tersedia

```text
[ ] E1. Identifikasi SELURUH fungsi ter-deploy (jangan hanya asumsikan 3)
        npx supabase functions list --project-ref jrlpwmsgptayfymguhnl
[ ] E2. Untuk SETIAP fungsi, catat: nama, status, waktu deploy terakhir
[ ] E3. Periksa autentikasi/otorisasi tiap endpoint:
        - apakah verify_jwt aktif?
        - apakah ada cek role di dalam kode?
        - apakah memakai service_role?
[ ] E4. FOKUS admin:
        - konfirmasi celah: assign_role tanpa cek Administrator
        - catat apakah masih ter-deploy → PRIORITAS MITIGASI
[ ] E5. FOKUS reports:
        - konfirmasi tidak ada auth check
        - catat data yang bisa dibaca anon (anggota, valuasi, copy)
[ ] E6. Inventaris pemakaian SUPABASE_SERVICE_ROLE_KEY
[ ] E7. Periksa secret terpasang:
        npx supabase secrets list
        → pastikan tidak ada key VITE_* dan key lama masih ada/ sudah diganti
[ ] E8. Rumuskan mitigasi per fungsi (lihat 6.3)
```

### 6.3 Mitigasi yang diperlukan (rencana, belum dijalankan)

```text
[ ] F1. admin    → HAPUS dari remote (fungsi tidak dipanggil aplikasi mana pun)
                   npx supabase functions delete admin
[ ] F2. reports  → HAPUS dari remote (alasan sama)
                   npx supabase functions delete reports
[ ] F3. book-metadata → deploy ulang versi terbaru (validasi input sudah ada)
[ ] F4. Setelah penghapusan: uji ulang aplikasi penuh
[ ] F5. Catat hasil di PROGRESS.md
```

> ⚠ **F1 dan F2 adalah tindakan destruktif remote — memerlukan persetujuan eksplisit.**
> Jangan dijalankan sebelum §6.2 selesai dan persetujuan diberikan.

---

## 7. Penanganan migrasi 0 byte

**Status: IN PROGRESS — belum ada keputusan.**

### 7.1 Fakta audit pendukung

| Fakta | Nilai |
|---|---|
| File | `supabase/migrations/20261105170000_digital_books.sql` |
| Ukuran | **0 byte** |
| Blob | `e69de29` (blob kosong Git) |
| Masuk di commit | `f625636` (`update v0.6 and fix metadata`) |
| Pernah berisi konten? | **Tidak — selalu 0 byte sejak dibuat** |
| Posisi | **Sebelum** 5 migrasi baru (`20261118*`) |
| Direferensikan kode? | **Tidak ada** |

### 7.2 File 0 byte lainnya (5 total di HEAD)

```text
src/components/DigitalBookReader.tsx        0 byte
src/components/EpubBookReader.tsx           0 byte
src/components/PdfBookReader.tsx            0 byte
src/services/digitalBookService.ts          0 byte
supabase/migrations/20261105170000_digital_books.sql   0 byte
```

Tidak ada import kode ke file-file ini (terkonfirmasi `grep` → 0 kecocokan).

### 7.3 Risiko

```text
R1. Jika file ini BELUM terpasang di remote, `supabase db push` akan mencoba
    menerapkannya. File kosong bisa:
      - no-op (diam-diameter sukses), ATAU
      - error dan MENGAGALKAN SELURUH BATCH migrasi 20261118*
    → ini risiko utama karena 5 migrasi baru menunggu push.
R2. Jika SUDAH terpasang, file kosong tidak berpengaruh — tapi statusnya
    tidak diketahui (terblokir, lihat §8).
```

### 7.4 Checklist

```text
[ ] D1. TENTUKAN status file ini di remote (butuh §8 / akses DB)
[ ] D2. Keputusan user — salah satu:
        (a) ISI dengan migrasi digital book yang sebenarnya, ATAU
        (b) HAPUS file dari repo (fitur digital book belum selesai), ATAU
        (c) BIARKAN bila sudah terpasang dan tak berpengaruh
[ ] D3. Jika (b): hapus juga 4 file sumber 0 byte agar konsisten
[ ] D4. Jika (a): tulis isi migrasi, lalu test di lokal dulu
[ ] D5. VERIFIKASI `db push` tidak terganggu — jalankan di environment testing
        SETELAH keputusan D2, sebelum push migrasi 20261118*
[ ] D6. Catat keputusan + alasan di PROGRESS.md
```

> ⚠ Keputusan D2 adalah **keputusan user**. Jangan dihapus atau diisi tanpa persetujuan.

---

## 8. Verifikasi migration history remote

**Status: IN PROGRESS — TERBLOKIR tanpa token.**

### 8.1 Hasil percobaan audit pendukung

| Perintah | Hasil |
|---|---|
| `npx supabase migration list` | Gagal — mencoba local stack `127.0.0.1:54322`, Docker tidak jalan (`ECONNREFUSED`) |
| `npx supabase migration list --remote` | Gagal — **`AccessTokenRequiredError`** |

**Kesimpulan: state migrasi remote BELUM diketahui.**

### 8.2 Migrasi lokal (11 file, urutan benar)

```text
20261102000000_initial_schema.sql          13242 b   (di HEAD)
20261102000001_functions.sql                6566 b   (di HEAD)
20261104000000_circulation_logic.sql       18639 b   (di HEAD)
20261104190500_disable_circulation.sql      1335 b   (di HEAD)
20261105163600_rebrand_meeliefont.sql        645 b   (di HEAD)
20261105170000_digital_books.sql               0 b   (di HEAD) ← §7
20261118000000_security_hardening.sql        547 b   (baru, untracked)
20261118000100_public_copy_view.sql         1108 b   (baru, untracked)
20261118000200_branding_localization.sql     913 b   (baru, untracked)
20261118000300_soft_delete_books.sql        1186 b   (baru, untracked)
20261118000400_fix_book_upsert_soft_delete.sql 6541 b (baru, untracked)
```

Urutan timestamp `000000` → `000400` **benar**. 6 migrasi lama **tidak berubah** dari HEAD.

### 8.3 Temuan drift migrasi (baru ditemukan)

```text
⚠ 20261102000000_initial_schema.sql DIUBAH SETELAH DIBUAT
   di commit c64df66 ("update v0.4") — commit yang SAMA memuat .env
   Perubahan: 19 baris
     - uuid_generate_v4()  →  gen_random_uuid()   (18 tempat)
     - BOM UTF-8 (EF BB BF) ditambahkan di awal file
   Dampak: bila migrasi ini sudah terpasang di remote SEBELUM c64df66,
   remote memakai versi LAMA dan perubahan file TIDAK diterapkan ulang.
```

**Konflik schema yang mungkin terjadi:**

| # | Risiko | Level |
|---|---|---|
| C1 | Drift `initial_schema.sql` (lihat di atas) — remote mungkin tidak sinkron dengan file | **WARNING** |
| C2 | `CREATE EXTENSION "uuid-ossp"` masih ada tapi `uuid_generate_v4` sudah tak dipakai → extension jadi dead declaration | Info |
| C3 | BOM UTF-8 di awal `initial_schema.sql` — bisa mengganggu tooling/parser SQL tertentu | Info |
| C4 | `DROP CONSTRAINT IF EXISTS books_isbn_13_key` — nama asumsi konvensi PostgreSQL. Jika beda di remote, DROP no-op → katalog ulang ISBN terarsip gagal | **WARNING** |
| C5 | Migrasi 0 byte sebelum batch baru (§7) — bisa menggagalkan seluruh push | **WARNING** |
| C6 | 5 migrasi `20261118*` belum pernah diterapkan — state remote tak diketahui | **WARNING** |

**Cross-check yang lolos:**

- ✅ `ALTER FUNCTION public.has_role(text)` cocok dengan `has_role(p_role TEXT)` (`initial_schema.sql:264`)
- ✅ Semua `DROP POLICY IF EXISTS` menunjuk nama policy yang memang ada
- ✅ `20261118000400` identik dengan fungsi asli kecuali **1 baris** `ON CONFLICT`
- ✅ `20261118000200` = UPDATE bersyarat, tidak menimpa edit user
- ✅ Policy `settings` authenticated-only aman (`loadCloudSettings` hanya dipanggil setelah `current_user_role` sukses)

### 8.4 Checklist

```text
[ ] H1. supabase login  → beri akses audit
[ ] H2. npx supabase migration list --remote
        → catat migrasi mana yang SUDAH / BELUM terpasang
[ ] H3. Bandingkan dengan daftar 11 file lokal (§8.2)
[ ] H4. Selidiki drift C1: apakah initial_schema versi remote pakai
        uuid_generate_v4 atau gen_random_uuid?
        (baca via read-only SQL — JANGAN ubah apa pun)
[ ] H5. Konfirmasi nama constraint ISBN di remote (risiko C4)
        SELECT conname FROM pg_constraint WHERE conrelid='public.books'::regclass;
[ ] H6. Konfirmasi status file 0 byte (risiko C5 / §7 D1)
[ ] H7. Putuskan urutan & isi push — TANPA menjalankan db push di tahap ini
[ ] H8. Backup database testing sebelum push apa pun (§5.2 B4)
[ ] H9. Catat hasil di PROGRESS.md
```

> ⚠ **`db push` TIDAK dijalankan di tahap ini.** Butuh persetujuan terpisah.

---

## 9. Finalisasi Phase 0 sebelum Phase 1

**Status: IN PROGRESS.**

```text
[x] F-0.1  Audit Phase 0 (read-only) selesai                — SELESAI
[x] F-0.2  7 poin Phase 0 terverifikasi lulus               — SELESAI
[x] F-0.3  54 entri git status terklasifikasi & aman        — SELESAI
[x] F-0.4  Audit persiapan keamanan (read-only) disetujui   — SELESAI
[x] F-0.5  SECURITY-REMEDIATION.md dibuat                  — SELESAI
[ ] F-0.6  §2 rotasi credential selesai                     — IN PROGRESS
[ ] F-0.7  §6 audit remote Edge Functions selesai           — IN PROGRESS (terblokir)
[ ] F-0.8  §8 verifikasi migration history remote selesai   — IN PROGRESS (terblokir)
[ ] F-0.9  §7 keputusan migrasi 0 byte                      — IN PROGRESS (butuh user)
[ ] F-0.10 §5 backup + pembersihan riwayat (setelah F-0.6)  — IN PROGRESS
[ ] F-0.11 Persetujuan akhir Phase 0                        — IN PROGRESS
[ ] F-0.12 Phase 1 dimulai                                  — BELUM (tertunda)
```

**Phase 1 TIDAK dimulai sampai F-0.6 … F-0.11 selesai dan disetujui.**

---

## 10. Ringkasan status

| § | Item | Status | Terblokir oleh |
|---|---|---|---|
| 1 | Identifikasi credential terdampak | **IN PROGRESS** | — (audit selesai) |
| 2 | Prosedur revoke & generate key baru | **IN PROGRESS** | Persetujuan user |
| 3 | Pindah Google key ke Edge secret | **IN PROGRESS** | §2 |
| 4 | Verifikasi app pakai credential baru | **IN PROGRESS** | §2, §3 |
| 5 | Backup & rewrite Git history | **IN PROGRESS** | §2 + persetujuan |
| 6 | Verifikasi deployment Edge Functions | **IN PROGRESS** | **Token Supabase** |
| 7 | Penanganan migrasi 0 byte | **IN PROGRESS** | Keputusan user |
| 8 | Verifikasi migration history remote | **IN PROGRESS** | **Token Supabase** |
| 9 | Finalisasi Phase 0 | **IN PROGRESS** | §2, §5–8 |

### Pekerjaan yang memerlukan aksi/keputusan user

| # | Pekerjaan | Jenis |
|---|---|---|
| U1 | `supabase login` / `SUPABASE_ACCESS_TOKEN` → membuka §6 dan §8 | Akses |
| U2 | Putuskan §7 D2 (isi / hapus / biarkan migrasi 0 byte) | Keputusan |
| U3 | Setujui & jalankan rotasi key (§2) | Tindakan |
| U4 | Setujui backup (§5.2) | Tindakan |
| U5 | Setujui rewrite riwayat (§5.3) | **Destruktif** |
| U6 | Setujui penghapusan `admin`/`reports` remote (§6.3 F1–F2) | **Destruktif** |
| U7 | Setujui `db push` (§8) | **Destruktif** |
| U8 | Finalisasi Phase 0 → izin Phase 1 | Persetujuan |

---

## 11. Catatan batasan tahap ini

Tidak dilakukan pada tahap pembuatan dokumen ini:

- ❌ Rotasi key
- ❌ Menghapus / men-deploy Edge Functions
- ❌ Menjalankan migrasi atau `db push`
- ❌ Rewrite Git history
- ❌ Commit atau push
- ❌ Memulai Phase 1
- ❌ Menghapus / mereset database testing

Seluruh pemeriksaan bersifat **read-only**. Hasil audit pendukung berasal dari pembacaan file lokal,
riwayat Git, dan percobaan CLI yang gagal dengan `AccessTokenRequiredError` (tidak ada perubahan remote).
