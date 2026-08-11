import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Event } from '../../interface/objects/simpleObject';
import EventCard from './EventCard';
import EventService from '../../services/lib/event';
import getFilterString from '../../utils/color_convertor';
import Spinner from '../Spinner';
import { FaChevronDown, FaShare, FaMap, FaLocationArrow } from 'react-icons/fa';
import { useStore } from '../../store/store';
import NextImage from 'next/image';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { geocodeLocation } from '../../utils/geocode';

interface EventsSectionProps {
  title: string;
  subTitle: string;
  events: null | Event[];
  isAlt: boolean;
  defaultIsExpanded?: boolean;
  onClick: Function;
  isLoading?: boolean;
  highlightedFields?: {
    isNameActive: boolean;
    isDateActive: boolean;
    isPriceActive: boolean;
    isLocationActive: boolean;
  };
  searchQuery?: string;
  spaceAfter?: boolean;
  language?: string;
  isShareable?: boolean;
  isInListView?: boolean;
  locationName?: string;
  sectionDayStartMs?: number;
}

interface EventCoordinates {
  [key: number]: google.maps.LatLngLiteral | null;
}

// MapController component to handle map centering
const MapController = ({ eventCoordinates }: { eventCoordinates: EventCoordinates }) => {
  const map = useMap();
  const hasInitialized = useRef(false);
  
  useEffect(() => {
    if (map && Object.keys(eventCoordinates).length > 0 && !hasInitialized.current) {
      // Only center map once when first loaded
      const bounds = new google.maps.LatLngBounds();
      let hasValidBounds = false;
      
      // Add all event coordinates to bounds
      Object.values(eventCoordinates).forEach(coords => {
        if (coords) {
          bounds.extend(coords);
          hasValidBounds = true;
        }
      });
      
      if (hasValidBounds) {
        // Use bounds if we have multiple points
        if (Object.values(eventCoordinates).length > 1) {
          map.fitBounds(bounds, 50); // 50px padding
        } else {
          // If only one point, center on it with a reasonable zoom level
          const singleCoord = Object.values(eventCoordinates)[0];
          if (singleCoord) {
            map.setCenter(singleCoord);
            map.setZoom(14);
          }
        }
        hasInitialized.current = true;
      }
    }
  }, [map, eventCoordinates]);
  
  return null;
};

// Location button component to center map on user's location
const LocationButton = () => {
  const map = useMap();
  const [isLoading, setIsLoading] = useState(false);
  
  const centerOnUserLocation = () => {
    if (!map) return;
    
    setIsLoading(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          map.setCenter(userLocation);
          map.setZoom(15); // Zoom level that shows a few blocks
          
          setIsLoading(false);
        },
        (error) => {
          console.error('Error getting user location:', error);
          setIsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      setIsLoading(false);
    }
  };
  
  return (
    <button
      onClick={centerOnUserLocation}
      className="absolute z-10 right-[1rem] bottom-20 bg-white p-2 rounded-full shadow-md hover:bg-gray-100 focus:outline-none"
      title="Center map on your location"
      disabled={isLoading}
    >
      {isLoading ? (
        <div className="w-6 h-6 animate-spin rounded-full border-2 border-gray-300 border-t-beaming-orange"></div>
      ) : (
        <FaLocationArrow className="text-beaming-orange" />
      )}
    </button>
  );
};

const EventsSection = ({
  title,
  subTitle,
  events,
  isAlt,
  defaultIsExpanded,
  onClick,
  isLoading,
  highlightedFields,
  searchQuery,
  spaceAfter,
  language,
  isShareable,
  isInListView,
  locationName,
  sectionDayStartMs,
}: EventsSectionProps) => {
  const [store, dispatch] = useStore();
  const [isExpanded, setIsExpanded] = useState(defaultIsExpanded ?? false);
  const [userEmail, setUserEmail] = useState('');
  const [userFirstName, setUserFirstName] = useState('');
  const [favoritedEvents, setFavoritedEvents] = useState<number[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [isMapView, setIsMapView] = useState(false);
  const [eventCoordinates, setEventCoordinates] = useState<EventCoordinates>({});
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({ lat: 19.4326, lng: -99.1332 }); // Default to Mexico City
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ processed: 0, total: 0 });
  const hasGeocoded = useRef(false);

  // Add keyboard shortcut handler for Shift+M
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if shift key is pressed along with 'M' or 'm' key
      if (event.shiftKey && (event.key === 'M' || event.key === 'm')) {
        // Only toggle if the section is expanded
        if (isExpanded) {
          const newMapView = !isMapView;
          setIsMapView(newMapView);
          
          // Reset geocoding flag when toggling to map view
          if (newMapView) {
            hasGeocoded.current = false;
          }
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded, isMapView]);

  useEffect(() => {
    const fetchFavoritedEvents = async () => {
      const userEmail = localStorage.getItem('userEmail');
      const response = await EventService.getFavoritedEvents({
        email: userEmail || '',
      });
      setFavoritedEvents(
        response.data?.favorites.map((event: Event) => event.id) || []
      );
    };

    fetchFavoritedEvents();
  }, [store.event.justFavorited]);

  useEffect(() => {
    const userEmailFromSession = localStorage.getItem('userEmail');
    const userFirstNameFromSession = localStorage.getItem('userFirstName');
    setUserEmail(userEmailFromSession || '');
    setUserFirstName(userFirstNameFromSession || '');
  }, []);

  // Geocode event addresses when map view is activated
  useEffect(() => {
    // Only geocode if map view is active, there are events, and we haven't geocoded yet
    if (isMapView && events && events.length > 0 && !hasGeocoded.current) {
      const geocodeEvents = async () => {
        setIsGeocoding(true);
        setGeocodingProgress({ processed: 0, total: events.length });
        let validCoordinates: google.maps.LatLngLiteral[] = [];
        let processedCount = 0;
        
        console.log(`Starting geocoding for ${events.length} events`);
        
        // Process events in batches to avoid rate limits
        const batch = 5;
        for (let i = 0; i < events.length; i += batch) {
          const batchEvents = events.slice(i, i + batch);
          
          await Promise.all(
            batchEvents.map(async (event) => {
              // Skip if we already have coordinates for this event
              if (eventCoordinates[event.id]) {
                console.log(`Event ${event.id} already has coordinates:`, eventCoordinates[event.id]);
                validCoordinates.push(eventCoordinates[event.id] as google.maps.LatLngLiteral);
                processedCount++;
                return;
              }
              
              if (event.venue && event.venue.address) {
                const address = `${event.venue.address}, ${event.venue.city || ''}, ${event.venue.state || ''}, ${event.venue.country || ''}`;
                console.log(`Geocoding address for event ${event.id}: ${address}`);
                
                try {
                  const coords = await geocodeLocation(address);
                  if (coords) {
                    console.log(`Successfully geocoded event ${event.id}:`, coords);
                    // Update coordinates immediately for this event
                    setEventCoordinates(prev => ({ ...prev, [event.id]: coords }));
                    validCoordinates.push(coords);
                  } else {
                    // Try alternative address format
                    const altAddress = `${event.venue.city || ''}, ${event.venue.state || ''}, ${event.venue.country || ''}`;
                    if (altAddress.trim() !== ', , ') {
                      console.log(`Trying alternative address format for event ${event.id}: ${altAddress}`);
                      const altCoords = await geocodeLocation(altAddress);
                      if (altCoords) {
                        console.log(`Successfully geocoded event ${event.id} with alternative format:`, altCoords);
                        // Update coordinates immediately for this event
                        setEventCoordinates(prev => ({ ...prev, [event.id]: altCoords }));
                        validCoordinates.push(altCoords);
                      } else {
                        console.log(`No coordinates returned for event ${event.id} with alternative format`);
                      }
                    } else {
                      console.log(`No coordinates returned for event ${event.id}`);
                    }
                  }
                } catch (error) {
                  console.error(`Failed to geocode address for event ${event.id}:`, error);
                }
                
                // Update progress after processing each event
                processedCount++;
              } else {
                console.log(`Event ${event.id} has no venue or address information`);
                processedCount++;
              }
            })
          );
          
          // Update progress after each batch
          setGeocodingProgress(prev => ({ ...prev, processed: processedCount }));
          
          // Small delay between batches to avoid rate limits
          if (i + batch < events.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        console.log(`Geocoding complete. Found coordinates for ${validCoordinates.length} events`);
        
        // Calculate center of the map from all valid coordinates
        if (validCoordinates.length > 0) {
          const centerLat = validCoordinates.reduce((sum, coord) => sum + coord.lat, 0) / validCoordinates.length;
          const centerLng = validCoordinates.reduce((sum, coord) => sum + coord.lng, 0) / validCoordinates.length;
          setMapCenter({ lat: centerLat, lng: centerLng });
        }
        
        setIsGeocoding(false);
        setGeocodingProgress({ processed: 0, total: 0 });
        hasGeocoded.current = true;
      };
      
      geocodeEvents();
    }
  }, [isMapView, events]);

  return (
    <div className={`flex flex-col ${spaceAfter ? 'pb-10' : ''} ${isInListView ? isMapView ? 'mb-0' : 'mb-4' : ''}`}>
      <div
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={
          'rounded-xl shadow-[0px_0px_40px_rgba(0,0,0,0.05)] shadow-dim-shadow flex items-start gap-4 p-4 pr-6 z-[1] select-none ' +
          ' hover:filter hover:brightness-[90%] hover:cursor-pointer ' +
          ' bg-gradient-to-r from-beaming-orange-light to-sacral-red '
        }
      >
        <FaChevronDown
          className="w-4  pt-[2px] mt-2 h-3 text-black transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : '',
          }}
        />
        <div className="text-midnight flex items-center justify-between w-full gap-4">
          <div className="flex md:gap-2 md:items-end flex-col md:flex-row">
            <div className="font-bold select-none text-xl">{title}</div>
            <div className="text-sm font-medium select-none hidden md:flex pb-[3px]">
              -
            </div>
            <div className="text-sm font-medium select-none md:flex pb-[3px]">
              {subTitle}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Map toggle button removed - now using Shift+M shortcut */}
          {isShareable && (
            <a
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering the onClick for expanding
                navigator.clipboard.writeText(
                  `https://eventtracker.lafaslist.com/favorites/?email=${userEmail}&name=${userFirstName}`
                );
                setLinkCopied(true);
                setTimeout(() => {
                  setFadeOut(true);
                  setTimeout(() => {
                    setLinkCopied(false);
                    setFadeOut(false);
                  }, 500);
                }, 3000);
              }}
              className="text-midnight font-semibold md:hover:underline pl-1 flex items-center gap-1"
            >
              <NextImage
                src="/images/upload.svg"
                alt="Share Icon"
                width={28}
                height={28}
                className="text-midnight pb-1"
              />
              Share
            </a>
          )}
          </div>
        </div>
      </div>
      {isExpanded ? (
        <div className={`-mt-2 rounded-b-xl overflow-clip relative z-0 ${isInListView && events?.length ? 'p-0 pt-5' : 'p-6 pt-8'} ${isMapView ? 'p-0 pt-0 mb-8' : ''}`}>
          <div
            className={
              'w-full h-full absolute top-0 left-0 opacity-30  ' +
              (isAlt ? 'bg-beaming-orange' : 'bg-beaming-orange') +
              (isInListView && events?.length ? 'bg-none' : ' bg-stone-gray ')
            }
          ></div>
          {linkCopied && (
            <p
              className={`text-white text-right mb-2 mt-[-16px] ${
                fadeOut ? 'fade-out' : ''
              }`}
            >
              link copied!
            </p>
          )}
          {isMapView ? (
            <div className="w-full relative z-[1]">
              <div className="w-full h-[500px] relative z-[1] rounded-md">
                <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string}>
                  <Map
                    defaultZoom={12}
                    defaultCenter={mapCenter}
                    mapId="roadmap"
                    className="w-full h-full rounded-xl"
                    streetViewControl={false}
                    mapTypeControl={false}
                    fullscreenControl={true}
                  >
                    <MapController eventCoordinates={eventCoordinates} />
                    <LocationButton />
                    {!isLoading && events && events.map((event, index) => {
                      const coordinates = eventCoordinates[event.id];
                      
                      // Debug logging to see what coordinates we have
                      if (!coordinates) {
                        console.log(`Event ${event.id} (${event.name}) has no coordinates`);
                        return null;
                      }
                      
                      return (
                        <AdvancedMarker
                          key={`event_marker_${index}`}
                          position={coordinates}
                          onClick={() => {
                            // Show event details when marker is clicked
                            import('../../store/actions/eventDetailsDialog').then(({ showEvent }) => {
                              showEvent({
                                ...event,
                                is_favorite: favoritedEvents.includes(event.id) ?? false,
                                viewing_language: language,
                              })(dispatch);
                            });
                            
                            const body = document.querySelector('body');
                            if (body != null) {
                              body.style.overflow = 'hidden';
                            }
                          }}
                        >
                          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-beaming-orange bg-midnight">
                            <img
                              src={event.orig_thumb ? event.orig_thumb : ''}
                              alt="Event Thumbnail"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </AdvancedMarker>
                      );
                    })}
                  </Map>
                </APIProvider>
                {isLoading && (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-slate-black bg-opacity-50 rounded-xl">
                    <Spinner colorClass={'text-beaming-orange'} size={48} />
                  </div>
                )}
                {isGeocoding && !isLoading && Object.keys(eventCoordinates).length === 0 && (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-slate-black bg-opacity-30 rounded-xl">
                    <div className="bg-white rounded-lg p-4 flex flex-col items-center gap-3">
                      <Spinner colorClass={'text-beaming-orange'} size={24} />
                      <span className="text-midnight font-medium">Loading event locations...</span>
                      <div className="text-xs text-midnight opacity-70">
                        {geocodingProgress.processed} of {geocodingProgress.total} events processed
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Show a subtle loading indicator when geocoding but we already have some markers */}
                {isGeocoding && !isLoading && Object.keys(eventCoordinates).length > 0 && (
                  <div className="absolute top-4 right-4 bg-white rounded-lg px-3 py-2 shadow-md">
                    <div className="flex items-center gap-2">
                      <Spinner colorClass={'text-beaming-orange'} size={16} />
                      <span className="text-xs text-midnight">
                        Processing events...
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Keyboard shortcut hint */}
              <div className="hidden mt-2 text-right text-xs text-white opacity-50">
                Press Shift+M to toggle map view
              </div>
              
              {/* Event count info */}
              {events && events.length > 0 && (
                <div className="mt-2 text-center text-xs text-white opacity-70">
                  {Object.keys(eventCoordinates).length > 0 ? (
                    `Some events may not have location data.`
                  ) : isGeocoding ? (
                    `Processing ${geocodingProgress.processed} of ${geocodingProgress.total} events...`
                  ) : (
                    `No events have location data. Check console for geocoding details.`
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={`w-full flex flex-wrap justify-center md:justify-start z-[1] ${isInListView ? 'gap-3' : 'gap-6'}`}>
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Spinner colorClass={'text-beaming-orange'} size={48} />
              </div>
            ) : events?.length == 0 ? (
              <div className="w-full h-full flex items-center justify-center font-medium text-slate-gray z-[1]">
                No Events Found...
              </div>
            ) : (
                <>
                  {((() => {
                    const isToday = title === 'Today' || title === 'Hoy';
                    if (!isToday || !events) return events;
                    const todayMidnight = new Date().setHours(0, 0, 0, 0);
                    const isAlmostOverFn = (e: typeof events[0]) => {
                      const endStr = e.end_date != null ? String(e.end_date).trim() : '';
                      const parsedEnd = endStr ? new Date(endStr) : null;
                      const effectiveEnd =
                        parsedEnd && !isNaN(parsedEnd.getTime())
                          ? parsedEnd
                          : new Date(e.start_date);
                      return effectiveEnd < new Date(todayMidnight);
                    };
                    return [...events].sort((a, b) => {
                      const aOver = isAlmostOverFn(a) ? 0 : 1;
                      const bOver = isAlmostOverFn(b) ? 0 : 1;
                      return aOver - bOver;
                    });
                  })() ?? []).map((event, index) => {
            const isAlmostOver = (() => {
              const endStr = event.end_date != null ? String(event.end_date).trim() : '';
              const parsedEnd = endStr ? new Date(endStr) : null;
              const effectiveEnd =
                parsedEnd && !isNaN(parsedEnd.getTime())
                  ? parsedEnd
                  : new Date(event.start_date);
              return effectiveEnd < new Date(new Date().setHours(0, 0, 0, 0));
            })();
            return (
                <EventCard
                  highlightedFields={highlightedFields}
                  searchQuery={searchQuery}
                  almostOver={(title === 'Today' || title === 'Hoy') && isAlmostOver}
                  key={`event_${index}`}
                  event={event}
                  isFavorite={favoritedEvents.includes(event.id)}
                  language={language}
                  locationName={locationName}
                  isInListView={isInListView}
                  sectionDayStartMs={sectionDayStartMs}
                />
                  );
                  })}
                  {/* Keyboard shortcut hint */}
                  <div className="hidden w-full text-right text-xs text-white opacity-50 mt-4">
                    Press Shift+M to toggle map view
                  </div>
                </>
            )}
          </div>
          )}
        </div>
      ) : (
        ''
      )}
    </div>
  );
};

export default EventsSection;
