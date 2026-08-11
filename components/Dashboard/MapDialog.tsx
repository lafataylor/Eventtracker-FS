import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { useStore } from '../../store/store';
import { hideMap } from '../../store/actions/mapDialog';
import { FiX } from 'react-icons/fi';
import Spinner from '../Spinner';
import BottomDrawer from './BottomDrawer';

interface MapDialogProps {
  setIsMapDialogOpen: (open: boolean) => void;
}

const MapDialog: React.FC<MapDialogProps> = ({ setIsMapDialogOpen }) => {
  const [state, dispatch] = useStore();
  const { mapDialog, loader } = state;

  const mapCenter = useMemo(
    () => mapDialog.coordinates,
    [mapDialog.coordinates]
  );
  const placesLibrary = useMapsLibrary('places');
  const mapQuery = encodeURIComponent(mapDialog.location);

  // URLs for opening maps:
  // For browser (Option 1):
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  // For Android native app :
  const geoUrl = `geo:0,0?q=${mapQuery}`;
  // For iOS native maps: You can choose one of the following:
  // To open Apple Maps:
  const appleMapsUrl = `https://maps.apple.com/?q=${mapQuery}`;
  // Or, if you want to force Google Maps on iOS (if installed):
  const googleMapsIOSUrl = `comgooglemaps://?q=${mapQuery}`;

  // State for controlling the mobile drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  

  // Helper to detect device type
  const getDeviceType = () => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android')) return 'android';
      if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    }
    return 'desktop';
  };

  const deviceType = getDeviceType();
  const isMobile = deviceType !== 'desktop';

  // Handler for clicking the "Open in Maps" button
  const handleOpenMaps = () => {
    if (isMobile) {
      setIsDrawerOpen(true);
    } else {
      window.open(mapsUrl, '_blank');
    }
  };

  const openGoogleMapApp = () => {
    if (deviceType === 'ios') {
      window.location.href = googleMapsIOSUrl;
    } else if (deviceType === 'android') {
      window.location.href = geoUrl;
    }
    setIsDrawerOpen(false);
  };

  const openAppleMapApp = () => {
    if (deviceType === 'ios') {
      window.location.href = appleMapsUrl;
    }
    setIsDrawerOpen(false);
  };

  return (
    <>
      <div
        className="fixed top-0 left-0 z-30 flex justify-center items-center w-full h-full backdrop-blur-sm"
        onClick={() => {
          setIsMapDialogOpen(false);
          hideMap()(dispatch);
        }}
      >
        <APIProvider
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string}
          libraries={placesLibrary ? ['places'] : undefined}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:w-[70vw] h-[90%] w-full flex flex-col p-5 gap-5 lg:rounded-lg rounded-3xl bg-slate-black shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h1 className="font-medium text-white text-2xl">
                {mapDialog.location}
              </h1>
              <FiX
                onClick={() => {
                  setIsMapDialogOpen(false);
                  hideMap()(dispatch);
                }}
                className="flex flex-shrink-0 justify-end w-5 h-5 lg:w-7 lg:h-7 hover:cursor-pointer text-white"
              />
            </div>
            <div className="h-[100%] flex rounded-xl items-center justify-center">
              {loader?.isSpinnerVisible || !mapCenter ? (
                <Spinner size={66} colorClass="text-beaming-orange" />
              ) : (
                <Map
                  defaultZoom={18}
                  defaultCenter={mapCenter}
                  disableDefaultUI={false}
                  zoomControl={true}
                  clickableIcons={true}
                  gestureHandling="greedy"
                  mapId="roadmap"
                  className="map-container"
                >
                  <AdvancedMarker position={mapDialog.coordinates} />
                </Map>
              )}
            </div>
            <button
              className={`bg-beaming-orange text-black hover:bg-beaming-orange-dark border-beaming-orange-dark mx-auto flex w-64 justify-center items-center rounded-lg border-2 gap-4 p-3 font-medium self-end hover:cursor-pointer ${
                loader.isSpinnerVisible || !mapCenter
                  ? 'opacity-80 bg-beaming-orange-dark cursor-not-allowed'
                  : ''
              }`}
              onClick={handleOpenMaps}
              disabled={loader.isSpinnerVisible || !mapCenter}
            >
              <img className="w-5" src="/images/buy.svg" alt="Map Icon" />
              <span>Open in Maps</span>
            </button>
          </div>
        </APIProvider>
      </div>

      {/* Mobile: Show BottomDrawer only if isMobile */}
      {isMobile && (
        <BottomDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        >
          <div className="flex flex-col font-semibold gap-3">
            {deviceType === 'ios' ? (
              <>
                <button
                  className="flex justify-start py-2 rounded  px-4"
                  onClick={openAppleMapApp}
                >
                  Open in Maps
                </button>
                <button
                  className="flex justify-start py-2 rounded  px-4"
                  onClick={openGoogleMapApp}
                >
                  Open in Google Maps
                </button>
              </>
            ) : deviceType === 'android' ? (
              <button
                className="flex justify-start py-2 rounded  px-4"
                onClick={openGoogleMapApp}
              >
                Open in Google Maps App
              </button>
            ) : null}
          </div>
          <button
            className="mt-4 text-gray-600 underline"
            onClick={() => setIsDrawerOpen(false)}
          >
            Cancel
          </button>
        </BottomDrawer>
      )}
    </>
  );
};

export default MapDialog;
