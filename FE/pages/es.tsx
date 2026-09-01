import type { NextPage } from 'next';
import { useStore } from '../store/store';
import React, { useState, useEffect, useMemo } from 'react';
import EventsSection from '../components/Dashboard/EventsSection';
import EventDetails from '../components/Dashboard/EventDetails';
import { closePopup } from '../store/actions/popup';
import { BiSortAlt2 } from 'react-icons/bi';
import EventService from '../services/lib/event';
import { formatDate, isStateCode } from '../utils/utils';
import { eventSpanOverlapsWindow, eventStartsInWindow } from '../utils/eventDateSpan';
import { Option } from '../interface/filterInterface';
import { Constants } from '../utils/constants';
import { Event } from '../interface/objects/simpleObject';
import SearchBar from '../components/SearchBar';
import SortOverlay from '../components/SortOverlay';
import ActionDialog from '../components/overlay/ActionDialog';
import LoadingDialog from '../components/overlay/LoadingDialog';
import DashboardFilter from '../components/Filter/DashboardFilter';
import { FaEye, FaTimes } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { logout } from '../store/actions/auth';
import Image from 'next/image';
import UserDropdown from '../components/Dashboard/UserDropdown';

const Home: NextPage = () => {
  const [state, dispatch] = useStore();
  const router = useRouter();
  const { search, loader, actionDialog, auth } = state;

  const [sort, setSort] = useState<Option>({ value: '', label: 'None' });
  const [showSortOverlay, setShowSortOverlay] = useState(false);

  const [isFetchingEvents, setIsFetchingEvents] = useState(true);
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isTomorrowLoading, setIsTomorrowLoading] = useState(true);
  const [isWeekendLoading, setIsWeekendLoading] = useState(true);
  const [isWeekLoading, setIsWeekLoading] = useState(true);
  const [isYearLoading, setIsYearLoading] = useState(true);
  const [isLastYearLoading, setIsLastYearLoading] = useState(true);

  const [todayEvents, setTodayEvents] = useState<Event[] | null>(null);
  const [tomorrowEvents, setTomorrowEvents] = useState<Event[] | null>(null);
  const [weekendEvents, setWeekendEvents] = useState<Event[] | null>(null);
  const [weekEvents, setWeekEvents] = useState<Event[] | null>(null);
  const [yearEvents, setYearEvents] = useState<Event[] | null>(null);
  const [lastYearEvents, setLastYearEvents] = useState<Event[] | null>(null);
  const [lastClickedSection, setLastClickedSection] = useState<string>('');

  const [filteredEvents, setFilteredEvents] = useState<Event[] | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userLastName, setUserLastName] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<string>('');

  const [isList, setIsList] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsList(true);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    setUserFirstName(localStorage.getItem('userFirstName'));
    setUserLastName(localStorage.getItem('userLastName'));
  }, []);

  const [appliedFilters, setAppliedFilters] = useState({
    date: null,
    price: null,
    location: '',
    offerings: '',
  });

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');

    const currentTimeHour = new Date().getHours();

    const fetchEvents = async () => {
      setIsFetchingEvents(true);
      setIsTodayLoading(true);
      setIsTomorrowLoading(true);
      setIsWeekendLoading(true);
      setIsWeekLoading(true);
      setIsYearLoading(true);
      setIsLastYearLoading(true);

      const today = new Date();
      const yesterdaysDate = new Date(today);
      yesterdaysDate.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + 1);
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 6);
      const weekendStart = new Date(today);
      weekendStart.setDate(
        today.getDay() === 0
          ? today.getDate()
          : today.getDate() + (6 - today.getDay())
      );
      const weekendEnd = new Date(weekendStart);
      weekendEnd.setDate(
        today.getDay() === 0 ? today.getDate() : weekendStart.getDate() + 1
      );
      const yearEnd = new Date(today);
      yearEnd.setDate(today.getDate() + 365);
      const lastYearStart = new Date(today);
      lastYearStart.setDate(today.getDate() - 365);
      const lastYearEnd = new Date(today);
      lastYearEnd.setDate(today.getDate() - 1);

      try {
        try {
          const todayData = currentTimeHour >= 5
            ? await EventService.getEventByDate({ date: formatDate(today) })
            : await EventService.getEventByDateRange({
                start: formatDate(yesterdaysDate),
                end: formatDate(today),
              });
          setTodayEvents(todayData.data.data);
          setIsTodayLoading(false);
        } catch (error) {
          console.error('Fetching today events failed:', error);
          setIsTodayLoading(false);
        }
        
        try {
          const tomorrowData = await EventService.getEventByDate({ date: formatDate(tomorrow) });
          const filteredTomorrowEvents = tomorrowData.data.data.filter(
            (event: Event) => {
              if (!event.start_time) return false;

              const eventTime = event.start_time.match(/(\d+):(\d+)\s*(AM|PM)/);
              if (!eventTime) return false;

              const [hours, minutes, period] = eventTime?.slice(1);
              let eventHours = parseInt(hours, 10);
              if (period === 'PM' && eventHours !== 12) eventHours += 12;
              if (period === 'AM' && eventHours === 12) eventHours = 0;
              return eventHours <= 5;
            }
          );
          
          setTodayEvents(prevTodayEvents => [
            ...(prevTodayEvents || []), 
            ...filteredTomorrowEvents
          ]);
          setTomorrowEvents(tomorrowData.data.data);
          setIsTomorrowLoading(false);
        } catch (error) {
          console.error('Fetching tomorrow events failed:', error);
          setIsTomorrowLoading(false);
        }
        
        try {
          const weekendData = await EventService.getEventByDateRange({
            start: formatDate(weekendStart),
            end: formatDate(weekendEnd),
          });
          setWeekendEvents(weekendData.data.data);
          setIsWeekendLoading(false);
        } catch (error) {
          console.error('Fetching weekend events failed:', error);
          setIsWeekendLoading(false);
        }
        
        try {
          const weekData = await EventService.getEventByDateRange({
            start: formatDate(weekStart),
            end: formatDate(weekEnd),
          });
          setWeekEvents(weekData.data.data);
          setIsWeekLoading(false);
        } catch (error) {
          console.error('Fetching week events failed:', error);
          setIsWeekLoading(false);
        }
        
        try {
          const yearData = await EventService.getEventByDateRange({
            start: formatDate(new Date()),
            end: formatDate(yearEnd),
          });
          setYearEvents(yearData.data.data);
          setIsYearLoading(false);
        } catch (error) {
          console.error('Fetching year events failed:', error);
          setIsYearLoading(false);
        }
        
        try {
          const lastYearData = await EventService.getEventByDateRange({
            start: formatDate(lastYearStart),
            end: formatDate(lastYearEnd),
          });
          setLastYearEvents(lastYearData.data.data);
          setIsLastYearLoading(false);
        } catch (error) {
          console.error('Fetching last year events failed:', error);
          setIsLastYearLoading(false);
        }
        
        setIsFetchingEvents(false);
      } catch (error) {
        console.error('Fetching events failed:', error);
        setIsFetchingEvents(false);
        setIsTodayLoading(false);
        setIsTomorrowLoading(false);
        setIsWeekendLoading(false);
        setIsWeekLoading(false);
        setIsYearLoading(false);
        setIsLastYearLoading(false);
      }
    };

    EventService.getFavoritedEvents({ email: userEmail || '' }).then((res) => {
      //console.log(res);
    });

    fetchEvents();
  }, []);

  const sortListByProperty = (
    sortValue: string,
    list: Event[] | null
  ): Event[] | null => {
    console.log("sortListByProperty", sortValue, list);
    if (!list || sortValue === '') return list;

    const underscoreIndex = sortValue.lastIndexOf('_');
    if (underscoreIndex === -1) {
      console.error('Invalid sort value:', sortValue);
      return list;
    }

    const field = sortValue.substring(0, underscoreIndex);
    const direction = sortValue.substring(underscoreIndex + 1);

    const getResolvedName = (event: Event): string => {
      const Constants = { delimiter: ',' };
      const getValue = (
        value: string | null,
        fallback1: string | null = null,
        fallback2: string | null = null
      ) => {
        if (value && value.trim() !== '') {
          return value.split(Constants.delimiter)[0];
        }
        if (fallback1 && fallback1.trim() !== '') {
          return fallback1.split(Constants.delimiter)[0];
        }
        if (fallback2 && fallback2.trim() !== '') {
          return fallback2.split(Constants.delimiter)[0];
        }
        return '...';
      };
      return getValue(event.name, event.artist, event.promoter).toLowerCase();
    };

    return [...list].sort((a, b) => {
      let valA: any, valB: any;

      switch (field) {
        case 'timestamp':
        case 'start_date':
        case 'end_date':
        case 'created_at':
        case 'date':
          const dateA = new Date(a[field]);
          const timeA = a.start_time || '23:59:59';
          const dateB = new Date(b[field]);
          const timeB = b.start_time || '23:59:59';

          const combinedDateTimeA = new Date(
            dateA.toDateString() + ' ' + timeA
          );
          const combinedDateTimeB = new Date(
            dateB.toDateString() + ' ' + timeB
          );

          valA = combinedDateTimeA;
          valB = combinedDateTimeB;
          break;
        case 'name':
          valA = getResolvedName(a);
          valB = getResolvedName(b);
          return direction === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case 'price':
          const parsePrice = (price: string | null): number => {
            if (!price) return 0;
            price = price.toLowerCase().trim();
            if (price === 'no cover' || price === 'free') return 0;
            const numericPriceStr = price.replace(/[^0-9.]/g, '');
            return isNaN(parseFloat(numericPriceStr))
              ? 0
              : parseFloat(numericPriceStr);
          };
          valA = parsePrice(a[field]);
          valB = parsePrice(b[field]);
          break;
        default:
          console.error('No valid sorting field provided:', field);
          return 0;
      }
      return direction === 'asc' ? valA - valB : valB - valA;
    });
  };

  const sortedEvents: Event[] | null = useMemo(() => {
    const eventsToSort = filteredEvents ?? [
      ...(todayEvents ?? []),
      ...(weekEvents ?? []),
      ...(yearEvents ?? []),
      ...(lastYearEvents ?? []),
    ];

    const uniqueEventsToSort: Event[] = Array.from(
      new Set(eventsToSort.map((event) => event.id))
    ).map((id) => eventsToSort.find((event) => event.id === id)) as Event[];

    // Apply default sorting by event date if no sort value is provided
    return sort?.value
      ? sortListByProperty(sort.value, uniqueEventsToSort)
      : sortListByProperty('start_date_asc', uniqueEventsToSort);
  }, [
    filteredEvents,
    todayEvents,
    weekEvents,
    yearEvents,
    lastYearEvents,
    sort?.value,
  ]);

  const applyFilters = (events: Event[], filters: any) => {
    let filteredEvents = events;

    if (filters.date) {
      const { from, to } = filters.date;
      filteredEvents = filteredEvents.filter((event) => {
        const eventStart = new Date(event.start_date).setHours(0, 0, 0, 0);
        const eventEnd = event.end_date
          ? new Date(event.end_date).setHours(23, 59, 59, 999)
          : eventStart;

        const filterFrom = new Date(from).setHours(0, 0, 0, 0);
        const filterTo = to
          ? new Date(to).setHours(23, 59, 59, 999)
          : filterFrom;

        return eventStart >= filterFrom && eventEnd <= filterTo;
      });
    }

    if (filters.price) {
      const [min, max] = filters.price;

      filteredEvents = filteredEvents.filter((event) => {
        let eventPrice = 0; // Default to 0

        if (event.price !== null && event.price !== undefined) {
          const priceStr = event.price.toLowerCase().trim();
          if (priceStr === 'no cover' || priceStr === 'free') {
            eventPrice = 0;
          } else {
            // Remove dollar sign and other non-numeric characters
            const numericPriceStr = priceStr.replace(/[^0-9.]/g, '');
            if (!isNaN(parseFloat(numericPriceStr))) {
              eventPrice = parseFloat(numericPriceStr);
            } else {
              console.warn(
                `Unexpected price format: "${event.price}" for event ID: ${event.id}`
              );
            }
          }
        }

        return eventPrice >= min && eventPrice <= max;
      });
    }

    if (filters.location) {
      const location = filters.location.toLowerCase();
      filteredEvents = filteredEvents.filter((event) => {
        if (isStateCode(location)) {
          return event.venue.state?.toLowerCase() === location; // Exact match for state code
        } else {
          return event.venue.city?.toLowerCase().includes(location); // Partial match for city
        }
      });
    }

    if (filters.offerings) {
      filteredEvents = filteredEvents.filter((event) =>
        // offering is null for ~42% of events since the structured extractor
        // shipped. An unguarded .toLowerCase() here crashed the whole app on
        // the first keystroke in the offerings box (2026-09-01 outage class):
        // a null offering simply does not match the filter.
        (event.offering ?? '').toLowerCase().includes(filters.offerings.toLowerCase())
      );
    }

    return filteredEvents;
  };

  const handleFilterChange = (filters: any) => {
    setAppliedFilters(filters);
    if (Object.keys(filters).length === 0 && filters.constructor === Object) {
      setFilteredEvents(null);
      return;
    }

    const allEvents = [
      ...(todayEvents ?? []),
      ...(weekEvents ?? []),
      ...(yearEvents ?? []),
      ...(lastYearEvents ?? []),
    ];

    const filtered = applyFilters(allEvents, filters);

    const uniqueFilteredEvents: Event[] = Array.from(
      new Set(filtered.map((event) => event.id))
    ).map((id) => filtered.find((event) => event.id === id)) as Event[];

    const sortedFilteredEvents = sortListByProperty(
      sort.value || 'start_date_asc',
      uniqueFilteredEvents
    );

    setFilteredEvents(sortedFilteredEvents);
    setShowSortOverlay(false); // Close the sort dropdown
  };

  const searchSortedFilteredEvents = useMemo(() => {
    return filteredEvents && search.eventResults
      ? sortListByProperty(
          sort.value,
          filteredEvents.filter((event) =>
            search.eventResults?.find(
              (searchEvent: Event) => searchEvent.id === event.id
            )
          )
        )
      : search.eventResults && sort.value
      ? sortListByProperty(sort.value, search.eventResults)
      : filteredEvents
      ? sortListByProperty(sort.value, filteredEvents)
      : sortListByProperty('start_date_asc', [
          ...(todayEvents ?? []),
          ...(weekEvents ?? []),
          ...(yearEvents ?? []),
          ...(lastYearEvents ?? []),
        ]);
  }, [filteredEvents, search.eventResults, sort.value]);

  const handleLogout = () => {
    logout(false)(dispatch);
    router.push('/login');
  };

  useEffect(() => {
    //console.log("!!!activeDropdown", activeDropdown);
  }, [activeDropdown]);

  const highlightedFields = {
    isNameActive: search.show || sort.value.includes('name'),
    isDateActive: !!appliedFilters.date || sort.value.includes('timestamp'),
    isPriceActive: !!appliedFilters.price || sort.value.includes('price'),
    isLocationActive: !!appliedFilters.location,
  };

  const isDateFilter = appliedFilters.date;

  const getSiftedEvents = (
    events: Event[] | null,
    sectionType:
      | 'todayEvents'
      | 'tomorrowEvents'
      | 'weekendEvents'
      | 'weekEvents'
      | 'yearEvents'
      | 'pastEvents'
      | 'specificDayEvents'
      | 'nextWeekEvents'
      | 'afterNextWeekEvents',
    filters: typeof appliedFilters,
    specificDay?: number
  ): Event[] | null => {
    if (!events) return null;

    let filteredEvents = events;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMidnight = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      0,
      0,
      0,
      0
    ).getTime();

    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0
    ).getTime();

    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    const currentTimeHour = new Date().getHours();

    switch (sectionType) {
      case 'todayEvents': {
        const windowStart =
          currentTimeHour < 5 ? yesterdayMidnight : todayMidnight;
        const windowEnd = endOfToday;
        filteredEvents = filteredEvents.filter((event) =>
          eventStartsInWindow(event, windowStart, windowEnd)
        );
        break;
      }

      case 'tomorrowEvents': {
        const tomorrowStart = todayMidnight + 24 * 60 * 60 * 1000;
        const tomorrowEnd = endOfToday + 24 * 60 * 60 * 1000;
        filteredEvents = filteredEvents.filter((event) =>
          eventStartsInWindow(event, tomorrowStart, tomorrowEnd)
        );
        break;
      }

      case 'specificDayEvents':
        if (specificDay !== undefined) {
          const currentDayOfWeek = today.getDay();
          let daysToAdd = specificDay - currentDayOfWeek;
          if (daysToAdd <= 0) daysToAdd += 7;

          const specificDayStart =
            todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
          const specificDayEnd = specificDayStart + 24 * 60 * 60 * 1000 - 1;

          filteredEvents = filteredEvents.filter((event) =>
            eventStartsInWindow(event, specificDayStart, specificDayEnd)
          );
        }
        break;

      case 'nextWeekEvents': {
        const currentDayOfWeek = today.getDay();
        const daysUntilNextMonday =
          currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
        const nextMondayStart =
          todayMidnight + daysUntilNextMonday * 24 * 60 * 60 * 1000;
        const nextSundayEnd =
          nextMondayStart + 6 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1;

        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, nextMondayStart, nextSundayEnd)
        );
        break;
      }

      case 'afterNextWeekEvents': {
        const currentDayOfWeek = today.getDay();
        const daysUntilNextMonday =
          currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
        const nextMondayStart =
          todayMidnight + daysUntilNextMonday * 24 * 60 * 60 * 1000;
        const afterNextMondayStart =
          nextMondayStart + 7 * 24 * 60 * 60 * 1000;

        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(
            event,
            afterNextMondayStart,
            Number.MAX_SAFE_INTEGER
          )
        );
        break;
      }

      case 'weekendEvents': {
        const weekendStart = todayMidnight + 24 * 60 * 60 * 1000;
        const weekendEnd = endOfToday + 24 * 60 * 60 * 1000;
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, weekendStart, weekendEnd)
        );
        break;
      }

      case 'weekEvents': {
        const startOfTomorrow = todayMidnight + 24 * 60 * 60 * 1000;
        const endOfWeek = startOfTomorrow + 6 * 24 * 60 * 60 * 1000;
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, startOfTomorrow, endOfWeek - 1)
        );
        break;
      }

      case 'yearEvents':
        filteredEvents = filteredEvents.filter(
          (event) => new Date(event.start_date) > today
        );
        break;

      case 'pastEvents': {
        const y = new Date(yesterday);
        const yesterdayEnd = new Date(
          y.getFullYear(),
          y.getMonth(),
          y.getDate(),
          23,
          59,
          59,
          999
        ).getTime();
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, yesterdayMidnight, yesterdayEnd)
        );
        break;
      }

      default:
        return null;
    }

    // Apply any additional filters
    filteredEvents = applyFilters(filteredEvents, filters);

    return filteredEvents;
  };

  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsAtTop(currentScrollY <= 100);
      if (currentScrollY <= 100) {
        setIsNavbarVisible(true); // Show navbar at the top
      } else if (currentScrollY < lastScrollY) {
        setIsNavbarVisible(true); // Show navbar on scroll up
      } else {
        setIsNavbarVisible(false); // Hide navbar on scroll down
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastScrollY]);

  return (
    <div
      className="py-5 font-montserrat h-full bg-midnight"
      onClick={() => {
        closePopup()(dispatch);
      }}
    >
      <nav
        className={`fixed top-0 left-0 w-[100vw] flex md:flex-row flex-wrap flex-col gap-4 justify-between py-4 border-0 z-10 bg-midnight transition-transform duration-300 md:py-6 ex:gap-6 ex:mx-10 ex:ml-0 ex:pl-10 ex:px-0 ex:pr-[56px] ${
          isNavbarVisible ? 'translate-y-0' : '-translate-y-full'
        } ${isAtTop ? 'border-0' : 'border-b-[2px] border-slate-black'}`}
      >
        {isAtTop && (
          <div className="px-6 ex:px-0 flex items-end text-mist-white flex justify-between md:hidden">
            <Image
              src="/images/wordMark.png"
              alt="Lafa's List"
              width={240}
              height={80}
            />
            <button className="flex items-center text-sm gap-2 hidden text-mist-white border border-slate-black px-3 rounded-lg h-8 mb-[-1px] md:hover:bg-mist-white md:hover:text-midnight transition-all duration-300 ease-in-out" 
              onClick={()=>{
                setIsList(prev => !prev);
              }}>
              <FaEye />
              {isList ? 'Grid' : 'List'}
            </button>
          </div>
        )}
        <div className="ex:px-0 px-6 flex font-normal text-mist-white flex items-end justify-between hidden md:flex mb-[-1px] gap-4 max-h-[40px]">
          <Image
            src="/images/wordMark.png"
            alt="Lafa's List"
            width={240}
            height={80}
          />
          <button className="flex items-center text-xs gap-2 hidden ex:flex text-mist-white border border-slate-black px-3 rounded-lg h-8 mb-[-1px] md:hover:bg-mist-white md:hover:text-midnight transition-all duration-300 ease-in-out" 
            onClick={()=>{
              setIsList(prev => !prev);
            }}>
            <FaEye />
            {isList ? 'Grid' : 'List'}
          </button>
        </div>
        <div className="flex flex-1 justify-between md:justify-end gap-4 z-[2] pl-6 pr-0 max-w-[94vw] ex:relative ex:px-0">
          <SearchBar language="es" forceShrink={Object.values(appliedFilters).filter(value => value !== null && value !== '').length+2} />
          <div className="flex items-center gap-2">
            <button 
              className={`flex p-2 flex-col h-[45px] justify-center items-center text-xs gap-2 ex:hidden text-mist-white px-3 rounded-lg
                ${isList 
                  ? 'border border-2 border-slate-black font-semibold text-black bg-beaming-orange' 
                  : 'border border-2 border-slate-black bg-transparent-white opacity-50'
                } transition-all duration-300`}
              onClick={()=>{
                setIsList(prev => !prev);
              }}>
              List
            </button>
            <DashboardFilter
              onFilterChange={handleFilterChange}
              appliedFilters={appliedFilters}
              hideSortOverlay={() => setShowSortOverlay(false)}
              setSort={setSort}
              sort={sort}
              events={[
                ...(todayEvents ?? []),
                ...(weekEvents ?? []),
                ...(yearEvents ?? []),
                ...(lastYearEvents ?? []),
              ]}
              language="es"
              setActiveDropdown={setActiveDropdown}
              resetDropdowns={activeDropdown != 'filter'}
              isHidden={!isNavbarVisible}
              isMobileShrunken={!isAtTop}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSortOverlay((prev) => !prev);
                setActiveDropdown('sort');
              }}
              className={
                'ex:flex hidden ml-2 group items-center gap-2 hover:bg-mist-white border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white' +
                (sort.value
                  ? ' opacity-100 bg-beaming-orange text-mist-white'
                  : '')
              }
            >
              <div
                className={
                  'w-full h-full absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100' +
                  (sort.value ? ' opacity-100 text-mist-white' : '')
                }
              ></div>
              <BiSortAlt2
                className={
                  'w-5 h-5 z-[1]  filter group-hover:!brightness-0' +
                  (sort?.value ? '  text-mist-white' : '')
                }
              />
              <span
                className={
                  'z-[1] flex items-center gap-2  filter group-hover:!brightness-0 ' +
                  (sort?.value ? '  text-mist-white' : '')
                }
              >
                Ordenar
                {sort.value && (
                  <FaTimes
                    onClick={(e) => {
                      e.stopPropagation();
                      setSort({ value: '', label: 'None' });
                    }}
                  />
                )}
              </span>
            </button>
            {activeDropdown === 'sort' ? (
              <SortOverlay
                hide={() => setShowSortOverlay(false)}
                value={sort}
                onChange={(newValue: any) => setSort(newValue as Option)}
                options={Constants.spanishEventsSortingOptionsDashboard}
                isHidden={!isNavbarVisible}
              />
            ) : null}
            <div className="flex items-center">
              {mounted && auth.isUserLoggedIn && (
                <UserDropdown 
                  isHomeSelected={true} 
                  language="es" 
                  setActiveDropdown={setActiveDropdown} 
                  resetDropdowns={activeDropdown != 'user'}
                  hideDropdown={!isNavbarVisible}
                />
              )}
            </div>
            {mounted && !auth.isUserLoggedIn && (
              <UserDropdown 
                isHomeSelected={true} 
                isLoggedOut={true} 
                language="es" 
                setActiveDropdown={setActiveDropdown} 
                resetDropdowns={activeDropdown != 'user'}
                hideDropdown={!isNavbarVisible}
              />
            )}
          </div>
        </div>
      </nav>
      <div
        className={`h-0 ex:h-[${
          isAtTop ? '3' : '0'
        }px] mt-[100px] md:mt-[68px] mx-10 bg-gradient-to-r from-beaming-orange-light to-sacral-red`}
      />

      <main className="py-2 h-[91%] px-6 ex:p-10 ex:pt-6 ex:pb-0 flex flex-col gap-5 bg-midnight ">
        {search.show ? (
          <EventsSection
            key="searchEvents"
            title="Resultados de la búsqueda"
            subTitle={`Mostrando ${
              filteredEvents
                ? searchSortedFilteredEvents?.length ?? 0
                : search.eventResults?.length ?? 0
            } evento(s)`}
            events={
              filteredEvents ? searchSortedFilteredEvents : search.eventResults
            }
            isAlt={false}
            defaultIsExpanded={true}
            highlightedFields={highlightedFields}
            searchQuery={search.query}
            onClick={() => {}}
            isLoading={search.loading}
            language="es"
            isInListView={isList}
          />
        ) : isDateFilter && filteredEvents ? (
          <EventsSection
            key="filterEvents"
            title="Resultados Filtrados"
            subTitle={`Mostrando ${filteredEvents.length} evento(s)`}
            events={searchSortedFilteredEvents}
            isAlt={false}
            defaultIsExpanded={true}
            highlightedFields={highlightedFields}
            onClick={() => {}}
            isLoading={search.loading}
            language="es"
            isInListView={isList}
          />
        ) : (
          <>
            {(() => {
              const today = new Date();
              const currentTimeHour = today.getHours();
              const todayMidnight = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate(),
                0,
                0,
                0,
                0
              ).getTime();
              const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
              const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
              const tomorrowDate = new Date(today);
              tomorrowDate.setDate(today.getDate() + 1);
              
              const sections = [];
              
              // Today
              sections.push(
                <EventsSection
                  key="todayEvents"
                  title="Hoy"
                  subTitle={`(${days[dayOfWeek]})`}
                  events={getSiftedEvents(
                    sortedEvents,
                    'todayEvents',
                    appliedFilters
                  )}
                  sectionDayStartMs={todayMidnight}
                  isAlt={lastClickedSection !== 'today'}
                  defaultIsExpanded={true}
                  highlightedFields={highlightedFields}
                  onClick={() => setLastClickedSection('today')}
                  isLoading={isTodayLoading}
                  language="es"
                  isInListView={isList}
                />
              );
              
              // Tomorrow
              if (dayOfWeek !== 0) { // Not Sunday
                const tomorrowDay = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
                sections.push(
                  <EventsSection
                    key="tomorrowEvents"
                    title="Mañana"
                    subTitle={`(${days[tomorrowDay]})`}
                    events={getSiftedEvents(
                      sortedEvents,
                      'tomorrowEvents',
                      appliedFilters
                    )}
                    sectionDayStartMs={new Date(
                      tomorrowDate.getFullYear(),
                      tomorrowDate.getMonth(),
                      tomorrowDate.getDate(),
                      0,
                      0,
                      0,
                      0
                    ).getTime()}
                    isAlt={lastClickedSection !== 'tomorrow'}
                    defaultIsExpanded={true}
                    highlightedFields={highlightedFields}
                    onClick={() => setLastClickedSection('tomorrow')}
                    isLoading={isTomorrowLoading}
                    language="es"
                    isInListView={isList}
                  />
                );
              }
              
              // Days of the week
              if (dayOfWeek === 1) { // Monday
                // Skip tomorrow (Tuesday, 2) and start from Wednesday (3)
                [3, 4, 5, 6, 0].forEach(day => {
                  let daysToAdd = day - dayOfWeek;
                  if (daysToAdd <= 0) daysToAdd += 7;
                  const specificDayStart = todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
                  sections.push(
                    <EventsSection
                      key={`day${day}Events`}
                      title={days[day]}
                      subTitle=""
                      events={getSiftedEvents(
                        sortedEvents,
                        'specificDayEvents',
                        appliedFilters,
                        day
                      )}
                      sectionDayStartMs={specificDayStart}
                      isAlt={lastClickedSection !== `day${day}`}
                      defaultIsExpanded={true}
                      highlightedFields={highlightedFields}
                      onClick={() => setLastClickedSection(`day${day}`)}
                      isLoading={isWeekLoading}
                      language="es"
                      isInListView={isList}
                    />
                  );
                });
              } else if (dayOfWeek === 2) { // Tuesday
                // Skip tomorrow (Wednesday, 3) and start from Thursday (4)
                [4, 5, 6, 0].forEach(day => {
                  let daysToAdd = day - dayOfWeek;
                  if (daysToAdd <= 0) daysToAdd += 7;
                  const specificDayStart = todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
                  sections.push(
                    <EventsSection
                      key={`day${day}Events`}
                      title={days[day]}
                      subTitle=""
                      events={getSiftedEvents(
                        sortedEvents,
                        'specificDayEvents',
                        appliedFilters,
                        day
                      )}
                      sectionDayStartMs={specificDayStart}
                      isAlt={lastClickedSection !== `day${day}`}
                      defaultIsExpanded={true}
                      highlightedFields={highlightedFields}
                      onClick={() => setLastClickedSection(`day${day}`)}
                      isLoading={isWeekLoading}
                      language="es"
                      isInListView={isList}
                    />
                  );
                });
              } else if (dayOfWeek === 3) { // Wednesday
                // Skip tomorrow (Thursday, 4) and start from Friday (5)
                [5, 6, 0].forEach(day => {
                  let daysToAdd = day - dayOfWeek;
                  if (daysToAdd <= 0) daysToAdd += 7;
                  const specificDayStart = todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
                  sections.push(
                    <EventsSection
                      key={`day${day}Events`}
                      title={days[day]}
                      subTitle=""
                      events={getSiftedEvents(
                        sortedEvents,
                        'specificDayEvents',
                        appliedFilters,
                        day
                      )}
                      sectionDayStartMs={specificDayStart}
                      isAlt={lastClickedSection !== `day${day}`}
                      defaultIsExpanded={true}
                      highlightedFields={highlightedFields}
                      onClick={() => setLastClickedSection(`day${day}`)}
                      isLoading={isWeekLoading}
                      language="es"
                      isInListView={isList}
                    />
                  );
                });
              } else if (dayOfWeek === 4) { // Thursday
                // Skip tomorrow (Friday, 5) and start from Saturday (6)
                [6, 0].forEach(day => {
                  let daysToAdd = day - dayOfWeek;
                  if (daysToAdd <= 0) daysToAdd += 7;
                  const specificDayStart = todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
                  sections.push(
                    <EventsSection
                      key={`day${day}Events`}
                      title={days[day]}
                      subTitle=""
                      events={getSiftedEvents(
                        sortedEvents,
                        'specificDayEvents',
                        appliedFilters,
                        day
                      )}
                      sectionDayStartMs={specificDayStart}
                      isAlt={lastClickedSection !== `day${day}`}
                      defaultIsExpanded={true}
                      highlightedFields={highlightedFields}
                      onClick={() => setLastClickedSection(`day${day}`)}
                      isLoading={isWeekLoading}
                      language="es"
                      isInListView={isList}
                    />
                  );
                });
              } else if (dayOfWeek === 5) { // Friday
                // Skip tomorrow (Saturday, 6) and only show Sunday (0)
                [0].forEach(day => {
                  let daysToAdd = day - dayOfWeek;
                  if (daysToAdd <= 0) daysToAdd += 7;
                  const specificDayStart = todayMidnight + daysToAdd * 24 * 60 * 60 * 1000;
                  sections.push(
                    <EventsSection
                      key={`day${day}Events`}
                      title={days[day]}
                      subTitle=""
                      events={getSiftedEvents(
                        sortedEvents,
                        'specificDayEvents',
                        appliedFilters,
                        day
                      )}
                      sectionDayStartMs={specificDayStart}
                      isAlt={lastClickedSection !== `day${day}`}
                      defaultIsExpanded={true}
                      highlightedFields={highlightedFields}
                      onClick={() => setLastClickedSection(`day${day}`)}
                      isLoading={isWeekLoading}
                      language="es"
                      isInListView={isList}
                    />
                  );
                });
              } else if (dayOfWeek === 6) { // Saturday
                // Don't show any specific days since tomorrow is Sunday
                // and it's handled by the "Tomorrow" section
                // No additional day sections needed
              }
              
              // Next Week
              sections.push(
                <EventsSection
                  key="nextWeekEvents"
                  title="Próxima Semana"
                  subTitle=""
                  events={getSiftedEvents(
                    sortedEvents,
                    'nextWeekEvents',
                    appliedFilters
                  )}
                  isAlt={lastClickedSection !== 'nextWeek'}
                  defaultIsExpanded={true}
                  highlightedFields={highlightedFields}
                  onClick={() => setLastClickedSection('nextWeek')}
                  isLoading={isWeekLoading}
                  language="es"
                  isInListView={isList}
                />
              );
              
              // After Next Week
              sections.push(
                <EventsSection
                  key="afterNextWeekEvents"
                  title="Después de la Próxima Semana"
                  subTitle="Sucediendo después de la próxima semana"
                  events={getSiftedEvents(
                    sortedEvents,
                    'afterNextWeekEvents',
                    appliedFilters
                  )}
                  isAlt={lastClickedSection !== 'afterNextWeek'}
                  defaultIsExpanded={true}
                  highlightedFields={highlightedFields}
                  onClick={() => setLastClickedSection('afterNextWeek')}
                  isLoading={isYearLoading}
                  language="es"
                  isInListView={isList}
                  spaceAfter={true}
                />
              );
              
              return sections;
            })()}
            <div className=" w-full h-[100px]" />
          </>
        )}

        <EventDetails isEdit={false} />
      </main>

      {loader.isVisible ? <LoadingDialog /> : null}
      {actionDialog.dialog != null ? <ActionDialog /> : null}
    </div>
  );
};

export default Home;
