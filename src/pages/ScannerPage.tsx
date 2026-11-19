import React, { useRef, useState } from 'react';
import {
  Search,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  BookMarked,
  Info,
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

interface ScannerPageProps {
  onBookCataloged: (bookId: string) => void;
  onNavigateToBookshelf: () => void;
}

// Resilient Book Cover Preview with Alternate URL and Visual Fallback (BUG-06 Fix)
const BookCoverPreview: React.FC<{
  coverUrl?: string;
  alternateCoverUrl?: string;
  title: string;
  category?: string;
}> = ({ coverUrl, alternateCoverUrl, title, category }) => {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(coverUrl);
  const [triedAlternate, setTriedAlternate] = useState<boolean>(false);
  const [hasFailed, setHasFailed] = useState<boolean>(!coverUrl);

  React.useEffect(() => {
    setCurrentSrc(coverUrl);
    setTriedAlternate(false);
    setHasFailed(!coverUrl);
  }, [coverUrl]);

  const handleImageError = () => {
    if (!triedAlternate && alternateCoverUrl && alternateCoverUrl !== currentSrc) {
      setTriedAlternate(true);
      setCurrentSrc(alternateCoverUrl);
    } else {
      setHasFailed(true);
    }
  };

  if (hasFailed || !currentSrc) {
    return (
      <div className="w-20 aspect-2/3 rounded-lg bg-gradient-to-br from-[#EAE5DE] to-[#D5CEC5] border border-[#D4CDC3] flex flex-col items-center justify-between p-2 text-center text-[#5A4D44] shadow-xs select-none">
        <span className="text-[8px] font-mono uppercase tracking-wider text-[#8C7E72] block w-full truncate">
          {category || 'Buku'}
        </span>
        <div className="my-auto flex flex-col items-center">
          <BookOpen className="w-6 h-6 text-[#8C7E72] mb-1" />
          <span className="text-[9px] font-bold leading-tight line-clamp-3 text-[#3E342D]">
            {title || 'Cover Tidak Tersedia'}
          </span>
        </div>
        <span className="text-[7px] text-[#A3968A] uppercase">Tanpa Cover</span>
      </div>
    );
  }

  return (
    <div className="w-20 aspect-2/3 rounded-lg bg-[#F2EDE4] overflow-hidden shrink-0 border border-[#E5E0D8] shadow-xs relative">
      <img
        src={currentSrc}
        alt={title}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover transition-opacity duration-300"
        onError={handleImageError}
      />
    </div>
  );
};

async function prepareBookCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih file gambar untuk cover buku.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Ukuran foto maksimal 12 MB.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

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
  onNavigateToBookshelf,
}) => {
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [isbnInput, setIsbnInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<{
    type: MetadataErrorType | 'general';
    message: string;
  } | null>(null);
  const [metadata, setMetadata] = useState<ScannedBookMetadata | null>(null);
  const [existingBook, setExistingBook] = useState<Book | null>(null);
  const [coverError, setCoverError] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [savedBook, setSavedBook] = useState<Book | null>(null);

  // Quick test barcodes for instant evaluation without webcam
  const sampleIsbns = [
    { title: 'Clean Code', isbn: '9780132350884' },
    { title: 'Dune', isbn: '9780441013593' },
    { title: 'The Hobbit', isbn: '9780547928227' },
    { title: 'Atomic Habits', isbn: '9780735211292' },
    { title: 'Sapiens', isbn: '9780062316097' },
    { title: 'Design Patterns', isbn: '9780201633610' },
  ];

  const handleIsbnLookup = async (isbnToLookup: string) => {
    setLookupStatus(null);
    setSavedBook(null);
    setExistingBook(null);
    setMetadata(null);

    const cleaned = cleanIsbn(isbnToLookup);
    if (!isValidIsbn(cleaned)) {
      setLookupStatus({
        type: 'invalid_isbn',
        message: `"${isbnToLookup}" bukan checksum atau format ISBN yang valid. Pastikan 10 atau 13 digit angka tertera dengan benar.`,
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
          coverUrl: alreadyInCatalog.cover_url,
          categories: alreadyInCatalog.categories.map((category) => category.name),
          source: 'local_database',
        });
        return;
      }

      const res = await fetchBookMetadataByIsbn(cleaned);
      if (res.metadata) {
        setMetadata(res.metadata);
        if (!res.success && res.error) {
          setLookupStatus({
            type: res.errorType || 'general',
            message: res.error,
          });
        }
        setExistingBook(alreadyInCatalog);
      } else {
        setLookupStatus({
          type: res.errorType || 'general',
          message: res.error || 'Gagal mengambil metadata buku.',
        });
      }
    } catch (err: any) {
      setLookupStatus({
        type: 'general',
        message: err.message || 'Terjadi kendala saat menghubungi server metadata.',
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
      setLookupStatus({
        type: 'invalid_isbn',
        message: `Kode ${result.digits} terdeteksi sebagai ISBN, tetapi checksum salah. Kode mentah berhasil dibaca dan disimpan untuk pengecekan manual.`,
      });
      return;
    }

    setLookupStatus({
      type: 'general',
      message: `Kode berhasil dibaca: "${result.raw}". Kode ini bukan ISBN yang dikenal. Anda dapat mencoba scan ulang atau memasukkan data manual.`,
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
      setCoverError(error instanceof Error ? error.message : 'Foto cover gagal diproses.');
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadata || !metadata.title) return;

    setIsProcessing(true);
    try {
      const result = await LibraryService.addBook(metadata);

      setSavedBook(result.book);
      setMetadata(null);
      setExistingBook(null);
      setIsbnInput('');
      setLookupStatus(null);
    } catch (err: any) {
      setLookupStatus({
        type: 'general',
        message: `Kendala saat menyimpan buku: ${err.message}`,
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
        return 'Merged (Multiple Sources)';
      case 'open_library':
        return 'Open Library';
      case 'google_books':
        return 'Google Books';
      case 'jakarta_library':
        return 'Perpustakaan Jakarta';
      case 'local_database':
        return 'Local Database';
      case 'manual':
        return 'Data Manual';
      default:
        return source.replace('_', ' ');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-[#EAE5DE] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
          Smart ISBN Barcode Scanner
        </h1>
        <p className="text-xs text-[#7E6F64]">
          Katalog buku otomatis melalui scan barcode kamera atau input ISBN, dengan fallback Open Library, Google Books, dan Perpustakaan Jakarta.
        </p>
      </div>

      {/* Success Notification Banner */}
      {savedBook && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-950">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">
                Buku "{savedBook.title}" Berhasil Ditambahkan ke Katalog!
              </p>
              <p className="text-[11px] text-emerald-800">
                Buku kini tersimpan di katalog · {formatAddedAt(savedBook.created_at)}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onBookCataloged(savedBook.id)}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              Lihat di Bookshelf
            </button>
            <button
              onClick={handleScanAnother}
              className="px-3 py-1.5 bg-white border border-emerald-200 text-xs font-medium text-emerald-800 hover:bg-emerald-100 rounded-lg"
            >
              Scan Buku Lain
            </button>
          </div>
        </div>
      )}

      {/* Classified Lookup Error or Info Banner (BUG-08 & BUG-05 Fix) */}
      {lookupStatus && (
        <div
          className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
            lookupStatus.type === 'invalid_isbn'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : lookupStatus.type === 'not_found'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : lookupStatus.type === 'network_error'
              ? 'bg-red-50 border-red-200 text-red-950'
              : 'bg-orange-50 border-orange-200 text-orange-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {lookupStatus.type === 'network_error' ? (
              <WifiOff className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : lookupStatus.type === 'not_found' ? (
              <BookMarked className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">
                {lookupStatus.type === 'not_found'
                  ? 'Buku Tidak Ditemukan di Sumber Metadata'
                  : lookupStatus.type === 'invalid_isbn'
                  ? 'Format ISBN Tidak Sesuai'
                  : lookupStatus.type === 'rate_limited'
                  ? 'Batas Kuota API Tercapai'
                  : 'Pemberitahuan Metadata'}
              </p>
              <p className="mt-0.5 leading-relaxed text-[11px]">{lookupStatus.message}</p>
            </div>
          </div>

          {(lookupStatus.type === 'timeout' || lookupStatus.type === 'network_error' || lookupStatus.type === 'rate_limited' || lookupStatus.type === 'not_found') && isbnInput && (
            <button
              type="button"
              onClick={() => handleIsbnLookup(isbnInput)}
              className="px-2.5 py-1 bg-white border border-orange-300 hover:bg-orange-100/50 rounded text-[11px] font-semibold text-orange-900 shrink-0 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Coba Lagi</span>
            </button>
          )}
        </div>
      )}

      {/* Main Two-Column Scanner Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Scanner & Manual Input (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Live Camera Scanner Component */}
          <BarcodeScanner
            onDetected={async (result) => {
              await handleResolvedScan(result);
            }}
            onScan={(scanned) => {
              setIsbnInput(scanned);
            }}
            isProcessing={isProcessing}
            onResetScan={() => {
              setLookupStatus(null);
            }}
          />

          {/* Manual ISBN Input Fallback */}
          <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#2C221E]">Input ISBN Manual</span>
              <span className="text-[11px] text-[#7E6F64]">Format EAN-13 atau ISBN-10</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isbnInput) handleIsbnLookup(isbnInput);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={isbnInput}
                  onChange={(e) => setIsbnInput(e.target.value)}
                  placeholder="Contoh: 9780132350884 atau 0132350882"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#c62828]"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !isbnInput}
                className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Cari Buku</span>
              </button>
            </form>

            {/* Quick Test Barcode Buttons (development only) */}
            {import.meta.env.DEV && (
              <div className="mt-4 pt-3 border-t border-[#F0ECE4]">
                <span className="block text-[11px] font-semibold text-[#7E6F64] mb-2">
                  Barcode Contoh untuk Testing Langsung (1-Click Lookup):
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
                      className="px-2.5 py-1 text-[11px] bg-[#FAF8F5] hover:bg-[#fce4e4] border border-[#E5E0D8] hover:border-[#c62828]/40 text-[#4A3E35] rounded-md transition-colors font-mono"
                    >
                      {s.title} ({s.isbn.slice(-4)})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Retrieved Metadata Review (5 cols) */}
        <div className="lg:col-span-5">
          {metadata ? (
            <form
              onSubmit={handleSaveBook}
              className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#c62828]">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {metadata.source === 'manual'
                      ? 'Metadata Tidak Ditemukan — Isi Manual'
                      : 'Metadata Berhasil Diambil'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-[#F2EDE4] px-2 py-0.5 rounded text-[#5A4D44]">
                  {getSourceBadgeLabel(metadata.source)}
                </span>
              </div>

              {existingBook && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                  <strong>"{existingBook.title}"</strong> sudah ada di dalam katalog. Menyimpan akan
                  memperbarui data bibliografis buku ini.
                </div>
              )}

              {/* Book Overview Preview with Fallback Component (BUG-06 Fix) */}
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
                    className="group relative block w-20 aspect-2/3 overflow-hidden rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c62828]"
                    aria-label={metadata.coverUrl ? 'Ganti foto cover buku' : 'Unggah foto cover buku'}
                  >
                    <BookCoverPreview
                      coverUrl={metadata.coverUrl}
                      alternateCoverUrl={metadata.alternateCoverUrl}
                      title={metadata.title}
                      category={metadata.categories[0]}
                    />
                    <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded bg-black/60 px-1 py-1 text-[8px] font-semibold text-white">
                      <ImagePlus className="h-3 w-3" />
                      <span>{metadata.coverUrl ? 'Ganti foto' : 'Tambah foto'}</span>
                    </span>
                  </button>
                  {coverError && (
                    <p className="text-[10px] leading-tight text-rose-700" role="alert">{coverError}</p>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    className="w-full font-bold text-sm text-[#2C221E] border-b border-transparent hover:border-[#D4CDC3] focus:border-[#c62828] focus:outline-hidden"
                    placeholder="Judul Buku"
                    required
                  />
                  <input
                    type="text"
                    value={metadata.subtitle || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, subtitle: e.target.value || undefined })
                    }
                    className="w-full text-xs text-[#7E6F64] italic border-b border-transparent hover:border-[#D4CDC3] focus:border-[#c62828] focus:outline-hidden"
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
                    className="w-full text-xs text-[#7E6F64] border-b border-transparent hover:border-[#D4CDC3] focus:border-[#c62828] focus:outline-hidden"
                    placeholder="Penulis (pisahkan dengan koma)"
                  />
                  <div className="pt-1 text-[11px] font-mono text-[#A89F91]">
                    ISBN: {formatIsbn(metadata.isbn13)}
                  </div>
                </div>
              </div>

              {/* Editable Bibliographic Details */}
              <div className="grid grid-cols-3 gap-3 text-xs pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                    Penerbit
                  </label>
                  <input
                    type="text"
                    value={metadata.publisher || ''}
                    onChange={(e) => setMetadata({ ...metadata, publisher: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                    placeholder="Nama penerbit"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
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
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono"
                    placeholder="Contoh: 2024"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
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
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono"
                    placeholder="Halaman"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Sinopsis / Deskripsi
                </label>
                <textarea
                  value={metadata.description || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, description: e.target.value || undefined })
                  }
                  rows={3}
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs resize-y max-h-40"
                  placeholder="Ringkasan atau sinopsis buku"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Kategori Utama
                </label>
                <input
                  type="text"
                  value={metadata.categories[0] || ''}
                  onChange={(e) => setMetadata({ ...metadata, categories: [e.target.value] })}
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                  placeholder="Contoh: Computer Science"
                />
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Bahasa
                </label>
                <input
                  type="text"
                  value={metadata.language || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, language: e.target.value || undefined })
                  }
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                  placeholder="Contoh: en / id"
                  maxLength={10}
                />
              </div>

              {/* Form Action */}
              <div className="pt-3 border-t border-[#F0ECE4] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMetadata(null);
                    setLookupStatus(null);
                  }}
                  className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Simpan ke Katalog</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="h-full min-h-[320px] bg-white border border-dashed border-[#D4CDC3] rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-[#A89F91] mb-3">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#2C221E] mb-1">
                Area Pratinjau Metadata
              </h3>
              <p className="text-xs text-[#7E6F64] max-w-xs leading-relaxed">
                Pindai barcode buku atau masukkan ISBN untuk mencari metadata di Open Library, Google Books, dan katalog Perpustakaan Jakarta.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
