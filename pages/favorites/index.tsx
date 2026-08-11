import type { NextPage, GetServerSideProps } from 'next';
import { useStore } from '../../store/store';
import React, { useState, useEffect, useMemo, use } from 'react';
import EventsSection from '../../components/Dashboard/EventsSection';
import EventDetails from '../../components/Dashboard/EventDetails';
import { closePopup } from '../../store/actions/popup';
import { BiSortAlt2 } from 'react-icons/bi';
import EventService from '../../services/lib/event';
import { formatDate, isStateCode } from '../../utils/utils';
import { eventSpanOverlapsWindow } from '../../utils/eventDateSpan';
import { Option } from '../../interface/filterInterface';
import { Constants } from '../../utils/constants';
import { Event } from '../../interface/objects/simpleObject';
import SearchBar from '../../components/SearchBar';
import SortOverlay from '../../components/SortOverlay';
import ActionDialog from '../../components/overlay/ActionDialog';
import LoadingDialog from '../../components/overlay/LoadingDialog';
import DashboardFilter from '../../components/Filter/DashboardFilter';
import { FaChevronLeft, FaTimes, FaEye } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { logout } from '../../store/actions/auth';
import axios from 'axios';
import UserDropdown from '../../components/Dashboard/UserDropdown';
import Head from 'next/head';

const Home: NextPage<{ firstFavoriteEventThumb: string; name: string }> = ({
  firstFavoriteEventThumb,
  name,
}) => {
  const [state, dispatch] = useStore();
  const router = useRouter();
  const { search, loader, actionDialog, auth } = state;

  const [sort, setSort] = useState<Option>({ value: '', label: 'None' });
  const [showSortOverlay, setShowSortOverlay] = useState(false);

  const [isFetchingEvents, setIsFetchingEvents] = useState(true);

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
  //const [nameFromParam, setNameFromParam] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>('');
  const [isOtherUser, setIsOtherUser] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string>('');
  const [isList, setIsList] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsList(true);
    }
    setMounted(true);
  }, []);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    const nameParam = urlParams.get('name');

    if (
      localStorage.getItem('language') === 'es' &&
      emailParam &&
      nameParam &&
      emailParam !== 'null' &&
      nameParam !== 'null'
    ) {
      router.push('/favorites/es/?email=' + emailParam + '&name=' + nameParam);
    }

    if (emailParam && emailParam != 'null') {
      //console.log(`Logged email parameter: ${emailParam}`);
      setUserEmail(emailParam);
      //setNameFromParam(nameParam);
      setIsOtherUser(true);
    } else {
      //console.log('No email parameter found in the query');
      setUserEmail(localStorage.getItem('userEmail') || '');
    }

    setUserFirstName(localStorage.getItem('userFirstName'));
    setUserLastName(localStorage.getItem('userLastName'));
  }, []);

  useEffect(() => {
    if (userEmail == '') {
      return;
    }
    //console.log(`Fetching events for user: ${userEmail}`);
    fetchEvents();
  }, [userEmail]);

  const [appliedFilters, setAppliedFilters] = useState({
    date: null,
    price: null,
    location: '',
    offerings: '',
  });

  const fetchEvents = async () => {
    setIsFetchingEvents(true);

    const today = new Date();
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

    const threeYearsFromNow = new Date(today);
    threeYearsFromNow.setDate(today.getDate() + 1095);

    try {
      const [
        todayData,
        tomorrowData,
        weekendData,
        weekData,
        yearData,
        lastYearData,
      ] = await Promise.all([
        EventService.getEventByDate({ date: formatDate(threeYearsFromNow) }),
        EventService.getEventByDate({ date: formatDate(threeYearsFromNow) }),
        EventService.getEventByDateRange({
          start: formatDate(threeYearsFromNow),
          end: formatDate(threeYearsFromNow),
        }),
        EventService.getEventByDateRange({
          start: formatDate(threeYearsFromNow),
          end: formatDate(threeYearsFromNow),
        }),
        EventService.getFavoritedEvents({
          email: userEmail || '',
        }),
        EventService.getEventByDateRange({
          start: formatDate(threeYearsFromNow),
          end: formatDate(threeYearsFromNow),
        }),
      ]);

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

      //console.log('yearData!', yearData.data.favorites);

      setTodayEvents([...todayData.data.data, ...filteredTomorrowEvents]);
      setTomorrowEvents(tomorrowData.data.data);
      setWeekendEvents(weekendData.data.data);
      setWeekEvents(weekData.data.data);
      setYearEvents(yearData.data.favorites);
      setLastYearEvents(lastYearData.data.data);
      setIsFetchingEvents(false);
    } catch (error) {
      console.error('Fetching events failed:', error);
      setIsFetchingEvents(false);
    }
  };

  useEffect(() => {
    //fetchEvents();
  }, []);

  const sortListByProperty = (
    sortValue: string,
    list: Event[] | null
  ): Event[] | null => {
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
          const timeA = a.start_time || '00:00:00';
          const dateB = new Date(b[field]);
          const timeB = b.start_time || '00:00:00';

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
          const parsePrice = (price: string): number => {
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
    //console.log('yearEvents', yearEvents);
    const eventsToSort = filteredEvents ?? [...(yearEvents ?? [])];

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
        event.offering.toLowerCase().includes(filters.offerings.toLowerCase())
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
      | 'favorites',
    filters: typeof appliedFilters
  ): Event[] | null => {
    if (!events) return null;

    if (sectionType === 'favorites') {
      return events;
    }

    let filteredEvents = events;
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

    switch (sectionType) {
      case 'todayEvents':
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, todayMidnight, endOfToday)
        );
        break;

      case 'tomorrowEvents': {
        const tomorrowStart = todayMidnight + 24 * 60 * 60 * 1000;
        const tomorrowEnd = endOfToday + 24 * 60 * 60 * 1000;
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, tomorrowStart, tomorrowEnd)
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
        const ninetyDaysAgo = todayMidnight - 90 * 24 * 60 * 60 * 1000;
        filteredEvents = filteredEvents.filter((event) =>
          eventSpanOverlapsWindow(event, ninetyDaysAgo, todayMidnight - 1)
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
    <>
      <Head>
        {/* Open Graph Meta Tags */}
        {firstFavoriteEventThumb && (
          <>
            <meta property="og:image" content={firstFavoriteEventThumb} />
            <meta
              property="og:title"
              content={`lafaslist - ${name}'s favorite events`}
            />
            <meta
              property="og:description"
              content={`View ${name}'s favorite events.`}
            />
          </>
        )}
        {/* Twitter Card Meta Tags */}
        {firstFavoriteEventThumb && (
          <>
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:image" content={firstFavoriteEventThumb} />
            <meta
              name="twitter:title"
              content={`lafaslist - ${name}'s favorite events`}
            />
            <meta
              name="twitter:description"
              content={`View ${name}'s favorite events.`}
            />
          </>
        )}
        <title>View {name}'s favorite events</title>
      </Head>
      <div
        className="py-5 font-montserrat h-full bg-midnight"
        onClick={() => {
          closePopup()(dispatch);
        }}
      >
        <nav
          className={`fixed top-0 left-0 w-[100vw] flex flex-row items-center justify-between px-4 py-6 lg:px-10 border-0 z-10 bg-midnight transition-transform duration-300 ${
            isNavbarVisible ? 'translate-y-0' : '-translate-y-full'
          } ${isAtTop ? 'border-0' : 'border-b-[2px] border-slate-black'}`}
        >
          <div className="flex items-center gap-2">
            <img
              src="/images/leftChevron.svg"
              className="mr-1 w-8 h-8 lg:w-10 lg:h-10 text-beaming-orange hover:text-beaming-orange-dark hover:cursor-pointer"
              onClick={() => router.push('/mexico-city')}
            />
          </div>
          
          <div className="flex flex-1 max-w-[70%] lg:max-w-[85%] mx-2 lg:mx-4">
            <SearchBar allEvents={yearEvents ?? []} />
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              className={`flex p-2 flex-col h-[45px] justify-center items-center text-xs gap-2 ex:hidden text-mist-white px-3 rounded-lg
                ${isList 
                  ? 'border border-2 border-slate-black font-semibold text-black bg-beaming-orange' 
                  : 'border border-2 border-slate-black bg-transparent-white opacity-50'
                } transition-all duration-300`}
              onClick={() => setIsList(prev => !prev)}
            >
              List
            </button>
            <button 
              className="flex justify-center items-center text-xs p-1 lg:p-2 text-mist-white border border-2 border-slate-black rounded-lg md:hover:bg-mist-white md:hover:text-midnight transition-all duration-300 ease-in-out hidden ex:flex" 
              onClick={() => setIsList(prev => !prev)}
            >
              <FaEye className="mr-1" />
              {isList ? 'Grid' : 'List'}
            </button>
            {mounted && auth.isUserLoggedIn && (
              <UserDropdown isFavoritesSelected={true} setActiveDropdown={setActiveDropdown} resetDropdowns={activeDropdown != 'user'} hideDropdown={!isNavbarVisible} />
            )}
          </div>
        </nav>
        <div
          className={`h-0 lg:h-[${
            isAtTop ? '3' : '0'
          }px] mt-[50px] lg:mt-[60px] mx-10 bg-gradient-to-r from-beaming-orange-light to-sacral-red`}
        />

        <main className="py-2 h-[91%] px-6 pt-6 lg:p-10 lg:pt-6 lg:pb-0 flex flex-col gap-5 bg-midnight ">
          {search.show ? (
            <EventsSection
              key="searchEvents"
              title="Search Results"
              subTitle={`Showing ${
                filteredEvents
                  ? searchSortedFilteredEvents?.length ?? 0
                  : search.eventResults?.length ?? 0
              } event(s)`}
              events={
                filteredEvents
                  ? searchSortedFilteredEvents
                  : search.eventResults
              }
              isAlt={false}
              defaultIsExpanded={true}
              highlightedFields={highlightedFields}
              onClick={() => {}}
              isLoading={isFetchingEvents}
              isInListView={isList}
            />
          ) : isDateFilter && filteredEvents ? (
            <EventsSection
              key="filterEvents"
              title="Filtered Results"
              subTitle={`Showing ${filteredEvents.length} event(s)`}
              events={searchSortedFilteredEvents}
              isAlt={false}
              defaultIsExpanded={true}
              highlightedFields={highlightedFields}
              onClick={() => {}}
              isLoading={isFetchingEvents}
              isInListView={isList}
            />
          ) : (
            <>
              <EventsSection
                key="favorites"
                title={name ? `${name}'s Favorites` : 'Favorites'}
                isShareable={!isOtherUser}
                subTitle={isOtherUser ? `` : 'Your favorite events'}
                events={getSiftedEvents(
                  sortedEvents,
                  'favorites',
                  appliedFilters
                )}
                isAlt={lastClickedSection !== 'favorites'}
                defaultIsExpanded={true}
                highlightedFields={highlightedFields}
                onClick={() => setLastClickedSection('favorites')}
                isLoading={isFetchingEvents}
                isInListView={isList}
                spaceAfter={true}
              />
            </>
          )}

          <EventDetails isEdit={false} />

          {/*<div className="w-full h-full flex flex-col justify-end  items-end gap-4 text-beaming-orange">
            <div className="w-fit">
              {userFirstName && (
                <span className="text-sm">
                  Logged in as {userFirstName} {userLastName}
                </span>
              )}
              <button
                onClick={handleLogout}
                className=" text-beaming-orange px-4 py-2 rounded"
              >
                Logout
              </button>
            </div>
          </div>*/}
        </main>

        {loader.isVisible ? <LoadingDialog /> : null}
        {actionDialog.dialog != null ? <ActionDialog /> : null}
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { email, name } = context.query; // Get email from query parameters
  let firstFavoriteEventThumb = '';

  // Fetch the favorite events based on the email
  if (email) {
    const yearData = await EventService.getFavoritedEvents({
      email: email as string,
    });
    const favorites = yearData.data.favorites;

    if (favorites && favorites.length > 0) {
      firstFavoriteEventThumb = favorites[0].orig_thumb; // Get the orig_thumb of the first favorite event
    }
  }

  return {
    props: {
      firstFavoriteEventThumb, // Pass only firstFavoriteEventThumb
      name: typeof name === 'string' ? name : null,
    },
  };
};

export default Home;
