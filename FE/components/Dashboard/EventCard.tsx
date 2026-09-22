import React, { useLayoutEffect, useRef, useState } from 'react';
import { Event } from '../../interface/objects/simpleObject';
import { useStore } from '../../store/store';
import { showEvent } from '../../store/actions/eventDetailsDialog';
import { MdLocationOn } from 'react-icons/md';
import { MdStar } from 'react-icons/md';
import { FaHeart, FaRegCalendar } from 'react-icons/fa';
import { FaRegHeart } from 'react-icons/fa';
import { FaStar } from 'react-icons/fa';
import { FaRegStar } from 'react-icons/fa';
import EventService from '../../services/lib/event';
import { FaCalendar } from 'react-icons/fa';
import { Constants } from '../../utils/constants';
import {
  DESKTOP_LIST_CHIP_MAX_ROWS,
  fitOfferingChips,
} from '../../utils/fitOfferingChips';
import { favoriteEvent } from '../../store/actions/event';
import { useRouter } from 'next/router';

interface EventCardsProp {
  event: Event;
  disabled?: boolean;
  isFavorite?: boolean;
  highlightedFields?: {
    isNameActive: boolean;
    isDateActive: boolean;
    isPriceActive: boolean;
    isLocationActive: boolean;
  };
  searchQuery?: string;
  language?: string;
  locationName?: string;
  almostOver?: boolean;
  isInListView?: boolean;
  sectionDayStartMs?: number;
}

const DESKTOP_LIST_CHIP_CLASS =
  'text-[11px] text-mist-white bg-[#353432] rounded-md px-2.5 py-[3px] whitespace-nowrap shrink-0';

const desktopListChipWidthCache = new Map<string, number>();

function measureDesktopListChipWidth(label: string, container: HTMLElement) {
  const font = getComputedStyle(container).font;
  const cacheKey = `${font}\n${label}`;
  const cached = desktopListChipWidthCache.get(cacheKey);
  if (cached != null) return cached;

  const span = document.createElement('span');
  span.className = DESKTOP_LIST_CHIP_CLASS;
  span.textContent = label;
  span.style.position = 'absolute';
  span.style.visibility = 'hidden';
  span.style.pointerEvents = 'none';
  span.setAttribute('aria-hidden', 'true');
  container.appendChild(span);
  const width = Math.ceil(span.getBoundingClientRect().width);
  span.remove();
  desktopListChipWidthCache.set(cacheKey, width);
  return width;
}

function DesktopListOfferingChip({
  label,
  title,
  extraClassName = '',
}: {
  label: string;
  title?: string;
  extraClassName?: string;
}) {
  return (
    <span
      title={title ?? label}
      className={`${DESKTOP_LIST_CHIP_CLASS} ${extraClassName}`.trim()}
    >
      {label}
    </span>
  );
}

function EventCard({
  event,
  disabled,
  highlightedFields,
  searchQuery,
  isFavorite,
  language,
  locationName,
  almostOver,
  isInListView,
  sectionDayStartMs,
}: EventCardsProp) {
  const [state, dispatch] = useStore();
  const [justEdited, setJustEdited] = useState(false);
  const router = useRouter();
  const { auth } = state;

  // Helper function to determine currency symbol
  const getCurrencySymbol = () => {
    if (locationName === 'mexico-city') {
      return 'MXN';
    }
    return '$';
  };

  const formatProperty = (propertyVal: any) => {
    if (propertyVal) {
      const firstVal = propertyVal.toString().split(Constants.delimiter)[0];
      return firstVal;
    }
    return '...';
  };

  const formattedDate = () => {
    if (event.start_date) {
      const date = new Date(event.start_date);

      const formattingOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      };

      // A run that ends on a later day shows both ends ("Fri, Aug 21 – Sun,
      // Aug 23, 2026"), so a multi-day listing is never mistaken for a
      // wrong date (owner 2026-09-18: an event under Today that "says it
      // starts on the 21st").
      if (event.end_date) {
        const end = new Date(event.end_date);
        const sameDay =
          end.getFullYear() === date.getFullYear() &&
          end.getMonth() === date.getMonth() &&
          end.getDate() === date.getDate();
        if (!sameDay && end > date) {
          const startPart = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          return `${startPart} – ${end.toLocaleDateString('en-US', formattingOptions)}`;
        }
      }

      return date.toLocaleDateString('en-US', formattingOptions);
    }

    return '';
  };

  const eventStartDayStartMs = (() => {
    const d = new Date(event.start_date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  })();

  const hideGridDateForSpanningEvent =
    !isInListView &&
    sectionDayStartMs != null &&
    sectionDayStartMs !== eventStartDayStartMs;

  const hideListDateForSpanningEvent =
    isInListView &&
    sectionDayStartMs != null &&
    sectionDayStartMs !== eventStartDayStartMs;
  function formatPrice(price: string) {
    if (!price) {
      return '...';
    }
    const currencySymbol = getCurrencySymbol();
    
    if (!isNaN(parseFloat(price))) {
      if (currencySymbol === 'MXN') {
        return currencySymbol + ' ' + price.replaceAll('$', '').trim();
      } else {
        return currencySymbol + price.replace('$', '').trim();
      }
    }

    if (currencySymbol === 'MXN') {
      return price.replaceAll('$', currencySymbol + ' ').trim();
    } else {
      return price.replaceAll('$', currencySymbol).trim();
    }

    return price.trim();
  }
  const formattedTime = (time: string | null) => {
    if (!time) return '';
    if (time == '...') return;

    try{
      const [hour, minute, period] = time
        .match(/(\d+):(\d+)\s*(AM|PM)/i)!
        ?.slice(1);
      return `${parseInt(hour)}:${minute} ${period.toUpperCase()}`;
    } catch (error) {
      return '';
    }
  };

  const showDetails = () => {
    showEvent({
      ...event,
      is_favorite: isFavorite ?? false,
      viewing_language: language,
    })(dispatch);
    const body = document.querySelector('body');
    if (body != null) {
      body.style.overflow = 'hidden';
    }
  };

  const getGenreOrOffering = (event: Event) => {
    if (event.genres && event.genres.trim() !== '') {
      return event.genres;
    }
    return event.offering ?? null;
  };

  const getValue = (
    value: string | null,
    fallback1: string | null = null,
    fallback2: string | null = null,
    fallback3: string | null = null
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
    if (fallback3 && fallback3.trim() !== '') {
      return fallback3.split(Constants.delimiter)[0];
    }
    return '...';
  };

  const eventTitle = getValue(event.name, event.artist, event.promoter, event.poster?.user);

  //console.log(eventTitle, searchQuery);

  const nameStyle = (highlightedFields?.isNameActive && eventTitle.toLowerCase().includes(searchQuery?.toLowerCase().trim() ?? '')) || (searchQuery != null && searchQuery?.trim() !== '' && eventTitle.toLowerCase().includes(searchQuery?.toLowerCase().trim() ?? ''))
    ? 'font-bold underline'
    : '';
  const dateStyle = highlightedFields?.isDateActive 
    ? 'font-bold underline'
    : '';
  const priceStyle = highlightedFields?.isPriceActive
    ? 'font-bold underline'
    : '';
  const searchLower = searchQuery?.toLowerCase().trim() ?? '';
  const locationTextMatchesSearch =
    (!!event.venue.name && event.venue.name.toLowerCase().includes(searchLower)) ||
    (!!event.venue.address && event.venue.address.toLowerCase().includes(searchLower));
  const locationStyle =
    (highlightedFields?.isLocationActive && locationTextMatchesSearch) ||
    (searchQuery != null && searchQuery?.trim() !== '' && locationTextMatchesSearch)
      ? 'font-bold underline'
      : '';

  const venueDisplayLine = getValue(event.venue.name, event.venue.address);
  const hasVenueDisplay =
    (event.venue.name && event.venue.name.trim() !== '') ||
    (event.venue.address && event.venue.address.trim() !== '');
  const genreOrOfferingStyle = (searchQuery != null && searchQuery?.trim() !== '' && event.genres?.toLowerCase().includes(searchQuery?.toLowerCase().trim() ?? '')) || (searchQuery != null && searchQuery?.trim() !== '' && event.offering?.toLowerCase().includes(searchQuery?.toLowerCase().trim() ?? ''))
    ? 'font-bold underline'
    : '';

  const getCityAndCountry = () => {
    return `${getValue(event.venue.city)}, ${getValue(event.venue.country)}`;
  };

  const firstToken = (value: string | null | undefined) => {
    if (!value || value.trim() === '') return '';
    return value.split(Constants.delimiter)[0].trim();
  };

  // Desktop list subtitle: Artist → Genre → Host/Promoter → nothing.
  // Skip a candidate that merely repeats the title.
  const listSubtitle = (() => {
    const titleLower = eventTitle.toLowerCase();
    const candidates = [
      firstToken(event.artist),
      firstToken(event.genres),
      firstToken(event.host) || firstToken(event.promoter),
    ];
    return candidates.find((c) => c && c.toLowerCase() !== titleLower) || '';
  })();

  const listOfferingChips = (() => {
    const raw = event.offering || '';
    const fromOffering = raw
      .split(Constants.delimiter)
      .flatMap((part) => part.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    const chips = [...fromOffering];
    const age = firstToken(event.age_barrier);
    if (age && !chips.some((c) => c.toLowerCase() === age.toLowerCase())) {
      chips.push(age);
    } else if (event.is_age_restricted && !chips.some((c) => /21/.test(c))) {
      chips.push('21+');
    }
    if (event.ticket_link && !chips.some((c) => c.toLowerCase() === 'tickets')) {
      chips.push('Tickets');
    }
    return chips;
  })();

  const listDateParts = (() => {
    if (!event.start_date) return { weekday: '', monthDay: '' };
    const date = new Date(event.start_date);
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      monthDay: date
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        .toUpperCase(),
    };
  })();

  const listCityLine = (() => {
    const city = event.venue.city && event.venue.city.trim() !== '' ? event.venue.city.trim() : '';
    const region =
      (event.venue.state && event.venue.state.trim() !== '' && event.venue.state) ||
      (event.venue.country && event.venue.country.trim() !== '' && event.venue.country) ||
      '';
    if (city && region) return `${city}, ${region}`;
    return city || region;
  })();

  const offeringChipsKey = listOfferingChips.join('\u0001');
  const listChipContainerRef = useRef<HTMLDivElement>(null);
  const [listChipFit, setListChipFit] = useState({
    visibleIndexes: [] as number[],
    extraCount: 0,
  });

  useLayoutEffect(() => {
    if (!isInListView) return;
    const container = listChipContainerRef.current;
    if (!container) return;

    const compute = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      const gapX = parseFloat(getComputedStyle(container).columnGap);
      setListChipFit(
        fitOfferingChips({
          chipWidths: listOfferingChips.map((label) =>
            measureDesktopListChipWidth(label, container)
          ),
          extraWidthFor: (n) => measureDesktopListChipWidth(`+${n}`, container),
          containerWidth: width,
          gapX: Number.isFinite(gapX) ? gapX : 6,
          maxRows: DESKTOP_LIST_CHIP_MAX_ROWS,
        })
      );
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isInListView, offeringChipsKey]);

  const visibleOfferingChips = listChipFit.visibleIndexes.map(
    (index) => listOfferingChips[index]
  );
  const extraOfferingCount = listChipFit.extraCount;

  const favoriteHeart = (
    <div className="flex-shrink-0 z-[4]">
      {justEdited ? (
        <FaHeart className="w-7 h-7 text-beaming-orange-transparent" />
      ) : isFavorite ? (
        <FaHeart
          className="w-7 h-7 text-beaming-orange"
          onClick={(e) => {
            e.stopPropagation();
            handleUnfavoriteClick(event.id);
          }}
        />
      ) : (
        <FaRegHeart
          className="w-7 h-7 text-beaming-orange"
          onClick={(e) => {
            e.stopPropagation();
            handleFavoriteClick(event.id);
          }}
        />
      )}
    </div>
  );

  async function handleFavoriteClick(id: number): Promise<void> {
    if (!auth.isUserLoggedIn) {
      router.push('/login'); // Redirect to login if not logged in
      return;
    }
    setJustEdited(true);

    const userEmail = localStorage.getItem('userEmail');
    await EventService.addFavoriteEvent({
      email: userEmail || '',
      event_ids: [id.toString()],
    });

    favoriteEvent()(dispatch);
    setTimeout(() => setJustEdited(false), 1000);
  }

  async function handleUnfavoriteClick(id: number): Promise<void> {
    if (!auth.isUserLoggedIn) {
      router.push('/login'); // Redirect to login if not logged in
      return;
    }
    setJustEdited(true);

    const userEmail = localStorage.getItem('userEmail');
    await EventService.removeFavoriteEvent({
      email: userEmail || '',
      event_ids: [id.toString()],
    });

    favoriteEvent()(dispatch);
    setTimeout(() => setJustEdited(false), 1000);
  }

  return (
    <>
    {isInListView && (
      <div
        onClick={() => (disabled ? {} : showDetails())}
        className="hidden md:grid w-full items-center gap-x-4 lg:gap-x-5 cursor-pointer rounded-xl bg-slate-black px-3 py-2.5 hover:bg-stone-gray/50 transition-colors grid-cols-[130px_minmax(0,3fr)_1px_6.75rem_1px_minmax(0,1fr)_1px_minmax(0,1fr)_2rem]"
      >
        <div className="relative w-[130px] h-[86px] rounded-lg overflow-hidden bg-stone-gray">
          <img
            src={event.orig_thumb ? event.orig_thumb : ''}
            alt="Event Thumbnail"
            className="absolute top-0 left-0 w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <p
            className={
              'text-xl lg:text-[22px] font-semibold text-mist-white uppercase tracking-wide leading-tight overflow-hidden ' +
              nameStyle
            }
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
            }}
          >
            {eventTitle}
          </p>
          {listSubtitle && (
            <p className="text-[12px] text-mist-white/50 truncate mt-0.5 leading-snug">
              {listSubtitle}
            </p>
          )}
        </div>
        <div className="w-px self-stretch my-1.5 bg-[#403E3C]" aria-hidden="true" />
        <div className="text-left leading-tight">
          {!hideListDateForSpanningEvent && (
            <>
              {listDateParts.weekday && (
                <p className="text-[12px] tracking-[0.12em] text-mist-white/50">
                  {listDateParts.weekday}
                </p>
              )}
              {listDateParts.monthDay && (
                <p className="text-base font-semibold text-beaming-orange">
                  {listDateParts.monthDay}
                </p>
              )}
              {formattedTime(event.start_time) && (
                <p className="text-[14px] text-mist-white/50 mt-0.5">
                  {formattedTime(event.start_time)}
                </p>
              )}
            </>
          )}
        </div>
        <div className="w-px self-stretch my-1.5 bg-[#403E3C]" aria-hidden="true" />
        <div className="min-w-0">
          {hasVenueDisplay && (
            <>
              <p
                className={
                  'flex items-center gap-1.5 min-w-0 text-base text-mist-white leading-tight ' +
                  locationStyle
                }
              >
                <MdLocationOn className="text-beaming-orange w-5 h-5 flex-shrink-0" />
                <span className="truncate">{venueDisplayLine}</span>
              </p>
              {listCityLine && (
                <p className="text-[13px] text-mist-white/50 truncate mt-0.5 pl-7">
                  {listCityLine}
                </p>
              )}
            </>
          )}
        </div>
        <div className="w-px self-stretch my-1.5 bg-[#403E3C]" aria-hidden="true" />
        <div
          ref={listChipContainerRef}
          className="min-w-0 flex flex-wrap items-center justify-end content-start gap-x-1.5 gap-y-1"
        >
          {visibleOfferingChips.map((chip, i) => (
            <DesktopListOfferingChip
              key={`${chip}-${i}`}
              label={chip}
              extraClassName={genreOrOfferingStyle}
            />
          ))}
          {extraOfferingCount > 0 && (
            <DesktopListOfferingChip label={`+${extraOfferingCount}`} />
          )}
        </div>
        {favoriteHeart}
      </div>
    )}
    <div
      onClick={() => (disabled ? {} : showDetails())}
      className={
        'w-full flex flex-col gap-[2px] hover:cursor-pointer ' +
        (event.is_event ? ' bg-slate-black border border-2 border-[#403E3C80] ' : 'bg-slate-black border border-2 border-[#403E3C80] ') +
        (almostOver ? ' opacity-70 bg-opacity-50 border-dotted border-2 border-midnight ' : '') +
        (isInListView ? ' md:hidden rounded-xl p-2 z-[1]' : ' p-[0.65rem] rounded-2xl shadow-[8px_8px_24px_rgba(0,0,0,0.15)] z-[1] md:w-[250px] justify-between ')
      }
    >
      <div className={`flex  ${isInListView ? 'flex-row w-full ' : 'flex-col'}`}>
        <div className={`flex  ${isInListView ? 'flex-row justify-start gap-3 w-full ' : 'flex-col gap-1'}`}>
          <div className={`relative rounded-xl overflow-hidden ${isInListView ? ' h-[100px] min-w-[100px] max-w-[100px] ' : ' w-full pb-[100%] '}`}>
            <img
              className={`absolute top-0 left-0 object-cover rounded-xl object-cover bg-midnight ${isInListView ? ' min-w-[100px] h-[100px] '  : ' w-full h-full  '}`}
              src={event.orig_thumb ? event.orig_thumb : ''}
              alt="Event Thumbnail"
            />
          </div>
          <div className={`flex justify-between items-start ${isInListView ? 'flex-1' : ''}`}>
            <span
              className={`break-words text-mist-white font-semibold  ${isInListView ? ' flex flex-col md:grid md:grid-cols-[20vw_20vw_20vw] items-start md:items-center justify-items-start gap-1 md:gap-4 h-full z-[4] w-[calc(100%-40px)] md:max-w-[80%] text-sm md:text-lg min-w-0' : ' text-xl max-w-[80%]'}`}
            >
              <div className={`flex break-words col-span-1`}>
                <span className={`${nameStyle} font-semibold hidden md:block ${isInListView ? ' break-words text-sm md:text-lg w-[100%] ' : ''}`}>{getValue(
                  event.name,
                  event.artist,
                  event.promoter,
                  event.poster?.user
                )}</span>
                <span className={`${nameStyle} font-semibold block md:hidden ${isInListView ? ' break-words text-xs md:text-lg w-[100%] ' : ''}`}>{getValue(
                  event.name,
                  event.artist,
                  event.promoter,
                  event.poster?.user
                )}</span>
              </div>
              <div className={`flex flex-wrap md:flex-row md:gap-2 mt-1 md:mt-0 items-center md:justify-center`}>
                {isInListView && !hideListDateForSpanningEvent && <FaRegCalendar className="w-3 h-3 text-beaming-orange w-4 h-4 mr-2 md:mr-0" />}
                {isInListView && !hideListDateForSpanningEvent && <span
                  className={`!font-bold text-[10px] md:text-[15px] text-beaming-orange ${dateStyle} `}
                >
                  <span className="md:hidden !font-bold">
                    {(formattedDate().endsWith(', 2025')
                      ? formattedDate().slice(0, -6)
                      : formattedDate()
                    ).replace(/,\s*\d{4}/g, '')}
                  </span>
                  <span className="hidden md:inline !font-bold">
                    {formattedDate().endsWith(', 2025')
                      ? formattedDate().slice(0, -6)
                      : formattedDate()}
                  </span>
                </span>}
                {isInListView && !hideListDateForSpanningEvent && event.start_time != null && (
                  <span
                    className={`ml-5 hidden md:ml-0 font-bold text-[10px] md:text-[15px] text-beaming-orange ${dateStyle}`}
                  >
                    {formattedTime(event.start_time)}
                  </span>
                )}
              </div>
              <div className={`gap-2 items-center justify-center hidden md:flex`}>
                {isInListView && getGenreOrOffering(event) && (
                  <div className={`flex gap-2 items-start justify-center`}>
                    <img
                      src="/images/offering.svg"
                      className="w-[14px] h-[14px] text-beaming-orange-dark mt-[3px]"
                    />
                    <span
                      className={`font-bold text-[0.8rem] text-[12px] md:text-sm text-beaming-orange ${genreOrOfferingStyle}`}
                    >
                      
                      {getGenreOrOffering(event)}
                    </span>
                  </div>
                )}
              </div>
              <div className={`gap-2 flex items-start justify-start md:hidden w-full min-w-0`}>
                {isInListView && getGenreOrOffering(event) && (
                  <div className={`flex gap-2 items-start justify-start min-w-0 w-full`}>
                    <img
                      src="/images/offering.svg"
                      className="w-[12px] h-[12px] text-beaming-orange-dark mt-[3px] flex-shrink-0"
                    />
                    <span
                      className={`font-bold text-[10px] md:text-sm text-beaming-orange ${genreOrOfferingStyle} min-w-0 break-words whitespace-normal`}
                    >
                      {getGenreOrOffering(event)}
                    </span>
                  </div>
                )}
              </div>
              <div>
                {isInListView && hasVenueDisplay && (
                  <span
                    className={`flex gap-1 items-center justify-start mt-1 hidden md:flex `}
                  >
                    <div className=" ml-[-4px] mr-[1px] mt-[0px]">
                      <MdLocationOn className="w-5 h-5 text-beaming-orange-dark" />
                    </div>
                    <span
                      className={`text-[0.8rem] font-semibold text-mist-white opacity-80 mt-[1px] ${locationStyle} `}
                    >
                      {venueDisplayLine}
                    </span>
                  </span>
                )}
              </div>
              <div className="w-full min-w-0">
                {isInListView && hasVenueDisplay && (
                  <span
                    className={`flex gap-1 items-start justify-start md:hidden w-full min-w-0`}
                  >
                    <div className="ml-[-2px] mr-[1px] mt-[0px] flex-shrink-0">
                      <MdLocationOn className="w-4 h-4 text-beaming-orange-dark" />
                    </div>
                    <span
                      className={`text-[10px] font-semibold text-mist-white opacity-80 mt-[1px] ${locationStyle} min-w-0 break-words whitespace-normal`}
                    >
                      {venueDisplayLine}
                    </span>
                  </span>
                )}
              </div>
              
            </span>

            <div className={`mr-1 mt-[6px] z-[4]`}>
              {justEdited ? (
                <FaHeart
                  className={`w-5 h-5 text-beaming-orange-transparent`}
                />
              ) : isFavorite ? (
                <FaHeart
                  className={`w-5 h-5 text-beaming-orange`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnfavoriteClick(event.id);
                  }}
                />
              ) : (
                <FaRegHeart
                  className="w-5 h-5 text-beaming-orange"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFavoriteClick(event.id);
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {!hideGridDateForSpanningEvent && (
          <span
            className={`font-bold text-[0.8rem] pt-[0.4em] text-beaming-orange ${dateStyle} ${isInListView ? 'hidden' : ''}`}
          >
            {formattedDate().endsWith(', 2025')
              ? formattedDate().slice(0, -6)
              : formattedDate()}
          </span>
        )}
        {!hideGridDateForSpanningEvent && event.start_time != null && (
          <span
            className={`text-[0.8rem] font-bold text-beaming-orange ${dateStyle} ${isInListView ? 'hidden' : ''}`}
          >
            {formattedTime(event.start_time)}
          </span>
        )}
        {hasVenueDisplay && (
          <div
            className={`flex gap-2 items-start justify-start w-[80%] my-2 mt-3 ${isInListView ? 'hidden' : ''}`}
          >
            <div className="w-[10%]  ml-[-4px] mr-[1px] mt-[0px]">
              <MdLocationOn className="w-5 h-5 text-beaming-orange-dark" />
            </div>
            <span
              className={`text-[0.8rem] font-semibold text-mist-white ${locationStyle} max-w-[82%]`}
            >
              {venueDisplayLine}
            </span>
          </div>
        )}
        {!hasVenueDisplay && <div className="h-[5px]" />}
        {getGenreOrOffering(event) && (
          <div className={`flex gap-2 items-start justify-start w-[80%] mb-2 ${isInListView ? 'hidden' : ''}`}>
            <div className="!w-[10%] ml-[-1px] mt-[1px] mr-[-1px]">
              <img
                src="/images/offering.svg"
                className="w-[14px] h-[14px] text-beaming-orange-dark mt-[1px]"
              />
            </div>
            <span
              className={`text-[0.8rem] font-semibold text-mist-white ${genreOrOfferingStyle} max-w-[82%]`}
            >
              {formatProperty(getGenreOrOffering(event))}
              {/* getValue(event.venue.city)}, {getValue(event.venue.country)} */}
            </span>
          </div>
        )}
      </div>
      <div className={`flex justify-between items-end gap-2 pt-4 text-xs ${isInListView ? 'hidden' : ''}`}>
        {/* getValue(event.venue.city)}, {getValue(event.venue.country)} */}
        <div className={`flex gap-2 items-center justify-start w-[80%]`}>
          {/*<div className="w-[10%]">
            <MdLocationOn className="w-5 h-5 text-beaming-orange-dark" />
          </div>*/}
          {getCityAndCountry() != '..., ...' && (
            <span className={`text-[0.6rem] text-mist-white ${locationStyle}`}>
              {`${getValue(event.venue.city)}, ${getValue(
                event.venue.country
              )}`.replace(/^..., |, ...$/g, '')}
            </span>
          )}
        </div>
        {event.price ? (
          <span
            className={`p-1 px-2 rounded-lg flex items-center h-fit bg-gradient-to-r from-beaming-orange-dark to-beaming-orange text-slate-black font-semibold ${priceStyle}`}
          >
            {formatPrice(event.price)}
          </span>
        ) : (
          <> </>
        )}
      </div>
    </div>
    </>
  );
}

export default EventCard;