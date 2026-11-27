import React, { useEffect, useId, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  BookPalette,
  extractBookPalette,
  extractPaletteFromImageElement,
  getCachedBookPalette,
  getFallbackBookPalette,
  normalizeCoverUrl,
} from '../lib/bookColor';

type BookCardSize = 'xs' | 'sm' | 'md' | 'lg';

interface BookCardProps {
  coverUrl?: string;
  alternateCoverUrl?: string;
  title: string;
  author?: string;
  seed?: string;
  size?: BookCardSize;
  showRibbon?: boolean;
  priority?: boolean;
  unavailable?: boolean;
  className?: string;
}

const IMAGE_DIMS: Record<BookCardSize, { width: number; height: number; cornerRadius: string }> = {
  xs: { width: 48, height: 78, cornerRadius: '0 3px 3px 0' },
  sm: { width: 120, height: 196, cornerRadius: '0 5px 5px 0' },
  md: { width: 176, height: 288, cornerRadius: '0 6px 6px 0' },
  lg: { width: 224, height: 367, cornerRadius: '0 7px 7px 0' },
};

export const BookCard: React.FC<BookCardProps> = ({
  coverUrl,
  alternateCoverUrl,
  title,
  author,
  seed,
  size = 'md',
  showRibbon,
  priority = false,
  unavailable = false,
  className = '',
}) => {
  const paletteSeed = seed || title || 'book';
  const [activeSrc, setActiveSrc] = useState<string | undefined>(() =>
    normalizeCoverUrl(coverUrl),
  );
  const [useCors, setUseCors] = useState(true);
  const [triedAlternate, setTriedAlternate] = useState(false);
  const [imgFailed, setImgFailed] = useState(() => !normalizeCoverUrl(coverUrl));
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [palette, setPalette] = useState<BookPalette>(() =>
    getCachedBookPalette(coverUrl) ?? getFallbackBookPalette(paletteSeed),
  );

  useEffect(() => {
    const normalized = normalizeCoverUrl(coverUrl);
    setActiveSrc(normalized);
    setUseCors(true);
    setTriedAlternate(false);
    setImgFailed(!normalized);
    setFitMode('contain');
    setPalette(getCachedBookPalette(normalized) ?? getFallbackBookPalette(paletteSeed));
  }, [coverUrl, paletteSeed]);

  useEffect(() => {
    if (!activeSrc) return;
    const cached = getCachedBookPalette(activeSrc);
    if (cached) {
      setPalette(cached);
      return;
    }

    let cancelled = false;
    void extractBookPalette(activeSrc, paletteSeed).then((resolved) => {
      if (!cancelled) {
        setPalette(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSrc, paletteSeed]);

  const handleImageError = () => {
    if (useCors) {
      setUseCors(false);
      if (activeSrc) {
        void extractBookPalette(activeSrc, paletteSeed).then((resolved) => {
          setPalette(resolved);
        });
      }
      return;
    }

    const alt = normalizeCoverUrl(alternateCoverUrl);
    if (!triedAlternate && alt && alt !== activeSrc) {
      setTriedAlternate(true);
      setUseCors(true);
      setActiveSrc(alt);
      setImgFailed(false);
      return;
    }
    setImgFailed(true);
  };

  const dims = IMAGE_DIMS[size];
  const hasImage = Boolean(activeSrc && !imgFailed);
  const renderRibbon = showRibbon ?? (size === 'sm' || size === 'md' || size === 'lg');
  const rawUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const spineGradId = `book-spine-${rawUid}`;
  const pagesGradId = `book-pages-${rawUid}`;
  const ribbonGradId = `book-ribbon-${rawUid}`;

  return (
    <div
      className={`relative aspect-[136/223] select-none transition-[filter,opacity,transform] duration-200 group-hover:-translate-y-0.5 drop-shadow-[0_4px_10px_rgba(38,41,37,0.08)] ${
        unavailable ? 'grayscale opacity-65 saturate-0' : ''
      } ${className}`}
    >
      {/* 3-tone hardcover geometry matching asset/book asset.svg with unobstructed front cover */}
      <svg
        viewBox="0 0 136 223"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient
            id={spineGradId}
            x1="67.5"
            y1="0"
            x2="67.5"
            y2="214"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={palette.spine} />
            <stop offset="1" stopColor={palette.spineBottom} />
          </linearGradient>
          <linearGradient
            id={pagesGradId}
            x1="8"
            y1="198"
            x2="135"
            y2="198"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#EED5B8" />
            <stop offset="1" stopColor="#F1DDC5" />
          </linearGradient>
        </defs>

        {/* Shadow 1: Rounded left spine + casing body */}
        <path
          d="M128 0C131.866 0 135 3.13401 135 7V208C135 211.314 132.314 214 129 214H18C8.05887 214 0 205.941 0 196V16C0 7.16344 7.16344 0 16 0H128Z"
          fill={`url(#${spineGradId})`}
        />

        {/* Base: Front cover surface */}
        <path
          d="M129 0H12V182H135V6C135 2.68629 132.314 0 129 0Z"
          fill={hasImage ? palette.edge : palette.cover}
        />

        {/* Hinge crease seated on spine seam outside the artwork area */}
        <rect x="10.5" y="0" width="1.5" height="182" fill="#000000" fillOpacity="0.16" />

        {/* Shadow 2: Darkest curved bottom C-wrap */}
        <path
          d="M0 196C0 188.268 6.26801 182 14 182H135V208C135 211.314 132.314 214 129 214H18C8.05887 214 0 205.941 0 196Z"
          fill={palette.bottomWrap}
        />

        {/* Cream page block tucked inside curved C-wrap */}
        <path
          d="M8 198C8 193.029 12.0294 189 17 189H135V207H17C12.0294 207 8 202.971 8 198Z"
          fill={`url(#${pagesGradId})`}
        />
        <rect x="13" y="189" width="122" height="1.5" fill="#262925" fillOpacity="0.06" />
        <path d="M15 195H135" stroke="#DECBB0" />
        <path d="M15 201H135" stroke="#DECBB0" />
      </svg>

      {/* Flush cover artwork layer aligned to x=12..135, y=0..182 */}
      <div
        style={{
          left: '8.8235%',
          top: 0,
          right: '0.7353%',
          height: '81.6143%',
          borderRadius: dims.cornerRadius,
          backgroundColor: hasImage ? palette.edge : palette.cover,
        }}
        className="absolute overflow-hidden flex items-center justify-center ring-1 ring-inset ring-black/[0.06]"
      >
        {hasImage ? (
          <img
            src={activeSrc}
            alt={title}
            width={dims.width}
            height={dims.height}
            crossOrigin={useCors ? 'anonymous' : undefined}
            referrerPolicy="no-referrer"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                const ratio = naturalWidth / naturalHeight;
                setFitMode(ratio >= 0.64 && ratio <= 0.71 ? 'cover' : 'contain');
              }
              if (useCors) {
                const derived = extractPaletteFromImageElement(event.currentTarget, activeSrc);
                if (derived) {
                  setPalette(derived);
                }
              }
            }}
            onError={handleImageError}
            className={`h-full w-full ${fitMode === 'cover' ? 'object-cover object-top' : 'object-contain'}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center px-2.5 py-2 text-center text-white">
            <BookOpen
              className={size === 'xs' ? 'h-3.5 w-3.5 opacity-90' : 'mb-1.5 h-5 w-5 opacity-90'}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {size !== 'xs' && (
              <>
                <span className="font-book line-clamp-3 text-[11px] font-semibold leading-tight text-white">
                  {title || 'Tanpa sampul'}
                </span>
                {author && (
                  <span className="mt-1 line-clamp-1 text-[10px] text-white/80">
                    {author}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Compact foreground swallowtail bookmark ribbon with gradient & tucked fold shadow */}
      {renderRibbon && (
        <svg
          viewBox="0 0 136 223"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient
              id={ribbonGradId}
              x1="107"
              y1="193"
              x2="107"
              y2="220"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={palette.ribbon} />
              <stop offset="1" stopColor={palette.ribbonEnd} />
            </linearGradient>
          </defs>
          <path
            d="M97 193H117V219.2C117 219.8 116.45 220.25 115.85 220.1L107 217.9L98.15 220.1C97.55 220.25 97 219.8 97 219.2V193Z"
            fill={`url(#${ribbonGradId})`}
          />
          <rect x="97" y="193" width="20" height="1.8" fill="#262925" fillOpacity="0.12" />
        </svg>
      )}
    </div>
  );
};
