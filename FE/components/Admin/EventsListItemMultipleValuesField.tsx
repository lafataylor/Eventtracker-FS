import React, { useEffect, useRef, useState } from 'react';
import Select, { components } from 'react-select';
import { closePopup, showPopup } from '../../store/actions/popup';
import { useStore } from '../../store/store';

const { Option } = components;

const CustomOption = (props: any) => {
  const { data, innerRef, innerProps } = props;
  return data.custom ? (
    data.type == 'label' ? (
      <div
        {...innerProps}
        className="text-left text-[0.75rem] pointer-events-none"
      >
        {data.label}
      </div>
    ) : (
      <div
        ref={innerRef}
        {...innerProps}
        className="text-sm pt-4 pb-2 font-medium hover:cursor-pointer"
      >
        <span>+</span> Append value
      </div>
    )
  ) : (
    <div className="border-b-[1px] border-off-white">
      <Option {...props} />
    </div>
  );
};

interface EventsListItemMultipleValuesFieldProps {
  propertyName: string;
  isHidden: boolean;
  isHighlighted: boolean;
  options: any;
  onChange: Function;
}

const EventsListItemMultipleValuesField = ({
  propertyName,
  isHidden,
  isHighlighted,
  options,
  onChange,
}: EventsListItemMultipleValuesFieldProps) => {
  const [state, dispatch] = useStore();
  const { popup } = state;

  const [freeInp, setFreeInp] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState(options[1]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const inputRef = useRef(null);
  const optionsRef = useRef(null);

  const sortButtonStyle: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: '#000000',
      borderRadius: '8px',
      padding: '12px 4px',
      backgroundColor: 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      '&:active': {
        backgroundColor: '#F1FCFF80',
      },
      fontWeight: 400,
      fontSize: '0.95rem',
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      border: 'none',
      borderColor: 'none',
      userSelect: 'none',
      outline: 'none',
      focus: 'none',
      boxShadow: 'none',
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: '#FFFFFF',
      border: '2px solid #62B6CB',
      borderRadius: '10px',
      padding: '10px',
      width: 'max-content',
      left: 0,
      zIndex: 10,
    }),
    indicatorSeparator: () => null,
    dropdownIndicator: (style: React.CSSProperties) => ({
      ...style,
      display: 'none',
    }),
    singleValue: (style: React.CSSProperties) => ({
      ...style,
      color: '#000000',
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: 'red',
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      width: '100%',
      position: 'relative',
      outline: 'none',
    }),
  };

  useEffect(() => {
    if (!popup.isVisible) {
      setIsMenuOpen(false);
    }
  }, [popup]);

  return (
    <td
      className={
        'border-r-[1px] w-[200px] border-slate-black flex items-center p-3 relative overflow-hidden ' +
        (isHidden ? 'hidden ' : '') +
        (isHighlighted ? 'bg-beaming-orange' : '')
      }
    >
      <div
        className={
          'w-full h-[60px] flex items-center select-none break-all ' +
          (isMenuOpen && 'hidden')
        }
        onDoubleClick={(e) => {
          e.stopPropagation();

          closePopup()(dispatch);
          setTimeout(() => {
            setIsMenuOpen(true);
          }, 0);
        }}
      >
        {selectedSuggestion.value != '' ? selectedSuggestion.value : freeInp}
      </div>

      <input
        ref={inputRef}
        type="text"
        className={
          'w-full h-[60px] px-2 text-center flex items-center justify-center border-[1px] border-slate-black rounded-[8px] bg-white outline-none focus:border-[1px] focus:border-solid focus:border-slate-black ' +
          (!isMenuOpen && 'hidden')
        }
        value={
          selectedSuggestion.value != '' ? selectedSuggestion.value : freeInp
        }
        onChange={(e) => {
          if (selectedSuggestion.value == '') {
            setFreeInp(e.target.value);
          }
        }}
        // onClick={(e) => {
        //   e.stopPropagation();

        //   closePopup()(dispatch);
        //   setTimeout(() => {
        //     setIsMenuOpen(true);
        //   }, 0);
        //   // setImmediate(() => {

        //   // });
        // }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onChange(propertyName, e.currentTarget.value);
          }
        }}
      />

      <div className={'multiple-value-field ' + (!isMenuOpen && 'hidden')}>
        <Select
          ref={optionsRef}
          value={selectedSuggestion}
          onChange={(newValue) => {
            setIsMenuOpen(false);
            setSelectedSuggestion(newValue);
            if (newValue.value == '') {
              setFreeInp('');
              (inputRef.current as any).focus();
            } else {
              onChange(propertyName, newValue.value, setIsMenuOpen);
            }
          }}
          components={{ Option: CustomOption }}
          options={options}
          styles={sortButtonStyle}
          menuIsOpen={isMenuOpen}
        />
      </div>
    </td>
  );
};

export default EventsListItemMultipleValuesField;
