import React, { useState, useEffect } from 'react';
import Select, { SingleValue, components } from 'react-select';
import { FiX } from 'react-icons/fi';
import { AiOutlineSortAscending } from 'react-icons/ai';
import { FilterItemProps, Option } from '../../interface/filterInterface';
import { closePopup } from '../../store/actions/popup';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import DateField from '../Dashboard/DateField';
import {
  showFilterResults,
  updateFilters,
  resetFilters,
  setEventsLoadedByFilter,
} from '../../store/actions/filter';
import EventService from '../../services/lib/event';
import { Event } from '../../interface/objects/simpleObject';
import getFilterString, { colorFromClass } from '../../utils/color_convertor';

const tailwindConfig = require('../../tailwind.config.js');
const colors = tailwindConfig.theme.colors;

const midnight = colors['midnight'];
const slateBlack = colors['slate-black'];
const mistWhite = colors['mist-white'];

const sortOptions: Option[] = [
  { value: '', label: 'None' },
  { value: 'event_date', label: 'By Date of Event' },
  { value: 'creation_date', label: 'By Date Added' },
];

const orderOptions: Option[] = [
  { value: 'asc', label: 'Older to Newer' },
  { value: 'desc', label: 'Newer to Older' },
];

const { ValueContainer } = components;

const CustomSelectValueContainer = ({ children, ...props }: any) => {
  let label = props.hasValue ? (props.getValue() as any)[0]['label'] : '';

  if (label === 'None') {
    props.clearValue();
  }

  return (
    <ValueContainer {...props}>
      <div className="flex flex-row items-center justify-center gap-2 hover:cursor-pointer">
        <AiOutlineSortAscending className="w-4 h-4 text-gray-700" />
        <div className="flex flex-row">{children}</div>
      </div>
    </ValueContainer>
  );
};

const formatDate = (dateToFormat: Date) => {
  const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
  const day = dateToFormat.getDate().toString().padStart(2, '0');
  const year = dateToFormat.getFullYear();

  return `${month}/${day}/${year}`;
};

interface FilterProps {
  hide: Function;
  isAdmin: boolean;
  existingEvents?: Event[];
  sort?: Option;
  setSort?: Function;
  order?: boolean;
  setOrder?: Function;
}

const Filter = ({
  hide,
  isAdmin,
  existingEvents,
  sort,
  setSort,
  order,
  setOrder,
}: FilterProps) => {
  const [state, dispatch] = useStore();
  const { filter } = state;

  const [filteredLocationOptions, setFilteredLocationOptions] = useState(
    existingEvents ? existingEvents.map((event) => event.venue.address) : []
  );

  const [selectedLocation, setSelectedLocation] = useState('');

  const customStyles: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: mistWhite,
      borderRadius: '8px',
      padding: '10px 20px',
      backgroundColor: state.isSelected ? slateBlack : 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      fontSize: '0.8rem',
      '&:active': {
        backgroundColor: 'var(--dropdown_selected_option)',
      },
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      backgroundColor: midnight,
      border: 'none',
      padding: '4px 5px',
      borderRadius: '8px',
      outline: 'none',
      boxShadow: 'none',
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: midnight,
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
      color: mistWhite,
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: 'red',
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      width: '100%',
      outline: 'none',
    }),
  };

  const sortButtonStyle: Object = {
    option: (provided: any, state: any) => ({
      ...provided,
      color: state.isSelected ? mistWhite : mistWhite,
      borderRadius: '8px',
      padding: '10px 20px',
      backgroundColor: state.isSelected ? slateBlack : 'none',
      cursor: state.isSelected ? 'auto' : 'pointer',
      whiteSpace: 'nowrap',
      fontSize: '0.8rem',
      '&:active': {
        backgroundColor: mistWhite,
      },
    }),
    control: (styles: React.CSSProperties) => ({
      ...styles,
      backgroundColor: midnight,
      border: 'none',
      padding: '4px 5px',
      borderRadius: '8px',
      boxShadow: 'none',
      color: mistWhite,
    }),
    menu: (style: React.CSSProperties) => ({
      ...style,
      backgroundColor: midnight,
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
      color: mistWhite,
      fontWeight: '500',
    }),
    valueContainer: (style: React.CSSProperties) => ({
      ...style,
      color: mistWhite,
    }),
    container: (style: React.CSSProperties) => ({
      ...style,
      width: '100%',
    }),
  };

  const addFilterHandler = () => {
    const updatedFilters = [...filter.filters];

    updatedFilters.push({
      type: isAdmin
        ? Constants.adminPropertyOptions[0]
        : Constants.propertyOptions[0],
      condition: Constants.conditionOptions['default'][0],
      conjugation: Constants.conjugationOptions[0],
      values: [],
    });

    updateFilters(updatedFilters)(dispatch);
  };

  const removeAllFiltersHandler = () => {
    resetFilters()(dispatch);
    updateFilters([
      {
        type: isAdmin
          ? Constants.adminPropertyOptions[0]
          : Constants.propertyOptions[0],
        condition: Constants.conditionOptions['default'][0],
        conjugation: Constants.conjugationOptions[0],
        values: [],
      },
    ])(dispatch);
  };

  const removeFilterHandler = (index: number) => {
    let updatedFilters = [...filter.filters];

    updatedFilters.splice(index, 1);

    if (updatedFilters.length === 0) {
      // When the last filter is removed, reset filters and close the dropdown
      resetFilters()(dispatch);
      updatedFilters = [
        {
          type: isAdmin
            ? Constants.adminPropertyOptions[0]
            : Constants.propertyOptions[0],
          condition: Constants.conditionOptions['default'][0],
          conjugation: Constants.conjugationOptions[0],
          values: [],
        },
      ];
      hide();
      closePopup()(dispatch);
    }

    updateFilters(updatedFilters)(dispatch);
  };

  const handleLocationInputChange = (inputValue: string, index: number) => {
    onChangeFilterValue(index, 'values', inputValue, 0);
    // venue.address is null on ~60% of venue rows, so the map yields nulls and
    // the filter used to call .toLowerCase() straight on them — the same
    // crash-the-whole-app shape as the 2026-09-01 outage. Drop the empties
    // first; they were only ever rendered as blank options anyway.
    const filtered = existingEvents
      ?.map((event) => event.venue?.address)
      .filter((option): option is string => !!option)
      .filter((option) =>
        option.toLowerCase().includes(inputValue.toLowerCase())
      );
    setFilteredLocationOptions(filtered ?? []);
    setSelectedLocation('');
  };

  const handleLocationSelection = (option: any, index: number) => {
    setFilteredLocationOptions([]);
    setSelectedLocation(option.toString());
    handleLocationInputChange(option, index);
  };

  const onChangeFilterValue = (
    index: number,
    property: string,
    value: number | string | Date | SingleValue<Option>,
    valueIndex: number | null
  ) => {
    const updatedFilters = [...filter.filters];
    const updatedFilter = { ...filter.filters[index] };

    if (updateFilters == null || updatedFilter['values'] == null) {
      alert(
        'Updated Filter: ' +
          JSON.stringify(updatedFilter) +
          ' :: ' +
          index.toString()
      );
      alert('Updated Filters: ' + JSON.stringify(updatedFilters));
    }

    if (property == 'values') {
      const updatedFilterValues: number[] | string[] | Date[] =
        updatedFilter['values'];

      if (updatedFilterValues.length > valueIndex!) {
        (updatedFilterValues as any)[valueIndex!] = value;
      } else {
        (updatedFilterValues as any).push(value);
      }

      (updatedFilter as any)['values'] = updatedFilterValues;
    } else {
      (updatedFilter as any)[property] = value;

      if (property === 'type' || property === 'condition') {
        updatedFilter['values'] = [];
      }

      if (property === 'type') {
        updatedFilter['condition'] = (Constants.conditionOptions as any)[
          (value as Option).value
        ][0];
      }
    }

    updatedFilters[index] = updatedFilter;
    updateFilters(updatedFilters)(dispatch);
  };

  const isValid = (filters: FilterItemProps[]) => {
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (
        filter.type.value === '' ||
        filter.condition.value === '' ||
        filter.conjugation.value === '' ||
        filter.values.length === 0 ||
        (filter.condition.value === 'between' && filter.values.length !== 2) ||
        (filter.condition.value === 'equal' && filter.values.length !== 1)
      ) {
        return false;
      }
    }

    return true;
  };

  const getFilterObject = (filters: FilterItemProps[]) => {
    const filtersObj = [];
    for (let i = 0; i < filters.length; i++) {
      const type = filters[i].type.value;
      const condition = filters[i].condition.value;
      let values = [];

      if (type === 'date') {
        if (condition === 'between') {
          values.push(formatDate(filters[i].values[0]));
          values.push(formatDate(filters[i].values[1]));
        } else {
          values.push(formatDate(filters[i].values[0]));
        }
      } else if (type === 'price') {
        if (condition === 'between') {
          values.push(parseFloat(filters[i].values[0]));
          values.push(parseFloat(filters[i].values[1]));
        } else {
          values.push(parseFloat(filters[i].values[0]));
        }
      } else {
        values = filters[i].values;
      }
      filtersObj.push({
        type: type,
        condition: condition,
        conjugation: filters[i].conjugation.value,
        values: values,
      });
    }

    return filtersObj;
  };

  const getNearest1PM_PST = () => {
    const currentTime = new Date();
    
    // Convert current time to PST
    const pstOffset = -8 * 60; // PST is UTC-8
    const currentTimeInPST = new Date(currentTime.getTime() + (currentTime.getTimezoneOffset() + pstOffset) * 60 * 1000);
    
    // Get the date part of the current time in PST
    const nearest1PM = new Date(currentTimeInPST);
    nearest1PM.setUTCHours(9, 0, 0, 0); // Set to PST's 1 PM
  
    // If the nearest 1 PM is in the future, go to the previous day
    if (nearest1PM > currentTimeInPST) {
      nearest1PM.setDate(nearest1PM.getDate() - 1);
    }
  
    return nearest1PM;
  };

  useEffect(() => {
    if (isValid(filter.filters)) {
      showFilterResults()(dispatch);

      const filtersObj = getFilterObject(filter.filters);

      if (!isAdmin) {
        EventService.getEventByFilter({
          filters: getFilterObject(filter.filters),
        }).then((res) => {
          if (res.status === 200) {
            if (res.data.status === 'success') {
              setEventsLoadedByFilter(res.data.data)(dispatch);
            }
          }
        });
      } else {
        let filteredEvents = [...existingEvents!];
        filtersObj.forEach((filter) => {
          if (filter.type === 'date') {
            if (filter.condition === 'between') {
              const startDate = new Date(filter.values[0]);
              const endDate = new Date(filter.values[1]);

              filteredEvents = filteredEvents.filter((event) => {
                const thisDate = new Date(event.timestamp);
                return thisDate >= startDate && thisDate <= endDate;
              });
            } else {
              const date = new Date(filter.values[0]);

              filteredEvents = filteredEvents.filter((event) => {
                const thisDate = new Date(event.timestamp);
                thisDate.setHours(0);
                thisDate.setMinutes(0);
                thisDate.setSeconds(0);
                thisDate.setMilliseconds(0);
                return thisDate.getTime() === date.getTime();
              });
            }
          } else if (filter.type === 'account') {
            const accountFilterValue = filter.values[0];

            filteredEvents = filteredEvents.filter((event) =>
              // Account.user is nullable; an account without a handle simply
              // matches no handle filter instead of crashing the page.
              (event.poster?.user ?? '')
                .trim()
                .toLowerCase()
                .startsWith(accountFilterValue.trim().toLowerCase())
            );
          } else if (filter.type === 'run') {
            const runFilterValue = filter.values[0];

            const lastRunInitTime = getNearest1PM_PST();

            if (runFilterValue?.value === 'lastRun') {
              filteredEvents = filteredEvents.filter((event) => {
                const eventDate = new Date(event.created_at);
                //console.log("Event Date: ", eventDate, "Last Run Init Time: ", lastRunInitTime);
                //console.log("Event: ", event);
                return eventDate >= lastRunInitTime;
              });
            } else if (runFilterValue?.value === 'olderRuns') {
              filteredEvents = filteredEvents.filter((event) => {
                const eventDate = new Date(event.created_at);
                //console.log("Event Date: ", eventDate, "Last Run Init Time: ", lastRunInitTime);
                return eventDate < lastRunInitTime;
              });
            }
          }
        });
        setEventsLoadedByFilter(filteredEvents)(dispatch);
      }
    }
  }, [filter.filters]);

  return (
    <>
      <div
        className="w-full lg:w-auto h-[95vh] lg:h-auto bg-charcoal-gray filter shadow-[0px_5.30739px_5.30739px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-lg fixed lg:absolute right-0 top-[5vh] lg:top-16 p-6 px-6 lg:px-8 flex flex-col gap-4 z-[3] overflow-auto lg:overflow-visible"
        onClick={(e) => {
          e.stopPropagation();
          closePopup()(dispatch);
        }}
      >
        <div className="flex lg:hidden flex-row items-center justify-between mb-2">
          <div className="text-xl font-semibold text-mist-white">Filters</div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              hide();
              closePopup()(dispatch);
            }}
          >
            <FiX className="w-4 h-4 text-white cursor-pointer" />
          </div>
        </div>
        {setSort ? (
          <div className="p-4 bg-white rounded-xl lg:hidden">
            <div className="flex flex-row items-center gap-8">
              <span className="whitespace-nowrap">Sort By</span>
              <div className="w-full">
                <Select
                  onChange={(newValue) => setSort(newValue as Option)}
                  value={sort}
                  options={sortOptions}
                  styles={sortButtonStyle}
                  isSearchable={false}
                  menuPlacement="auto"
                  menuPosition="fixed"
                  components={{
                    ValueContainer: CustomSelectValueContainer,
                  }}
                  placeholder={<span className="text-off-white">Sort</span>}
                />
              </div>
            </div>
            <div className="flex flex-row items-center gap-8 mt-4">
              <span className="whitespace-nowrap">In Order</span>
              <div className="w-full">
                <Select
                  onChange={(newValue) => setOrder!(newValue?.value === 'desc')}
                  value={orderOptions[order ? 1 : 0]}
                  options={orderOptions}
                  styles={sortButtonStyle}
                  isSearchable={false}
                  menuPlacement="auto"
                  menuPosition="fixed"
                />
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex justify-between text-white">
          <span className="font-medium hidden lg:block"></span>
          <span className="font-normal text-sm lg:hidden">Set Filters</span>
          <button className="bg-none text-sm" onClick={removeAllFiltersHandler}>
            Clear All
          </button>
        </div>

        {filter.filters.map((filter: FilterItemProps, index: number) => (
          <div
            className="grid grid-cols-2 lg:grid-cols-[auto_1fr_auto] items-center gap-5 bg-white p-4 rounded-xl lg:p-0 lg:rounded-none lg:bg-[#FFFFFF00]"
            key={index}
          >
            <div
              className="row-start-1"
              style={{ minWidth: index === 0 ? 0 : '4rem' }}
            >
              {index === 0 ? null : (
                <div className="w-full">
                  <Select
                    value={filter['conjugation']}
                    onChange={(newValue) =>
                      onChangeFilterValue(index, 'conjugation', newValue, null)
                    }
                    options={Constants.conjugationOptions}
                    styles={customStyles}
                    isSearchable={false}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 col-span-2 lg:col-span-1 lg:flex justify-evenly gap-3 items-center relative ">
              <div className="w-full lg:w-[11rem]">
                <Select
                  value={filter['type']}
                  onChange={(newValue) =>
                    onChangeFilterValue(index, 'type', newValue, null)
                  }
                  options={
                    isAdmin
                      ? Constants.adminPropertyOptions
                      : Constants.propertyOptions
                  }
                  styles={customStyles}
                  isSearchable={false}
                  isOptionDisabled={(option) => option.disabled ?? false}
                />
              </div>
              <div className="w-full lg:w-[11rem]">
                <Select
                  value={filter['condition']}
                  onChange={(newValue) =>
                    onChangeFilterValue(index, 'condition', newValue, null)
                  }
                  options={
                    (Constants.conditionOptions as any)[
                      filter['type']['value'] ?? []
                    ] as Option[]
                  }
                  styles={customStyles}
                  isSearchable={false}
                />
              </div>
              {['default', 'location', 'artist', 'account'].includes(
                filter['type']['value']
              ) || filter['condition']['value'] === '' ? (
                <div
                  className={
                    'relative bg-midnight w-full flex items-center gap-2 px-4 p-2 rounded-lg flex-1 ' +
                    (filter['condition']['value'] === 'between'
                      ? ''
                      : 'col-span-2 lg:col-span-1 ') +
                    (filter['condition']['value'] === ''
                      ? 'pointer-events-none select-none'
                      : '')
                  }
                >
                  <input
                    type="text"
                    className="bg-midnight text-mist-white w-full outline-none font-medium text-[0.8rem]"
                    placeholder="Value"
                    value={
                      filter['values'].length > 0
                        ? (filter['values'][0] as string)
                        : ''
                    }
                    onChange={(e) => {
                      onChangeFilterValue(index, 'values', e.target.value, 0);
                      if (filter['type']['value'] == 'location') {
                        handleLocationInputChange(e.target.value, index);
                      }
                    }}
                  />
                  {filter['type']['value'] == 'location' &&
                    filteredLocationOptions.length > 0 &&
                    selectedLocation === '' && (
                      <ul className="absolute z-10 top-[3em] left-0 w-full overflow-x-auto bg-main-filter_input_bg border border-gray-300 rounded-md shadow-lg">
                        {filteredLocationOptions.map((option, i) => (
                          <li
                            key={i}
                            className="px-3 py-2 text-sm text-white cursor-pointer hover:bg-gray-100"
                            onClick={() =>
                              handleLocationSelection(option, index)
                            }
                          >
                            {option}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              ) : filter['type']['value'] === 'date' ? (
                <DateField
                  value={
                    filter['values'].length > 0
                      ? (filter['values'][0] as Date)
                      : null
                  }
                  otherValue={
                    filter['values'].length > 1
                      ? (filter['values'][1] as Date)
                      : null
                  }
                  type="start"
                  onChange={(newDate: Date) =>
                    onChangeFilterValue(index, 'values', newDate, 0)
                  }
                  setRange={(range: {
                    prev: Date;
                    current: Date;
                    next: Date;
                  }) => {
                    onChangeFilterValue(index, 'values', range['current'], 0);
                    onChangeFilterValue(index, 'values', range['next'], 1);
                  }}
                />
              ) : filter['type']['value'] === 'price' ? (
                <div
                  className={
                    'bg-midnight w-full flex items-center gap-2 px-4 p-2 rounded-lg flex-1 ' +
                    (filter['condition']['value'] === 'between'
                      ? ''
                      : 'col-span-2 lg:col-span-1 ')
                  }
                >
                  <input
                    type="number"
                    className="bg-midnight text-mist-white w-full outline-none font-medium text-[0.8rem]"
                    placeholder="Value"
                    value={
                      filter['values'].length > 0
                        ? (filter['values'][0] as number)
                        : ''
                    }
                    onChange={(e) =>
                      onChangeFilterValue(index, 'values', e.target.value, 0)
                    }
                  />
                </div>
              ) : filter['type']['value'] === 'run' ? (
                <div className="w-full lg:w-[11rem]">
                  <Select
                    value={filter['values'][0]}
                    onChange={(newValue) =>
                      onChangeFilterValue(index, 'values', newValue, 0)
                    }
                    options={Constants.runOptions}
                    styles={customStyles}
                    isSearchable={false}
                  />
                </div>
              ) : null}
              {filter['type']['value'] === 'date' &&
              filter['condition']['value'] === 'between' ? (
                <DateField
                  value={
                    filter['values'].length > 1
                      ? (filter['values'][1] as Date)
                      : null
                  }
                  otherValue={
                    filter['values'].length > 0
                      ? (filter['values'][0] as Date)
                      : null
                  }
                  type="end"
                  onChange={(newDate: Date) =>
                    onChangeFilterValue(index, 'values', newDate, 1)
                  }
                  setRange={(range: {
                    prev: Date;
                    current: Date;
                    next: Date;
                  }) => {
                    onChangeFilterValue(index, 'values', range['prev'], 0);
                    onChangeFilterValue(index, 'values', range['current'], 1);
                  }}
                />
              ) : filter['type']['value'] === 'price' &&
                filter['condition']['value'] === 'between' ? (
                <div
                  className={
                    'bg-midnight w-full flex items-center gap-2 px-4 p-2 rounded-lg flex-1 ' +
                    (filter['condition']['value'] === 'between'
                      ? ''
                      : 'col-span-2 lg:col-span-1 ')
                  }
                >
                  <input
                    type="number"
                    className="bg-midnight text-mist-white w-full outline-none font-medium text-[0.8rem]"
                    placeholder="Value"
                    value={
                      filter['values'].length > 1
                        ? (filter['values'][1] as number)
                        : ''
                    }
                    onChange={(e) =>
                      onChangeFilterValue(index, 'values', e.target.value, 1)
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="row-start-1 lg:row-start-auto justify-self-end">
              <FiX
                className="w-5 h-5 cursor-pointer text-white"
                onClick={() => removeFilterHandler(index)}
              />
            </div>
          </div>
        ))}
        <div
          className="w-fit text-white text-sm hover:cursor-pointer"
          onClick={addFilterHandler}
        >
          + Add more filters
        </div>
      </div>
    </>
  );
};

export default Filter;
