import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/store';

interface EventsListItemSingleValueFieldProps {
  propertyName: string;
  isHidden: boolean;
  isHighlighted: boolean;
  value: any;
  onChange: Function;
}

const EventsListItemSingleValueField = ({
  propertyName,
  isHidden,
  isHighlighted,
  value,
  onChange,
}: EventsListItemSingleValueFieldProps) => {
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [freeInp, setFreeInp] = useState(value ?? '');

  const inputRef = useRef(null);

  useEffect(() => {
    setFreeInp(value ?? '');
  }, [value]);

  useEffect(() => {
    if (isInputVisible) {
      (inputRef.current as any).focus();
    }
  }, [isInputVisible]);

  const handleBlur = () => {
    setFreeInp(value);
    setIsInputVisible(false);
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onChange(propertyName, e.currentTarget.value, setIsInputVisible);
    }
  };

  return (
    <td
      className={
        'border-r-[1px] w-[200px] border-slate-black flex items-center p-3 relative overflow-hidden ' +
        (isHidden ? 'hidden ' : '') +
        (isHighlighted ? 'bg-beaming-orange text-black' : ' ') +
        (propertyName === 'venue,address' ? 'w-[400px]' : '')
      }
    >
      <div
        className={
          'w-full h-[60px] flex items-center select-none break-all ' +
          (isInputVisible && 'hidden')
        }
        onDoubleClick={() => {
          setIsInputVisible(true);
        }}
      >
        {freeInp}
      </div>
      <input
        ref={inputRef}
        type="text"
        className={
          'w-full h-[60px] px-2 text-center text-black flex items-center justify-center border-[6px] border-slate-black rounded-[8px] bg-white outline-none focus:border-[1px] focus:border-solid focus:border-ocean-blue ' +
          (!isInputVisible && 'hidden')
        }
        value={freeInp}
        onChange={(e) => {
          setFreeInp(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </td>
  );
};

export default EventsListItemSingleValueField;
