import React, { useEffect, useMemo, useState } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import { useStore } from '../../../store/store';
import { Constants } from '../../../utils/constants';
import Filter from '../../../components/Filter/Filter';
import DeleteRowsOverlay from '../../../components/Admin/DeleteRowsOverlay';
import EventColumnsHideOverlay from '../../../components/Admin/EventColumnsHideOverlay';
import EventsSection from '../../../components/Admin/EventsSection';
import EventDetails from '../../../components/Dashboard/EventDetails';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import {
  hideLoadingDialog,
  hideSpinner,
  showLoadingDialog,
  showSpinner,
} from '../../../store/actions/loadingState';
import {
  deleteEvents,
  readAdminEvents,
  requestMiddleware,
  getAllUsers,
} from '../../../services/lib/admin';
import SearchBar from '../../../components/SearchBar';
import { closePopup } from '../../../store/actions/popup';
import SortOverlay from '../../../components/SortOverlay';
import ActionDialog from '../../../components/overlay/ActionDialog';
import {
  addToDeletedStack,
  resetSelections,
} from '../../../store/actions/selections';
import { FiFilter, FiEyeOff } from 'react-icons/fi';
import { BiSortAlt2 } from 'react-icons/bi';
import DeletionConfirmationOverlay from '../../../components/Admin/DeletionConfirmationOverlay';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import {
  HIDE_INFO_OVERLAY,
  SHOW_INFO_OVERLAY,
} from '../../../store/actions/type';
import Spinner from '../../../components/Spinner';
import { Option } from '../../../interface/filterInterface';
import { Event } from '../../../interface/objects/simpleObject';
import { columnNameToValue, convertTo24Hr } from '../../../utils/utils';
import { FaPlus, FaTimes } from 'react-icons/fa';
import {
  setEventsLoadedBySearch,
  updateSearchResults,
} from '../../../store/actions/search';
import event from '../../../services/lib/event';
import EventCreate from '../../../components/Admin/EventCreate';

const Index = () => {
  const [state, dispatch] = useStore();
  const {
    selections,
    loader,
    filter,
    search,
    actionDialog,
    hiddenColumns,
    auth,
  } = state;
  const { overlay } = auth;

  const [showFilter, setShowFilter] = useState(false);
  const [showHideDialog, setShowHideDialog] = useState(false);
  const [lastClickedSection, setLastClickedSection] = useState('');

  const [thisMonthEvents, setThisMonthEvents] = useState([] as Event[]);
  const [prevEvents, setPrevEvents] = useState([] as Event[]);

  const [sortBy, setSortBy] = useState({ value: '', label: 'None' });
  const [selectedColumn, setSelectedColumn] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [showSortOverlay, setShowSortOverlay] = useState(false);
  const [deletionResult, setDeletionResult] = useState({
    success: false,
    count: 0,
    error: null,
  });

  const [linkedAccounts, setLinkedAccounts] = useState<string[]>([]);

  const clearDeletionResult = () => {
    setDeletionResult({
      success: false,
      count: 0,
      error: null,
    });
  };

  const [createEvent, setCreateEvent] = useState(false);
  const emptyEvent: Event = {
    id: 0,
    name: '',
    artist: '',
    opener: '',
    host: '',
    promoter: '',
    offering: '',
    timestamp: '',
    created_at: '',
    date: '',
    time: '',
    venue: {
      id: 0,
      name: '',
      address: '',
      city: '',
      state: '',
      country: '',
    },
    price: '',
    ticket_link: '',
    is_age_restricted: false,
    orig_link: '',
    orig_thumb: '',
    poster: {
      id: 0,
      user: '',
      is_personal: true,
      created_at: '',
    },
    is_event: true,
    age_barrier: '',
    late: false,
    link_in_bio: false,
    rsvp_required: false,
    num_events: 0,
    genres: '',
    is_blurred: false,
    is_favorite: false,
    viewing_language: 'en',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
  };

  const filterEventsByLinkedAccounts = (events: Event[]): Event[] => {
    // If linkedAccounts includes "all" or is empty, show all events
    // (the empty case previously fell through to the filter below, which
    // filtered out EVERYTHING for an admin with no linked accounts).
    if (linkedAccounts.length === 0 || linkedAccounts.includes('all')) {
      return events;
    }
    
    // Otherwise filter events to only show those from linked accounts
    return events.filter(event => {
      const posterUser = event.poster?.user?.toLowerCase();
      return posterUser && linkedAccounts.some(account => 
        account.toLowerCase() === posterUser
      );
    });
  };

  const fetchEvents = async () => {
    if (await requestMiddleware(dispatch)) {
      showLoadingDialog()(dispatch);
      readAdminEvents()
        .then((res) => {
          if (res.status == 200) {
            const events: Event[] = res.data.data;

            events
              .sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateA < dateB ? -1 : dateA === dateB ? 0 : 1;
              })
              .reverse();

            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();

            const thisMonthEventsAll = events.filter((event) => {
              const eventDate = new Date(event.created_at);
              return (
                eventDate.getMonth() === currentMonth &&
                eventDate.getFullYear() === currentYear
              );
            });

            const prevEventsAll = events.filter((event) => {
              const eventDate = new Date(event.created_at);
              return (
                eventDate.getMonth() !== currentMonth ||
                eventDate.getFullYear() !== currentYear
              );
            });

            // Apply linked accounts filtering
            setThisMonthEvents(filterEventsByLinkedAccounts(thisMonthEventsAll));
            setPrevEvents(filterEventsByLinkedAccounts(prevEventsAll));
          }
          hideLoadingDialog()(dispatch);
        })
        .catch((error) => {
          const message = error || 'Error fetching events';
          dispatch({
            type: SHOW_INFO_OVERLAY,
            payload: { message, isError: true },
          });
          hideLoadingDialog()(dispatch);
        });
    }
  };

  const fetchLinkedAccounts = async () => {
    if (await requestMiddleware(dispatch)) {
      try {
        const adminEmail = localStorage.getItem('adminEmail');
        if (!adminEmail) {
          console.log('No admin email found in localStorage');
          return;
        }
        
        // Get all users
        const response = await getAllUsers();
        const users = response?.data?.users || [];
        
        // Find the current admin in the users list
        const currentUser = users.find((user: any) => user.email === adminEmail);
        
        if (currentUser && currentUser.linkedAccounts) {
          let parsedAccounts: string[] = [];
          
          try {
            // Try parsing as JSON first
            parsedAccounts = JSON.parse(currentUser.linkedAccounts);
          } catch (e) {
            // If not valid JSON, treat as comma-separated string
            parsedAccounts = currentUser.linkedAccounts.split(',').map((acc: string) => acc.trim());
          }
          
          console.log('Linked accounts for admin:', parsedAccounts);
          setLinkedAccounts(parsedAccounts);
        } else {
          console.log('No linked accounts found for admin:', adminEmail);
          setLinkedAccounts([]);
        }
      } catch (error) {
        console.error('Error fetching linked accounts:', error);
      }
    }
  };

  useEffect(() => {
    fetchEvents();
    //fetchLinkedAccounts();
  }, [linkedAccounts]);

  useEffect(() => {
    fetchLinkedAccounts();
  }, []);

  const getNestedProperty = <T,>(object: T, path: string): any => {
    return path
      .split('.')
      .reduce((obj: any, key: string) => obj && obj[key], object as any);
  };

  const sortEvents = (events: Event[], sortOption: Option): Event[] => {
    if (!sortOption || sortOption.value === '') {
      return events;
    }

    const lastUnderscoreIndex = sortOption.value.lastIndexOf('_');
    const field = sortOption.value.substring(0, lastUnderscoreIndex);
    const order = sortOption.value.substring(lastUnderscoreIndex + 1);

    const parsePrice = (price: string): number => {
      if (price === 'NO COVER' || price === 'Free') {
        return 0;
      }
      if (price === 'SOLD OUT' || price === 'NaN') {
        return Number.POSITIVE_INFINITY;
      }
      const parsedPrice = parseFloat(price.replace(/[^0-9.-]+/g, ''));
      return isNaN(parsedPrice) ? 0 : parsedPrice;
    };

    return [...events].sort((a, b) => {
      let valA: any = getNestedProperty(a, field);
      let valB: any = getNestedProperty(b, field);

      switch (field) {
        case 'name':
        case 'artist':
        case 'host':
        case 'promoter':
        case 'ticket_link':
        case 'late':
        case 'link_in_bio':
        case 'rsvp_required':
        case 'num_events':
          valA = valA?.toString().toLowerCase() ?? '';
          valB = valB?.toString().toLowerCase() ?? '';
          break;
        case 'city':
          valA = getNestedProperty(a, 'venue.city')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'venue.city')?.toLowerCase() ?? '';
          break;
        case 'state':
          valA = getNestedProperty(a, 'venue.state')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'venue.state')?.toLowerCase() ?? '';
          break;
        case 'country':
          valA = getNestedProperty(a, 'venue.country')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'venue.country')?.toLowerCase() ?? '';
          break;
        case 'account':
          valA = getNestedProperty(a, 'poster.user')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'poster.user')?.toLowerCase() ?? '';
          break;
        case 'with_opener':
          valA = getNestedProperty(a, 'opener')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'opener')?.toLowerCase() ?? '';
          break;
        case 'age':
          valA = getNestedProperty(a, 'age_barrier')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'age_barrier')?.toLowerCase() ?? '';
          break;
        case 'offerings':
          valA = getNestedProperty(a, 'offering')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'offering')?.toLowerCase() ?? '';
          break;
        case 'promoter':
          valA = getNestedProperty(a, 'promoter')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'promoter')?.toLowerCase() ?? '';
          break;
        case 'timestamp':
        case 'created_at':
        case 'start_date':
        case 'end_date':
          valA = new Date(valA);
          valB = new Date(valB);
          break;
        case 'start_time':
        case 'end_time':
          valA = valA
            ? new Date(`1970-01-01T${convertTo24Hr(valA)}`)
            : new Date(0);
          valB = valB
            ? new Date(`1970-01-01T${convertTo24Hr(valB)}`)
            : new Date(0);
          break;
        case 'venue':
          valA = getNestedProperty(a, 'venue.name')?.toLowerCase() ?? '';
          valB = getNestedProperty(b, 'venue.name')?.toLowerCase() ?? '';
          break;
        case 'price':
          valA = parsePrice(valA ?? '');
          valB = parsePrice(valB ?? '');
          break;
        default:
          console.error(`Unrecognized sorting field: ${field}`);
          return 0; // No sorting applied if field is unrecognized
      }

      if (order === 'asc') {
        return valA < valB ? -1 : valA > valB ? 1 : 0;
      } else {
        return valA > valB ? -1 : valA < valB ? 1 : 0;
      }
    });
  };

  const sortedThisMonthEvents = useMemo(
    () => sortEvents(thisMonthEvents, sortBy),
    [thisMonthEvents, sortBy]
  );
  const sortedPrevEvents = useMemo(
    () => sortEvents(prevEvents, sortBy),
    [prevEvents, sortBy]
  );
  const sortedFilteredEvents = useMemo(
    () => (filter.results ? sortEvents(filter.results, sortBy) : []),
    [filter.results, sortBy]
  );
  const sortedSearchEvents = useMemo(
    () => (search.eventResults ? sortEvents(search.eventResults, sortBy) : []),
    [search.eventResults, sortBy]
  );

  const deleteItemsInStack = async () => {
    if (selections.events) {
      const stackEventItems = { ...selections.events };
      const eventsToDelete = Object.keys(stackEventItems);
      showSpinner()(dispatch);

      if (await requestMiddleware(dispatch)) {
        deleteEvents({ events: eventsToDelete })
          .then(() => {
            addToDeletedStack(stackEventItems)(dispatch);
            hideSpinner()(dispatch);
            resetSelections()(dispatch);
            setDeletionResult({
              success: true,
              count: eventsToDelete.length,
              error: null,
            });

            // Filter out the deleted events from the events list
            setThisMonthEvents((prev) =>
              prev.filter(
                (event) => !eventsToDelete.includes(event.id.toString())
              )
            );
            setPrevEvents((prev) =>
              prev.filter(
                (event) => !eventsToDelete.includes(event.id.toString())
              )
            );

            const updatedSearchResults =
              search.eventResults?.filter(
                (event: Event) => !eventsToDelete.includes(event.id.toString())
              ) || [];

            dispatch(
              updateSearchResults(updatedSearchResults, state.accountResults)
            );
          })
          .catch((error) => {
            hideSpinner()(dispatch);
            //console.log('Deletion error: ', error);
          });
      }
    }
  };

  const isFilterSet = () => {
    if (filter.filters.length > 1) {
      return true;
    } else {
      return filter.filters[0].values.length > 0;
    }
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="events" />
      <div
        className="px-8 pt-8 h-full font-montserrat flex flex-col w-full text-off-white overflow-x-auto"
        onClick={() => {
          setShowFilter(false);
          setShowHideDialog(false);
          setShowSortOverlay(false);
          closePopup()(dispatch);
        }}
      >
        <nav className="border-b-4 border-beaming-orange flex justify-start items-center flex pb-3 gap-4">
          <div className="text-5xl font-bold  px-3">Manage Events</div>
          <button
            className="bg-slate-black px-6 p-2 text-white font-semibold rounded-lg hover:bg-stone-gray hover:font-semibold transition-all duration-300"
            onClick={() => {
              setCreateEvent(true);
            }}
          >
            + New Event
          </button>
        </nav>
        <div className="flex justify-between mt-5 mb-8 relative">
          <div></div>
          <div className="flex justify-evenly items-center gap-4 relative z-[3]">
            {loader.isSpinnerVisible && (
              <Spinner colorClass={'text-beaming-orange mr-2 '} size={32} />
            )}
            <SearchBar allEvents={filterEventsByLinkedAccounts([...thisMonthEvents, ...prevEvents])} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFilter(!showFilter);
                setShowSortOverlay(false);
                setShowHideDialog(false);
              }}
              className="lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white "
            >
              <div
                className={
                  'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100 ' +
                  (isFilterSet() ? ' opacity-100 ' : '')
                }
              ></div>
              <FiFilter
                className={
                  'w-4 z-[1] text-mist-white filter group-hover:!brightness-0 ' +
                  (isFilterSet() ? ' !brightness-0 ' : '')
                }
              />
              <span
                className={
                  'z-[1] text-mist-white filter group-hover:!brightness-0 ' +
                  (isFilterSet() ? ' !brightness-0 ' : '')
                }
              >
                Filter
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSortOverlay(!showSortOverlay);
                setShowFilter(false);
                setShowHideDialog(false);
              }}
              className="lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white  "
            >
              <div
                className={
                  'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100' +
                  (sortBy?.value == '' ? ' ' : ' opacity-100 ')
                }
              ></div>
              <BiSortAlt2
                className={
                  'w-5 h-5 z-[1] text-mist-white filter group-hover:!brightness-0 ' +
                  (sortBy?.value == '' ? ' ' : ' !brightness-0 ')
                }
              />
              <span
                className={
                  'z-[1] text-mist-white flex items-center gap-2 filter group-hover:!brightness-0 ' +
                  (sortBy?.value == '' ? ' ' : ' !brightness-0 ')
                }
              >
                Sort
                {sortBy?.value && (
                  <FaTimes
                    onClick={(e) => {
                      e.stopPropagation();
                      setSortBy({ value: '', label: 'None' });
                      setSelectedColumn('');
                      setShowSortOverlay(false);
                    }}
                  />
                )}
              </span>
            </button>
            {showSortOverlay ? (
              <SortOverlay
                hide={() => setShowSortOverlay(false)}
                value={sortBy}
                onChange={(newValue: any) => {
                  setSortBy(newValue as Option);
                  if (newValue.value == '') {
                    setSelectedColumn('');
                  }
                  const valueOfSelectedColumn =
                    columnNameToValue(selectedColumn);
                  if (!newValue.value.startsWith(valueOfSelectedColumn)) {
                    setSelectedColumn('');
                    setSortOrder('asc');
                  } else if (newValue.value.startsWith(valueOfSelectedColumn)) {
                    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                  }
                }}
                options={Constants.eventsSortingOptions}
              />
            ) : (
              <></>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHideDialog(!showHideDialog);
                setShowFilter(false);
                setShowSortOverlay(false);
              }}
              className="lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white  "
            >
              <div
                className={
                  'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100' +
                  (Object.keys(hiddenColumns.columns).length === 0
                    ? ' '
                    : ' opacity-100 ')
                }
              ></div>
              <FiEyeOff
                className={
                  'w-3 z-[1] text-mist-white filter group-hover:!brightness-0 ' +
                  (Object.keys(hiddenColumns.columns).length === 0
                    ? ' '
                    : ' !brightness-0 ')
                }
              />
              <span
                className={
                  'z-[1] text-mist-white filter group-hover:!brightness-0 ' +
                  (Object.keys(hiddenColumns.columns).length === 0
                    ? ' '
                    : ' !brightness-0 ')
                }
              >
                Hide
              </span>
            </button>
          </div>
          {showFilter ? (
            <Filter
              hide={() => {
                setShowFilter(false);
                setShowHideDialog(false);
              }}
              isAdmin={true}
              existingEvents={[...thisMonthEvents, ...prevEvents]}
            />
          ) : (
            <></>
          )}
          {showHideDialog ? <EventColumnsHideOverlay /> : <></>}
        </div>

        <div className="flex-1 w-full overflow-x-auto overflow-y-auto pb-8">
          <div className="w-[100%] h-full pr-2 flex flex-col gap-8">
            {search.show ? (
              <EventsSection
                key="search"
                title="Search Results"
                subTitle={`Showing ${
                  search.eventResults?.length ?? 0
                } event(s)`}
                events={sortedSearchEvents}
                defaultIsExpanded={true}
                setSelectedColumn={setSelectedColumn}
                setSortBy={setSortBy}
                sortBy={sortBy}
                selectedColumn={selectedColumn}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                isAlt={false}
                onClick={() => {}}
                onEventUpdate={fetchEvents}
              />
            ) : filter.show ? (
              <EventsSection
                key="filterEvents"
                title="Filtered Results"
                subTitle={`Showing ${filter.results?.length ?? 0} event(s)`}
                events={sortedFilteredEvents}
                defaultIsExpanded={true}
                setSelectedColumn={setSelectedColumn}
                setSortBy={setSortBy}
                selectedColumn={selectedColumn}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                sortBy={sortBy}
                isAlt={false}
                onClick={() => {}}
                onEventUpdate={fetchEvents}
              />
            ) : (
              <>
                <div className="flex-1 z-[1]">
                  <EventsSection
                    title={`All Events (${sortedThisMonthEvents.length + sortedPrevEvents.length})`}
                    events={sortedThisMonthEvents.concat(sortedPrevEvents)}
                    defaultIsExpanded={true}
                    isAlt={lastClickedSection !== 'month'}
                    setSelectedColumn={setSelectedColumn}
                    setSortBy={setSortBy}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    setSortOrder={setSortOrder}
                    selectedColumn={selectedColumn}
                    onClick={() => setLastClickedSection('month')}
                    onEventUpdate={fetchEvents}
                  />
                </div>
                {/*<EventsSection
                  title={`Events added this month (${sortedThisMonthEvents.length})`}
                  events={sortedThisMonthEvents}
                  defaultIsExpanded={true}
                  isAlt={lastClickedSection !== 'month'}
                  setSelectedColumn={setSelectedColumn}
                  setSortBy={setSortBy}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  setSortOrder={setSortOrder}
                  selectedColumn={selectedColumn}
                  onClick={() => setLastClickedSection('month')}
                  onEventUpdate={fetchEvents}
                />
                <div className="z-[1]">
                  <EventsSection
                    title={`Events added previously (${sortedPrevEvents.length})`}
                    events={sortedPrevEvents}
                    defaultIsExpanded={true}
                    setSelectedColumn={setSelectedColumn}
                    setSortBy={setSortBy}
                    selectedColumn={selectedColumn}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    setSortOrder={setSortOrder}
                    isAlt={lastClickedSection !== 'prev'}
                    onClick={() => setLastClickedSection('prev')}
                    onEventUpdate={fetchEvents}
                  />
                </div>*/}
              </>
            )}
          </div>

          {Object.keys(selections.events).length > 0 ? (
            <DeleteRowsOverlay
              isAccounts={false}
              deleteItems={deleteItemsInStack}
            />
          ) : (
            <></>
          )}
          <EventDetails isEdit={true} />
        </div>
      </div>

      {loader.isVisible ? <LoadingDialog /> : <></>}
      {actionDialog.dialog != null ? <ActionDialog /> : <></>}
      {deletionResult.success || deletionResult.error ? (
        <DeletionConfirmationOverlay
          itemType={'Event'}
          result={deletionResult}
          onClose={clearDeletionResult}
        />
      ) : null}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
      {createEvent ? <EventCreate isEdit={true} account={linkedAccounts.includes('all') || linkedAccounts.length === 0 ? null : linkedAccounts[0]} onClose={() => setCreateEvent(false)}/> : <></>}
    </div>
  );
};

export default Index;
