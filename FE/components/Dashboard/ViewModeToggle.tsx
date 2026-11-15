import React from 'react';
import { ViewMode, ViewModeLayout, VIEW_MODE_ORDER } from '../../utils/viewMode';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  layout: ViewModeLayout;
  className?: string;
}

const LABELS: Record<ViewMode, string> = {
  masonry: 'Masonry view',
  list: 'Compact list view',
  board: 'Grid view',
  flyer: 'Cards view',
};

function ModeIcon({ mode }: { mode: ViewMode }) {
  if (mode === 'masonry') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="5" height="7.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.25" y="0.75" width="5" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="0.75" y="9.75" width="5" height="3.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.25" y="6.25" width="5" height="7" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (mode === 'list') {
    return (
      <svg width="14" height="12" viewBox="0 0 16 14" fill="none" aria-hidden="true">
        <rect x="0.75" y="1.75" width="2" height="2" rx="0.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 2.75h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="0.75" y="10.25" width="2" height="2" rx="0.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 11.25h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (mode === 'board') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="5" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.25" y="0.75" width="5" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="0.75" y="8.25" width="5" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.25" y="8.25" width="5" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
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
  );
}

/**
 * Narrow icon pill. Desktop order: masonry, list, grid, cards.
 * Phone order: grid, list, masonry, cards.
 * Fixed 48px height to match SearchBar + filter button.
 */
function ViewModeToggle({
  mode,
  onChange,
  layout,
  className = '',
}: ViewModeToggleProps) {
  const btn = (active: boolean) =>
    `flex h-full w-8 items-center justify-center transition-colors ${
      active
        ? 'bg-beaming-orange text-black'
        : 'bg-transparent text-mist-white opacity-50'
    }`;

  return (
    <div
      className={`inline-flex !h-12 min-h-12 max-h-12 box-border items-stretch rounded-lg border-2 border-slate-black overflow-hidden ${className}`}
      role="group"
      aria-label="View mode"
    >
      {VIEW_MODE_ORDER[layout].map((id, index) => (
        <button
          key={id}
          type="button"
          aria-label={LABELS[id]}
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={`${index > 0 ? 'border-l-2 border-slate-black ' : ''}${btn(mode === id)}`}
        >
          <ModeIcon mode={id} />
        </button>
      ))}
    </div>
  );
}

export default ViewModeToggle;
