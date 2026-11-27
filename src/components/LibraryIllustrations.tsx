import React from 'react';
import bookStackUrl from '../assets/book-stack.svg';
import libraryCardUrl from '../assets/library-card.svg';
import magnifierUrl from '../assets/magnifier.svg';
import openBookUrl from '../assets/open-book.svg';
import readingCandlesUrl from '../assets/reading-candles.svg';
import stickyNoteUrl from '../assets/sticky-note.svg';

interface EmptyIllustrationProps {
  compact?: boolean;
  className?: string;
}

export const ReadingCornerEmptyIllustration: React.FC<EmptyIllustrationProps> = ({
  compact = false,
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none flex flex-col items-center ${className}`}
    >
      <div className="flex items-end justify-center gap-3 px-2 -mb-px">
        <img
          src={bookStackUrl}
          alt=""
          width={159}
          height={224}
          className={compact ? 'block h-16 w-auto' : 'block h-22 w-auto'}
        />
        <img
          src={readingCandlesUrl}
          alt=""
          width={43}
          height={59}
          className={compact ? 'block h-7 w-auto' : 'block h-9 w-auto'}
        />
      </div>
      <div className="h-px w-36 bg-[#E8E3D9]" />
    </div>
  );
};

interface SimpleIllustrationProps {
  className?: string;
}

export const EmptySearchIllustration: React.FC<SimpleIllustrationProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none flex justify-center ${className}`}
    >
      <img
        src={magnifierUrl}
        alt=""
        width={72}
        height={72}
        className="block h-11 w-auto"
      />
    </div>
  );
};

export const EmptyLoansIllustration: React.FC<SimpleIllustrationProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none flex flex-col items-center ${className}`}
    >
      <div className="flex items-end justify-center gap-3 px-2 -mb-px">
        <img
          src={bookStackUrl}
          alt=""
          width={159}
          height={224}
          className="block h-16 w-auto"
        />
        <img
          src={libraryCardUrl}
          alt=""
          width={116}
          height={78}
          className="block h-10 w-auto"
        />
      </div>
      <div className="h-px w-36 bg-[#E8E3D9]" />
    </div>
  );
};

export const ScannerPreviewEmptyIllustration: React.FC<SimpleIllustrationProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none flex flex-col items-center ${className}`}
    >
      <div className="relative flex items-end justify-center px-3 -mb-px">
        <img
          src={openBookUrl}
          alt=""
          width={128}
          height={90}
          className="block h-[70px] w-auto"
        />
        <img
          src={magnifierUrl}
          alt=""
          width={72}
          height={72}
          className="block h-10 w-auto -ml-4 mb-0.5 relative z-10"
        />
      </div>
      <div className="h-px w-36 bg-[#E8E3D9]" />
    </div>
  );
};

export const LoanEmptyCardAccent: React.FC<SimpleIllustrationProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none shrink-0 flex items-end gap-2 ${className}`}
    >
      <img
        src={bookStackUrl}
        alt=""
        width={159}
        height={224}
        className="block h-12 w-auto"
      />
      <img
        src={readingCandlesUrl}
        alt=""
        width={43}
        height={59}
        className="block h-5.5 w-auto"
      />
    </div>
  );
};

export const EmptyNotesAccent: React.FC<SimpleIllustrationProps> = ({
  className = '',
}) => {
  return (
    <img
      src={stickyNoteUrl}
      alt=""
      aria-hidden="true"
      width={68}
      height={68}
      className={`pointer-events-none select-none block h-8 w-auto shrink-0 ${className}`}
    />
  );
};
