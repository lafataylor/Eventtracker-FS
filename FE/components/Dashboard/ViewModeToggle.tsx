import React from 'react';

interface ViewModeToggleProps {
  /** true = compact list, false = big flyer cards */
  isList: boolean;
  onChange: (isList: boolean) => void;
  className?: string;
}

/**
 * Narrow icon pill: portrait flyer | compact rows.
 * Fixed 46px height to match SearchBar + filter button.
 */
function ViewModeToggle({ isList, onChange, className = '' }: ViewModeToggleProps) {
  return (
    <div
      className={`inline-flex !h-12 min-h-12 max-h-12 box-border items-stretch rounded-lg border-2 border-slate-black overflow-hidden ${className}`}
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        aria-label="Big flyer view"
        aria-pressed={!isList}
        onClick={() => onChange(false)}
        className={`flex h-full w-9 items-center justify-center transition-colors ${
          !isList
            ? 'bg-beaming-orange text-black'
            : 'bg-transparent text-mist-white opacity-50'
        }`}
      >
        {/* Vertical rectangle ≈ flyer card aspect */}
        <svg width="12" height="16" viewBox="0 0 14 18" fill="none" aria-hidden="true">
          <rect
            x="1.5"
            y="1.5"
            width="11"
            height="15"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Compact list view"
        aria-pressed={isList}
        onClick={() => onChange(true)}
        className={`flex h-full w-9 items-center justify-center border-l-2 border-slate-black transition-colors ${
          isList
            ? 'bg-beaming-orange text-black'
            : 'bg-transparent text-mist-white opacity-50'
        }`}
      >
        {/* Rows with left thumb — not a hamburger */}
        <svg width="14" height="12" viewBox="0 0 16 14" fill="none" aria-hidden="true">
          <rect x="0.75" y="0.75" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 2.75h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="0.75" y="9.25" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 11.25h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default ViewModeToggle;
