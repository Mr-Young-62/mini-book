import React, { useState } from 'react';
import {
  QrCode,
  Search,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Layers,
  MapPin,
  RefreshCw,
  Plus,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { BarcodeScanner } from '../components/scanner/BarcodeScanner';
import { fetchBookMetadataByIsbn } from '../services/metadataService';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13, formatIsbn } from '../services/isbnValidator';
import { LibraryService } from '../services/libraryService';
import { ScannedBookMetadata, Book } from '../types/library';

interface ScannerPageProps {
  onBookCataloged: (bookId: string) => void;
  onNavigateToBookshelf: () => void;
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  onBookCataloged,
  onNavigateToBookshelf,
}) => {
  const [isbnInput, setIsbnInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ScannedBookMetadata | null>(null);

  // Physical inventory copy configuration
  const [copyCount, setCopyCount] = useState<number>(1);
  const [shelfLocation, setShelfLocation] = useState<string>('Shelf Tech A');
  const [rackNumber, setRackNumber] = useState<string>('Rack 01');
  const [condition, setCondition] = useState<string>('Good');
  const [acquisitionPrice, setAcquisitionPrice] = useState<string>('24.95');
  const [acquisitionSource, setAcquisitionSource] = useState<string>('Direct Purchase');

  // Success state after saving
  const [savedBook, setSavedBook] = useState<Book | null>(null);
  const [savedCopiesCount, setSavedCopiesCount] = useState<number>(0);

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
    setLookupError(null);
    setSavedBook(null);

    const cleaned = cleanIsbn(isbnToLookup);
    if (!isValidIsbn(cleaned)) {
      setLookupError(`"${isbnToLookup}" is not a valid ISBN checksum. Please verify the digits.`);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetchBookMetadataByIsbn(cleaned);
      if (res.metadata) {
        setMetadata(res.metadata);
        if (!res.success && res.error) {
          setLookupError(res.error);
        }
      } else {
        setLookupError(res.error || 'Failed to retrieve book metadata.');
      }
    } catch (err: any) {
      setLookupError(err.message || 'Error occurred while contacting metadata APIs.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadata || !metadata.title) return;

    setIsProcessing(true);
    try {
      const result = await LibraryService.addBookWithCopies(metadata, {
        copyCount,
        shelfLocation,
        rackNumber,
        condition,
        acquisitionPrice: parseFloat(acquisitionPrice) || 0,
        acquisitionSource,
      });

      setSavedBook(result.book);
      setSavedCopiesCount(result.newCopies.length);
      setMetadata(null);
      setIsbnInput('');
    } catch (err: any) {
      setLookupError(`Error saving book: ${err.message}`);
    } finally {
      setIsProcessing(false);
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
          Automate book entry by scanning the barcode or entering the ISBN. Real metadata is retrieved from Open Library & Google Books.
        </p>
      </div>

      {/* Success Notification Banner */}
      {savedBook && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-950">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">
                Successfully Cataloged "{savedBook.title}"!
              </p>
              <p className="text-[11px] text-emerald-800">
                Created {savedCopiesCount} physical inventory copies with unique RDW codes on {shelfLocation}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onBookCataloged(savedBook.id)}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              View in Bookshelf
            </button>
            <button
              onClick={() => setSavedBook(null)}
              className="px-3 py-1.5 bg-white border border-emerald-200 text-xs font-medium text-emerald-800 hover:bg-emerald-100 rounded-lg"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Scanner Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Scanner & Manual Input (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Live Camera Scanner Component */}
          <BarcodeScanner
            onScan={(scanned) => {
              setIsbnInput(scanned);
              handleIsbnLookup(scanned);
            }}
            isProcessing={isProcessing}
          />

          {/* Manual ISBN Input Fallback */}
          <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#2C221E]">Manual ISBN Input</span>
              <span className="text-[11px] text-[#7E6F64]">EAN-13 or ISBN-10</span>
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
                  placeholder="e.g. 9780132350884 or 0132350882"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#EA580C]"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !isbnInput}
                className="px-4 py-2 bg-[#EA580C] hover:bg-[#C2410C] disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Lookup Book</span>
              </button>
            </form>

            {/* Quick Test Barcode Buttons */}
            <div className="mt-4 pt-3 border-t border-[#F0ECE4]">
              <span className="block text-[11px] font-semibold text-[#7E6F64] mb-2">
                One-Click Test Barcodes (Instant API lookup):
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
                    className="px-2.5 py-1 text-[11px] bg-[#FAF8F5] hover:bg-[#FFEDD5] border border-[#E5E0D8] hover:border-[#EA580C]/40 text-[#4A3E35] rounded-md transition-colors font-mono"
                  >
                    {s.title} ({s.isbn.slice(-4)})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Retrieved Metadata Review & Physical Copies Config (5 cols) */}
        <div className="lg:col-span-5">
          {metadata ? (
            <form
              onSubmit={handleSaveBook}
              className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#EA580C]">
                  <Sparkles className="w-4 h-4" />
                  <span>Metadata Retrieved</span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-[#F2EDE4] px-2 py-0.5 rounded text-[#5A4D44]">
                  {metadata.source.replace('_', ' ')}
                </span>
              </div>

              {/* Book Overview Preview */}
              <div className="flex gap-4">
                <div className="w-20 aspect-2/3 rounded bg-[#F2EDE4] overflow-hidden shrink-0 border border-[#E5E0D8]">
                  {metadata.coverUrl ? (
                    <img
                      src={metadata.coverUrl}
                      alt={metadata.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    className="w-full font-bold text-sm text-[#2C221E] border-b border-transparent hover:border-[#D4CDC3] focus:border-[#EA580C] focus:outline-hidden"
                    placeholder="Book Title"
                    required
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
                    className="w-full text-xs text-[#7E6F64] border-b border-transparent hover:border-[#D4CDC3] focus:border-[#EA580C] focus:outline-hidden"
                    placeholder="Authors (comma-separated)"
                  />
                  <div className="pt-1 text-[11px] font-mono text-[#A89F91]">
                    ISBN: {formatIsbn(metadata.isbn13)}
                  </div>
                </div>
              </div>

              {/* Editable Bibliographic Details */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                    Publisher
                  </label>
                  <input
                    type="text"
                    value={metadata.publisher || ''}
                    onChange={(e) => setMetadata({ ...metadata, publisher: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                    placeholder="Publisher name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                    Publication Year
                  </label>
                  <input
                    type="number"
                    value={metadata.publicationYear || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, publicationYear: parseInt(e.target.value, 10) || undefined })
                    }
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono"
                    placeholder="e.g. 2024"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Primary Category
                </label>
                <input
                  type="text"
                  value={metadata.categories[0] || ''}
                  onChange={(e) => setMetadata({ ...metadata, categories: [e.target.value] })}
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                  placeholder="e.g. Computer Science"
                />
              </div>

              {/* Physical Inventory Copies Configuration Section */}
              <div className="pt-3 border-t border-[#F0ECE4] space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#2C221E]">
                  <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Physical Inventory Copies</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Copies to Generate
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={copyCount}
                      onChange={(e) => setCopyCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Condition
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                    >
                      <option>Like New</option>
                      <option>Good</option>
                      <option>Fair</option>
                      <option>Worn</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Shelf Location
                    </label>
                    <input
                      type="text"
                      value={shelfLocation}
                      onChange={(e) => setShelfLocation(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Rack Number
                    </label>
                    <input
                      type="text"
                      value={rackNumber}
                      onChange={(e) => setRackNumber(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={acquisitionPrice}
                      onChange={(e) => setAcquisitionPrice(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Source
                    </label>
                    <input
                      type="text"
                      value={acquisitionSource}
                      onChange={(e) => setAcquisitionSource(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action */}
              <div className="pt-3 border-t border-[#F0ECE4] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMetadata(null)}
                  className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save to Supabase Catalog</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="h-full min-h-[320px] bg-white border border-dashed border-[#D4CDC3] rounded-xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-[#A89F91] mb-3">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#2C221E] mb-1">
                Metadata Review Staging
              </h3>
              <p className="text-xs text-[#7E6F64] max-w-xs leading-relaxed">
                Scan a barcode or enter an ISBN to pull bibliographic metadata from Open Library & Google Books.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
