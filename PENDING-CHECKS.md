# PENDING CHECKS — handoff untuk pengecekan berikutnya

Dokumen ini merangkum hal yang **belum bisa diverifikasi** dari sesi coding sebelumnya.
Tujuannya supaya teman/maintainer lain bisa melanjutkan pengecekan tanpa harus menebak konteks.

> Status repo saat dokumen ini dibuat: ada perubahan lokal yang belum di-commit (termasuk perbaikan B1–B4/B8, ErrorBoundary, dan perubahan UI lain). Jangan commit/push/deploy sembarangan; cek scope dulu.

---

## 1) Pastikan `GOOGLE_BOOKS_API_KEY` ada di Supabase

**Kenapa:** Lookup metadata ISBN memakai Open Library + Google Books. ISBN `9786026210470` (“Mahir Bahasa Inggris dari Nol”) tidak ada di Open Library, sedangkan Google Books API mengembalikan **429 / quota 0** jika `GOOGLE_BOOKS_API_KEY` tidak diset/valid. Ini menjelaskan gejala “beberapa ISBN tidak terbaca”.

**Perintah:**

```powershell
cd C:\project\mini-book
npx supabase --version
npx supabase login            # jika belum login
npx supabase projects list
npx supabase link --project-ref <PROJECT_REF>   # jika project belum ter-link
npx supabase secrets list
```

**Yang harus dipastikan:**
- Ada secret bernama `GOOGLE_BOOKS_API_KEY`.
- **Jangan** menempelkan nilai secret ke chat/issue/commit.

**Jika belum ada:**

```powershell
npx supabase secrets set GOOGLE_BOOKS_API_KEY=MASUKKAN_KEY_DI_SINI
```

Jalankan secara lokal/aman; jangan bagikan key.

---

## 2) Deploy ulang edge function `book-metadata`

**Kenapa:** Di repo, bug B1 sudah diperbaiki (`import { serve } ...` ditambahkan di `supabase/functions/book-metadata/index.ts`). Tapi perbaikan ini **belum tentu sudah ter-deploy** ke Supabase remote. Tanpa deploy ulang, remote bisa masih menjalankan versi lama.

**Perintah:**

```powershell
cd C:\project\mini-book
npx supabase functions deploy book-metadata
```

**Hasil yang diharapkan:** deploy sukses tanpa error.

**Jika gagal:** catat pesan error lengkap. Cek juga:

```powershell
npx supabase functions logs book-metadata
```

**Catatan:** deploy hanya boleh dilakukan dengan persetujuan pemilik project. Pastikan project yang ter-link benar.

---

## 3) Tes metadata ISBN setelah deploy

**Kenapa:** memastikan bug metadata benar-benar tertangani untuk kasus yang dilaporkan, dan tidak regresi.

**Cara tes lewat app:**

```powershell
cd C:\project\mini-book
node node_modules/vite/bin/vite.js --port 5173
```

Buka app → halaman **Scanner / ISBN Scanner**, lalu uji:

| ISBN | Harapan | Catatan |
|---|---|---|
| `9786026210470` | Idealnya ditemukan sebagai “Mahir Bahasa Inggris dari Nol” | Ini kasus yang dilaporkan user. Jika masih tidak ketemu setelah key+deploy, kemungkinan buku tidak ada di sumber Open Library/Google Books yang dipakai; perlu fallback pencarian judul (perubahan kode terpisah). |
| 1 ISBN kontrol | Harus tetap ditemukan | Pilih ISBN yang sebelumnya memang berhasil ditemukan. |

**Yang perlu dilaporkan:**
- ISBN 9786026210470: ketemu / tidak ketemu / error.
- Jika ketemu: judul dan sumber metadata (Open Library / Google Books / merged).
- ISBN kontrol: ketemu / tidak.
- Jika error: screenshot/pesan UI; kalau perlu DevTools → Network → request `book-metadata`, kirim status code + response body (**pastikan tidak ada secret**).

---

## 4) Status commit / working tree

**Kenapa:** saat ini ada banyak perubahan lokal; sebagian perbaikan saya, sebagian perubahan UI user. Commit harus sengaja dan tidak mencampur yang tidak diinginkan.

**Perintah cek:**

```powershell
cd C:\project\mini-book
git status --short
git log -1 --oneline
```

**Yang perlu dilaporkan:**
- Output `git status --short`.
- Output `git log -1 --oneline`.
- Apakah sudah ada commit untuk “perbaikan saya saja”? Jika ya, sertakan hash commit.

**Scope commit “perbaikan saya saja” yang sebelumnya disetujui (jika mau dieksekusi):**

File bersih (biasanya bisa di-stage penuh):
- `.github/workflows/ci.yml`
- `src/main.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/services/libraryService.ts`
- `supabase/functions/book-metadata/index.ts`
- `PROGRESS.md`

File campuran (stage **per-hunk**, ambil hanya hunk fix):
- `src/components/scanner/BarcodeScanner.tsx` — B8 (hapus duplicate reset effect)
- `src/pages/BookshelfPage.tsx` — B3 (`getAllBooks()`)
- `src/pages/DashboardPage.tsx` — B3 (`getAllBooks()`)
- `src/pages/ReportsPage.tsx` — B3 (`getAllBooks()`)
- `src/components/updater/UpdateDialog.tsx` — teks stale ready-install

**Jangan ikut commit:** `.env`, secret, keystore, artefak build, atau perubahan UI WIP yang tidak dimaksudkan.

Perintah staging (jalankan manual, review dulu):

```powershell
git add .github/workflows/ci.yml src/main.tsx src/components/ErrorBoundary.tsx src/services/libraryService.ts supabase/functions/book-metadata/index.ts PROGRESS.md

git add -p src/components/scanner/BarcodeScanner.tsx
git add -p src/pages/BookshelfPage.tsx
git add -p src/pages/DashboardPage.tsx
git add -p src/pages/ReportsPage.tsx
git add -p src/components/updater/UpdateDialog.tsx

git diff --cached --stat
git diff --cached
# commit hanya jika isi staged sudah benar
# git commit -m "fix: updater dialog text, metadata serve import, cover path, catalog pagination, ci pinning, scanner reset, error boundary"
```

---

## Ringkasan status yang sudah diketahui

| Item | Status |
|---|---|
| `tsc --noEmit` | PASS (dilaporkan user) |
| `vitest` | 54/54 PASS (dilaporkan user) |
| `vite build` | PASS (dilaporkan user) |
| B1 import `serve` di `book-metadata` | Sudah diperbaiki di repo, **belum tentu ter-deploy** |
| B2 cover upload `Date.now()` ganda | Sudah diperbaiki di repo |
| B3 buku >20 tidak tampil | Sudah diperbaiki di repo (`getAllBooks`) |
| B4 CI action pinning | Sudah diperbaiki di repo |
| B8 duplicate scanner reset effect | Sudah diperbaiki di repo |
| ErrorBoundary root | Sudah ditambahkan di repo |
| UpdateDialog teks stale | Sudah diperbaiki di repo |
| Bug blank putih (alur tambah buku → pindah menu) | Belum direproduksi pada alur tersebut; console bersih; ErrorBoundary belum muncul |
| ISBN 9786026210470 | Belum berhasil; OL kosong, GB 429 tanpa key; butuh key+deploy+tes ulang |
| Commit | Belum dilakukan oleh sesi ini |

## Hal yang **tidak boleh** dilakukan tanpa persetujuan eksplisit

- Commit/push/reset/force-push.
- Deploy edge function / db push / migration apply.
- Mengirim nilai secret/API key ke chat.
- Menghapus perubahan UI milik user.