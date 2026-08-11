'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { FaChevronDown } from 'react-icons/fa';
import { formatLocationSlug, normalizeLocationSlug } from '../../utils/utils';

interface LocationDropdownProps {
  currentLocation: string;
  formattedLocationName: string;
  locations: string[];
  language?: 'en' | 'es';
  setActiveDropdown?: (dropdown: string) => void;
  resetDropdowns?: boolean;
}

const LocationDropdown: React.FC<LocationDropdownProps> = ({
  currentLocation,
  formattedLocationName,
  locations,
  language = 'en',
  setActiveDropdown = () => {},
  resetDropdowns = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const otherLocations = useMemo(() => {
    const current = normalizeLocationSlug(currentLocation);
    const seen = new Set<string>();

    return locations.filter((loc) => {
      if (loc === 'general') return false;
      const normalized = normalizeLocationSlug(loc);
      if (normalized === current || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [locations, currentLocation]);

  useEffect(() => {
    if (resetDropdowns) {
      setIsOpen(false);
    }
  }, [resetDropdowns]);

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

  const toggleDropdown = () => {
    if (otherLocations.length === 0) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      setActiveDropdown('location');
    }
  };

  const handleNavigate = (slug: string) => {
    const urlSlug = slug.toLowerCase().replace(/\s+/g, '-');
    const path = language === 'es' ? `/es/${urlSlug}` : `/${urlSlug}`;
    setIsOpen(false);
    router.push(path);
  };

  const hasOtherLocations = otherLocations.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={!hasOtherLocations}
        className={`flex items-center gap-1.5 text-beaming-orange text-lg font-medium lowercase -ml-1 transition-opacity duration-200 ${
          hasOtherLocations
            ? 'hover:opacity-80 cursor-pointer'
            : 'cursor-default'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span>{formattedLocationName}</span>
        {hasOtherLocations && (
          <FaChevronDown
            className={`w-3 h-3 -mb-1 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {isOpen && hasOtherLocations && (
        <div
          className="absolute top-full left-0 mt-2 min-w-[200px] max-h-[280px] overflow-y-auto rounded-lg shadow-lg bg-slate-black border-2 border-midnight-transparent z-20 animate-fade-in"
          role="listbox"
        >
          {otherLocations.map((loc) => (
            <button
              key={loc}
              type="button"
              role="option"
              onClick={() => handleNavigate(loc)}
              className="block w-full text-left px-4 py-2.5 text-sm font-medium text-beaming-orange-light hover:bg-gunmetal-gray transition-colors duration-150 lowercase first:rounded-t-lg last:rounded-b-lg"
            >
              {formatLocationSlug(loc)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationDropdown;
