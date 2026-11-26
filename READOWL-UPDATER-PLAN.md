# READOWL — Rancangan Custom In-App APK Updater

> **Status dokumen: IN PROGRESS — Tahap A (fondasi) DONE 18 November 2026 · Tahap B (update checker)
> DONE 19 November 2026 · Tahap C (APK downloader) DONE 19 November 2026 · Tahap D (APK installer)
> DONE 19 November 2026 · Tahap E (security & testing) DONE 19 November 2026 — seluruh tahap
> A–E selesai; tinggal build APK + uji perangkat + konfigurasi secret CI.**
> Log implementasi: [`PROGRESS.md`](./PROGRESS.md) section 14.
>
> Tanggal rancangan: 18 November 2026 · Berbasis audit aktual: [`READOWL-ARCHITECTURE.md`](./READOWL-ARCHITECTURE.md)
> Kondisi proyek: DEVELOPMENT / TESTING · Security Remediation masih berlangsung — implementasi
> **tidak boleh mengganggu** proses remediation (`SECURITY-REMEDIATION.md`).

---

## 1. Keputusan distribusi & konteks

**Keputusan (user): ReadOwl didistribusikan sebagai file APK langsung — link download / website
resmi — BUKAN Google Play Store.** Karena itu:

- **Google Play In-App Updates API TIDAK dipakai** sebagai mekanisme utama (butuh Play Services +
  distribusi Play). Diganti **Custom In-App APK Updater** berbasis manifest statis.
- Jalur distribusi yang **sudah ada hari ini** (dipertahankan): GitHub Actions → unggah APK ke
  **GCS bucket publik** (`https://storage.googleapis.com/<bucket>/MeelieFont-vX.Y.Z.apk`) →
  GitHub Release → notifikasi FCM. Rancangan updater **melengkapi**, tidak membongkar, alur ini.
- Manifest update di-host di lokasi statis HTTPS yang sama (lihat §4).

```text
Keputusan distribusi:
  ✅ APK langsung (link/website resmi)     ← DIPILIH
  ✅ GitHub Releases sebagai arsip publik  ← SUDAH ADA (CI)
  ❌ Google Play Store                     ← BUKAN jalur utama
  ❌ Google Play In-App Updates            ← TIDAK dipakai
```

---

## 2. Tujuan & alur yang diharapkan

```text
 1. Pengguna membuka ReadOwl
 2. App memeriksa latest.json dari server (terjadwal + manual)
 3. Jika versionCode server > versionCode terpasang → tampil info versi baru
 4. Pengguna melihat changelog
 5. Pengguna memilih "Update Sekarang"
 6. App mengunduh APK (HTTPS, progress, resume/retry)
 7. App memverifikasi SHA-256 + identitas paket + signing certificate
 8. App membuka Android Package Installer via FileProvider
 9. Pengguna mengonfirmasi instalasi (prompt sistem — WAJIB)
10. Setelah selesai, pengguna membuka kembali ReadOwl (data & session selamat)
```

**Batasan Android yang harus jujur diketahui (bukan bisa diakali):**

- Aplikasi biasa **tidak bisa** menginstal APK diam-diam. Butuh izin `REQUEST_INSTALL_PACKAGES`
  (Android 8+) + konfirmasi pengguna lewat installer resmi sistem.
- `forceUpdate` **hanya bisa memaksa UI** (tombol update tanpa tombol "Nanti", blokir halaman
  tertentu) — **tidak bisa** memaksa instalasi senyap. Pengguna selalu bisa menutup aplikasi.
- Setelah `minSdk` 24 (Android 7.0) — Android 7 memakai "Unknown sources" global; Android 8+
  (API 26+) per-app permission. Rancangan harus menangani keduanya.

---

## 3. Arsitektur update manifest

### 3.1 Lokasi manifest

```text
Primary : https://storage.googleapis.com/<APK_BUCKET>/latest.json   (satu bucket dgn APK)
Fallback: https://github.com/Mr-Young-62/mini-book/releases/latest  (tautan alternatif, opsional)
```

> Domain resmi (`APP_URL`) masih placeholder `MY_APP_URL` → **belum** dipakai. Saat domain resmi
> ada, manifest pindah ke `https://domain-resmi/releases/latest.json` (host lama tetap didukung
> via allowlist — lihat §6.3).

### 3.2 Skema final manifest

```json
{
  "schemaVersion": 1,
  "app": "org.readowl.library",
  "version": "1.1.0",
  "versionCode": 11000,
  "releaseDate": "2026-11-18",
  "minimumSupportedVersionCode": 9000,
  "downloadUrl": "https://storage.googleapis.com/<bucket>/MeelieFont-v1.1.0.apk",
  "sha256": "64-karakter-hex-lowercase",
  "fileSize": 25000000,
  "changelog": [
    "Perbaikan performa katalog",
    "Perbaikan bug scan barcode"
  ],
  "forceUpdate": false
}
```

**Fungsi setiap field:**

| Field | Tipe | Fungsi |
|---|---|---|
| `schemaVersion` | int | Versioning skema manifest sendiri — parser lama menolak skema tak dikenal (`> 1` → gagal aman, tanpa update) |
| `app` | string | **Validasi identitas**: harus `org.readowl.library` — mencegah manifest milik aplikasi lain dipakai |
| `version` | string | versionName — **hanya tampilan** (changelog, dialog) |
| `versionCode` | int | **Basis perbandingan satu-satunya** — selalu > 0 |
| `releaseDate` | string (ISO date) | Tampilan; divalidasi format `YYYY-MM-DD`, tidak wajib valid secara kronologis ketat |
| `minimumSupportedVersionCode` | int | Versi terpasang **di bawah** ini → update **dipaksakan lewat UI** (tidak ada tombol "Nanti") |
| `downloadUrl` | string (https) | Sumber APK — divalidasi ketat (§6.3) |
| `sha256` | string (64 hex) | Checksum APK **wajib** sebelum instalasi |
| `fileSize` | int | Verifikasi ukuran file hasil unduhan (deteksi file terpotong/penyimpangan) |
| `changelog[]` | string[] | Ditampilkan di dialog update |
| `forceUpdate` | bool | Paksa dialog (≈ `versionCode < minimumSupportedVersionCode`); **tetap butuh konfirmasi sistem untuk instalasi** |

### 3.3 Validasi manifest (urutan, berhenti di kegagalan pertama)

```text
V1. HTTP status 200 + Content-Type json; timeout 10 detik (AbortController)
V2. JSON parse valid
V3. schemaVersion === 1 (angka)             → selain itu: tolak, pakai cache
V4. app === "org.readowl.library"           → selain itu: tolak (PENTING: anti manifest salah-tujuan)
V5. versionCode integer > 0
V6. minimumSupportedVersionCode ≤ versionCode (jika ada)
V7. downloadUrl: protocol https:, host ∈ allowlist, path pola /<bucket>/MeelieFont-v*.apk
V8. sha256: string 64 karakter [0-9a-f]
V9. fileSize: integer > 0 && < 500 MB (batas wajar APK)
V10. forceUpdate: boolean (default false bila hilang); changelog: array of string (default [])
```

### 3.4 Penanganan kondisi gagal

| Kondisi | Perilaku |
|---|---|
| Manifest tidak tersedia (timeout / 5xx / DNS) | **Diam** (no-op). Jika ada manifest cache → tampilkan info dari cache. Log ke console. **Jangan pernah** memblokir aplikasi |
| Manifest tidak valid (V1–V10 gagal) | Tolak, pakai cache terakhir yang valid. Jika tak ada cache → dianggap tidak ada update |
| Jaringan terputus saat cek | Sama seperti tidak tersedia; cek ulang pada siklus berikutnya |
| `versionCode` server **sama** dengan terpasang | "Sudah versi terbaru" — khusus hasil cek **manual**; cek otomatis tidak menampilkan apa-apa |
| `versionCode` server **lebih rendah** | Abaikan (manifest basi/CDN cache) — **jangan** tawarkan "downgrade" |
| `versionCode` server lebih tinggi tapi `forceUpdate`/di bawah minimum | Dialog **tanpa tombol "Nanti"**; pengguna hanya bisa Update. (Catatan: app tetap bisa ditutup — batasan Android, §2) |
| Unduhan gagal / hash tidak cocok | Lihat §5.4 — retry, file rusak dibuang, tawarkan coba lagi |
| User memilih "Nanti" | Simpan `versionCode` yang di-dismiss di `localStorage` → banner tidak muncul lagi untuk versi itu; muncul lagi untuk versi berikutnya |

---

## 4. Mekanisme pemeriksaan versi

### 4.1 Kapan berjalan

| Pemicu | Kapan | Catatan |
|---|---|---|
| **Otomatis (startup)** | Sekali, setelah `App.tsx` selesai auth/role (setelah `loadCloudSettings`), **dengan jeda ≥ 3 detik** | Tidak menghambat loading awal; hanya di Android (`Capacitor.getPlatform() === 'android'`) |
| **Manual** | Tombol "Periksa pembaruan" di **SettingsPage** (section "Tentang / Pembaruan", akhir form — Settings hanya untuk Administrator sesuai `allowedTabs`) | Selalu menampilkan hasil (tersedia / sudah terbaru / gagal) |
| **Retry setelah gagal** | Satu retry otomatis **+5 menit** dalam sesi yang sama | Jangan retry agresif |

### 4.2 Cara membandingkan `versionCode`

```text
currentVersionCode  ← diinjeksi saat BUILD web (Vite define / import.meta.env.VITE_APP_VERSION_CODE)
remoteVersionCode   ← latest.json

update tersedia  ⇔  remoteVersionCode > currentVersionCode
```

- **Angka, bukan string compare** — `versionCode` integer selalu lebih benar daripada banding
  semver string.
- **Sumber versi terpasang**: `package.json` = `0.0.0` dan versi Android hanya hidup di env CI
  (temuan F-1) → Tahap A mengusulkan: CI mengekspor `APP_VERSION` + `APP_VERSION_CODE` ke env
  build web (`VITE_APP_VERSION`, `VITE_APP_VERSION_CODE`) sebelum `npm run build`, sehingga
  bundle tahu versinya sendiri. **Fallback aman bila env kosong** (build lokal/dev): anggap
  `versionCode = 0` → checker **nonaktif** (lebih baik tidak ada cek daripada menampilkan update
  palsu).
- **Skema `versionCode`** (perbaikan temuan F-2): berhenti memakai `GITHUB_RUN_NUMBER`, pindah ke
  deterministik `MAJOR*1000000 + MINOR*1000 + PATCH` (mis. 1.1.0 → 1001000). Alternatif tetap
  `GITHUB_RUN_NUMBER` **ditolak** untuk updater karena bisa tidak monoton antar-tag lama.

### 4.3 Menghindari request berulang

```text
localStorage:
  readowl_update_check     = { lastCheckAt: ISO, lastSeenVersionCode: int }
  readowl_update_manifest  = manifest terakhir yang valid (cache)
Aturan:
  • Interval minimum antar cek otomatis: 6 JAM
  • Satu flight per waktu (guard flag) — cek ganda digabung
  • Manifest di-cache selama 24 jam; cek manual mengabaikan interval & cache manifest
  • Setelah 1 kegagalan → jeda berikutnya digandakan (6h → 12h → 24h, maks 24h)
```

**Tidak ada polling berkala.** Satu permintaan per pembukaan aplikasi (dengan throttle) + manual.

### 4.4 Timeout & retry

- Fetch manifest: **timeout 10 detik**, **1 kali retry langsung** (delay 1 dtk) untuk gangguan
  sesaat; selanjutnya menunggu siklus berikutnya.
- Tidak ada mekanisme antrian agresif — gagal = senyap.

---

## 5. Mekanisme download APK

### 5.1 Pendekatan

**WebView TIDAK bisa** menginstal/mengelola APK — download + instalasi harus **native**. Rancangan:

```text
Opsi A (DIREKOMENDASIKAN — Tahap C/D):  Capacitor Custom Plugin Android (Kotlin/Java kecil)
    → download via OkHttp/HttpURLConnection di native, emit event progress ke WebView,
      simpan ke cacheDir, hash SHA-256 native, panggil FileProvider + Package Installer.
Opsi B (alternatif):  Unduh dari WebView (fetch → base64 → simpan via Filesystem plugin)
      → mudah di TS, TAPI boros memori (APK ~25 MB base64 ~33 MB), progress lompat-lompat,
        mati bila WebView ditutup.
Opsi C (bukan untuk APK):  DownloadManager sistem Android → jalan di background, tapi
      pemindaian file oleh app tetap perlu native.
```

**Keputusan usulan: Opsi A** — plugin native ringan (mis. `AppUpdater`), karena mencakup download,
verifikasi, dan instalasi dalam satu tempat dengan akses penuh ke `PackageManager`.

### 5.2 Syarat download

| Syarat | Implementasi |
|---|---|
| HTTPS | Hanya `https://` (§6.3); `cleartext` sudah `false` di `capacitor.config.ts` |
| Progress | Event native `progress { received, total }` → UI bar persen + MB (throttle update ke React maks 4x/detik) |
| Koneksi terputus | Deteksi: file `.part` sementara; **resume** via header `Range: bytes=<offset>-` bila server mendukung (GCS mendukung); kalau tidak → mulai ulang |
| Retry | Maks **3 percobaan per sesi**, backoff 2s/5s; setelah itu UI "Gagal — Coba lagi" (manual) |
| File selesai sebelum instalasi | Syarat ketat: `bytes === fileSize` **DAN** SHA-256 cocok **DAN** `zipalign`/parse APK sukses via `PackageManager.getPackageArchiveInfo` |
| Lokasi penyimpanan | `context.cacheDir/updates/readowl-<versionCode>.apk` (+ `.part` saat berjalan). **Cache**, bukan storage publik → tidak perlu izin penyimpanan, mudah dibersihkan |
| Pembersihan | Hapus `.part`/APK lama setelah instal sukses, setelah gagal verifikasi, dan saat startup (sweep file berumur > 7 hari) |

### 5.3 Keadaan unduhan (state machine)

```text
idle → checking → updateAvailable → downloading(pct) → verifying → readyToInstall
        │               │                 │               │             │
        │               └ (user: Nanti)   └ (user: Batal) └ (hash ✗)   └ (installer terbuka)
        │                                          ↓              ↓
        └ (gagal)                            retry (≤3)      failed → retry/hapus
```

### 5.4 File rusak / hash tidak cocok

1. Buat file (hapus `.part`).
2. Tampilkan "File tidak lolos verifikasi" + tombol **Coba lagi**.
3. Ganti URL (`downloadUrl` + `?retry=N` **tidak diizinkan** — URL wajib persis dari manifest;
   retry = request ulang URL yang sama dengan cache-buster `?r=<timestamp>` hanya bila host
   mengizinkan query — default: tanpa cache-buster, `Cache-Control` APK sudah `immutable` jadi
   file di URL itu tidak pernah berubah).

### 5.5 Pengguna menutup aplikasi saat download berlangsung

- **Opsi A (native, direkomendasikan)**: download **mati** ketika proses app selesai (plugin tidak
  memakai foreground service). File `.part` **tetap ada** → saat app dibuka lagi, opsi "Lanjutkan
  unduhan" (resume `Range`) atau mulai ulang otomatis (bila < 25% tersisa). *Jika ingin download
  selamat dari penutupan app → tambah foreground service + notifikasi progress (Tahap opsional,
  di luar scope minimum).*
- Keputusan UX default: **resume jika memungkinkan, kalau tidak mulai ulang; tidak ada notifikasi
  download background di versi pertama** (kompleksitas ijin `FOREGROUND_SERVICE` tidak sepadan
  untuk APK ~25 MB pada jaringan baik).

---

## 6. Keamanan updater

> **Prinsip: SHA-256 saja TIDAK cukup** — bila penyerang bisa menulis manifest (Kompromi bucket /
> DNS / host), dia juga bisa menulis checksum yang cocok. Lapisan pertahanan berlapis:

### 6.1 Lapisan pertahanan

| # | Lapisan | Melawan | Status di rancangan |
|---|---|---|---|
| S1 | **HTTPS wajib** untuk manifest + APK | MITM, pengubahan di jalan | Wajib |
| S2 | **Allowlist host + pola path** (§6.3) | Manifest/APK dialihkan ke domain lain | Wajib |
| S3 | **Validasi manifest ketat** (§3.3) + field `app` | Manifest salah-jenis / korup | Wajib |
| S4 | **SHA-256 + fileSize** sebelum instal | APK terpotong / korup / tertukar di CDN | Wajib |
| S5 | **Validasi identitas paket**: `PackageManager.getPackageArchiveInfo` pada file hasil unduh → `packageName === "org.readowl.library"` | APK berpaket lain | Wajib |
| S6 | **Validasi signing certificate**: bandingkan signature APK hasil unduh dengan signature aplikasi terpasang (`PackageManager` API 28+: `signingInfo.apkContentsSigners`) | **APK ber-signature beda** — ini juga yang membuat Android menolak update dan menghapus data; divalidasi **lebih awal** dengan pesan jelas alih-alih biarkan instalasi gagal | Wajib |
| S7 | **Signature manifest Ed25519** — `latest.json` ditandatangani, publik key di-pin di aplikasi | **Kompromi host/bucket** (S1–S4 tidak berdaya bila manifest juga dimanipulasi di origin) | ✅ **Disetujui — bukan opsional lagi: wajib selesai di Tahap E sebelum updater dirilis ke pengguna** (Tahap A sengaja belum menandatangani manifest; signing key di CI secret, publik key hard-coded di app) |
| S8 | **versionCode hanya naik** (§4.2) | Replay manifest lama (downgrade) | Wajib |
| S9 | Keystore/secret **tidak pernah** di repo / frontend | Kompromi signing | Sudah kebijakan (lihat `SECURITY-REMEDIATION.md`) |

**Evaluasi signature manifest (S7):** tanpa S7, skenario ancaman nyata = penulis bucket mem-publish
manifest + APK berbahaya dengan checksum cocok → **dihentikan oleh S6** (signature Android tidak
cocok dengan app korban → instalasi ditolak sistem). Jadi S6 adalah penghalang kuat terakhir.
S7 tetap disarankan karena memberi **kegagalan lebih awal & jelas** dan melindungi dari "APK
resmi lama yang di-replace di URL sama" (dengan `Cache-Control: immutable` + versionCode naik,
risiko ini rendah). **Keputusan: S7 = Tahap E, wajib selesai sebelum updater dirilis ke pengguna (approval 18 November 2026).**

### 6.2 Penanganan manifest dimanipulasi

- Field `sha256`/`downloadUrl` dimanipulasi → S5+S6 memastikan APK tetap harus berpaket sama dan
  ber-signature sama dengan app korban; selain itu instalasi ditolak Android.
- Manifest menurunkan `versionCode` → ditolak V5/S8.
- Manifest memaksa `forceUpdate` palsu → hanya mengubah UI, **tidak ada risiko teknis**; dan
  muncul hanya bila checksum/signature tetap lolos untuk instalasi.
- Skenario terburuk yang tersisa tanpa S7: **DoS pengalaman** (update gadungan yang selalu gagal
  verifikasi) — bukan kebocoran data; itulah alasan S7 dijadikan syarat wajib sebelum rilis updater (Tahap E).

### 6.3 Validasi URL download (skema allowlist)

```text
Izinkan HANYA:
  protocol : "https:"
  hostname ∈ { "storage.googleapis.com"  (bucket APK yang sama, pola path ketat),
               "<domain-resmi-readowl>"   (saat nanti ada) }
  pathname : /^\/[a-z0-9._-]+\/MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk$/i
  + field "app" cocok + S7 (Tahap E)
```

Pola ini **lanjutan dari pola yang sudah ada** di `UpdateNotifications.tsx:28`
(`/^\/[a-z0-9._-]+\/MeelieFont-[^/]+\.apk$/i` + host `storage.googleapis.com`) — konsisten dengan
kode aktual, diperketat dengan versi.

### 6.4 Secret

- Tidak ada secret baru di frontend. Plugin native hanya membaca URL dari manifest yang sudah
  divalidasi. **Keystore, password, service role: TIDAK PERNAH masuk repo/bundle** (kebijakan
  berjalan — `SECURITY-REMEDIATION.md`).

---

## 7. Kompatibilitas & pengalaman pengguna

| Aspek | Rancangan |
|---|---|
| Capacitor Android | Plugin native terdaftar via `registerPlugin` (iOS: tidak ada updater APK → guard `Capacitor.getPlatform() === 'android'`) |
| Android Package Installer | `Intent.ACTION_VIEW` + `application/vnd.android.package-archive`, `data` = content URI FileProvider, flag `FLAG_GRANT_READ_URI_PERMISSION` |
| Izin Android 8+ | Cek `packageManager.canRequestPackageInstalls()` → bila false: buka Settings `ACTION_MANAGE_UNKNOWN_APP_SOURCES` (package URI) → kembali → lanjut instal. Android 7 (minSdk 24): "Unknown sources" global → cukup dialog sistem bawaan |
| FileProvider | **Sudah ada** (temuan audit): authority `${applicationId}.fileprovider`, `file_paths.xml` sudah punya `cache-path` — APK di `cacheDir/updates/` **sudah tercakup** tanpa ubah manifest. Catatan F-4: pertimbangkan mempersempit path di kemudian hari (perubahan terpisah, butuh persetujuan) |
| Status download | Bar persen + MB terunduh + kecepatan estimasi; tombol Batal aktif selama download |
| Status instalasi | Setelah intent terbuka, kontrol berpindah ke sistem → UI menampilkan "Selesaikan instalasi di layar Android" + opsi "Buka lagi installer" |
| Pembatalan | Tombol Batal selama download → file `.part` dihapus |
| Kegagalan | Papan status jelas: jaringan gagal / verifikasi gagal / instalasi ditolak sistem (mis. signature beda) — selalu dengan **Coba lagi** dan **unduh manual via browser** (fallback `Browser.open`, mekanisme lama) |
| Data lokal | Tidak disentuh updater; `allowBackup=false`; update in-place **memelihara data** selama signature sama |
| Supabase session | Selamat — session di localStorage, tidak terhapus oleh update in-place |
| Pengguna offline | Cek versi gagal → senyap; tombol manual menampilkan "Tidak ada koneksi"; tidak ada error mengganggu |
| Menutup app saat download | Lihat §5.5 |

---

## 8. Desain UI/UX

### 8.1 Lokasi UI

| Lokasi | Isi | Alasan |
|---|---|---|
| **Banner toast global** (atas layar, komponen baru `UpdateBanner` atau evolusi `UpdateNotifications.tsx`) | "Pembaruan v1.1.0 tersedia" + [Unduh] [Nanti] | Muncul otomatis setelah cek startup; konsisten dengan banner FCM yang sudah ada (warna `#c62828` / `#2C221E` / `#FAF8F5`); **tidak mengganggu aktivitas membaca** (tidak modal, auto-dismiss setelah ~10 dtk ke status ikon) |
| **SettingsPage → section baru "Pembaruan"** (setelah section "Library Profile", sebelum tombol Save) | Versi terpasang, versi terbaru, tombol "Periksa pembaruan", changelog, progress, tombol instal | Settings = halaman Administrator (nav `roles: ['Administrator']`) — tempat alami untuk kontrol; **tanpa mengubah akses nav** |
| **Dialog detail (modal)** | Hanya saat pengguna ketuk banner/tombol — detail changelog + [Update Sekarang] [Nanti] | Kekhawatiran hanya muncul atas inisiatif pengguna atau force update |

### 8.2 State UI (10 kondisi wajib)

```text
1. UPDATE TERSEDIA      → banner + dialog: "Pembaruan tersedia"
2. INFO VERSI           → "Versi terpasang: 1.0.0 (build 1000000)" / "Versi terbaru: 1.1.0"
3. CHANGELOG            → daftar bullet dari manifest.changelog
4. TOMBOL UPDATE        → [Update Sekarang] merah #c62828 (ikut palet app)
5. TOMBOL NANTI         → teks abu #7E6F64; menyimpan dismiss (per versionCode)
6. PROGRESS DOWNLOAD    → bar persen + "12,4 / 25,0 MB" + [Batal]
7. VERIFIKASI APK       → spinner + "Memverifikasi integritas APK…"
8. INSTRUKSI INSTALASI  → "Android akan meminta konfirmasi instalasi. Ketuk 'Install'."
                           + tombol [Buka Installer] bila permission belum dikasih
9. UPDATE GAGAL         → pesan penyebab + [Coba lagi] + [Unduh via browser]
10. SUDAH TERBARU       → (khusus cek manual) centang + "Anda sudah menggunakan versi terbaru"
```

**Force update** = state 1 tanpa tombol "Nanti" + overlay yang menutupi konten (bukan banner).

### 8.3 Alur interaksi (ringkas)

```text
startup → cek (6h throttle) → tersedia?
   ├─ ya & force → overlay wajib → [Update Sekarang] → download → verify → installer
   ├─ ya         → banner (auto) → ketuk → dialog → [Update Sekarang] / [Nanti]
   └─ tidak      → (senyap)

Settings → "Periksa pembaruan" → hasil: terbaru / tersedia / gagal
```

---

## 9. Arsitektur release & distribusi

### 9.1 Alur release (target — penambahan pada CI yang sudah ada)

```text
Developer menaikkan versi + tag v1.1.0
  → CI: build web (dengan env VITE_APP_VERSION_CODE baru)
  → CI: build APK signed (APP_VERSION_CODE dari SKEMA BARU §4.2)
  → CI: hitung SHA-256 (sha256sum) + ukuran file
  → CI: unggah APK ke bucket            ── ①
  → CI: verifikasi unggahan (unduh ulang/HEAD + size check)
  → CI: generate latest.json (dari hasil build) ── ② (HANYA SETELAH ① & verifikasi sukses)
  → CI: unggah latest.json (Cache-Control: no-cache, agar tidak basi)
  → CI: GitHub Release (arsip + catatan rilis)
  → CI: (opsional, pelengkap) FCM notification → mekanisme lama tetap jalan
  → App mendeteksi versi baru → pengguna unduh & instal
```

**Aturan emas: manifest dipublikasikan SETELAH APK terunggah dan terverifikasi** — agar tidak
pernah ada jendela `latest.json` menunjuk APK yang belum tersedia.

### 9.2 Evaluasi hosting

| Kandidat | Kelebihan | Kekurangan | Penilaian |
|---|---|---|---|
| **GCS bucket publik (yang sudah ada)** | Sudah dipakai CI, URL stabil, HTTPS, `Cache-Control` per-objek, satu tempat dengan APK, biaya ~0 | Bucket publik = siapa pun bisa baca (by design utk distribusi); kompromi bucket = kompromi manifest (lihat S7) | ✅ **Direkomendasikan (primary)** |
| GitHub Releases | Sudah ada, arsip bagus | URL asset mengarah ke host berubah-ubah (`objects.githubusercontent.com`) → allowlist rumit; rate-limit unduhan anonim; repo bisa private | 🟡 Sekunder/arsip |
| Website resmi / static hosting | Domain sendiri, branding | `APP_URL` masih placeholder — **belum ada domain resmi** | 🟡 Nanti, setelah domain ada |
| Supabase Edge Function serving JSON | Dinamis | Overkill untuk file statis; menghubungkan updater ke availability Supabase | ❌ Tidak perlu |

### 9.3 Pengelolaan versionCode & versionName (anti konflik versi)

```text
versionName (tampilan) = tag git:            v1.2.3 → "1.2.3"   (semver, wajib regex di CI)
versionCode (mesin)    = MAJOR*1000000 + MINOR*1000 + PATCH
                         1.2.3 → 1002003

Aturan:
  • Tag WAJIB naik — generator manifest membandingkan dengan versionCode terakhir di
    latest.json (CI mengunduh manifest terpublish saat build → GAGAL bila versionCode baru
    ≤ yang terpublish; manifest rusak/tak terbaca → fail closed; belum ada → bootstrap)
  • versionCode = 0 reserved untuk build lokal/dev tanpa env → checker nonaktif
  • GITHUB_RUN_NUMBER tidak lagi dipakai sebagai versionCode (temuan F-2)
  • ✅ SUDAH DIIMPLEMENTASIKAN di CI (Tahap A, 18 November 2026): langkah ini hanya
    menyentuh android-release.yml — build.gradle tidak diubah karena sudah membaca env.
    Log: PROGRESS.md §14.
```

---

## 10. Roadmap implementasi bertahap (PERENCANAAN — belum dikerjakan)

> Setiap tahap menyebut file yang **kemungkinan** dibuat/diubah **berdasarkan audit aktual**.
> Nama file bersifat usulan dan dapat disesuaikan saat review implementasi.

### Tahap A — Fondasi (version management, manifest hosting, release workflow) — ✅ **DONE (18 November 2026)**

| Aksi | File (kondisi aktual) | Status |
|---|---|---|
| Skema versionCode baru + ekspor `VITE_APP_VERSION*` ke build web | **Baru**: `scripts/version-utils.mjs` · **Ubah**: `.github/workflows/android-release.yml` (step "Build web assets" + "Build signed release APK"). `android/app/build.gradle` **tidak diubah** — sudah membaca env `APP_VERSION`/`APP_VERSION_CODE`, jadi otomatis memakai skema baru | ✅ DONE |
| Generator `latest.json` + step verifikasi-upload-then-publish | **Baru**: `scripts/generate-latest-manifest.mjs` · **Ubah**: `android-release.yml` — verifikasi `content-length` setelah unggah APK, step baru **"Publish update manifest (latest.json)"** di urutan terakhir | ✅ DONE |
| Dokumentasi rilis + aturan tag | **Ubah**: `README.md` §5 (skema versi, alur manifest, aturan tag); `.env.example` (var build versi non-secret); npm scripts `release:version-code` / `release:manifest` | ✅ DONE |
| Sumber versi tunggal `package.json` version | **Tidak dikerjakan** — sengaja: `versionName` resmi tetap berasal dari tag git (CI), sehingga `package.json` `0.0.0` tidak lagi relevan bagi Android/updater. Menyinkronkannya justru menciptakan dua sumber versi | ⏭ Dilewati (keputusan direvisi) |

**Hasil verifikasi Tahap A**: `tsc --noEmit` 0 · `vitest run` 18/18 · `vite build` PASS · `git diff --check` 0 · parse YAML OK + `bash -n` 5/5 blok · secret scan 0 · uji unit script (harness sementara) 36/36. Detail: `PROGRESS.md` §14.4–14.5.

### Tahap B — Update checker — ✅ **DONE (19 November 2026)**

| Aksi | File |
|---|---|
| Baca manifest + validasi §3.3 + throttle §4.3 | **Baru**: `src/services/updateService.ts` (+ `updateService.test.ts` mengikuti pola Vitest yang ada) |
| State hook app-wide (polling startup, dismiss, force) | **Baru**: `src/hooks/useAppUpdater.ts` (folder `hooks/` belum ada — baru) |
| Banner + dialog 10 state §8.2 | **Baru**: `src/components/updater/UpdateBanner.tsx`, `UpdateDialog.tsx`; **Pertimbangkan evolusi**: `src/components/UpdateNotifications.tsx` (FCM) digabung/dikoordinasi agar tidak banner kembar |
| Mount checker + banner | **Ubah**: `src/App.tsx` (di sini `UpdateNotifications` sudah di-mount — penempatan sama) |
| Cek manual + info versi | **Ubah**: `src/pages/SettingsPage.tsx` (section baru sebelum Form Actions, baris ~292) |
| Baca versi build | via `import.meta.env.VITE_APP_VERSION_CODE` (hasil Tahap A) |

### Tahap C — APK downloader — ✅ **DONE (19 November 2026)**

| Aksi | File |
|---|---|
| Download + progress + resume/retry + hash | **Baru**: plugin native — `android/app/src/main/java/org/readowl/library/updater/AppUpdaterPlugin.java` (atau Kotlin; paket `org.readowl.library` sudah ada), + registrasi di `MainActivity.java` (saat ini isi kosong: `BridgeActivity`) |
| Bridge TS + event | **Baru**: `src/services/updaterBridge.ts` / `src/types/updater.ts` |
| UI progress/cancel | **Ubah**: `src/components/updater/UpdateDialog.tsx` (state 6–9) |
| Dependency bridge | **Ubah**: `package.json` (bila pakai API Capacitor resmi untuk plugin custom — review kebutuhan aktual) |

### Tahap D — Android installer — ✅ **DONE (19 November 2026)**

| Aksi | File |
|---|---|
| Izin `REQUEST_INSTALL_PACKAGES` | **Ubah**: `android/app/src/main/AndroidManifest.xml` (sekarang hanya INTERNET+CAMERA) |
| FileProvider path APK (cek/cocokkan) | **Baca/Sesuaikan bila perlu**: `android/app/src/main/res/xml/file_paths.xml` (cache-path sudah ada; pertimbangkan subdirektori `updates/` — F-4, keputusan terpisah) |
| Cek permission + `ACTION_VIEW` installer + `canRequestPackageInstalls` | **Ubah**: plugin `AppUpdaterPlugin` (Tahap C) + `MainActivity.java` |
| Alur permission UX di WebView | **Ubah**: `src/components/updater/UpdateDialog.tsx` (state 8) |

### Tahap E — Security & testing — ✅ **DONE (19 November 2026)**

| Aksi | File |
|---|---|
| SHA-256 + identitas paket + signature cert (S4–S6) | **Ubah**: `AppUpdaterPlugin` (native) |
| Signature manifest Ed25519 (S7 — **wajib sebelum rilis updater**) | **Baru**: `scripts/sign-manifest.mjs` + CI secret baru; **Ubah**: `updateService.ts` (verifikasi publik key) |
| Unit test checker/manifest | **Baru**: `src/services/updateService.test.ts` |
| Test matrix: upgrade dari versi lama · data & session persist · offline · download terputus · force update · Android 7 vs 8+ · hash gagal | **Baru**: `docs/test-cases-updater.md` (usulan) atau catatan di `PROGRESS.md` |

**Ketergantungan antar tahap:** A → B → (C → D) → E. B bisa mulai paralel dgn C (mock download).
Semua tahap **setelah** persetujuan, dan **tidak boleh** menyentuh pekerjaan Security Remediation
yang sedang berjalan (migrasi, rotasi, Edge Functions — tetap urutan di `SECURITY-REMEDIATION.md`).

---

## 11. Ringkasan status & keputusan

**Status dokumen: DONE — Tahap A (18 November 2026) · Tahap B–E (19 November 2026) selesai; tinggal konfigurasi secret CI + build APK + uji perangkat.**

| # | Keputusan / pekerjaan | Jenis | Status |
|---|---|---|---|
| 1 | Distribusi APK langsung via link/website (bukan Play Store) | Keputusan user | ✅ Disetujui |
| 2 | Manifest primary di GCS bucket (`latest.json`) — bucket yang sudah dipakai pipeline release | Rekomendasi | ✅ **Disetujui & diimplementasikan (Tahap A)** — verifikasi konfigurasi aktual: bucket via secret `APK_STORAGE_BUCKET`, HTTPS publik, allowlist host sama dengan yang dipakai `UpdateNotifications.tsx` |
| 3 | Skema versionCode `MAJOR*1e6+MINOR*1e3+PATCH` (ganti `GITHUB_RUN_NUMBER`) — monoton, konsisten SemVer, tanpa duplikasi/penurunan | Keputusan teknis | ✅ **Disetujui & diimplementasikan (Tahap A)** — gate monoton fail-closed di generator |
| 4 | Plugin native Capacitor (Opsi A) untuk download+install | Keputusan teknis | ✅ Disetujui **jika diperlukan berdasarkan audit** — audit Tahap A/B menegaskan WebView tidak bisa kelola APK → diperlukan (Tahap C/D) |
| 5 | Signature manifest Ed25519 | Keputusan keamanan | ✅ Disetujui — **wajib selesai (Tahap E) sebelum updater dirilis ke pengguna** |
| 6 | FCM dipertahankan sebagai notifikasi tambahan; manifest = sumber kebenaran versi; **anti-duplikasi banner** | Keputusan | ✅ Disetujui — aturan anti-double-banner jadi syarat desain Tahap B (§8.1, lihat catatan §11.1) |
| 7 | F-6: `ReportsPage` orphan — **jangan dihapus & jangan diaktifkan**, biarkan sampai keputusan terpisah | Keputusan | ✅ Disetujui — tidak disentuh |
| 8 | F-4: persempit `file_paths.xml` sesuai kebutuhan aktual **tanpa merusak fitur lain** | Keputusan | ✅ Disetujui — dijadwalkan Tahap D (audit kebutuhan path dulu) |
| 9 | Implementasi bertahap Tahap A→E, laporan per tahap sebelum lanjut | Implementasi | ✅ **Selesai**: A DONE → B DONE → C DONE → D DONE → E DONE (18–19 November 2026) |

### 11.1 Aturan anti-duplikasi notifikasi (hasil approval poin 6)

- **Manifest = satu-satunya sumber kebenaran versi.** Checker berbasis `latest.json` (Tahap B) yang memutus apakah ada update.
- **FCM tetap ada** hanya sebagai *pemicu/pemberitahuan* — pesan push **tidak** langsung memunculkan banner kedua; saat pesan diterima, app cukup memicu cek manifest (bila rate-limit memungkinkan) atau diam.
- Satu banner saja per waktu: state banner global tunggal di `App.tsx`; jika banner sudah tampil, notifikasi FCM tidak menambah elemen UI.
- Selisih identik antara notifikasi sistem FCM (notification payload) dan banner in-app tidak dapat dihilangkan 100% (notifikasi sistem = OS), tetapi **tidak akan ada dua banner in-app**.

### 11.2 Revisi desain akibat Tahap A (tercatat agar dokumen tetap akurat)

1. `android/app/build.gradle` **tidak perlu diubah** — sudah membaca env `APP_VERSION`/`APP_VERSION_CODE`; cukup CI yang menghitung nilai baru.
2. Ditambahkan **verifikasi unggahan APK** (HEAD `content-length` == file lokal) di CI — lebih kuat dari rancangan awal §9.1 (yang hanya "unduh ulang/HEAD + size check"): kegagalan = rilis berhenti sebelum manifest terbit.
3. Changelog manifest dibuat **best-effort dari git log** (keterbatasan fetch-depth 1 di `actions/checkout`); kosong/bising tidak merusak (field opsional).
4. `package.json` version **tidak disinkronkan** dengan tag (lihat §10 Tahap A, baris terakhir) — tag = sumber `versionName` tunggal.

### Batasan yang dipatuhi dokumen ini

- ❌ Tidak ada perubahan source code / konfigurasi Android
- ❌ Tidak ada plugin updater dibuat
- ❌ Tidak ada build APK dijalankan
- ❌ Tidak ada perubahan database / migrasi / deploy / hapus Edge Function
- ❌ Tidak ada rotasi credential / rewrite Git history / commit / push
- ❌ Tidak ada Phase 1 / tindakan destruktif / perubahan production
