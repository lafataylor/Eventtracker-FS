import React, { useState, useEffect } from 'react';
import Select, { SingleValue } from 'react-select';
import { FilterItemProps, Option } from '../../interface/filterInterface';
import { closePopup } from '../../store/actions/popup';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import DateField from '../Dashboard/DateField';

interface FilterProps {
  hide: Function;
  value: Option;
  onChange: Function;
}

const AccountsFilter = ({ hide, value, onChange }: FilterProps) => {
  const [, dispatch] = useStore();

  const customStyles: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: 'var(--dropdown_menu_option_text)',
      borderRadius: '8px',
      padding: '10px 20px',
      backgroundColor: state.isSelected
        ? 'var(--dropdown_selected_option)'
        : 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      fontSize: '0.8rem',
      '&:active': {
        backgroundColor: 'var(--dropdown_selected_option)',
      },
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      backgroundColor: 'var(--midnight)',
      border: 'none',
      padding: '4px 5px',
      borderRadius: '8px',
      boxShadow: 'none',
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: 'var(--dropdown_menu_bg)',
      borderRadius: '10px',
      padding: '10px',
      width: 'max-content',
      right: 0,
    }),
    indicatorSeparator: () => null,
    dropdownIndicator: (style: React.CSSProperties) => ({
      ...style,
      display: 'none',
    }),
    singleValue: (style: React.CSSProperties) => ({
      ...style,
      fontSize: '0.8rem',
      color: 'var(--filter_input_text)',
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: 'red',
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      width: '100%',
    }),
  };

  return (
    <>
      <div
        className="bg-charcoal-gray shadow-[0px_5.30739px_5.30739px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-lg absolute right-0 top-16 p-6 px-8 hidden lg:flex flex-col gap-4 z-[2]"
        onClick={(e) => {
          e.stopPropagation();
          closePopup()(dispatch);
        }}
      >
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-5">
          <span className="font-medium text-sm w-full">
            Filter Tracking Status
          </span>
          <div className="w-[11rem]">
            <Select
              value={value}
              onChange={(newValue) => onChange(newValue)}
              options={Constants.accountsFilterOptions}
              styles={customStyles}
              isSearchable={false}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default AccountsFilter;
