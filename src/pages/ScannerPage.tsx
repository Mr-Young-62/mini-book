import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  BookMarked,
  WifiOff,
  ImagePlus,
} from 'lucide-react';
import { BarcodeScanner } from '../components/scanner/BarcodeScanner';
import { fetchBookMetadataByIsbn, MetadataErrorType } from '../services/metadataService';
import { cleanIsbn, isValidIsbn, formatIsbn } from '../services/isbnValidator';
import { LibraryService } from '../services/libraryService';
import { ScannedBookMetadata, Book } from '../types/library';
import type { ResolvedCode } from '../services/codeResolver';
import { formatAddedAt } from '../lib/datetime';
import { normalizeStockCount } from '../lib/stock';
import { BookCard } from '../components/BookCard';
import { useToast } from '../components/ToastProvider';
import { ScannerPreviewEmptyIllustration } from '../components/LibraryIllustrations';

interface ScannerPageProps {
  onBookCataloged: (bookId: string) => void;
  onNavigateToBookshelf: () => void;
}

async function prepareBookCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih berkas gambar untuk sampul buku.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Ukuran foto maksimal 12 MB.');
  }

    const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Foto tidak dapat diproses (dimensi nol).');
    }

    const maxDimension = 1200;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Foto tidak dapat diproses di perangkat ini.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Foto gagal dikompres.')),
        'image/jpeg',
        0.82,
      );
    });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Foto gagal dibaca.'));
      reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
      reader.readAsDataURL(compressed);
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  onBookCataloged,
}) => {
  const { notify } = useToast();
  const [isbnInput, setIsbnInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<{
    type: MetadataErrorType | 'general';
    message: string;
  } | null>(null);
  const [metadata, setMetadata] = useState<ScannedBookMetadata | null>(null);
  const [existingBook, setExistingBook] = useState<Book | null>(null);
  const [coverError, setCoverError] = useState('');
  const [justDetected, setJustDetected] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const topStatusRef = useRef<HTMLDivElement>(null);

  const [savedBook, setSavedBook] = useState<Book | null>(null);

  useEffect(() => {
    if (!metadata) {
      setJustDetected(false);
      return;
    }
    setJustDetected(true);
    const frameId = requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: window.innerWidth < 1024 ? 'start' : 'nearest',
      });
    });
    const timer = window.setTimeout(() => {
      setJustDetected(false);
    }, 1600);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [metadata]);

  useEffect(() => {
    if (!savedBook) return;
    topStatusRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [savedBook]);

  const sampleIsbns = import.meta.env.DEV
    ? [
        { title: 'Clean Code', isbn: '9780132350884' },
        { title: 'Dune', isbn: '9780441013593' },
        { title: 'The Hobbit', isbn: '9780547928227' },
        { title: 'Atomic Habits', isbn: '9780735211292' },
        { title: 'Sapiens', isbn: '9780062316097' },
        { title: 'Design Patterns', isbn: '9780201633610' },
      ]
    : [];

  const handleIsbnLookup = async (isbnToLookup: string) => {
    setLookupStatus(null);
    setSavedBook(null);
    setExistingBook(null);
    setMetadata(null);

    const cleaned = cleanIsbn(isbnToLookup);
    if (!isValidIsbn(cleaned)) {
      const msg = `“${isbnToLookup}” bukan checksum atau format ISBN yang valid. Pastikan 10 atau 13 digit angka tertera dengan benar.`;
      setLookupStatus({
        type: 'invalid_isbn',
        message: msg,
      });
      notify({
        tone: 'warning',
        title: 'ISBN belum terbaca valid',
        description: 'Periksa kembali 10 atau 13 digit kode ISBN di sampul belakang.',
      });
      return;
    }

    setIsProcessing(true);
    try {
      let alreadyInCatalog: Book | null = null;
      try {
        alreadyInCatalog = await LibraryService.getBookByIsbn(cleaned);
      } catch (error) {
        console.warn('Could not check the local catalog before metadata lookup:', error);
      }

      if (alreadyInCatalog) {
        const currentStock = normalizeStockCount(alreadyInCatalog.stock_count);
        setExistingBook(alreadyInCatalog);
        setMetadata({
          title: alreadyInCatalog.title,
          subtitle: alreadyInCatalog.subtitle,
          authors: alreadyInCatalog.authors.map((author) => author.name),
          publisher: alreadyInCatalog.publisher?.name,
          publicationYear: alreadyInCatalog.publication_year,
          isbn10: alreadyInCatalog.isbn_10,
          isbn13: alreadyInCatalog.isbn_13,
          description: alreadyInCatalog.description,
          language: alreadyInCatalog.language,
          pageCount: alreadyInCatalog.page_count,
          stockCount: currentStock + 1,
          coverUrl: alreadyInCatalog.cover_url,
          categories: alreadyInCatalog.categories.map((category) => category.name),
          source: 'local_database',
        });
        notify({
          tone: 'success',
          title: 'Buku ditemukan di katalog',
          description: `“${alreadyInCatalog.title}” (${currentStock} eksemplar). Simpan untuk menambah stok atau memperbarui data.`,
        });
        return;
      }

      const res = await fetchBookMetadataByIsbn(cleaned);
      if (res.metadata) {
        setMetadata({
          ...res.metadata,
          stockCount: normalizeStockCount(res.metadata.stockCount),
        });
        notify({
          tone: 'success',
          title: 'Buku terdeteksi',
          description: `“${res.metadata.title}” siap diperiksa dan disimpan ke rak.`,
        });
        if (!res.success && res.error) {
          setLookupStatus({
            type: res.errorType || 'general',
            message: res.error,
          });
        }
        // Pengecekan ulang katalog setelah lookup metadata, karena buku mungkin
        // baru saja ditambahkan oleh pengguna lain selama lookup berjalan.
        try {
          const freshBook = await LibraryService.getBookByIsbn(cleaned);
          if (freshBook) setExistingBook(freshBook);
        } catch {
          /* abaikan jika katalog lokal tidak tersedia atau terjadi kendala jaringan */
        }
      } else {
        const errMessage = res.error || 'Gagal mengambil metadata buku.';
        setLookupStatus({
          type: res.errorType || 'general',
          message: errMessage,
        });
        notify({
          tone: 'warning',
          title: 'Pencarian ISBN butuh perhatian',
          description: errMessage,
        });
      }
    } catch (err: any) {
      const errMessage = err.message || 'Terjadi kendala saat menghubungi server metadata.';
      setLookupStatus({
        type: 'general',
        message: errMessage,
      });
      notify({
        tone: 'error',
        title: 'Gagal mencari buku',
        description: errMessage,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolvedScan = async (result: ResolvedCode) => {
    if (result.kind === 'isbn') {
      setIsbnInput(result.isbn13);
      await handleIsbnLookup(result.isbn13);
      return;
    }

    if (result.kind === 'invalid_isbn') {
      setIsbnInput(result.digits);
      setLookupStatus({
        type: 'invalid_isbn',
        message: `Kode ${result.digits} terdeteksi sebagai ISBN, tetapi checksum salah. Kode mentah berhasil dibaca dan disimpan untuk pengecekan manual.`,
      });
      return;
    }

    setLookupStatus({
      type: 'general',
      message: `Kode berhasil dibaca: “${result.raw}”. Kode ini bukan ISBN yang dikenal. Anda dapat mencoba pindai ulang atau memasukkan data manual.`,
    });
  };

  const handleCoverSelection = async (file?: File) => {
    if (!file || !metadata) return;
    setCoverError('');
    try {
      const coverUrl = await prepareBookCover(file);
      setMetadata((current) => current
        ? { ...current, coverUrl, alternateCoverUrl: undefined }
        : current);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : 'Foto sampul gagal diproses.');
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadata || !metadata.title) return;

    setIsProcessing(true);
    try {
      const result = await LibraryService.addBook(metadata);
      const savedStock = normalizeStockCount(result.book.stock_count);

      setSavedBook(result.book);
      setMetadata(null);
      setExistingBook(null);
      setIsbnInput('');
      setLookupStatus(null);
      notify({
        tone: 'success',
        title: existingBook ? 'Stok & data buku diperbarui!' : 'Buku tersimpan ke rak!',
        description: `“${result.book.title}” (${savedStock} eksemplar) sudah tercatat di katalog.`,
        actionLabel: 'Lihat Rak',
        onAction: () => onBookCataloged(result.book.id),
      });
    } catch (err: any) {
      setLookupStatus({
        type: 'general',
        message: `Kendala saat menyimpan buku: ${err.message}`,
      });
      notify({
        tone: 'error',
        title: 'Gagal menyimpan buku',
        description: err.message || 'Periksa kembali isian buku lalu coba lagi.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanAnother = () => {
    setSavedBook(null);
    setMetadata(null);
    setLookupStatus(null);
    setIsbnInput('');
  };

  const getSourceBadgeLabel = (source: string) => {
    switch (source) {
      case 'merged':
        return 'Gabungan Sumber';
      case 'open_library':
        return 'Open Library';
      case 'google_books':
        return 'Google Books';
      case 'jakarta_library':
        return 'Perpustakaan Jakarta';
      case 'local_database':
        return 'Basis Data Lokal';
      case 'manual':
        return 'Data Manual';
      default:
        return source.replace('_', ' ');
    }
  };

  return (
    <div className="space-y-6 sm:space-y-7 pb-8">
      <div>
        <h1 className="page-title">
          Pindai <span className="acronym">ISBN</span>
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] sm:text-[15px] leading-[1.55] text-[#686C65]">
          Arahkan kamera ke barcode di sampul belakang buku, atau ketik nomor <span className="acronym">ISBN</span> secara manual.
        </p>
      </div>

      {savedBook && (
        <div
          ref={topStatusRef}
          className="p-4 bg-[#E5F2EE] rounded-[18px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#165243]"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#1F6F5B] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-[15px] font-semibold">
                “<span className="font-book">{savedBook.title}</span>” berhasil disimpan ke rak.
              </p>
              <p className="text-[12px] sm:text-[13px] font-medium text-[#165243]/85">
                Tercatat {formatAddedAt(savedBook.created_at)}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onBookCataloged(savedBook.id)}
              className="btn-primary-tactile min-h-[44px] px-5 text-xs font-semibold rounded-[12px]"
            >
              Lihat di Rak Buku
            </button>
            <button
              type="button"
              onClick={handleScanAnother}
              className="min-h-[44px] px-4 bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] text-xs font-semibold text-[#262925] hover:bg-[#ECE8DF] rounded-[12px]"
            >
              Pindai buku lain
            </button>
          </div>
        </div>
      )}

      {lookupStatus && (
        <div
          className={`p-4 rounded-[18px] flex items-start justify-between gap-3 text-xs ${
            lookupStatus.type === 'invalid_isbn' || lookupStatus.type === 'network_error'
              ? 'bg-[#F7EAE4] text-[#9E4028]'
              : 'bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] text-[#262925]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {lookupStatus.type === 'network_error' ? (
              <WifiOff className="w-4 h-4 text-[#B9543A] shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />
            ) : lookupStatus.type === 'not_found' ? (
              <BookMarked className="w-4 h-4 text-[#1F6F5B] shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#B9543A] shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />
            )}
            <div>
              <p className="text-[15px] font-semibold">
                {lookupStatus.type === 'not_found'
                  ? 'Buku tidak ditemukan di katalog daring'
                  : lookupStatus.type === 'invalid_isbn'
                  ? <>Format <span className="acronym">ISBN</span> tidak sesuai</>
                  : lookupStatus.type === 'rate_limited'
                  ? 'Batas permintaan server tercapai'
                  : lookupStatus.type === 'provider_error'
                  ? 'Layanan metadata tidak tersedia'
                  : 'Info pencarian'}
              </p>
              <p className="mt-0.5 leading-[1.5] text-[13px] font-medium opacity-85">{lookupStatus.message}</p>
            </div>
          </div>

          {(lookupStatus.type === 'timeout' || lookupStatus.type === 'network_error' || lookupStatus.type === 'rate_limited' || lookupStatus.type === 'provider_error' || lookupStatus.type === 'not_found') && isbnInput && (
            <button
              type="button"
              onClick={() => handleIsbnLookup(isbnInput)}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-[12px] bg-[#B9543A] px-4 text-xs font-semibold text-white hover:bg-[#9E4028]"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span>Coba lagi</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <BarcodeScanner
            onDetected={async (result: ResolvedCode) => {
              await handleResolvedScan(result);
            }}
            onScan={(scanned: string) => {
              setIsbnInput(scanned);
            }}
            isProcessing={isProcessing}
            onResetScan={() => {
              setLookupStatus(null);
            }}
          />

          <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="manual-isbn-input" className="text-[15px] font-semibold text-[#262925]">
                Input <span className="acronym">ISBN</span> manual
              </label>
              <span className="text-[12px] font-medium text-[#737770]">
                <span className="acronym">EAN-13</span> atau <span className="acronym">ISBN-10</span>
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isbnInput) handleIsbnLookup(isbnInput);
              }}
              className="flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  id="manual-isbn-input"
                  type="text"
                  value={isbnInput}
                  onChange={(e) => setIsbnInput(e.target.value)}
                  placeholder="Contoh: 9780132350884"
                  className="w-full min-h-[44px] sm:min-h-[48px] px-4 py-2 text-[14px] sm:text-[15px] font-mono bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-[#262925] placeholder-[#686C65]"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !isbnInput}
                className="btn-primary-tactile min-h-[44px] sm:min-h-[48px] px-6 disabled:opacity-50 text-[13.5px] sm:text-sm font-semibold rounded-[12px] inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                )}
                <span>Cari buku</span>
              </button>
            </form>

            {/* Quick Test Barcode Buttons (development only) */}
            {import.meta.env.DEV && sampleIsbns.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#ECE7DD]">
                <span className="block text-[11px] font-semibold text-[#686C65] mb-2">
                  Contoh <span className="acronym">ISBN</span> untuk pengujian lokal (mode pengembangan):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleIsbns.map((s) => (
                    <button
                      key={s.isbn}
                      type="button"
                      onClick={() => {
                        setIsbnInput(s.isbn);
                        handleIsbnLookup(s.isbn);
                      }}
                      className="px-2.5 py-1.5 text-[11px] bg-[#F2EFE8] hover:bg-[#E7E2D7] text-[#262925] rounded-[10px] transition-colors font-mono"
                    >
                      {s.title} ({s.isbn.slice(-4)})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div ref={previewRef} className="lg:col-span-5 lg:sticky lg:top-6 self-start scroll-mt-6">
          {isProcessing && !metadata ? (
            <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#165243]">
                <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                <span>Mencari data buku...</span>
              </div>
              <div className="flex gap-4 animate-pulse">
                <div className="w-20 aspect-[136/223] rounded-[10px] bg-[#ECE8DF] shrink-0" />
                <div className="flex-1 space-y-2.5 py-1">
                  <div className="h-4 w-4/5 rounded bg-[#ECE8DF]" />
                  <div className="h-3 w-3/5 rounded bg-[#F2EFE8]" />
                  <div className="h-3 w-2/5 rounded bg-[#F2EFE8]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5 animate-pulse">
                <div className="h-9 rounded-[12px] bg-[#F2EFE8]" />
                <div className="h-9 rounded-[12px] bg-[#F2EFE8]" />
                <div className="h-9 rounded-[12px] bg-[#F2EFE8]" />
              </div>
            </div>
          ) : metadata ? (
            <form
              onSubmit={handleSaveBook}
              className={`bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-4 sm:p-5 space-y-3.5 transition-shadow ${
                justDetected ? 'ring-2 ring-[#1F6F5B]/35' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#ECE7DD]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#165243]">
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
                  <span>
                    {metadata.source === 'manual'
                      ? 'Isi data buku manual'
                      : 'Data buku ditemukan'}
                  </span>
                </div>
                <span className="text-[11px] font-medium bg-[#F2EFE8] px-2.5 py-1 rounded-[10px] text-[#686C65]">
                  {getSourceBadgeLabel(metadata.source)}
                </span>
              </div>

              {existingBook && (
                <div className="p-3 bg-[#F7EAE4] rounded-[12px] text-[12px] text-[#9E4028]">
                  <strong>“{existingBook.title}”</strong> sudah ada di katalog ({normalizeStockCount(existingBook.stock_count)} eksemplar).
                  Menyimpan akan memperbarui data dan stok menjadi{' '}
                  <strong className="tabular-nums">{normalizeStockCount(metadata.stockCount)}</strong> eksemplar.
                </div>
              )}

              <div className="flex gap-4">
                <div className="w-20 shrink-0 space-y-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleCoverSelection(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="group relative block w-20 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F6F5B]"
                    aria-label={metadata.coverUrl ? 'Ganti foto sampul buku' : 'Unggah foto sampul buku'}
                  >
                    <BookCard
                      coverUrl={metadata.coverUrl}
                      alternateCoverUrl={metadata.alternateCoverUrl}
                      title={metadata.title}
                      seed={metadata.isbn13 || metadata.title}
                      size="sm"
                      showRibbon={false}
                      className="w-full"
                    />
                    <span className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-[10px] bg-[#F2EFE8] px-1.5 py-1 text-[10px] font-semibold text-[#262925] group-hover:bg-[#E7E2D7]">
                      <ImagePlus className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                      <span>{metadata.coverUrl ? 'Ganti foto' : 'Tambah foto'}</span>
                    </span>
                  </button>
                  {coverError && (
                    <p className="text-[10px] leading-tight text-[#B3261E]" role="alert">{coverError}</p>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    className="w-full font-book text-[16px] font-semibold leading-snug text-[#262925] bg-transparent border-b border-[#ECE7DD] focus:border-[#1F6F5B] focus:outline-hidden pb-0.5"
                    placeholder="Judul Buku"
                    required
                  />
                  <input
                    type="text"
                    value={metadata.subtitle || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, subtitle: e.target.value || undefined })
                    }
                    className="w-full text-xs text-[#737770] italic bg-transparent border-b border-transparent hover:border-[#ECE7DD] focus:border-[#1F6F5B] focus:outline-hidden"
                    placeholder="Subjudul (opsional)"
                  />
                  <input
                    type="text"
                    value={metadata.authors.join(', ')}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        authors: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    className="w-full text-[13px] text-[#686C65] bg-transparent border-b border-transparent hover:border-[#ECE7DD] focus:border-[#1F6F5B] focus:outline-hidden"
                    placeholder="Penulis (pisahkan dengan koma)"
                  />
                  <div className="pt-0.5 text-[11px] font-mono text-[#686C65] tabular-nums">
                    <span className="acronym">ISBN</span> {formatIsbn(metadata.isbn13)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Penerbit
                  </label>
                  <input
                    type="text"
                    value={metadata.publisher || ''}
                    onChange={(e) => setMetadata({ ...metadata, publisher: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs text-[#262925]"
                    placeholder="Nama penerbit"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Tahun Terbit
                  </label>
                  <input
                    type="number"
                    value={metadata.publicationYear || ''}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        publicationYear: parseInt(e.target.value, 10) || undefined,
                      })
                    }
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs tabular-nums text-[#262925]"
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Halaman
                  </label>
                  <input
                    type="number"
                    value={metadata.pageCount || ''}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        pageCount: parseInt(e.target.value, 10) || undefined,
                      })
                    }
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs tabular-nums text-[#262925]"
                    placeholder="Halaman"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Kategori Utama
                  </label>
                  <input
                    type="text"
                    value={metadata.categories[0] || ''}
                    onChange={(e) => setMetadata({ ...metadata, categories: [e.target.value] })}
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs text-[#262925]"
                    placeholder="Contoh: Fiksi"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Bahasa
                  </label>
                  <input
                    type="text"
                    value={metadata.language || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, language: e.target.value || undefined })
                    }
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs text-[#262925]"
                    placeholder="Contoh: en / id"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                    Jumlah Eksemplar
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={metadata.stockCount ?? 1}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        stockCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs tabular-nums text-[#262925]"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-medium text-[#686C65] mb-1">
                  Sinopsis / Deskripsi
                </label>
                <textarea
                  value={metadata.description || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, description: e.target.value || undefined })
                  }
                  rows={2}
                  className="w-full px-3 py-2 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-xs text-[#262925] resize-y max-h-36"
                  placeholder="Ringkasan atau sinopsis buku"
                />
              </div>

              <div className="pt-3 border-t border-[#ECE7DD] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMetadata(null);
                    setLookupStatus(null);
                  }}
                  className="min-h-[44px] px-5 rounded-[12px] bg-[#F2EFE8] hover:bg-[#E7E2D7] text-sm font-semibold text-[#262925]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="btn-hero-marigold min-h-[44px] px-6 text-sm font-bold rounded-[12px] flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>Simpan ke rak</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[260px] sm:min-h-[280px]">
              <ScannerPreviewEmptyIllustration className="mb-4" />
              <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#262925] mb-1">
                Pratinjau buku
              </h2>
              <p className="text-[13px] sm:text-[14px] text-[#737770] max-w-xs leading-[1.55]">
                Detail buku akan muncul di sini setelah barcode terbaca atau nomor <span className="acronym">ISBN</span> dicari.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
