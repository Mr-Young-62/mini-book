import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Camera,
  CameraOff,
  Flashlight,
  RefreshCw,
  Volume2,
  VolumeX,
  AlertCircle,
  CheckCircle2,
  Upload,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13 } from '../../services/isbnValidator';

interface BarcodeScannerProps {
  onScan: (isbn: string) => void;
  isProcessing?: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, isProcessing = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lazily load @zxing/library (~large dependency) so it does not bloat the initial bundle
  const loadReader = async () => {
    if (readerRef.current) return readerRef.current;
    const zxing = await import('@zxing/library');
    readerRef.current = new zxing.BrowserMultiFormatReader();
    return readerRef.current;
  };

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);

  // Play a pleasant chime upon scan
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch {
      // AudioContext may be restricted before user gesture
    }
  };

  // Initialize and list video devices
  useEffect(() => {
    loadReader();

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setAvailableDevices(videoInputs);
          if (videoInputs.length > 0) {
            // Prefer back camera if available
            const backCamera = videoInputs.find(
              (d) =>
                d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
            );
            setSelectedDeviceId(backCamera?.deviceId || videoInputs[0].deviceId);
          } else {
            setHasCamera(false);
          }
        })
        .catch(() => {
          // In sandboxed iframes or restricted environments, enumeration may be silently blocked
          setHasCamera(false);
        });
    } else {
      setHasCamera(false);
    }

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (deviceId?: string) => {
    if (!videoRef.current || !readerRef.current) return;
    stopCamera();
    setErrorMsg(null);
    setIsPermissionDenied(false);

    const devId = deviceId || selectedDeviceId;

    try {
      setCameraActive(true);
      const reader = await loadReader();
      await reader.decodeFromVideoDevice(
        devId ? devId : null,
        videoRef.current,
        (result: any, err: any) => {
          if (result) {
            const raw = result.getText();
            const cleaned = cleanIsbn(raw);

            if (isValidIsbn(cleaned)) {
              const normalized = normalizeToIsbn13(cleaned);
              setLastScannedCode(normalized);
              playBeep();
              onScan(normalized);
            } else if (raw.length >= 8) {
              setLastScannedCode(raw);
              playBeep();
              onScan(raw);
            }
          }
          if (err && err.name !== 'NotFoundException') {
            // Frame misses are normal
          }
        }
      );

      // Check stream capabilities for torch
      const stream = videoRef.current.srcObject as MediaStream;
      streamRef.current = stream;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        setHasTorch(Boolean(capabilities.torch));
      }
    } catch (err: any) {
      setCameraActive(false);
      const isDenied =
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        (typeof err.message === 'string' && err.message.toLowerCase().includes('permission'));

      if (isDenied) {
        setIsPermissionDenied(true);
        setErrorMsg(
          Capacitor.isNativePlatform()
            ? 'Camera permission was denied. Enable it in Android Settings > Apps > Readowl > Permissions, then retry.'
            : 'Camera access was denied by your browser or sandbox permissions. You can retry permissions, upload a photo of the barcode, or enter the ISBN manually.'
        );
      } else {
        setErrorMsg(err.message || 'Unable to start camera.');
      }
    }
  };

  const stopCamera = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchEnabled(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchEnabled;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchEnabled(nextState);
      } catch {
        // Torch not supported
      }
    }
  };

  const switchCamera = (devId: string) => {
    setSelectedDeviceId(devId);
    if (cameraActive) {
      startCamera(devId);
    }
  };

  // Upload an image file of a barcode or book cover
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    try {
      setIsAnalyzingImage(true);
      const reader = await loadReader();
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = async () => {
        try {
          const result = await reader.decodeFromImageElement(img);
          URL.revokeObjectURL(objectUrl);
          setIsAnalyzingImage(false);

          if (result) {
            const raw = result.getText();
            const cleaned = cleanIsbn(raw);

            if (isValidIsbn(cleaned)) {
              const normalized = normalizeToIsbn13(cleaned);
              setLastScannedCode(normalized);
              playBeep();
              onScan(normalized);
            } else {
              setLastScannedCode(raw);
              playBeep();
              onScan(raw);
            }
          }
        } catch {
          URL.revokeObjectURL(objectUrl);
          setIsAnalyzingImage(false);
          setErrorMsg(
            'No barcode detected in the uploaded image. Please ensure the barcode is clearly visible, or enter the ISBN digits directly.'
          );
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setIsAnalyzingImage(false);
        setErrorMsg('Could not read the uploaded image file.');
      };

      img.src = objectUrl;
    } catch {
      setIsAnalyzingImage(false);
      setErrorMsg('Error analyzing barcode image.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl overflow-hidden p-4">
      {/* Hidden file input for uploading barcode photos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* Viewport Frame */}
      <div className="relative aspect-video max-w-2xl mx-auto bg-[#1C1613] rounded-lg overflow-hidden shadow-inner flex items-center justify-center">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-0 hidden'
          }`}
          playsInline
          muted
        />

        {!cameraActive && (
          <div className="p-8 text-center text-[#E5E0D8]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center text-[#F97316]">
              <Camera className="w-8 h-8" />
            </div>
            <h4 className="text-base font-semibold text-white mb-1">
              {isPermissionDenied ? 'Camera Access Restricted' : 'Camera Scanner Ready'}
            </h4>
            <p className="text-xs text-[#A89F91] max-w-xs mx-auto mb-5">
              {isPermissionDenied
                ? 'Camera access is blocked by browser or iframe policy. You can retry permissions or upload a barcode photo.'
                : 'Align the ISBN barcode on the book cover inside the reticle frame.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => startCamera()}
                disabled={isProcessing || isAnalyzingImage}
                className="px-5 py-2.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap"
              >
                {isPermissionDenied ? 'Retry Camera Permission' : 'Start Live Camera'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing || isAnalyzingImage}
                className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Barcode Photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Reticle Guide & Scanner Laser Overlay */}
        {cameraActive && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
            <div className="relative w-64 sm:w-80 h-40 border-2 border-[#EA580C]/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* Corner targeting indicators */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white" />

              {/* Scanning red/orange laser beam animation */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#EA580C] to-transparent shadow-[0_0_8px_#EA580C] animate-pulse absolute top-1/2 -translate-y-1/2" />
            </div>
            <span className="mt-3 text-[11px] font-medium text-white/90 bg-black/60 px-3 py-1 rounded backdrop-blur-xs">
              Point camera at ISBN / EAN-13 barcode
            </span>
          </div>
        )}

        {(isProcessing || isAnalyzingImage) && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center backdrop-blur-xs z-10">
            <RefreshCw className="w-7 h-7 text-[#EA580C] animate-spin mb-3" />
            <p className="text-white text-sm font-semibold">
              {isAnalyzingImage ? 'Decoding Barcode from Image...' : 'Querying Metadata APIs...'}
            </p>
            <p className="text-[#A89F91] text-xs">
              {isAnalyzingImage ? 'Detecting barcode patterns' : 'Checking Open Library & Google Books'}
            </p>
          </div>
        )}
      </div>

      {/* Camera Controls Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-[#E5E0D8] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {cameraActive ? (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D4CDC3] bg-white text-[#4A3E35] hover:bg-[#F5F2EB] font-medium transition-colors"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startCamera()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white hover:bg-[#C2410C] font-medium transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Open Camera</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D4CDC3] bg-white text-[#4A3E35] hover:bg-[#F5F2EB] font-medium transition-colors"
            title="Upload an image file containing a book barcode"
          >
            <ImageIcon className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Upload Photo</span>
          </button>

          {availableDevices.length > 1 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => switchCamera(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-[#D4CDC3] bg-white text-[#4A3E35] text-xs"
            >
              {availableDevices.map((dev, idx) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          {hasTorch && cameraActive && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-1.5 rounded-lg border transition-colors ${
                torchEnabled
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'bg-white text-[#4A3E35] border-[#D4CDC3]'
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-lg border border-[#D4CDC3] bg-white text-[#4A3E35] hover:bg-[#F5F2EB] transition-colors"
            title={soundEnabled ? 'Mute Beep' : 'Enable Beep'}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>

        {lastScannedCode && (
          <div className="flex items-center gap-1.5 text-xs text-[#2C221E] font-mono tabular-nums bg-white px-2.5 py-1 rounded border border-[#E5E0D8]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[#6B5E55]">Detected:</span>
            <span className="font-semibold">{lastScannedCode}</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{errorMsg}</p>
            {isPermissionDenied && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded font-semibold text-[11px] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 rounded font-semibold text-[11px] inline-flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Barcode Photo</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
