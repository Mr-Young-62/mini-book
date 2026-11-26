import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from '@zxing/library';
import { Flashlight, RotateCcw, ImagePlus, Camera, Search, AlertCircle, X } from 'lucide-react';
import { resolveScannedCode, type ResolvedCode } from '../../services/codeResolver';

type Engine = 'native' | 'zxing';
type ScanChoice = { rawValue: string; format: string; engine: Engine };
type LastSeen = { text: string; count: number; at: number; firstSeen: number; format: string; engine: Engine };

const FORMATS = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
  BarcodeFormat.ITF, BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
];

const NATIVE_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix',
];

function formatLabel(format: string) {
  return format.toUpperCase().replace(/_/g, ' ');
}

interface Props {
  onDetected?: (result: ResolvedCode) => void;
  onScan?: (rawText: string) => void;
  onClose?: () => void;
  active?: boolean;
  isProcessing?: boolean;
  onResetScan?: () => void;
}

export function BarcodeScanner({ onDetected, onScan, onClose, active = true, isProcessing = false, onResetScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastRef = useRef<LastSeen>({ text: '', count: 0, at: 0, firstSeen: 0, format: '', engine: 'zxing' });
  const doneRef = useRef(false);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [manual, setManual] = useState('');
  const [hint, setHint] = useState('Arahkan kamera ke barcode / QR di buku');
  const [rawValue, setRawValue] = useState('');
  const [detectedFormat, setDetectedFormat] = useState('');
  const [scanChoices, setScanChoices] = useState<ScanChoice[]>([]);

  const emitRef = useRef<((raw: string, format?: string, engine?: Engine) => boolean) | null>(null);

  const resetScanState = useCallback(() => {
    doneRef.current = false;
    lastRef.current = { text: '', count: 0, at: 0, firstSeen: 0, format: '', engine: 'zxing' };
    setRawValue('');
    setDetectedFormat('');
    setScanChoices([]);
    setHint('Arahkan kamera ke barcode / QR di buku');
    setError('');
  }, []);

  const emit = useCallback((raw: string, format?: string, engine: Engine = 'zxing') => {
    const value = (raw || '').trim();
    if (!value || doneRef.current || isProcessing) return false;

    // Tandai selesai segera agar decode cepat berikutnya tidak melewati pengecekan.
    doneRef.current = true;

    const resolved = resolveScannedCode(value);
    setRawValue(value);
    setDetectedFormat(format ? formatLabel(format) : 'UNKNOWN');

    if (resolved.kind === 'invalid_isbn') {
      setHint(`Kode ${resolved.digits} terbaca, tetapi checksum ISBN tidak valid. Coba dekatkan / luruskan dan pindai ulang.`);
      onScan?.(value);
      onDetected?.(resolved);
      return true;
    }

    if (resolved.kind === 'unknown') {
      setHint(`Kode berhasil dibaca: ${value}. Kode ini bukan ISBN. Gunakan kode ini untuk pemeriksaan manual.`);
      onScan?.(value);
      onDetected?.(resolved);
      return true;
    }

    navigator.vibrate?.(60);
    onScan?.(value);
    onDetected?.(resolved);
    if (onResetScan) onResetScan();
    return true;
  }, [onDetected, onResetScan, onScan]);

  emitRef.current = emit;

  useEffect(() => {
    if (!active) return;
    resetScanState();
  }, [active]);

  const handleDecoded = useCallback((text: string, format: string, engine: Engine) => {
    const value = text.trim();
    if (!value || doneRef.current || isProcessing) return;

    const now = Date.now();
    const last = lastRef.current;
    if (last.text && last.text.toLowerCase() === value.toLowerCase()) {
      last.count += 1;
      last.at = now;
      last.format = format;
      last.engine = engine;
      if (last.count >= 2 && now - last.firstSeen <= 6000 && emitRef.current) {
        emitRef.current(value, format, engine);
      }
      return;
    }

    if (!last.text || now - last.at > 3000) {
      lastRef.current = { text: value, count: 1, at: now, firstSeen: now, format, engine };
      return;
    }

    lastRef.current = { text: value, count: 1, at: now, firstSeen: now, format, engine };
    if (lastRef.current.count >= 2 && now - lastRef.current.firstSeen <= 8000 && emitRef.current) {
      emitRef.current(value, format, engine);
    }
  }, [isProcessing]);

  const nativeFrameRef = useRef(0);
useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let reader: BrowserMultiFormatReader | null = null;

    const stopStream = () => {
      cancelAnimationFrame(rafId);
      reader?.reset();
      readerRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const startZxing = async (video: HTMLVideoElement) => {
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const zxingReader = new BrowserMultiFormatReader(hints, 100);
      reader = zxingReader;
      readerRef.current = zxingReader;

      try {
        const streamConstraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' } as any, { zoom: 1.0 } as any],
          },
        };
        await zxingReader.decodeFromConstraints(
          streamConstraints,
          video,
          (result) => {
            if (!result || cancelled || doneRef.current || isProcessing) return;
            const fmt = result.getBarcodeFormat();
            handleDecoded(result.getText(), fmt.toString(), 'zxing');
          }
        );
      } catch (e: any) {
        if (!cancelled && !doneRef.current) {
          setError(e?.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.'
            : `Kamera gagal dibuka: ${e?.message || e}`);
        }
      }
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera tidak tersedia. Buka lewat HTTPS (atau localhost) dan izinkan akses kamera.');
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' } as any, { zoom: 1.0 } as any],
        },
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        if (track && 'getCapabilities' in track) {
          const capabilities = track.getCapabilities?.() as any;
          if (capabilities?.focusMode) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => undefined);
          }
          if (capabilities?.torch) {
            await track.applyConstraints({ advanced: [{ torch: torchOn } as any] }).catch(() => undefined);
          }
        }

        const Native = (window as any).BarcodeDetector;
        if (typeof Native === 'function') {
          try {
            const supported: string[] = await Native.getSupportedFormats?.() || [];
            const supportedFormats = NATIVE_FORMATS.filter((format) => supported.includes(format));
            if (supportedFormats.length > 0) {
              const detector = new Native({ formats: supportedFormats });
              const tick = async () => {
                if (cancelled || doneRef.current || isProcessing) return;
                try {
                  nativeFrameRef.current++;
                  if (nativeFrameRef.current % 3 !== 0) {
                    rafId = requestAnimationFrame(tick);
                    return;
                  }
                  const codes = await detector.detect(video);
                  if (Array.isArray(codes) && codes.length > 0) {
                    const first = codes[0];
                    handleDecoded(first.rawValue, first.format || 'UNKNOWN', 'native');
                  }
                } catch {
                  await startZxing(video);
                  return;
                }

                if (!cancelled && !doneRef.current && !isProcessing) {
                  rafId = requestAnimationFrame(tick);
                }
              };

              tick();
              return;
            }
          } catch {
            // Fallback immediately to ZXing instead of leaving the scanner dead.
          }
        }

        await startZxing(video);
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.'
          : `Kamera gagal dibuka: ${e?.message || e}`);
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, handleDecoded, isProcessing, torchOn]);

  async function toggleTorch() {
    const video = videoRef.current;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    try {
      if (track && 'applyConstraints' in track) {
        const next = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: next } as any] } as any);
        setTorchOn(next);
        setHint(next ? 'Flashlight aktif' : 'Flashlight dimatikan');
        return;
      }
      setHint('Senter tidak didukung perangkat ini');
    } catch {
      setHint('Senter tidak didukung perangkat ini');
    }
  }

  async function onPickImage(file?: File) {
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();

      const Native = (window as any).BarcodeDetector;
      const imageResults: ScanChoice[] = [];

      if (typeof Native === 'function') {
        try {
          const supported: string[] = await Native.getSupportedFormats?.() || [];
          const supportedFormats = NATIVE_FORMATS.filter((format) => supported.includes(format));
          if (supportedFormats.length > 0) {
            const detector = new Native({ formats: supportedFormats });
            const codes = await detector.detect(image);
            for (const code of codes || []) {
              imageResults.push({ rawValue: code.rawValue, format: code.format || 'UNKNOWN', engine: 'native' });
            }
          }
        } catch {
          // continue to ZXing fallback below
        }
      }

      if (imageResults.length === 0) {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, 100);
        const result = await reader.decodeFromImageUrl(objectUrl);
        imageResults.push({ rawValue: result.getText(), format: result.getBarcodeFormat().toString(), engine: 'zxing' });
      }

      if (imageResults.length === 1 && emitRef.current) {
        emitRef.current(imageResults[0].rawValue, imageResults[0].format, imageResults[0].engine);
        return;
      }

      if (imageResults.length > 1) {
        setScanChoices(imageResults);
        setHint('Beberapa kode ditemukan di foto. Pilih kode yang benar.');
      } else {
        setHint('Tidak ada barcode/QR terbaca di foto. Pastikan terang & tidak buram.');
      }
    } catch {
      setHint('Tidak ada barcode/QR terbaca di foto. Pastikan terang & tidak buram.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const chooseImageResult = (choice: ScanChoice) => {
    setScanChoices([]);
    if (emitRef.current) {
      emitRef.current(choice.rawValue, choice.format, choice.engine);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#ECEEF2] bg-white p-4 shadow-2xs sm:p-5">
      {/* Camera Viewfinder */}
      <div className="relative overflow-hidden rounded-2xl bg-[#14181F] aspect-[4/3] shadow-inner">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* Subtle Viewfinder Corner Brackets */}
        <div className="pointer-events-none absolute inset-5">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-white/75" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-white/75" />
          <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-white/75" />
          <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-white/75" />
        </div>

        {/* Status Pill */}
        <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-[#F06449]' : 'bg-emerald-400 animate-pulse'}`} />
          <span>{error ? 'Camera Unavailable' : 'Live Scanner'}</span>
        </div>

        {/* Laser Line */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[#F06449] shadow-[0_0_12px_rgba(240,100,73,0.9)]" />
      </div>

      {/* Status / Error Message */}
      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span className="leading-relaxed">{error}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-[#F5F6F8] px-3.5 py-2.5 text-xs text-[#4B5563]">
          <Camera className="h-4 w-4 shrink-0 text-[#18362F]" />
          <span>{hint}</span>
        </div>
      )}

      {rawValue && (
        <div className="rounded-xl border border-[#ECEEF2] bg-[#F5F6F8] p-3 text-xs">
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#6E737D]">
            <span>Terakhir dibaca</span>
            <span>{detectedFormat || 'UNKNOWN'}</span>
          </div>
          <div className="mt-1 break-all font-mono text-[#14181F]">{rawValue}</div>
        </div>
      )}

      {scanChoices.length > 0 && (
        <div className="rounded-xl border border-[#ECEEF2] bg-[#F5F6F8] p-3 text-xs">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#6E737D]">
            Pilih kode dari foto
          </div>
          <div className="space-y-2">
            {scanChoices.map((choice, index) => (
              <button
                key={`${choice.rawValue}-${index}`}
                type="button"
                onClick={() => chooseImageResult(choice)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-left font-mono text-[11px] text-[#14181F] transition hover:border-[#18362F]"
              >
                {choice.format} · {choice.rawValue}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scanner Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleTorch}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
            torchOn
              ? 'bg-[#F06449] text-white shadow-[0_6px_14px_-4px_rgba(240,100,73,0.45)]'
              : 'border border-[#E5E7EB] bg-[#F5F6F8] text-[#14181F] hover:bg-[#ECEEF2]'
          }`}
        >
          <Flashlight className="h-3.5 w-3.5" />
          <span>{torchOn ? 'Matikan Senter' : 'Senter'}</span>
        </button>

        <button
          type="button"
          onClick={resetScanState}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3.5 py-2 text-xs font-semibold text-[#14181F] transition hover:bg-[#ECEEF2]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>

        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3.5 py-2 text-xs font-semibold text-[#14181F] transition hover:bg-[#ECEEF2]">
          <ImagePlus className="h-3.5 w-3.5" />
          <span>Scan Foto</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPickImage(e.target.files?.[0])}
          />
        </label>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-semibold text-[#6E737D] hover:bg-[#F5F6F8]"
          >
            <X className="h-3.5 w-3.5" />
            <span>Tutup</span>
          </button>
        )}
      </div>

      {/* Quick Code Input */}
      <div className="flex gap-2 pt-1">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Ketik ISBN / kode manual"
          className="min-h-[42px] flex-1 rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3.5 py-2 text-xs text-[#14181F] placeholder-[#9CA3AF] outline-none focus:border-[#18362F] focus:bg-white"
          inputMode="text"
        />
        <button
          type="button"
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#18362F] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_14px_-4px_rgba(24,54,47,0.35)] transition hover:bg-[#112822] hover:shadow-[0_8px_18px_-4px_rgba(24,54,47,0.45)] active:scale-95"
          onClick={() => {
            resetScanState();
            if (emitRef.current) emitRef.current(manual);
          }}
        >
          <Search className="h-3.5 w-3.5" />
          <span>Cari</span>
        </button>
      </div>
    </div>
  );
}

export default BarcodeScanner;