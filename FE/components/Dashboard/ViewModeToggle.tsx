import React, { useEffect, useRef, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import {
  ViewMode,
  ViewModeLayout,
  VIEW_MODE_MENU_LABELS,
  VIEW_MODE_ORDER,
} from '../../utils/viewMode';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  layout: ViewModeLayout;
  className?: string;
}

const ARIA_LABELS: Record<ViewMode, string> = {
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
 * Phone: one compact button (current icon + chevron) that opens a menu of
 * all four views. Desktop keeps the four-icon pill. 2026-11-15: four icons
 * were too wide next to search + filter on small screens.
 */
function MobileViewModeDropdown({
  mode,
  onChange,
  className = '',
}: Omit<ViewModeToggleProps, 'layout'>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectMode = (next: ViewMode) => {
    onChange(next);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        aria-label={ARIA_LABELS[mode]}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex !h-12 min-h-12 max-h-12 box-border items-center gap-1.5 rounded-lg border-2 border-slate-black bg-transparent px-2.5 text-mist-white transition-colors"
      >
        <span className="flex items-center justify-center text-beaming-orange">
          <ModeIcon mode={mode} />
        </span>
        <FaChevronDown
          className={`w-2.5 h-2.5 text-mist-white opacity-70 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 min-w-[168px] rounded-lg shadow-lg bg-slate-black border-2 border-midnight-transparent z-30 animate-fade-in overflow-hidden"
          role="listbox"
          aria-label="View mode"
        >
          {VIEW_MODE_ORDER.mobile.map((id) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectMode(id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-beaming-orange text-black'
                    : 'text-mist-white opacity-80 hover:bg-gunmetal-gray hover:opacity-100'
                }`}
              >
                <ModeIcon mode={id} />
                <span>{VIEW_MODE_MENU_LABELS[id]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Narrow icon pill. Desktop order: masonry, list, grid, cards.
 * Phone uses MobileViewModeDropdown instead of four icons.
 * Fixed 48px height to match SearchBar + filter button.
 */
function ViewModeToggle({
  mode,
  onChange,
  layout,
  className = '',
}: ViewModeToggleProps) {
  if (layout === 'mobile') {
    return (
      <MobileViewModeDropdown
        mode={mode}
        onChange={onChange}
        className={className}
      />
    );
  }

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
      {VIEW_MODE_ORDER.desktop.map((id, index) => (
        <button
          key={id}
          type="button"
          aria-label={ARIA_LABELS[id]}
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
