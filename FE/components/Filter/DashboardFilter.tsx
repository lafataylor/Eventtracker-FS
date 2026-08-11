import React, { useState, useEffect, useRef } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Range, getTrackBackground } from 'react-range';
import { Event } from '../../interface/objects/simpleObject';
import {
  FaCalendarAlt,
  FaDollarSign,
  FaMapMarkerAlt,
  FaList,
  FaTimes,
  FaFilter,
} from 'react-icons/fa';
import { BiSortAlt2 } from 'react-icons/bi';
import SortOverlay from '../SortOverlay';
import { Constants } from '../../utils/constants';
import { Option } from '../../interface/filterInterface';

interface DashboardFilterProps {
  onFilterChange: (filters: any) => void;
  hideSortOverlay: Function;
  events: Event[];
  setSort: Function;
  sort: Option;
  appliedFilters: Object;
  language?: string;
  locationName?: string;
  setActiveDropdown?: (dropdown: string) => void;
  resetDropdowns?: boolean;
  isHidden?: boolean;
  isMobileShrunken?: boolean;
}

const DashboardFilter: React.FC<DashboardFilterProps> = ({
  onFilterChange,
  hideSortOverlay,
  events,
  setSort,
  sort,
  appliedFilters,
  language = 'en',
  locationName,
  resetDropdowns = false,
  setActiveDropdown = () => {},
  isHidden = false,
  isMobileShrunken = false
}) => {
  // Helper function to determine currency symbol
  const getCurrencySymbol = () => {
    if (locationName === 'mexico-city') {
      return 'MXN';
    }
    return '$';
  };

  const USD_MAX = 50;
  const isMexicoCityPrice = locationName === 'mexico-city';
  const priceMax = isMexicoCityPrice ? 1000 : USD_MAX;
  const priceDisplay = (i: 0 | 1): number | string => {
    if (isMexicoCityPrice) return priceRange[i] * 10;
    if (i === 1 && priceRange[1] >= USD_MAX) return `${USD_MAX}+`;
    return priceRange[i];
  };

  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [showOfferingsFilter, setShowOfferingsFilter] = useState(false);
  const [showSortOverlay, setShowSortOverlay] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [tempMobileSort, setTempMobileSort] = useState<Option>({
    value: '',
    label: 'None',
  });

  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, priceMax]);
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [offeringOptions, setOfferingOptions] = useState<string[]>([]);
  const [filters, setFilters] = useState<any>({});
  const [locationSearch, setLocationSearch] = useState('');
  const [offeringSearch, setOfferingSearch] = useState('');
  const [mobileFilters, setMobileFilters] = useState<any>({});

  const initialPriceRange = useRef<[number, number]>([0, priceMax]);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const priceFilterRef = useRef<HTMLDivElement>(null);
  const priceButtonRef = useRef<HTMLButtonElement>(null);
  const offeringsFilterRef = useRef<HTMLDivElement>(null);
  const offeringsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const states = Array.from(new Set(events.map((event) => event.venue.state)))
      .filter((state) => Constants.validStates.includes(state))
      .sort();
    const cities = Array.from(
      new Set(events.map((event) => event.venue.city))
    ).sort();
    const offerings = Array.from(
      new Set(events.flatMap((event) => event.offering?.toLowerCase()?.split(',')))
    )
      .filter((offering) => offering.trim() !== '')
      .sort();
    setStateOptions(states);
    setCityOptions(cities);
    setOfferingOptions(offerings);
  }, [events]);

  useEffect(() => {
    if (resetDropdowns) {
      setShowDateFilter(false);
      setShowPriceFilter(false);
      setShowLocationFilter(false);
      setShowOfferingsFilter(false);
      setShowMobileMenu(false);
    }
  }, [resetDropdowns]);

  const handleDateFilterClick = () => {
    setShowDateFilter((prev) => !prev);
    setShowPriceFilter(false);
    setShowLocationFilter(false);
    setShowOfferingsFilter(false);
    setActiveDropdown('filter');
  };

  const handlePriceFilterClick = () => {
    setShowPriceFilter((prev) => !prev);
    setShowDateFilter(false);
    setShowLocationFilter(false);
    setShowOfferingsFilter(false);
    initialPriceRange.current = priceRange;
    setActiveDropdown('filter');
  };

  const handleLocationFilterClick = () => {
    setShowLocationFilter((prev) => !prev);
    setShowDateFilter(false);
    setShowPriceFilter(false);
    setShowOfferingsFilter(false);
    setActiveDropdown('filter');
  };

  const handleOfferingsFilterClick = () => {
    setShowOfferingsFilter((prev) => !prev);
    setShowDateFilter(false);
    setShowPriceFilter(false);
    setShowLocationFilter(false);
    setActiveDropdown('filter');
  };

  const handleSortClick = () => {
    setShowSortOverlay((prev) => !prev);
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu((prev) => !prev);
    setShowDateFilter(false);
    setShowPriceFilter(false);
    setShowLocationFilter(false);
    setShowOfferingsFilter(false);
    setActiveDropdown('filter');
  };

  useEffect(() => {
    onFilterChange(filters);
  }, [filters]);

  const filteredStateOptions = stateOptions.filter((state) =>
    state?.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const filteredCityOptions = cityOptions.filter((city) =>
    city?.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const filteredOfferingOptions = offeringOptions.filter((offering) =>
    offering.toLowerCase().includes(offeringSearch.toLowerCase())
  );

  const handleDateChange = (range: Date[], isMobile: boolean) => {
    const [from, to] = range;
    const newFilters = isMobile ? { ...mobileFilters } : { ...filters };
    if (from) {
      newFilters.date = { from, to };
    } else {
      delete newFilters.date;
    }
    if (isMobile) {
      handleMobileFilterChange(newFilters);
    } else {
      setFilters(newFilters);
    }
    setDateRange([from, to]);
    setShowDateFilter(false);
  };

  const handleDateClick = (date: Date) => {
    const [from, to] = dateRange;
    if (from?.getTime() === date.getTime() && !to) {
      setShowDateFilter(false);
      const newFilters = { ...filters, date: { from, to: from } };
      setFilters(newFilters);
    } else {
      setDateRange([date, null]);
    }
  };

  const handleQuickSelect = (
    type: 'today' | 'tomorrow' | 'week',
    isMobile = false
  ) => {
    const today = new Date();
    const daysLeftInWeek = today.getDay() == 0 ? 0 : 7 - today.getDay();
    let from: Date;
    let to: Date;

    switch (type) {
      case 'today':
        from = new Date(today);
        from.setHours(0, 0, 0, 0);
        to = new Date(today);
        to.setHours(23, 59, 59, 999);
        break;
      case 'tomorrow':
        from = new Date(today);
        from.setDate(today.getDate() + 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;
      case 'week':
        from = new Date(today);
        from.setHours(0, 0, 0, 0);
        to = new Date(today);
        to.setDate(today.getDate() + daysLeftInWeek);
        to.setHours(23, 59, 59, 999);
        break;
      default:
        return;
    }

    const newFilters = isMobile ? { ...mobileFilters } : { ...filters };
    newFilters.date = { from, to };
    if (isMobile) {
      handleMobileFilterChange(newFilters);
    } else {
      setFilters(newFilters);
    }
    setDateRange([from, to]);
    setShowDateFilter(false);
  };

  const snapPriceUsd = (n: number) =>
    Math.min(USD_MAX, Math.max(0, Math.round(n)));

  const applyPriceFilter = (isMobile = false) => {
    const newFilters = isMobile ? { ...mobileFilters } : { ...filters };
    if (isMexicoCityPrice) {
      if (priceRange[0] !== 0 || priceRange[1] !== 10000) {
        newFilters.price = priceRange.map((price) => price * 10);
      } else {
        delete newFilters.price;
      }
    } else {
      const lo = Math.min(USD_MAX, Math.max(0, Number(priceRange[0])));
      const hi = Math.min(USD_MAX, Math.max(0, Number(priceRange[1])));
      const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
      if (min !== 0 || max !== USD_MAX) {
        // When max handle is at USD_MAX ("50+"), remove the upper bound entirely
        newFilters.price = [min, max >= USD_MAX ? 999999 : max];
      } else {
        delete newFilters.price;
      }
    }
    if (isMobile) {
      handleMobileFilterChange(newFilters);
    } else {
      setFilters(newFilters);
    }
    setShowPriceFilter(false);
  };

  const resetPriceFilter = (isMobile = false) => {
    const newFilters = isMobile ? { ...mobileFilters } : { ...filters };
    delete newFilters.price;
    if (isMobile) {
      handleMobileFilterChange(newFilters);
    } else {
      setFilters(newFilters);
    }
    setPriceRange([0, priceMax]);
    setShowPriceFilter(false);
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (
      dateFilterRef.current &&
      !dateFilterRef.current.contains(event.target as Node) &&
      dateButtonRef.current &&
      !dateButtonRef.current.contains(event.target as Node)
    ) {
      if (dateRange[0] && !dateRange[1]) {
        const newFilters = {
          ...filters,
          date: { from: dateRange[0], to: dateRange[0] },
        };
        setFilters(newFilters);
      }
      setShowDateFilter(false);
    }

    if (
      priceFilterRef.current &&
      !priceFilterRef.current.contains(event.target as Node) &&
      priceButtonRef.current &&
      !priceButtonRef.current.contains(event.target as Node)
    ) {
      if (
        priceRange[0] != initialPriceRange.current[0] ||
        priceRange[1] != initialPriceRange.current[1]
      ) {
        applyPriceFilter();
      } else {
        setShowPriceFilter(false);
      }
    }

    if (
      offeringsFilterRef.current &&
      !offeringsFilterRef.current.contains(event.target as Node) &&
      offeringsButtonRef.current &&
      !offeringsButtonRef.current.contains(event.target as Node)
    ) {
      setShowOfferingsFilter(false);
    }
  };

  useEffect(() => {
    if (window.innerWidth >= 768) {
      if (showPriceFilter || showDateFilter || showOfferingsFilter) {
        document.addEventListener('mousedown', handleOutsideClick);
      } else {
        document.removeEventListener('mousedown', handleOutsideClick);
      }
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showPriceFilter, showDateFilter, showOfferingsFilter, dateRange, priceRange]);

  const buttonClass = (isSelected: boolean) =>
    `group flex items-center gap-2 border px-3 py-2 ex:py-1 rounded-lg text-mist-white border-slate-black ${
      isSelected ? 'bg-beaming-orange' : 'bg-midnight'
    } ex:hover:bg-mist-white`;

  const closeButtonClass = `ex:ml-2 ml-auto text-mist-white group-hover:text-black active:text-beaming-orange`;

  const handlePriceInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const value = e.target.value.replace(/\D/g, '');

    if (isMexicoCityPrice) {
      const raw = value === '' ? 0 : Number(value);
      const numValue = Math.min(Math.max(raw, 0), 10000);
      const internal = numValue / 10;
      if (index === 0) {
        setPriceRange([internal, Math.max(internal, priceRange[1])]);
      } else {
        setPriceRange([Math.min(priceRange[0], internal), internal]);
      }
      return;
    }

    const raw = value === '' ? 0 : Number(value);
    const numValue = Math.min(priceMax, Math.max(0, Math.floor(raw)));

    if (index === 0) {
      setPriceRange([numValue, Math.max(numValue, priceRange[1])]);
    } else {
      setPriceRange([Math.min(priceRange[0], numValue), numValue]);
    }
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to midnight for accurate comparison

    if (view === 'month') {
      if (dateRange[0] && dateRange[1]) {
        const startDate = new Date(dateRange[0]);
        startDate.setHours(0, 0, 0, 0); // Set time to midnight for accurate comparison
        const endDate = new Date(dateRange[1]);
        endDate.setHours(23, 59, 59, 999); // Set time to end of day for accurate comparison

        if (date >= startDate && date <= endDate) {
          if (date.toDateString() === today.toDateString()) {
            return 'today';
          }
          return 'bg-selected'; // Custom class for selected date range
        }
      } else if (date.toDateString() === today.toDateString()) {
        return 'default-today';
      }
    }
    return 'transparent';
  };

  // Function to capitalize the first letter of a string
  const capitalizeFirstLetter = (string: string) => {
    return string?.charAt(0).toUpperCase() + string?.slice(1);
  };

  // Function to apply mobile filters
  const applyMobileFilters = () => {
    setFilters(mobileFilters);
    setSort(tempMobileSort);
    setShowMobileMenu(false);
  };

  // Function to remove mobile filters
  const removeMobileFilters = () => {
    setMobileFilters({});
    setFilters({});
    setDateRange([null, null]);
    setPriceRange([0, priceMax]);
    setLocationSearch('');
    setOfferingSearch('');
    setTempMobileSort({
      value: '',
      label: 'None',
    });
    setSort({
      value: '',
      label: 'None',
    });
  };

  // Function to handle mobile filter changes
  const handleMobileFilterChange = (newFilters: any) => {
    setMobileFilters(newFilters);
    
    // Close the mobile menu if there are no filters and no sort selected
    if (Object.keys(newFilters).length === 0 && !tempMobileSort.value) {
      setShowMobileMenu(false);
    }
  };

  const handleCalendarChange = (value: Date | Date[], isMobile = false) => {
    if (Array.isArray(value)) {
      handleDateChange(value, isMobile);
    } else {
      handleDateChange([value, value], isMobile);
    }
  };

  // Add key press handler to the offerings input
  const handleOfferingsKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setShowOfferingsFilter(false);
    }
  };

  if (isHidden) {
    return null;
  }

  return (
    <>
      <div className="ex:hidden flex justify-between gap-4 z-[2] relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMobileMenu();
          }}
          className={`group flex items-center gap-2 border-2 px-3 py-3 rounded-lg text-mist-white border-slate-black ${
            Object.keys(appliedFilters).length > 0 || sort.value 
              ? 'bg-beaming-orange' 
              : 'bg-midnight'
          }`}
        >
          <FaFilter className="text-mist-white" />
        </button>
      </div>

      {showMobileMenu && (
        <div className={`absolute  m-2 pt-10 left-0 right-0 bg-slate-black shadow-lg rounded-lg p-4 z-10 ${isMobileShrunken ? 'top-16' : 'top-28'}`}>
          <div className="flex flex-col gap-2 mb-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMobileMenu();
              }}
              className="absolute top-3 right-3 text-mist-white"
            >
              <FaTimes />
            </button>
            <button
              ref={dateButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                handleDateFilterClick();
              }}
              className={buttonClass(showDateFilter || !!mobileFilters.date)}
            >
              <FaCalendarAlt className="text-mist-white " />
              <span className="z-[1] text-mist-white ">{language === 'es' ? 'Fecha' : 'Date'}</span>
              {mobileFilters.date && (
                <FaTimes
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFilters = { ...mobileFilters };
                    delete newFilters.date;
                    handleMobileFilterChange(newFilters);
                    setFilters(newFilters);
                    setDateRange([null, null]);
                  }}
                  className={closeButtonClass}
                />
              )}
            </button>
            {showDateFilter && (
              <div
                ref={dateFilterRef}
                className="w-full bg-slate-black flex flex-col items-center rounded-lg p-2 z-10"
              >
                <div className="flex justify-between mb-2">
                  <button
                    onClick={() => handleQuickSelect('today', true)}
                    className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
                  >
                    {language == 'es' ? 'Hoy' : 'Today'}
                  </button>
                  <button
                    onClick={() => handleQuickSelect('tomorrow', true)}
                    className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
                  >
                    {language == 'es' ? 'Mañana' : 'Tomorrow'}
                  </button>
                  <button
                    onClick={() => handleQuickSelect('week', true)}
                    className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
                  >
                    {language == 'es' ? 'Esta semana' : 'This Week'}
                  </button>
                </div>
                <Calendar
                  selectRange
                  onChange={(value: any) => handleCalendarChange(value, true)}
                  onClickDay={handleDateClick}
                  value={dateRange}
                  className={
                    '!max-w-max rounded-lg !bg-slate-black border-none text-[0.9rem] shadow-[0px_5px_5px_rgba(0,0,0,0.25)] shadow-overlay_shadow'
                  }
                  tileClassName={tileClassName}
                  tileDisabled={() => false}
                  next2Label={null}
                  prev2Label={null}
                />
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePriceFilterClick();
              }}
              ref={priceButtonRef}
              className={buttonClass(showPriceFilter || !!mobileFilters.price)}
            >
              {language === 'es' || isMexicoCityPrice ? (
                <p className="font-semibold">{getCurrencySymbol()}</p>
              ) : (
                <FaDollarSign className="text-mist-white " />
              )}
              <span className="z-[1] text-mist-white ">
                {mobileFilters.price
                  ? `${priceDisplay(0)} - ${priceDisplay(1)}`
                  : language === 'es' ? 'Precio' : 'Price'}
              </span>
              {mobileFilters.price && (
                <FaTimes
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFilters = { ...mobileFilters };
                    delete newFilters.price;
                    handleMobileFilterChange(newFilters);
                    setFilters(newFilters);
                    setPriceRange([0, priceMax]);
                  }}
                  className={closeButtonClass}
                />
              )}
            </button>
            {showPriceFilter && (
              <div
                ref={priceFilterRef}
                className="w-full bg-slate-black flex flex-col items-center rounded-lg p-2 z-10"
              >
                <Range
                  values={priceRange}
                  step={isMexicoCityPrice ? 10 : 1}
                  min={0}
                  max={priceMax}
                  onChange={(values) => {
                    const [a, b] = values as [number, number];
                    if (isMexicoCityPrice) {
                      setPriceRange([a, b]);
                    } else {
                      setPriceRange([snapPriceUsd(a), snapPriceUsd(b)]);
                    }
                  }}
                  renderTrack={({ props, children }) => (
                    <div
                      {...props}
                      style={{
                        ...props.style,
                        height: '6px',
                        width: '100%',
                        background: getTrackBackground({
                          values: priceRange,
                          colors: ['#ccc', '#DA702C', '#ccc'],
                          min: 0,
                          max: priceMax,
                        }),
                      }}
                    >
                      {children}
                    </div>
                  )}
                  renderThumb={({ props }) => (
                    <div
                      {...props}
                      style={{
                        ...props.style,
                        height: '20px',
                        width: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#DA702C',
                        display: 'flex',
                        justifyContent: 'center',

                        alignItems: 'center',
                      }}
                    />
                  )}
                />

                <div className="flex justify-between w-72 mt-4 items-center">
                  <div className="flex items-center">
                    <span className="flex mr-2 text-mist-white text-xs">
                      {getCurrencySymbol()}
                    </span>
                    <input
                      type="text"
                      value={priceDisplay(0)}
                      onChange={(e) => handlePriceInputChange(e, 0)}
                      className="bg-midnight text-mist-white text-sm px-2 text-center py-1 rounded-full w-16 mr-2"
                      pattern="\d*"
                    />
                  </div>
                  <span className="text-mist-white">-</span>
                  <div className="flex items-center">
                    <span className="flex text-mist-white text-xs">
                      {getCurrencySymbol()}
                    </span>
                    <input
                      type="text"
                      value={priceDisplay(1)}
                      onChange={(e) => handlePriceInputChange(e, 1)}
                      className="bg-midnight text-mist-white text-sm px-2 text-center py-1 rounded-full w-16 ml-2"
                      pattern="\d*"
                    />
                  </div>
                </div>
                <button
                  onClick={() => applyPriceFilter(true)}
                  className="mt-2 px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
                >
                  {language === 'es' ? 'Aplicar' : 'Confirm'}
                </button>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLocationFilterClick();
              }}
              className={buttonClass(
                showLocationFilter || !!mobileFilters.location
              )}
            >
              <FaMapMarkerAlt className="text-mist-white " />
              <span className="z-[1] text-mist-white ">{language === 'es' ? 'Ubicación' : 'Location'}</span>
              {mobileFilters.location && (
                <FaTimes
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFilters = { ...mobileFilters };
                    delete newFilters.location;
                    handleMobileFilterChange(newFilters);
                    setFilters(newFilters);
                    setLocationSearch('');
                  }}
                  className={closeButtonClass}
                />
              )}
            </button>
            {showLocationFilter && (
              <div className="w-full bg-slate-black shadow-lg rounded-lg p-4 z-10">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Find a location"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full p-2 border bg-midnight text-mist-white border-slate-black rounded-lg mb-2"
                  />
                  <div className="overflow-y-auto max-h-60">
                    <div className="font-semibold text-beaming-orange">
                      States
                    </div>
                    {filteredStateOptions.map((state) => (
                      <div
                        key={state}
                        onClick={() => {
                          const newFilters = {
                            ...mobileFilters,
                            location: state,
                          };
                          handleMobileFilterChange(newFilters);
                          setShowLocationFilter(false);
                        }}
                        className={`p-2 rounded-lg cursor-pointer text-white ${
                          mobileFilters.location === state
                            ? 'bg-beaming-orange'
                            : 'hover:bg-beaming-orange'
                        }`}
                      >
                        {state}
                      </div>
                    ))}
                    <div className="font-semibold text-beaming-orange mt-2">
                      Cities
                    </div>
                    {filteredCityOptions.map((city) => (
                      <div
                        key={city}
                        onClick={() => {
                          const newFilters = {
                            ...mobileFilters,
                            location: city,
                          };
                          handleMobileFilterChange(newFilters);
                          setShowLocationFilter(false);
                        }}
                        className={`p-2 rounded-lg cursor-pointer text-white ${
                          mobileFilters.location === city
                            ? 'bg-beaming-orange'
                            : 'hover:bg-beaming-orange'
                        }`}
                      >
                        {city}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOfferingsFilterClick();
              }}
              className={buttonClass(
                showOfferingsFilter || !!mobileFilters.offerings
              )}
            >
              <FaList className="text-mist-white " />
              <span className="z-[1] text-mist-white ">{language == "es" ? "Propuestas" : "Offerings"} </span>
              {mobileFilters.offerings && (
                <FaTimes
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFilters = { ...mobileFilters };
                    delete newFilters.offerings;
                    handleMobileFilterChange(newFilters);
                    setFilters(newFilters);
                    setOfferingSearch('');
                  }}
                  className={closeButtonClass}
                />
              )}
            </button>
            {showOfferingsFilter && (
              <div className="w-full bg-slate-black shadow-lg rounded-lg p-4 z-10">
                <div className="relative">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder={language === 'es' ? 'Buscar una oferta' : 'Find an offering'}
                      value={offeringSearch}
                      onChange={(e) => {
                        setOfferingSearch(e.target.value);
                        const newFilters = {
                          ...mobileFilters,
                          offerings: e.target.value,
                        };
                        handleMobileFilterChange(newFilters);
                      }}
                      onKeyPress={handleOfferingsKeyPress}
                      className="w-full p-2 border bg-midnight text-mist-white border-slate-black rounded-lg mb-2"
                    />
                  </div>
                  <div className="overflow-y-auto max-h-60">
                    {filteredOfferingOptions.map((offering) => (
                      <div
                        key={offering}
                        onClick={() => {
                          const newFilters = {
                            ...mobileFilters,
                            offerings: offering,
                          };
                          handleMobileFilterChange(newFilters);
                          setShowOfferingsFilter(false);
                        }}
                        className={`p-2 rounded-lg cursor-pointer text-white ${
                          mobileFilters.offerings === offering
                            ? 'bg-beaming-orange'
                            : 'hover:bg-beaming-orange'
                        }`}
                      >
                        {capitalizeFirstLetter(offering)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSortClick();
              }}
              className={
                buttonClass(showSortOverlay) +
                (tempMobileSort.value
                  ? ' opacity-100 bg-beaming-orange text-mist-white'
                  : '')
              }
            >
              <BiSortAlt2 className="text-mist-white w-5 h-5 " />
              <span className="z-[1] flex justify-between flex-1 items-center text-mist-white ">
                {language === 'es' ? 'Ordenar' : 'Sort'}
                {tempMobileSort.value && (
                  <FaTimes
                    onClick={(e) => {
                      e.stopPropagation();
                      setTempMobileSort({ value: '', label: 'None' });
                      setSort({ value: '', label: 'None' });
                    }}
                  />
                )}
              </span>
            </button>
            {showSortOverlay && (
              <SortOverlay
                hide={() => setShowSortOverlay(false)}
                value={tempMobileSort}
                onChange={(newValue: any) =>
                  setTempMobileSort(newValue as Option)
                }
                options={ language === 'es' ? Constants.spanishEventsSortingOptionsDashboard : Constants.eventsSortingOptionsDashboard}
              />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                applyMobileFilters();
              }}
              className="bg-beaming-orange mt-2 text-mist-white text-sm px-4 py-2 rounded-full shadow-md hover:bg-orange-600 transition duration-200 ease-in-out"
            >
              {language === 'es' ? 'Applicar' : 'Apply'}
            </button>
            {(Object.keys(appliedFilters).length > 0 || sort.value) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeMobileFilters();
                }}
                className=" text-mist-white text-sm px-4 py-2 rounded-full  transition duration-200 ease-in-out mt-2"
              >
                {language === 'es' ? 'Limpiar Filtros/Ordenar' : 'Clear Filters/Sort'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="hidden ex:flex justify-between gap-4 z-[2] relative">
        <button
          ref={dateButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            handleDateFilterClick();
            hideSortOverlay();
          }}
          className={buttonClass(showDateFilter || !!filters.date)}
        >
          <FaCalendarAlt className="text-mist-white group-hover:brightness-0" />
          <span className="z-[1] text-mist-white group-hover:brightness-0">
            {language === 'es' ? 'Fecha' : 'Date'}
          </span>
          {filters.date && (
            <FaTimes
              onClick={(e) => {
                e.stopPropagation();
                const newFilters = { ...filters };
                delete newFilters.date;
                setFilters(newFilters);
                setDateRange([null, null]);
              }}
              className={closeButtonClass}
            />
          )}
        </button>
        {showDateFilter && (
          <div
            ref={dateFilterRef}
            className="absolute top-12 -left-12 w-fit bg-slate-black rounded-lg p-2 z-10"
          >
            <div className="flex justify-between mb-2">
              <button
                onClick={() => handleQuickSelect('today')}
                className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
              >
                {language === 'es' ? 'Hoy' : 'Today'}
              </button>
              <button
                onClick={() => handleQuickSelect('tomorrow')}
                className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
              >
                {language === 'es' ? 'Mañana' : 'Tomorrow'}
              </button>
              <button
                onClick={() => handleQuickSelect('week')}
                className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
              >
                {language === 'es' ? 'Esta semana' : 'This Week'}
              </button>
            </div>
            <Calendar
              selectRange
              onChange={(value: any) => handleCalendarChange(value, false)}
              onClickDay={handleDateClick}
              value={dateRange}
              className={
                '!max-w-max rounded-lg !bg-slate-black border-none text-[0.9rem] shadow-[0px_5px_5px_rgba(0,0,0,0.25)] shadow-overlay_shadow'
              }
              tileClassName={tileClassName}
              tileDisabled={() => false}
              next2Label={null}
              prev2Label={null}
              locale={language === 'es' ? 'es' : 'en'}
            />
          </div>
        )}
        <button
          ref={priceButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            handlePriceFilterClick();
            hideSortOverlay();
          }}
          className={buttonClass(showPriceFilter || !!filters.price)}
        >
          {language === 'es' || isMexicoCityPrice ? (
            <p className="font-semibold group-hover:brightness-0">
              {getCurrencySymbol()}
            </p>
          ) : (
            <FaDollarSign className="text-mist-white group-hover:brightness-0" />
          )}
          <span className="z-[1] text-mist-white group-hover:brightness-0 whitespace-nowrap">
            {filters.price
              ? `${priceDisplay(0)} - ${priceDisplay(1)}`
              : language === 'es'
                ? 'Precio'
                : 'Price'}
          </span>
          {filters.price && (
            <FaTimes
              onClick={(e) => {
                e.stopPropagation();
                const newFilters = { ...filters };
                delete newFilters.price;
                setFilters(newFilters);
                setPriceRange([0, priceMax]);
              }}
              className={closeButtonClass}
            />
          )}
        </button>
        {showPriceFilter && (
          <div
            ref={priceFilterRef}
            className="absolute top-12 left-12 bg-slate-black shadow-lg w-80 rounded-lg p-6 z-10"
          >
            <Range
              values={priceRange}
              step={isMexicoCityPrice ? 10 : 1}
              min={0}
              max={priceMax}
              onChange={(values: any) => {
                const [a, b] = values as [number, number];
                if (isMexicoCityPrice) {
                  setPriceRange([a, b]);
                } else {
                  setPriceRange([snapPriceUsd(a), snapPriceUsd(b)]);
                }
              }}
              renderTrack={({ props, children }) => (
                <div
                  {...props}
                  style={{
                    ...props.style,
                    height: '6px',
                    width: '100%',
                    background: getTrackBackground({
                      values: priceRange,
                      colors: ['#ccc', '#DA702C', '#ccc'],
                      min: 0,
                      max: priceMax,
                    }),
                  }}
                >
                  {children}
                </div>
              )}
              renderThumb={({ props }) => (
                <div
                  {...props}
                  style={{
                    ...props.style,
                    height: '20px',
                    width: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#DA702C',
                    display: 'flex',
                    justifyContent: 'center',

                    alignItems: 'center',
                  }}
                />
              )}
            />
            <div className="flex justify-between gap-4 items-center mt-6 w-full">
              <div className="flex items-center">
                <span className="flex mr-2 text-mist-white text-xs">
                  {getCurrencySymbol()}
                </span>
                <input
                  type="text"
                  value={priceDisplay(0)}
                  onChange={(e) => handlePriceInputChange(e, 0)}
                  className="bg-midnight text-mist-white text-sm px-2 text-center py-1 rounded-full w-16 mr-2"
                  pattern="\d*"
                />
              </div>
              <span className="text-mist-white">-</span>
              <div className="flex items-center">
                                    <span className="flex mr-0 text-mist-white text-xs">
                      {getCurrencySymbol()}
                    </span>
                <input
                  type="text"
                  value={priceDisplay(1)}
                  onChange={(e) => handlePriceInputChange(e, 1)}
                  className="bg-midnight text-mist-white text-sm px-2 text-center py-1 rounded-full w-16 ml-2"
                  pattern="\d*"
                />
              </div>
            </div>
            <div className="flex justify-center mt-4">
              <button
                onClick={() => applyPriceFilter(false)}
                className="px-4 py-2 bg-midnight text-mist-white text-[0.8rem] rounded-full hover:bg-beaming-orange"
              >
                {language === 'es' ? 'Aplicar' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleLocationFilterClick();
            hideSortOverlay();
          }}
          className={buttonClass(showLocationFilter || !!filters.location)}
        >
          <FaMapMarkerAlt className="text-mist-white group-hover:brightness-0" />
          <span className="z-[1] text-mist-white group-hover:brightness-0">
            {language === 'es' ? 'Ubicación' : 'Location'}
          </span>
          {filters.location && (
            <FaTimes
              onClick={(e) => {
                e.stopPropagation();
                const newFilters = { ...filters };
                delete newFilters.location;
                setFilters(newFilters);
                setLocationSearch('');
              }}
              className={closeButtonClass}
            />
          )}
        </button>
        {showLocationFilter && (
          <div className="absolute top-12 right-32 bg-slate-black shadow-lg rounded-lg p-4 z-10">
            <div className="relative">
              <input
                type="text"
                placeholder={language === 'es' ? 'Buscar una ubicación' : 'Find a location'}
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                className="w-full p-2 border bg-midnight text-mist-white border-slate-black rounded-lg mb-2"
              />
              <div className="overflow-y-auto max-h-60">
                <div className="font-semibold text-beaming-orange">{language === 'es' ? 'Estados' : 'States'}</div>
                {filteredStateOptions.length === 0 ? (
                  <div className="p-2 text-mist-white opacity-50">
                    {language === 'es' ? 'No hay estados' : 'No states'}
                  </div>
                ) : (
                  filteredStateOptions.map((state) => (
                    <div
                      key={state}
                      onClick={() => {
                        setFilters({ ...filters, location: state });
                        setShowLocationFilter(false);
                      }}
                      className={`p-2 rounded-lg cursor-pointer text-white ${
                        filters.location === state
                          ? 'bg-beaming-orange'
                          : 'hover:bg-beaming-orange'
                      }`}
                    >
                      {state}
                    </div>
                  ))
                )}
                
                <div className="font-semibold text-beaming-orange mt-2">
                  {language === 'es' ? 'Ciudades' : 'Cities'}
                </div>
                {filteredCityOptions.map((city) => (
                  <div
                    key={city}
                    onClick={() => {
                      setFilters({ ...filters, location: city });
                      setShowLocationFilter(false);
                    }}
                    className={`p-2 rounded-lg cursor-pointer text-white ${
                      filters.location === city
                        ? 'bg-beaming-orange'
                        : 'hover:bg-beaming-orange'
                    }`}
                  >
                    {city}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <button
          ref={offeringsButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            handleOfferingsFilterClick();
            hideSortOverlay();
          }}
          className={buttonClass(showOfferingsFilter || !!filters.offerings)}
        >
          <FaList className="text-mist-white group-hover:brightness-0" />
          <span className="z-[1] text-mist-white group-hover:brightness-0">
            {language === 'es' ? 'Propuestas' : 'Offerings'}
          </span>
          {filters.offerings && (
            <FaTimes
              onClick={(e) => {
                e.stopPropagation();
                const newFilters = { ...filters };
                delete newFilters.offerings;
                setFilters(newFilters);
                setOfferingSearch('');
                setShowOfferingsFilter(false);
              }}
              className={closeButtonClass}
            />
          )}
        </button>
        {showOfferingsFilter && (
          <div 
            ref={offeringsFilterRef}
            className="absolute top-12 right-0 bg-slate-black shadow-lg rounded-lg p-4 z-10"
          >
            <div className="relative">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder={language === 'es' ? 'Buscar una oferta' : 'Find an offering'}
                  value={offeringSearch}
                  onChange={(e) => {
                    setOfferingSearch(e.target.value);
                    setFilters({ ...filters, offerings: e.target.value });
                  }}
                  onKeyPress={handleOfferingsKeyPress}
                  className="w-full p-2 border bg-midnight text-mist-white border-slate-black rounded-lg mb-2"
                />
              </div>
              <div className="overflow-y-auto max-h-60">
                {filteredOfferingOptions.map((offering) => (
                  <div
                    key={offering}
                    onClick={() => {
                      setFilters({ ...filters, offerings: offering });
                      setShowOfferingsFilter(false);
                    }}
                    className={`p-2 rounded-lg cursor-pointer text-white ${
                      filters.offerings === offering
                        ? 'bg-beaming-orange'
                        : 'hover:bg-beaming-orange'
                    }`}
                  >
                    {capitalizeFirstLetter(offering)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DashboardFilter;
