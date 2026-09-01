import React, { useState } from 'react';
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
    <div
      onClick={() => (disabled ? {} : showDetails())}
      className={
        'w-full flex flex-col gap-[2px] hover:cursor-pointer ' +
        (event.is_event ? ' bg-midnight border border-2 border-[#403E3C80] ' : 'bg-midnight border border-2 border-[#403E3C80] ') +
        (almostOver ? ' opacity-70 bg-opacity-50 border-dotted border-2 border-midnight ' : '') +
        (isInListView ? ' bg-slate-black bg-opacity-70 rounded-xl p-2 z-[1]' : ' p-[0.65rem] rounded-2xl shadow-[8px_8px_24px_rgba(0,0,0,0.15)] z-[1] md:w-[250px] justify-between ')
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
              className={`break-words text-mist-white font-semibold  ${isInListView ? ' md:grid md:grid-cols-[20vw_20vw_20vw] items-center justify-items-start gap-4 h-full z-[4] max-w-[70%] md:max-w-[80%] text-sm md:text-lg' : ' text-xl max-w-[80%]'}`}
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
                  className={`font-bold text-[10px] md:text-[15px] text-beaming-orange ${dateStyle} `}
                >
                  {formattedDate().endsWith(', 2025')
                    ? formattedDate().slice(0, -6)
                    : formattedDate()}
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
              <div className={`gap-2 flex items-center justify-start md:hidden`}>
                {isInListView && getGenreOrOffering(event) && (
                  <div className={`flex gap-2 items-start justify-center`}>
                    <img
                      src="/images/offering.svg"
                      className="w-[12px] h-[12px] text-beaming-orange-dark mt-[3px]"
                    />
                    <span
                      className={`font-bold text-[10px] md:text-sm text-beaming-orange ${genreOrOfferingStyle}`}
                    >
                      
                      {(getGenreOrOffering(event) ?? '').length > 12
                        ? `${(getGenreOrOffering(event) ?? '').slice(0, 12)}...`
                        : getGenreOrOffering(event)}
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
              <div>
                {isInListView && hasVenueDisplay && (
                  <span
                    className={`flex gap-1 items-center justify-start md:hidden `}
                  >
                    <div className="ml-[-2px] mr-[1px] mt-[0px]">
                      <MdLocationOn className="w-4 h-4 text-beaming-orange-dark" />
                    </div>
                    <span
                      className={`text-[10px] font-semibold text-mist-white opacity-80 mt-[1px] ${locationStyle} `}
                    >
                      {venueDisplayLine.length > 12
                        ? `${venueDisplayLine.slice(0, 12)}...`
                        : venueDisplayLine}
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
  );
}

export default EventCard;