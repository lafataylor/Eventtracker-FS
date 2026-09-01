import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { FiClock, FiUser, FiX } from 'react-icons/fi';
import { GrShare } from 'react-icons/gr';
import { BsCreditCard2FrontFill } from 'react-icons/bs';
import { FaDollarSign, FaHeart, FaMoneyBill, FaRegCalendar, FaRegHeart, FaShare, FaStar, FaWallet } from 'react-icons/fa';
import { FaLocationDot } from 'react-icons/fa6';
import { RiExpandDiagonalLine } from 'react-icons/ri';
import { Event } from '../../interface/objects/simpleObject';
import { createEventFromDashboard, createEventFromInstagram, updateEvent } from '../../services/lib/admin';
import { hideEvent } from '../../store/actions/eventDetailsDialog';
import { showImage } from '../../store/actions/imageDialog';
import {
  hideLoadingDialog,
  showLoadingDialog,
} from '../../store/actions/loadingState';
import { SHOW_IMAGE, SHOW_SPINNER } from '../../store/actions/type';
import { useStore } from '../../store/store';
import { Constants } from '../../utils/constants';
import {
  formatLongDate,
  formatTime,
  makeSlugFromName,
} from '../../utils/utils';
import { showMap } from '../../store/actions/mapDialog';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { showFeedbackDialog } from '../../store/actions/feedbackDialog';
import FeedbackDialog from '../Dashboard/FeedbackDialog';
import getFilterString, { colorFromClass } from '../../utils/color_convertor';
import { IoIosInformationCircle } from 'react-icons/io';
import copy from 'copy-to-clipboard'; // Import copy-to-clipboard
import NextImage from 'next/image';
import InfoOverlay from '../Admin/InfoOverlay';
import Spinner from '../Spinner';
import EventService from '../../services/lib/event';
import { favoriteEvent } from '../../store/actions/event';
import ImageDialog from '../Dashboard/ImageDialog';
import MapDialog from '../Dashboard/MapDialog';

interface EventCreateProps {
  isEdit: boolean;
  onClose: () => void;
  account?: string | null;
}

function EventCreate({ isEdit, onClose, account }: EventCreateProps) {
  const router = useRouter();
  const [state, dispatch] = useStore();
  const { eventDetailsDialog } = state;

  const [favoriteStatusJustEdited, setFavoriteStatusJustEdited] = useState(false);
  const [hasNewFavoritedValue, setHasNewFavoritedValue] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const [basicEventCreated, setBasicEventCreated] = useState(false);

  const [isEditOfferings, setIsEditOfferings] = useState(false);
  const { auth } = state;

  const { overlay } = auth;

  const [isMobile, setIsMobile] = useState(false);
  const [isMapDialogOpen, setIsMapDialogOpen] = useState(false);

  const [updatedEvent, setUpdatedEvent] = useState<null | Event>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [singleImage, setSingleImage] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [instagramUrl, setInstagramUrl] = useState<string>('');
  const [uploadMethod, setUploadMethod] = useState<'image' | 'instagram'>('image');
  const [location, setLocation] = useState<string>('');

  console.log("!!!",account);

  useEffect(() => {
    if (eventDetailsDialog.event && updatedEvent == null) {
      setUpdatedEvent(eventDetailsDialog.event);
    }
  }, [eventDetailsDialog.event]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 600);
  }, []);

  const formatProperty = (propertyVal: any) => {
    if (propertyVal) {
      const firstVal = propertyVal.toString().split(Constants.delimiter)[0];
      return firstVal;
    }
    return '...';
  };

  const formatAddress = (
    address: null | string,
    city: null | string,
    state: null | string,
    country: null | string
  ) => {
    // Simple approach like EventsSection - just concatenate with empty string fallbacks
    return `${address || ''}, ${city || ''}, ${state || ''}, ${country || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '');
  };

  const makePageScrollable = () => {
    const body = document.querySelector('body');
    if (body != null) {
      body.style.overflow = 'auto';
    }
  };

  const formattedDate = (start_date: string) => {
    if (start_date) {
      const date = new Date(start_date);
      const formattingOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      };
      return date.toLocaleDateString('en-US', formattingOptions);
    }
    return '...';
  };

  const formattedTime = (time: string | null): string => {
    if (!time) return '';

    const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return '';

    const [hour, minute, period] = match?.slice(1);
    return `${parseInt(hour)}:${minute} ${period.toUpperCase()}`;
  };

  const onSaveEventHandler = () => {
    showLoadingDialog()(dispatch);
    updateEvent({
      id: (updatedEvent as Event).id,
      event: {
        ...updatedEvent,
        poster: account || updatedEvent?.poster?.user
      }
    })
      .then(() => {
        hideLoadingDialog()(dispatch);
        router.reload();
      })
      .catch((error) => {
        alert(error);
        hideLoadingDialog()(dispatch);
      });
  };

  const onValueChangeHandler = (propertyName: string, value: any) => {
    if (updatedEvent) {
      const fields = propertyName.split(',');
      const newUpdatedEvent = { ...updatedEvent };

      if (propertyName == 'address') {
        (newUpdatedEvent as any).venue.address = value;
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'state') {
        const prevState = (newUpdatedEvent as any).venue.state;
        (newUpdatedEvent as any).venue.state = value;
        (newUpdatedEvent as any).venue.address = (
          newUpdatedEvent as any
        ).venue.address.replace(prevState + ',', value + ',');
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'age_barrier') {
        (newUpdatedEvent as any).age_barrier = value;
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'price') {
        const trimmedValue = value.replace('$', '');
        (newUpdatedEvent as any).price = trimmedValue;
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'start_date') {
        (newUpdatedEvent as any).start_date = new Date(value);
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'start_time') {
        (newUpdatedEvent as any).start_time = value;
        setUpdatedEvent(newUpdatedEvent);
        return;
      }

      if (propertyName == 'start_date_time') {
        try {
          if (value.includes(' at ')) {
            const [start_date, start_time] = value.split(' at ');
            (newUpdatedEvent as any).start_date = new Date(start_date);
            (newUpdatedEvent as any).start_time = start_time;
          } else {
            (newUpdatedEvent as any).start_date = new Date(value);
          }

          setUpdatedEvent(newUpdatedEvent);
        } catch (e: any) {
          //pass
        }
        return;
      }

      if (propertyName == 'end_date_time') {
        try {
          if (value.includes(' at ')) {
            const [end_date, end_time] = value.split(' at ');
            (newUpdatedEvent as any).end_date = new Date(end_date);
            (newUpdatedEvent as any).end_time = end_time;
          } else {
            (newUpdatedEvent as any).end_date = new Date(value);
          }

          setUpdatedEvent(newUpdatedEvent);
        } catch (e) {
          //pass
        }
        return;
      }

      let finalValue = value;

      if (fields.length > 1) {
      } else {
        let currentVal = (newUpdatedEvent as any)[fields[0]];

        if (currentVal == null) {
        } else if (
          (newUpdatedEvent as any)[fields[0]].includes(Constants.delimiter)
        ) {
          let values: string[] = (newUpdatedEvent as any)[fields[0]].split(
            Constants.delimiter
          );

          if (values.includes(value)) {
            values.splice(values.indexOf(value), 1);
          }

          if (
            (eventDetailsDialog.event as any)[fields[0]] !=
            (newUpdatedEvent as any)[fields[0]]
          ) {
            values.splice(0, 1);
          }

          values = [value, ...values];

          finalValue = values.join(Constants.delimiter);
        }
      }

      (newUpdatedEvent as any)[fields[0]] = finalValue;
      setUpdatedEvent(newUpdatedEvent);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSingleImage(file);
    setFileName(file ? file.name : null);
  };

  const preprocessLocation = (loc: string): string => {
    return loc;
  };



  const handleUploadClick = async () => {
    setIsUploading(true);
    try {
      const processedLocation = preprocessLocation(location);
      
      if (uploadMethod === 'image' && singleImage) {
        const createdEvent: any = await createEventFromDashboard({
          single_image: singleImage,
          for_location: processedLocation
        });

        EventService.getEvent({ "id": createdEvent.data.saved_events[0]}).then((event) => {
          state.eventDetailsDialog.event = event.data;
          setBasicEventCreated(true);
        });
      } else if (uploadMethod === 'instagram' && instagramUrl.trim()) {
        // Use the existing backend endpoint via admin service
        const createdEvent: any = await createEventFromInstagram({
          instagram_url: instagramUrl,
          for_location: processedLocation
        });

        // A carousel can save SEVERAL events, and a post the extractor decides
        // is not an event legitimately saves NONE (saved_events: []). Reading
        // [0] unguarded rendered a broken details dialog for the empty case.
        const savedIds: any[] = createdEvent?.data?.saved_events ?? [];
        if (savedIds.length === 0) {
          dispatch({
            type: 'SHOW_INFO_OVERLAY',
            payload: {
              message: createdEvent?.data?.message ||
                'No events found in that post.',
              isError: false,
            },
          });
        } else {
          if (savedIds.length > 1) {
            dispatch({
              type: 'SHOW_INFO_OVERLAY',
              payload: {
                message: `Saved ${savedIds.length} events from this post.`,
                isError: false,
              },
            });
          }
          EventService.getEvent({ "id": savedIds[0]}).then((event) => {
            state.eventDetailsDialog.event = event.data;
            setBasicEventCreated(true);
          });
        }
      } else {
        console.error(uploadMethod === 'image' ? 'No image selected' : 'No Instagram URL provided');
      }
    } catch (error) {
      console.error('Error uploading event:', error);
      // Show error message to user
      dispatch({
        type: 'SHOW_INFO_OVERLAY',
        payload: {
          message: `Error: ${error instanceof Error ? error.message : 'Failed to create event'}`,
          isError: true,
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!basicEventCreated) {
    return (
        <>
          <div
            className="fixed top-0 left-0 z-20 overflow-y-auto  w-full h-full  backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                makePageScrollable();
              }
            }}
          >
            <div className="flex justify-center items-center h-screen">
              <div className="p-6 rounded-lg shadow-lg bg-slate-black relative min-w-[480px] max-w-[600px]">
                <FiX
                  onClick={() => {
                    makePageScrollable();
                    onClose();
                  }}
                  className="absolute top-0 right-0 m-4 text-white cursor-pointer"
                />
                <h2 className="text-xl font-semibold mb-4 text-off-white">Create New Event</h2>
                
                {/* Location Selector */}
                <div className="mb-6">
                  <label className="block text-off-white text-sm font-medium mb-2">
                    Location *
                  </label>
                  <input
                    type="text"
                    list="location-options"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Type or select a location..."
                    className="w-full px-3 py-2 bg-midnight text-off-white rounded-md border border-slate-600 focus:border-beaming-orange focus:outline-none"
                  />
                  <datalist id="location-options">
                    <option value="San Francisco" />
                    <option value="Mexico City" />
                  </datalist>
                </div>

                {/* Toggle buttons for upload method */}
                <div className="flex mb-6 bg-midnight rounded-lg p-1">
                  <button
                    onClick={() => setUploadMethod('image')}
                    className={`flex-1 py-2 px-4 rounded-md transition-all duration-200 ${
                      uploadMethod === 'image'
                        ? 'bg-beaming-orange text-slate-black font-semibold'
                        : 'text-off-white hover:text-beaming-orange'
                    }`}
                  >
                    Upload Image
                  </button>
                  <button
                    onClick={() => setUploadMethod('instagram')}
                    className={`flex-1 py-2 px-4 rounded-md transition-all duration-200 ${
                      uploadMethod === 'instagram'
                        ? 'bg-beaming-orange text-slate-black font-semibold'
                        : 'text-off-white hover:text-beaming-orange'
                    }`}
                  >
                    Instagram URL
                  </button>
                </div>

                {uploadMethod === 'image' ? (
                  /* Image Upload Section */
                  <>
                    <p className="text-off-white pb-4 px-2 max-w-[520px]">
                      Start by uploading your event flyer and we'll use AI to automatically fill in most of the details.
                    </p>
                    <div className="flex justify-between items-center gap-3">
                      <input 
                        type="file" 
                        onChange={handleFileChange} 
                        accept="image/*" 
                        className="hidden"
                        id="file-upload"
                      />
                      <label 
                        htmlFor="file-upload" 
                        className="text-beaming-orange cursor-pointer underline hover:text-beaming-orange-dark transition-colors"
                      >
                        Select Image
                      </label>
                      {fileName && (
                        <p className="text-off-white pr-4 flex-1 text-sm">
                          Selected: <span className="text-beaming-orange">{fileName}</span>
                        </p>
                      )}
                      {isUploading && <Spinner colorClass={'text-beaming-orange'} size={32} />}
                      <button 
                        onClick={handleUploadClick} 
                        disabled={isUploading || !singleImage || !location.trim()}
                        className="bg-beaming-orange hover:bg-beaming-orange-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-slate-black font-bold py-2 px-4 rounded-md border border-2 border-solid border-midnight-transparent transition-colors"
                      >
                        ✨ Upload & Process
                      </button>
                    </div>
                  </>
                ) : (
                  /* Instagram URL Section */
                  <>
                    <p className="text-off-white pb-4 px-2 max-w-[520px]">
                      Paste an Instagram post URL and we'll extract every event it contains (a profile URL uses its latest post). This can take a minute or two.
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={instagramUrl}
                          onChange={(e) => setInstagramUrl(e.target.value)}
                          placeholder="https://instagram.com/...."
                          className="flex-1 px-3 py-2 bg-midnight text-off-white rounded-md border border-slate-600 focus:border-beaming-orange focus:outline-none"
                        />
                        {isUploading && <Spinner colorClass={'text-beaming-orange'} size={32} />}
                      </div>
                      <div className="flex justify-end">
                        <button 
                          onClick={handleUploadClick} 
                          disabled={isUploading || !instagramUrl.trim() || !location.trim()}
                          className="bg-beaming-orange hover:bg-beaming-orange-dark disabled:bg-gray-600 disabled:cursor-not-allowed text-slate-black font-bold py-2 px-6 rounded-md border border-2 border-solid border-midnight-transparent transition-colors"
                        >
                          ✨ Fetch & Process
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
    );
  }

  if (updatedEvent == null || eventDetailsDialog.event == null) {
    return <></>;
  }

  const getStartsAt = (startDate: string, startTime: string) => {
    return (
      (startDate ? `${startDate}    ` : '') +
      (startTime
        ? '\u00A0\u00A0\u00A0\u00A0' + `${formattedTime(startTime)}`
        : '')
    );
  };

  const getEndsAt = (
    startDate: string,
    endDate: string,
    endTime: string,
    late: boolean
  ) => {
    return (
      (endDate && endDate != '...'
        ? `${endDate}    `
        : startDate
        ? `${startDate}    `
        : '') +
      (endTime
        ? '\u00A0\u00A0\u00A0\u00A0' + ` ${formattedTime(endTime)}`
        : late
        ? ' (EARLY MORNING)'
        : '')
    );
  };

  function formatPrice(price: string) {
    if (!price) {
      return '...';
    }
    const isMexico = location.toLowerCase().includes('mexico');
    const currencySymbol = isMexico ? 'MXN' : '$';

    if (!isNaN(parseFloat(price))) {
      if (isMexico) {
        return currencySymbol + ' ' + price.replaceAll('$', '').trim();
      } else {
        return currencySymbol + price.replace('$', '').trim();
      }
    }

    if (isMexico) {
      return price.replaceAll('$', currencySymbol + ' ').trim();
    }

    return price.trim();
  }

  const getDisplayName = (event: Event, isEdit: boolean): string | null => {
    if (event == null) {
      return null;
    }

    if (isEdit) {
      return event.name;
    }

    if (event.name?.trim()) {
      return event.name;
    }

    if (event.artist?.trim()) {
      return event.artist;
    }

    if (event.promoter?.trim()) {
      return event.promoter;
    }

    if (event.poster?.user?.trim()) {
      return event.poster.user;
    }

    return null;
  };
  const displayName = getDisplayName(updatedEvent as Event, isEdit);

  const handleCopyLink = () => {
    const link = `eventtracker.lafaslist.com/event/share/${
      (updatedEvent as Event).id
    }/`;
    if (copy(link)) {
      dispatch({
        type: 'SHOW_INFO_OVERLAY',
        payload: {
          message: updatedEvent?.viewing_language === 'es' ? 'Link del evento copiado exitosamente' : 'Event link copied to clipboard',
        },
      });
    } else {
      dispatch({
        type: 'SHOW_INFO_OVERLAY',
        payload: {
          message: updatedEvent?.viewing_language === 'es' ? 'Error al copiar el link del evento' : 'Error copying event link to clipboard',
        },
      });
    }
  };

  async function handleFavoriteClick(id: number): Promise<void> {
    setFavoriteStatusJustEdited(true);

    const userEmail = localStorage.getItem('userEmail');
    await EventService.addFavoriteEvent({
      email: userEmail || '',
      event_ids: [id.toString()]
    });
    
    favoriteEvent()(dispatch);
    setTimeout(() => {
      setFavoriteStatusJustEdited(false);
      setHasNewFavoritedValue(true);
      setIsFavorite(true);
    }, 1000);
  }

  async function handleUnfavoriteClick(id: number): Promise<void>  {
    setFavoriteStatusJustEdited(true);

    const userEmail = localStorage.getItem('userEmail');
    await EventService.removeFavoriteEvent({
      email: userEmail || '',
      event_ids: [id.toString()]
    });

    favoriteEvent()(dispatch);
    setTimeout(() => {
      setFavoriteStatusJustEdited(false);
      setHasNewFavoritedValue(true);
      setIsFavorite(false);
    }, 1000);
  }

  return (
    <>
      <div
        className="fixed top-0 left-0 z-20 overflow-y-auto  w-full h-full  backdrop-blur-sm"
        onClick={() => {
          makePageScrollable();
          hideEvent()(dispatch);
        }}
      >
        <div
          className="bg-slate-black z-20 max-w-6xl mx-auto my-10  w-full flex flex-col p-5 pb-8 lg:rounded-lg rounded-3xl shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black overflow-auto "
          onClick={(e) => {
            e.stopPropagation();
            setIsEditOfferings(false);
          }}
        >
          <div className="flex justify-between lg:justify-end">
            <p className="text-2xl lg:hidden flex -mt-1 pb-2 text-off-white font-semibold mb-4 md:mb-0">
              {eventDetailsDialog.event.name} 
            </p>
            <FiX
              onClick={() => {
                makePageScrollable();
                hideEvent()(dispatch);
              }}
              className="flex flex-shrink-0 justify-end w-5 h-5 lg:w-7 lg:h-7 hover:cursor-pointer text-white"
            />
          </div>
          

          {basicEventCreated && <div className="flex flex-col lg:flex-row">
            <div className="md:max-h-full md:w-[50%] md:max-w-[50%] mx-auto lg:mr-4 pb-4 lg:pl-4 relative">
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded-xl w-full h-full z-[0]">
                { eventDetailsDialog.event.orig_thumb == null ? <Spinner colorClass={'text-beaming-orange'} size={48} /> : <></>} 
              </div>
              
              <img
                className="w-full h-full object-cover rounded-xl z-[10] max-h-[90vh]"
                src={eventDetailsDialog.event.orig_thumb}
                alt="Event Picture"
              />
              <div
                className="p-2 absolute right-4 top-2 bg-beaming-orange rounded-md hover:cursor-pointer border border-2 border-midnight-transparent"
                onClick={() =>
                  showImage(eventDetailsDialog.event.orig_thumb)(dispatch)
                }
              >
                <RiExpandDiagonalLine className="w-5 h-5 text-slate-black" />
              </div>
            </div>

            

            <div
              className={`flex flex-col flex-1 items-end lg:gap-4 lg:px-4 justify-between ${
                isMobile ? 'mt-4 ' : ''
              }`}
            >
              <div
                className={`bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light p-4 text-off-white grid grid-cols-[1fr_1.2fr] lg:hidden rounded-lg font-medium gap-2 ${
                  isMobile ? ' mb-4 ' : ' justify-evenly '
                }`}
              >
                <div
                  className={`flex flex-col text-sm border-r-2 justify-evenly pr-2 border-slate-black  p-1`}
                >
                  <div className="flex items-center gap-3">
                    <FaRegCalendar className="w-4 h-4 text-slate-black" />
                    <span>
                      {eventDetailsDialog.event.start_date
                        ? formatLongDate(
                            new Date(eventDetailsDialog.event.start_date)
                          )
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex  items-center gap-3">
                    <FiClock size={17} className=" text-slate-black" />
                    <span>
                      {eventDetailsDialog.event.start_time
                        ? formattedTime(eventDetailsDialog.event.start_time)
                        : '...'}
                    </span>
                  </div>
                  <div className="flex  items-center gap-3">
                    <FaMoneyBill className="w-4 h-4 text-slate-black" />
                    <span>{formatPrice(eventDetailsDialog.event.price)}</span>
                  </div>
                </div>
                <div className="min-w-[48%] flex flex-col gap-1 justify-evenly text-sm">
                  <div className="flex  items-start  gap-3">
                    <FaLocationDot className="w-[16px] h-[16px] mt-2 text-slate-black" />
                    <span
                      className="max-w-[80%] hover:underline hover:!text-teal-ocean hover:cursor-pointer"
                      onClick={() => {
                        dispatch({ type: SHOW_SPINNER });
                        setIsMapDialogOpen(true);
                        // Use complete address for better geocoding accuracy
                        const fullAddress = formatAddress(
                          eventDetailsDialog.event.venue.address,
                          eventDetailsDialog.event.venue.city,
                          eventDetailsDialog.event.venue.state,
                          eventDetailsDialog.event.venue.country
                        );
                        showMap(fullAddress)(dispatch);
                      }}
                    >
                      {formatProperty(eventDetailsDialog.event.venue.address)}
                    </span>
                  </div>
                  <div className="flex  items-center gap-3">
                    <FiUser className="w-4 h-4 text-slate-black" />
                    <span>
                      {(updatedEvent as Event).is_age_restricted
                        ? eventDetailsDialog.event.viewing_language === 'es' ? '21+ solo' : '21+ only'
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col w-full">
                <div className='lg:max-w-[100%] lg:flex gap-3 items-start'>
                  <h2
                    className={`text-mist-white text-2xl lg:flex hidden my-2 font-semibold outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md ${
                      isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                    }`}
                    contentEditable={isEdit}
                    onInput={(e) =>
                      onValueChangeHandler('name', (e.target as any).outerText)
                    }
                  >
                    {eventDetailsDialog.event.name}
                  </h2>
                  
                </div>
                {isEdit ? (
                  <div className="text-left my-3 font-medium">
                    Click on any event detail to make changes. Save using the button
                    below.
                  </div>
                ) : (
                  <></>
                )}
                <div
                    id="give_feedback"
                    className={
                      'mr-0 lg:mb-2 lg:mt-2 flex flex-row items-center justify-start gap-1 group hover:cursor-pointer hidden md:flex' +
                      (isEdit ? 'hidden' : '')
                    }
                    onClick={() =>
                      showFeedbackDialog(eventDetailsDialog.event.id)(dispatch)
                    }
                  >
                    <IoIosInformationCircle className="text-beaming-orange w-4 h-4" />
                    <span className="text-beaming-orange text-sm font-medium group-hover:underline">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Sugerir edición' : 'Suggest Edit'}
                    </span>
                  </div>
                  <ReactTooltip
                    anchorId="give_feedback"
                    place="bottom"
                    content={eventDetailsDialog.event.viewing_language === 'es' ? '¿Ves errores en la edición? ¡Repórtalos, por favor!' : "See errors in the card? Please report them!"}
                    className="z-[10] flex bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light"
                    style={{ backgroundColor: '#DA702C', color: '#282726' }}
                  />
                <div className="grid grid-cols-[auto_1fr] content-center gap-2 mt-2">
                  {(isEdit || eventDetailsDialog.event.artist) && <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                    {eventDetailsDialog.event.viewing_language === 'es' ? 'Artista(s)' : 'Artist(s)'}
                  </div>}
                  {(isEdit || eventDetailsDialog.event.artist) && <div
                    className={`bg-midnight  rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                      isEdit ? ' text-beaming-orange ' : 'text-ash-beige  '
                    }`}
                    contentEditable={isEdit}
                    onInput={(e) =>
                      onValueChangeHandler('artist', (e.target as any).outerText)
                    }
                  >
                    {formatProperty(eventDetailsDialog.event.artist)}
                  </div>}

                  {(isEdit || eventDetailsDialog.event.start_date) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Empieza' : 'Starts'}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.start_date) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                        isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                      }`}
                      contentEditable={isEdit}
                      onBlur={(e) => {
                        onValueChangeHandler(
                          'start_date_time',
                          (e.target as any).outerText
                        );
                      }}
                    >
                      {getStartsAt(
                        formattedDate(eventDetailsDialog.event.start_date),
                        eventDetailsDialog.event.start_time
                      )}
                    </div>
                  )}

                  {((isEdit || eventDetailsDialog.event.end_time) ||
                    eventDetailsDialog.event.late) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Termina' : 'Ends'}
                    </div>
                  )}

                  {((isEdit || eventDetailsDialog.event.end_time) ||
                    eventDetailsDialog.event.late) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                        isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                      }`}
                      contentEditable={isEdit}
                      onInput={(e) => {
                        onValueChangeHandler(
                          'end_date_time',
                          (e.target as any).outerText
                        );
                      }}
                    >
                      {getEndsAt(
                        formattedDate(eventDetailsDialog.event.start_date),
                        formattedDate(eventDetailsDialog.event.end_date),
                        eventDetailsDialog.event.end_time,
                        eventDetailsDialog.event.late
                      )}
                    </div>
                  )}

                  {(isEdit || eventDetailsDialog.event.opener) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Con / Opener' : 'With / Opener'}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.opener) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                        isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                      }`}
                      contentEditable={isEdit}
                      onInput={(e) =>
                        onValueChangeHandler(
                          'opener',
                          (e.target as any).outerText
                        )
                      }
                    >
                      {formatProperty(eventDetailsDialog.event.opener)}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.host) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Organizador' : 'Host'}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.host) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue" ${
                        isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                      }`}
                      contentEditable={isEdit}
                      onInput={(e) =>
                        onValueChangeHandler('host', (e.target as any).outerText)
                      }
                    >
                      {formatProperty(eventDetailsDialog.event.host)}
                    </div>
                  )}

                  {(isEdit || eventDetailsDialog.event.genres) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Género(s)' : 'Genre(s)'}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.genres) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue" ${
                        isEdit ? ' text-beaming-orange ' : ' text-ash-beige '
                      }`}
                      contentEditable={isEdit}
                      onInput={(e) =>
                        onValueChangeHandler(
                          'genres',
                          (e.target as any).outerText
                        )
                      }
                    >
                      {formatProperty(eventDetailsDialog.event.genres)}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.promoter) && (
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Promotor' : 'Promoter'}
                    </div>
                  )}
                  {(isEdit || eventDetailsDialog.event.promoter) && (
                    <div
                      className={`bg-midnight rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                        isEdit ? ' text-beaming-orange ' : 'text-ash-beige  '
                      }`}
                      contentEditable={isEdit}
                      onInput={(e) =>
                        onValueChangeHandler(
                          'promoter',
                          (e.target as any).outerText
                        )
                      }
                    >
                      {formatProperty(eventDetailsDialog.event.promoter)}
                    </div>
                  )}

                  {(isEdit || eventDetailsDialog.event.state) && <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light  px-6 py-3 rounded-xl text-sm font-bold z-[1] flex items-center">
                    {eventDetailsDialog.event.viewing_language === 'es' ? 'Estado' : 'State'}
                  </div>}
                  {(isEdit ||eventDetailsDialog.event.state) && <div
                    className={`bg-midnight  rounded-r-xl font-medium -ml-5 pl-10 pr-6 text-sm flex items-center py-2 outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue ${
                      isEdit ? ' text-beaming-orange ' : 'text-ash-beige  '
                    }`}
                    contentEditable={isEdit}
                    onBlur={(e) => {
                      onValueChangeHandler('state', (e.target as any).outerText);
                    }}
                  >
                    {formatProperty(eventDetailsDialog.event.venue.state)}
                  </div>}
                </div>
                {(isEdit ||eventDetailsDialog.event.offering) && (
                  <div className="mt-3 flex flex-col">
                    <div className="bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light p-3 rounded-xl text-sm z-[1] font-bold">
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Incluye' : 'Includes'}
                    </div>
                    <div
                      className={
                        'bg-midnight  font-medium text-sm pl-6 pt-4 pb-4 rounded-b-xl rounded-t-xl ' +
                        (isEdit && isEditOfferings ? ' hidden ' : ' ') +
                        (isEdit ? ' text-beaming-orange ' : ' text-ash-beige ')
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEdit) setIsEditOfferings(true);
                      }}
                    >
                      {eventDetailsDialog.event.offering
                        ? eventDetailsDialog.event.offering
                            .split(', ')
                            .map((offering: string, index: number) => (
                              <li>{offering.trim()}</li>
                            ))
                        : 'N/A'}
                    </div>
                    {isEdit && isEditOfferings ? (
                      <textarea
                        className="border-2 border-ocean-blue h-24 -mt-3 rounded-b-lg pt-3 px-2 pb-2 text-sm resize-none outline-none bg-midnight text-beaming-orange"
                        onClick={(e) => e.stopPropagation()}
                        value={
                          (updatedEvent as Event).offering
                            ? ((updatedEvent as Event).offering ?? '')
                            : ''
                        }
                        onChange={(e) =>
                          onValueChangeHandler('offering', e.target.value)
                        }
                      />
                    ) : (
                      <></>
                    )}
                  </div>
                )}
              </div>

              <div
                className={`mx-auto lg:mx-0 w-full flex flex-col items-end lg:justify-between justify-self-end gap-4 lg:gap-0 ${
                  isMobile ? ' mr-2' : ''
                }`}
              >
                <div className="flex flex-col w-full">
                  <div className="p-4 px-5 hidden text-off-white w-full lg:flex flex-col rounded-lg font-medium gap-3 bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light mt-4 min-w-[254px]">
                    <div className="flex items-center gap-6 ">
                      <FaRegCalendar className="w-4 h-4 text-slate-black" />
                      <span
                        className="text-midnight font-medium text-sm outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md"
                        contentEditable={isEdit}
                        onBlur={(e) =>
                          onValueChangeHandler(
                            'start_date',
                            (e.target as any).outerText
                          )
                        }
                      >
                        {eventDetailsDialog.event.start_date
                          ? formattedDate(eventDetailsDialog.event.start_date)
                          : '...'}
                      </span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr]  items-center gap-6">
                      <FiClock size={17} className=" text-slate-black" />
                      <span
                        className="text-midnight font-medium text-sm outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md"
                        contentEditable={isEdit}
                        onBlur={(e) =>
                          onValueChangeHandler(
                            'start_time',
                            (e.target as any).outerText
                          )
                        }
                      >
                        {eventDetailsDialog.event.start_time
                          ? formattedTime(eventDetailsDialog.event.start_time)
                          : '...'}
                      </span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr]  items-center gap-6">
                      <FaLocationDot className="w-4 h-4 text-slate-black" />
                      <span
                        className={
                          'text-midnight text-sm outline-none font-medium focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md ' +
                          (isEdit
                            ? ''
                            : 'hover:underline hover:!text-teal-ocean hover:cursor-pointer')
                        }
                        contentEditable={isEdit}
                        onBlur={(e) =>
                          onValueChangeHandler(
                            'address',
                            (e.target as any).outerText
                          )
                        }
                        onClick={(e) => {
                          if (isEdit) {
                            return;
                          }
                          dispatch({ type: SHOW_SPINNER });
                          setIsMapDialogOpen(true);
                          // Use complete address for better geocoding accuracy
                          const fullAddress = formatAddress(
                            eventDetailsDialog.event.venue.address,
                            eventDetailsDialog.event.venue.city,
                            eventDetailsDialog.event.venue.state,
                            eventDetailsDialog.event.venue.country
                          );
                          showMap(fullAddress)(dispatch);
                        }}
                      >
                        {formatProperty(eventDetailsDialog.event.venue.address)}
                      </span>
                    </div>
                    <div className="text-midnight font-medium flex items-center gap-6">
                      <FaMoneyBill className="w-4 h-4 text-slate-black" />
                      <span
                        className="text-midnight font-medium text-sm outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md"
                        contentEditable={isEdit}
                        onInput={(e) =>
                          onValueChangeHandler(
                            'price',
                            (e.target as any).outerText
                          )
                        }
                      >
                        {formatPrice(eventDetailsDialog.event.price)}
                      </span>
                    </div>
                    {eventDetailsDialog.event.age_barrier && (
                      <div className="grid grid-cols-[auto_1fr]  items-center gap-6">
                        <FiUser className="w-4 h-4 text-slate-black" />
                        <span
                          className="text-midnight font-medium text-sm outline-none focus:bg-white focus:border-2 focus:border-solid focus:border-ocean-blue focus:px-2 focus:py-1 focus:rounded-md"
                          contentEditable={isEdit}
                          onInput={(e) =>
                            onValueChangeHandler(
                              'age_barrier',
                              (e.target as any).outerText
                            )
                          }
                        >
                          {eventDetailsDialog.event.age_barrier}
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className="w-full hidden lg:flex flex-row items-center gap-2 px-2 py-2 rounded-lg bg-midnight"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <div
                      onClick={handleCopyLink}
                      className="w-8 h-8 rounded-lg cursor-pointer p-1 bg-beaming-orange flex items-center justify-center "
                    >
                      <NextImage
                        src="/images/share_icon.svg"
                        alt="Share Icon"
                        width={24}
                        height={24}
                        className="text-midnight"
                      />
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="text-xs underline px-2 text-right text-beaming-orange flex-1"
                    >
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Copiar Link del Evento' : 'Copy Event Link'}
                    </button>
                  </div>
                </div>
                <div className="w-100 flex flex-col justify-between gap-4 items-center mt-8 md:mt-0">
                  <div
                    className="w-full flex  lg:hidden flex-row items-center gap-2 px-2 py-2 rounded-lg bg-midnight"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <div
                      onClick={handleCopyLink}
                      className="w-8 h-8 rounded-lg cursor-pointer p-1 bg-beaming-orange flex items-center justify-center "
                    >
                      <NextImage
                        src="/images/share_icon.svg"
                        alt="Share Icon"
                        width={24}
                        height={24}
                        className="text-midnight"
                      />
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="text-xs underline px-2 text-right text-beaming-orange flex-1"
                    >
                      {eventDetailsDialog.event.viewing_language === 'es' ? 'Copiar Link del Evento' : 'Copy Event Link'}
                    </button>
                  </div>

                  <div className="text-[0.7rem] pt-2 pr-1 text-mist-white text-right font-light mt-4 mb-2 md:mb-0">
                    {eventDetailsDialog.event.viewing_language === 'es' ? 'Este evento se ha recuperado de la cuenta' : 'This event was retrieved from account'}: &nbsp;
                    {eventDetailsDialog.event.poster.user}
                    <br />
                    <br />
                    {eventDetailsDialog.event.ticket_link && (
                      <div className="flex items-center gap-1 justify-end">
                        Original event link:{' '}
                        <a
                          href={eventDetailsDialog.event.ticket_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-beaming-orange underline  max-w-full truncate"
                        >
                          {eventDetailsDialog.event.ticket_link.length > 30
                            ? `${eventDetailsDialog.event.ticket_link.substring(
                                0,
                                30
                              )}...`
                            : eventDetailsDialog.event.ticket_link}
                        </a>
                      </div>
                    )}
                    {eventDetailsDialog.event.link_in_bio &&
                      eventDetailsDialog.event.ticket_link && (
                        <div>
                          {eventDetailsDialog.event.viewing_language === 'es' ? '(Link encontrado en la bio del ' : '(Link was found in user '}
                          {eventDetailsDialog.event.viewing_language !== 'es' && <span>{eventDetailsDialog.event.poster.user}'s bio.)</span> }
                          {eventDetailsDialog.event.viewing_language === 'es' && <span>{eventDetailsDialog.event.poster.user})</span> }
                          {eventDetailsDialog.event.link_in_bio}
                        </div>
                      )}
                  </div>

                  {isEdit ? (
                    <button
                      className="flex w-[90%] justify-center items-center text-midnight rounded-lg border-beaming-orange-dark border-2 gap-4 p-3 self-end hover:cursor-pointer bg-beaming-orange"
                      onClick={() => onSaveEventHandler()}
                    >
                      <span className='font-semibold'>Save Event</span>
                    </button>
                  ) : (
                    <a
                      href={
                        eventDetailsDialog.event.ticket_link
                          ? eventDetailsDialog.event.ticket_link
                          : eventDetailsDialog.event.link_in_bio
                          ? 'https://instagram.com/' +
                            eventDetailsDialog.event.poster.user.substring(1)
                          : eventDetailsDialog.event.ticket_link
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-beaming-orange text-midnight hover:bg-gradient-to-r from-beaming-orange-dark to-beaming-orange-light border-beaming-orange-dark   flex w-[90%] justify-center items-center rounded-lg border-2 gap-4 p-3 font-medium self-end hover:cursor-pointer mt-4 mb-2"
                      title={eventDetailsDialog.event.ticket_link}
                    >
                      <GrShare className="w-5 h-5 font-bold text-slate-black" />
                      <span className="font-semibold">
                        {eventDetailsDialog.event.rsvp_required
                          ? eventDetailsDialog.event.viewing_language === 'es' ? 'Detalles de RSVP' : 'RSVP Details'
                          : eventDetailsDialog.event.viewing_language === 'es' ? 'Detalles del boleto' : 'Ticket Details'}
                      </span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>}
        </div>
      </div>
      <ImageDialog />
      {isMapDialogOpen && <MapDialog setIsMapDialogOpen={setIsMapDialogOpen} />}
      <FeedbackDialog existingEvent={eventDetailsDialog.event} language={eventDetailsDialog.event.viewing_language} />
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: 'HIDE_INFO_OVERLAY' })}
          language={eventDetailsDialog.event.viewing_language}
        />
      )}
      <div>
        {!isUploading ? (
          <button
            onClick={handleUploadClick}
            className="bg-beaming-orange text-white p-2 rounded"
          >
            Upload Image
          </button>
        ) : (
          <p>Uploading...</p>
        )}
      </div>
      <input type="file" onChange={handleFileChange} accept="image/*" />
    </>
  );
}

export default EventCreate;
