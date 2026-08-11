import type { NextPage } from 'next';
import { useStore } from '../store/store';
import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import EventsSection from '../components/Dashboard/EventsSection';
import EventDetails from '../components/Dashboard/EventDetails';
import { closePopup } from '../store/actions/popup';
import Filter from '../components/Filter/Filter';
import EventService from '../services/lib/event';
import { formatDate } from '../utils/utils';
import { Option } from '../interface/filterInterface';
import { Constants } from '../utils/constants';
import { Event } from '../interface/objects/simpleObject';
import SearchBar from '../components/SearchBar';
import SortOverlay from '../components/SortOverlay';
import ActionDialog from '../components/overlay/ActionDialog';
import LoadingDialog from '../components/overlay/LoadingDialog';
import getFilterString, { colorFromClass } from '../utils/color_convertor';

const Home: NextPage = () => {
  const [state, dispatch] = useStore();
  const { search, loader, actionDialog, filter } = state;

  const [sort, setSort] = useState({ value: '', label: 'None' });
  const [sortOrderRev, setSortOrderRev] = useState(false);
  const [showSortOverlay, setShowSortOverlay] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const [todayEvents, setTodayEvents] = useState(null as null | Event[]);
  const [weekEvents, setWeekEvents] = useState(null as null | Event[]);
  const [yearEvents, setYearEvents] = useState(null as null | Event[]);
  const [lastClickedSection, setLastClickedSection] = useState('');

  useEffect(() => {
    const today = new Date();
    const weekStart = new Date();
    const weekEnd = new Date();
    const yearStart = new Date();
    const yearEnd = new Date();

    weekStart.setDate(today.getDate() + 1);
    weekEnd.setDate(today.getDate() + 6);
    yearStart.setDate(today.getDate() + 7);
    yearEnd.setDate(today.getDate() + 365);

    EventService.getEventByDate({
      date: formatDate(new Date()),
    }).then((res) => {
      if (res.status == 200) {
        if (res.data.status == 'success') {
          setTodayEvents(res.data.data);
        }
      }
    });

    EventService.getEventByDateRange({
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
    }).then((res) => {
      if (res.status == 200) {
        if (res.data.status == 'success') {
          setWeekEvents(res.data.data);
        }
      }
    });

    EventService.getEventByDateRange({
      start: formatDate(yearStart),
      end: formatDate(yearEnd),
    }).then((res) => {
      if (res.status == 200) {
        if (res.data.status == 'success') {
          setYearEvents(res.data.data);
        }
      }
    });
  }, []);

  const sortListByProperty = (property: string, list: null | Event[]) => {
    if (list) {
      const updatedList = [...list];

      updatedList.sort((a: Event, b: Event) => {
        if (property == 'event_date') {
          return a.timestamp < b.timestamp ? -1 : 1;
        } else {
          return -1;
        }
      });

      return updatedList;
    }

    return null;
  };

  const searchSortedEvents = useMemo(() => {
    if (search.eventResults) {
      const allEvents = [...search.eventResults];

      const sortedEvents =
        sort && sort.value != ''
          ? sortListByProperty(sort.value, allEvents)
          : allEvents;

      return !sortOrderRev ? sortedEvents : sortedEvents!.reverse();
    }

    return null;
  }, [search.eventResults, sort, sortOrderRev]);

  const filteredSortedEvents = useMemo(() => {
    if (filter.results) {
      const allEvents = [...filter.results];

      const sortedEvents =
        sort && sort.value != ''
          ? sortListByProperty(sort.value, allEvents)
          : allEvents;

      return !sortOrderRev ? sortedEvents : sortedEvents!.reverse();
    }

    return null;
  }, [filter.results, sort, sortOrderRev]);

  const todaySortedEvents = useMemo(() => {
    if (todayEvents) {
      const allEvents = [...todayEvents];

      const sortedEvents =
        sort && sort.value != ''
          ? sortListByProperty(sort.value, allEvents)
          : allEvents;

      return !sortOrderRev ? sortedEvents : sortedEvents!.reverse();
    }

    return null;
  }, [todayEvents, sort, sortOrderRev]);

  const weekSortedEvents = useMemo(() => {
    if (weekEvents) {
      const allEvents = [...weekEvents];

      const sortedEvents =
        sort && sort.value != ''
          ? sortListByProperty(sort.value, allEvents)
          : allEvents;

      return !sortOrderRev ? sortedEvents : sortedEvents!.reverse();
    }

    return null;
  }, [weekEvents, sort, sortOrderRev]);

  const yearSortedEvents = useMemo(() => {
    if (yearEvents) {
      const allEvents = [...yearEvents];

      const sortedEvents =
        sort && sort.value != ''
          ? sortListByProperty(sort.value, allEvents)
          : allEvents;

      return !sortOrderRev ? sortedEvents : sortedEvents!.reverse();
    }

    return null;
  }, [yearEvents, sort, sortOrderRev]);

  return (
    <div
      className="theme-alt-yellow py-5 font-montserrat h-full bg-midnight"
      onClick={() => {
        closePopup()(dispatch);
        setShowFilter(false);
        setShowSortOverlay(false);
      }}
    >
      <nav className="flex lg:flex-row flex-col lg:gap-2 gap-4 relative justify-between lg:mx-10 py-4 lg:px-0 lg:border-b-[3px] border-beaming-orange">
        <h2 className="lg:px-0 px-4 text-2xl lg:text-4xl font-semibold text-mist-white">
          Tracked Events
        </h2>
        <div className="flex justify-evenly gap-4 z-[2] px-6 lg:px-0">
          <SearchBar />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFilter(!showFilter);
            }}
            className={
              'flex lg:hidden group items-center border-solid border-[1px] p-3 rounded-lg relative overflow-clip text-mist-white border-main-ocean-blue bg-main-filter_btn_bg'
            }
          >
            <div
              className={
                'w-full h-full absolute top-0 left-0 z-0 bg-beaming-orange_button'
              }
            ></div>
            <img
              className="w-4 z-[1]"
              src="/images/settings_icon.png"
              alt="Settings button"
            />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSortOverlay(false);
              setShowFilter(!showFilter);
            }}
            className={
              'lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white '
            }
          >
            <div
              className={
                'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 opacity-0 group-hover:opacity-100'
              }
            ></div>
            <img
              className="w-4 z-[1] text-mist-white filter group-hover:!brightness-0"
              src="/images/filterImg.png"
              alt="Filter button"
              style={{
                filter: getFilterString(
                  colorFromClass('text-mist-white', 'color')
                ),
              }}
            />
            <span className="z-[1] text-mist-white filter group-hover:!brightness-0">
              Filter
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFilter(false);
              setShowSortOverlay(!showSortOverlay);
            }}
            className={
              'lg:flex hidden group items-center gap-2 border-solid border-[1px] px-3 py-1 rounded-lg relative overflow-clip text-mist-white border-slate-black bg-transparent-white ' +
              (showSortOverlay ? 'bg-option_button_hover_bg' : '')
            }
          >
            <div
              className={
                'w-full h-full bg-pearl-white absolute top-0 left-0 z-0 group-hover:opacity-100' +
                (showSortOverlay ? '' : ' opacity-0')
              }
            ></div>
            <img
              className="w-4 z-[1] text-mist-white filter group-hover:!brightness-0"
              src="/images/sortImg.png"
              alt="Sort button"
              style={{
                filter: getFilterString(
                  colorFromClass('text-mist-white', 'color')
                ),
              }}
            />
            <span className="z-[1] text-mist-white filter group-hover:!brightness-0">
              Sort
            </span>
          </button>
          {showSortOverlay ? (
            <SortOverlay
              hide={() => setShowSortOverlay(false)}
              value={sort}
              onChange={(newValue: any) => setSort(newValue as Option)}
            />
          ) : (
            <></>
          )}
        </div>
        {showFilter ? (
          <Filter
            hide={() => setShowFilter(false)}
            isAdmin={false}
            sort={sort}
            setSort={setSort}
            order={sortOrderRev}
            setOrder={setSortOrderRev}
          />
        ) : (
          <></>
        )}
      </nav>

      <main className="py-2 px-6 lg:p-10 flex flex-col gap-5 bg-midnight hue-">
        {search.show ? (
          <EventsSection
            key="searchEvents"
            title="Search Results"
            subTitle={`Showing ${search.eventResults?.length ?? 0} event(s)`}
            events={searchSortedEvents}
            isAlt={false}
            defaultIsExpanded={true}
            onClick={() => {}}
          />
        ) : filter.show ? (
          <EventsSection
            key="filterEvents"
            title="Filtered Results"
            subTitle={`Showing ${filter.results?.length ?? 0} event(s)`}
            events={filteredSortedEvents}
            isAlt={false}
            defaultIsExpanded={true}
            onClick={() => {}}
          />
        ) : (
          <>
            <EventsSection
              key="todayEvents"
              title="Today"
              subTitle="Happening today"
              events={todaySortedEvents}
              isAlt={lastClickedSection != 'today'}
              defaultIsExpanded={true}
              onClick={() => setLastClickedSection('today')}
            />

            <EventsSection
              key="weekEvents"
              title="This Week"
              subTitle="Happening in the next 7 days"
              events={weekSortedEvents}
              isAlt={lastClickedSection != 'week'}
              defaultIsExpanded={true}
              onClick={() => setLastClickedSection('week')}
            />

            <EventsSection
              key="yearEvents"
              title="This Year"
              subTitle="Happening in the next 365 days"
              events={yearSortedEvents}
              isAlt={lastClickedSection != 'year'}
              defaultIsExpanded={true}
              onClick={() => setLastClickedSection('year')}
            />
          </>
        )}

        <EventDetails isEdit={false} />
      </main>

      {loader.isVisible ? <LoadingDialog /> : <></>}
      {actionDialog.dialog != null ? <ActionDialog /> : <></>}
    </div>
  );
};

export default Home;
