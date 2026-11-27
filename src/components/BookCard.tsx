import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  BookPalette,
  extractBookPalette,
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
  className = '',
}) => {
  const paletteSeed = seed || title || 'book';
  const [activeSrc, setActiveSrc] = useState<string | undefined>(() =>
    normalizeCoverUrl(coverUrl),
  );
  const [triedAlternate, setTriedAlternate] = useState(false);
  const [imgFailed, setImgFailed] = useState(() => !normalizeCoverUrl(coverUrl));
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [palette, setPalette] = useState<BookPalette>(() =>
    getFallbackBookPalette(paletteSeed),
  );

  useEffect(() => {
    const normalized = normalizeCoverUrl(coverUrl);
    setActiveSrc(normalized);
    setTriedAlternate(false);
    setImgFailed(!normalized);
    setFitMode('contain');
  }, [coverUrl]);

  useEffect(() => {
    let cancelled = false;
    setPalette(getFallbackBookPalette(paletteSeed));
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
    const alt = normalizeCoverUrl(alternateCoverUrl);
    if (!triedAlternate && alt && alt !== activeSrc) {
      setTriedAlternate(true);
      setActiveSrc(alt);
      setImgFailed(false);
      return;
    }
    setImgFailed(true);
  };

  const dims = IMAGE_DIMS[size];
  const hasImage = Boolean(activeSrc && !imgFailed);
  const renderRibbon = showRibbon ?? (size === 'sm' || size === 'md' || size === 'lg');

  return (
    <div className={`relative aspect-[136/223] select-none ${className}`}>
      {/* Hardcover spine, curved C-wrap bottom, and cream page block (136x223 proportions) */}
      <svg
        viewBox="0 0 136 223"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {/* Outer spine + continuous bottom wrap */}
        <path
          d="M 15 0 H 130 A 6 6 0 0 1 136 6 V 208 A 6 6 0 0 1 130 214 H 21 A 21 21 0 0 1 0 193 V 15 A 15 15 0 0 1 15 0 Z"
          fill={palette.spine}
        />

        {/* Subtle front hardcover backing */}
        <path
          d="M 16 0 H 130 A 6 6 0 0 1 136 6 V 166 A 6 6 0 0 1 130 172 H 16 Z"
          fill={hasImage ? palette.edge : palette.cover}
        />

        {/* Cream page block tucked inside curved C-wrap */}
        <path
          d="M 22 179 H 135 V 205 H 22 A 13 13 0 0 1 22 179 Z"
          fill="#EFE3D0"
        />
        <rect x="14" y="179" width="121" height="2.5" fill="#262925" fillOpacity="0.08" />
        <line x1="16" y1="187.5" x2="134" y2="187.5" stroke="#DFCBB0" strokeWidth="1" />
        <line x1="16" y1="196.5" x2="134" y2="196.5" stroke="#DFCBB0" strokeWidth="1" />
      </svg>

      {/* Flush cover artwork layer bound with hinge crease + subtle inset ring */}
      <div
        style={{
          left: '11.7647%',
          top: 0,
          right: 0,
          height: '77.13%',
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
            referrerPolicy="no-referrer"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                const ratio = naturalWidth / naturalHeight;
                setFitMode(ratio >= 0.58 && ratio <= 0.78 ? 'cover' : 'contain');
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

        {/* Delicate vertical binding hinge crease tying cover to spine */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-black/[0.12]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-[3px] w-px bg-white/25"
        />
      </div>

      {/* Foreground swallowtail bookmark ribbon with tucked fold shadow */}
      {renderRibbon && (
        <svg
          viewBox="0 0 136 223"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            d="M 98 179 H 116 V 221 L 107 215.5 L 98 221 Z"
            fill={palette.ribbon}
          />
          <rect x="98" y="179" width="18" height="2.5" fill="#262925" fillOpacity="0.14" />
        </svg>
      )}
    </div>
  );
};
