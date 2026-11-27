import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from '@zxing/library';
import { Flashlight, RotateCcw, ImagePlus, Camera, AlertCircle, X } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastRef = useRef<LastSeen>({ text: '', count: 0, at: 0, firstSeen: 0, format: '', engine: 'zxing' });
  const doneRef = useRef(false);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
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
    const cleanedFormat =
      format && format.toUpperCase() !== 'UNKNOWN'
        ? formatLabel(format)
        : resolved.kind === 'isbn'
        ? 'ISBN'
        : '';
    setDetectedFormat(cleanedFormat);

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
            ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan peramban.'
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
          ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan peramban.'
          : `Kamera gagal dibuka: ${e?.message || e}`);
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, handleDecoded, isProcessing, torchOn, cameraRetryKey]);

  async function toggleTorch() {
    const video = videoRef.current;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    try {
      if (track && 'applyConstraints' in track) {
        const next = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: next } as any] } as any);
        setTorchOn(next);
        setHint(next ? 'Senter aktif' : 'Senter dimatikan');
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

  const retryCamera = () => {
    setError('');
    resetScanState();
    setCameraRetryKey((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-3.5 sm:p-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void onPickImage(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {error ? (
        <>
          <video ref={videoRef} className="hidden" playsInline muted />
          <div className="rounded-[14px] bg-[#262925] p-5 sm:p-6 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-white/10 text-[#F7EAE4]">
                <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[15px] font-semibold">Kamera tidak aktif</p>
                <p className="text-[13px] leading-[1.5] text-white/80">
                  {error} Gunakan foto sampul belakang atau ketik <span className="acronym">ISBN</span> manual di bawah.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retryCamera}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-[12px] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#262925] hover:bg-[#ECE8DF]"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                <span>Coba buka kamera</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary-tactile inline-flex min-h-[42px] items-center gap-1.5 rounded-[12px] px-4 py-2 text-[13px] font-semibold"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                <span>Pindai dari foto</span>
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-[12px] bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-white/20"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>Tutup</span>
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-[14px] bg-[#262925] aspect-[4/3] sm:aspect-[16/10]">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

            <div className="pointer-events-none absolute inset-5">
              <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-white/80" />
              <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-white/80" />
              <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-white/80" />
              <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-white/80" />
            </div>

            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-[12px] font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Kamera aktif</span>
            </div>

            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[#B9543A]/90" />
          </div>

          <div className="flex items-center gap-2 border-t border-[#ECE7DD] pt-3 text-[13px] font-medium text-[#262925]">
            <Camera className="h-4 w-4 shrink-0 text-[#1F6F5B]" strokeWidth={1.5} aria-hidden="true" />
            <span>{hint}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleTorch}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] px-4 py-2 text-[13px] font-semibold transition-colors ${
                torchOn
                  ? 'bg-[#B9543A] text-white'
                  : 'bg-[#F2EFE8] text-[#262925] hover:bg-[#E7E2D7]'
              }`}
            >
              <Flashlight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>{torchOn ? 'Matikan senter' : 'Senter'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetScanState();
                onResetScan?.();
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[#F2EFE8] px-4 py-2 text-[13px] font-semibold text-[#262925] hover:bg-[#E7E2D7]"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>Ulangi</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[#F2EFE8] px-4 py-2 text-[13px] font-semibold text-[#262925] hover:bg-[#E7E2D7]"
            >
              <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>Dari foto</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[#F2EFE8] px-4 py-2 text-[13px] font-semibold text-[#262925] hover:bg-[#E7E2D7]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                <span>Tutup</span>
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-[12px] bg-[#F7EAE4] px-3.5 py-2.5 text-[12px] font-medium text-[#9E4028]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9543A]" strokeWidth={1.5} aria-hidden="true" />
          <span className="leading-[1.5]">
            Tips: di Chrome/Edge, klik ikon gembok di bilah alamat untuk mengizinkan akses kamera.
          </span>
        </div>
      )}

      {rawValue && (
        <div className="border-t border-[#ECE7DD] pt-3 text-xs">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#686C65]">
            <span>Terakhir dibaca</span>
            {detectedFormat && <span>{detectedFormat}</span>}
          </div>
          <div className="mt-1 break-all font-mono text-[13px] text-[#262925]">{rawValue}</div>
        </div>
      )}

      {scanChoices.length > 0 && (
        <div className="border-t border-[#ECE7DD] pt-3 text-xs">
          <div className="mb-2 text-[12px] font-semibold text-[#686C65]">
            Pilih kode dari foto
          </div>
          <div className="space-y-2">
            {scanChoices.map((choice, index) => (
              <button
                key={`${choice.rawValue}-${index}`}
                type="button"
                onClick={() => chooseImageResult(choice)}
                className="w-full rounded-[12px] bg-[#F2EFE8] px-3.5 py-2.5 text-left font-mono text-[12px] text-[#262925] hover:bg-[#E7E2D7]"
              >
                {choice.format} · {choice.rawValue}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BarcodeScanner;