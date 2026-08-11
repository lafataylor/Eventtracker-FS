import React from 'react';
import { Option } from '../interface/filterInterface';
import { closePopup } from '../store/actions/popup';
import { useStore } from '../store/store';
import { Constants } from '../utils/constants';

const tailwindConfig = require('../tailwind.config.js');
const colors = tailwindConfig.theme.colors;

const midnight = colors['midnight'];
const slateBlack = colors['slate-black'];
const mistWhite = colors['mist-white'];

interface SortOverlayProps {
  hide: Function;
  value: Option;
  onChange: Function;
  options?: Option[];
  isHidden?: boolean;
}

const SortOverlay = ({ hide, value, onChange, options, isHidden }: SortOverlayProps) => {
  const [, dispatch] = useStore();

  const sortOptions: Option[] = options
    ? options
    : [
        { value: 'timestamp_asc', label: 'Event Date (Soonest first)' },
        { value: 'timestamp_desc', label: 'Event Date (Furthest first)' },
        { value: 'created_at_asc', label: 'Date Added (Soonest first)' },
        { value: 'created_at_desc', label: 'Date Added (Furthest first)' },
      ];

  const handleOptionClick = (option: Option) => {
    onChange(option);
    hide();
  };

  if (isHidden) {
    return null;
  }

  return (
    <div
      className="lg:bg-slate-black text-mist-white lg:shadow-[0px_5.30739px_5.30739px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-lg lg:absolute right-0 top-12 p-4   flex flex-col gap-4 z-[2]"
      onClick={(e) => {
        e.stopPropagation();
        closePopup()(dispatch);
      }}
    >
      <div className="w-full flex flex-col gap-1 overflow-y-auto max-h-60">
        {sortOptions.map((option) => (
          <div
            key={option.value}
            onClick={() => handleOptionClick(option)}
            className={`p-2 mr-1 rounded-lg cursor-pointer  ${
              value?.value === option.value
                ? 'bg-beaming-orange'
                : 'hover:bg-beaming-orange'
            }`}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SortOverlay;
