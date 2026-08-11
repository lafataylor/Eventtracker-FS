import React, { useEffect, useRef, useState } from 'react';
import { Account, Event } from '../interface/objects/simpleObject';
import axios, { CancelTokenSource } from 'axios';
import EventService from '../services/lib/event';
import {
  resetSearch,
  setAccountsLoadedBySearch,
  setEventsLoadedBySearch,
  showSearchResults,
  setSearchLoading,
} from '../store/actions/search';
import { useStore } from '../store/store';
import { rgbToHex } from '../utils/color_convertor';
import { FiX } from 'react-icons/fi';
import { IoMdSearch } from 'react-icons/io';
import Spinner from './Spinner';

interface SearchBarProps {
  isAccounts?: boolean;
  allAccounts?: Account[];
  allEvents?: Event[];
  language?: string;
  forceShrink?: number;
}

const SearchBar = ({
  isAccounts,
  allAccounts,
  allEvents,
  language = 'en',
  forceShrink = 0,
}: SearchBarProps) => {
  const [state, dispatch] = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to hold the current CancelTokenSource.
  const cancelSourceRef = useRef<CancelTokenSource | null>(null);
  // Ref to track a request id that increments on each new search.
  const currentRequestIdRef = useRef(0);

  useEffect(() => {
    // Clear any pending debounce timer when searchTerm changes.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // If searchTerm is empty, reset search state.
    if (searchTerm.trim() === '') {
      // Cancel any pending request.
      if (cancelSourceRef.current) {
        cancelSourceRef.current.cancel('Search cleared');
      }
      resetSearch()(dispatch);
      setSearchLoading(false)(dispatch);
      return;
    }

    debounceTimeoutRef.current = setTimeout(() => {
      // Increment our request id for each new search.
      currentRequestIdRef.current += 1;
      const requestId = currentRequestIdRef.current;

      showSearchResults()(dispatch);
      setSearchLoading(true)(dispatch);

      // Cancel previous request if any.
      if (cancelSourceRef.current) {
        cancelSourceRef.current.cancel('New search initiated');
      }
      cancelSourceRef.current = axios.CancelToken.source();

      // Use local filtering if available.
      if (isAccounts && allAccounts) {
        const filteredAccounts = allAccounts.filter((account) =>
          account.user.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setAccountsLoadedBySearch(filteredAccounts)(dispatch);
        setSearchLoading(false)(dispatch);
      } else if (allEvents) {
        const filteredEvents = allEvents
          .filter(
            (event) =>
              event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              event.venue?.address
                ?.toLowerCase()
                .includes(searchTerm.toLowerCase())
          )
          .sort((a: Event, b: Event) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
        setEventsLoadedBySearch(filteredEvents, searchTerm)(dispatch);
        setSearchLoading(false)(dispatch);
      } else {
        // Fire the API call.
        EventService.getEventsBySearchTerm({
          query: searchTerm,
          cancelToken: cancelSourceRef.current.token,
        })
          .then((res) => {
            // Only update state if this response is from the latest request.
            if (requestId === currentRequestIdRef.current) {
              if (res.status === 200 && res.data.status === 'success') {
                const sortedEvents = res.data.data.sort((a: Event, b: Event) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
                const filteredEvents = sortedEvents.filter((event: Event) => {
                  const eventDate = new Date(event.start_date).getTime();
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  yesterday.setHours(0, 0, 0, 0);
                  return eventDate >= yesterday.getTime();
                });
                setEventsLoadedBySearch(filteredEvents, searchTerm)(dispatch);
              }
            }
          })
          .catch((err) => {
            if (axios.isCancel(err)) {
              ////console.log('Search request cancelled:', err.message);
            } else {
              console.error('Search request error:', err);
            }
          })
          .finally(() => {
            // Only clear loading if this is the latest request.
            if (requestId === currentRequestIdRef.current) {
              setSearchLoading(false)(dispatch);
            }
          });
      }
    }, 300);

    // Cleanup: Clear timer and cancel any in-flight request.
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (cancelSourceRef.current) {
        cancelSourceRef.current.cancel('Cleanup: searchTerm changed');
      }
    };
  }, [searchTerm]);

  const esExToExxMax ='ex:max-w-[9.75vw] exx:max-w-[45vw] min-w-0'

  return (
    <div
      className={`flex min-w-0 items-center gap-2 px-3 p-2 rounded-lg bg-slate-black w-[200px] max-w-[45vw] max-h-[50px] ${esExToExxMax} ${
        forceShrink > 4 ? 'md:w-[100px]' : forceShrink > 2 ? 'md:w-[140px]' : 'md:w-auto'
      }`}
    >
      <IoMdSearch className="w-auto shrink-0 md:w-5 md:h-5 text-mist-white" />
      <input
        ref={inputRef}
        className="min-w-0 flex-1 outline-none bg-ocean-mist text-mist-white"
        placeholder={language === 'es' ? 'Buscar' : 'Search'}
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      {state.search.loading ? (
        <div className="flex items-center justify-center w-4 h-4">
          <Spinner colorClass="text-mist-white" />
        </div>
      ) : (
        <FiX
          className={
            'w-4 h-4 hover:cursor-pointer text-mist-white ' +
            (searchTerm.length > 0
              ? ''
              : 'opacity-0 select-none pointer-events-none')
          }
          onClick={() => setSearchTerm('')}
        />
      )}
    </div>
  );
};

export default SearchBar;
