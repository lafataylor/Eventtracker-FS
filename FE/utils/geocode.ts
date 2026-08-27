import { getApiBase } from './locations';
// Fallback geocoding using browser's Geocoding API (if available)
const fallbackGeocode = async (location: string): Promise<google.maps.LatLngLiteral | null> => {
  const defaultCoordinates = { lat: 36.7783, lng: -119.4179 };
  
  try {
    // Check if we're in a browser environment and Google Maps is available
    if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      
      return new Promise((resolve) => {
        geocoder.geocode({ address: location }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const { lat, lng } = results[0].geometry.location;
            const coordinates = { lat: lat(), lng: lng() };
            console.log('✅ Fallback geocoding successful:', coordinates);
            resolve(coordinates);
          } else {
            console.warn('❌ Fallback geocoding failed:', status);
            resolve(defaultCoordinates);
          }
        });
      });
    } else {
      console.warn('❌ Google Maps Geocoder not available for fallback');
      return defaultCoordinates;
    }
  } catch (error) {
    console.error('❌ Error in fallback geocoding:', error);
    return defaultCoordinates;
  }
};

export const geocodeLocation = async (location: string): Promise<google.maps.LatLngLiteral | null> => {
  const defaultCoordinates = { lat: 36.7783, lng: -119.4179 };
  
  // Clean up the location string for better geocoding
  const cleanLocation = location
    .replace(/\|==\|/g, ', ') // Replace delimiter with comma-space
    .replace(/,\s*,/g, ',') // Remove double commas
    .replace(/^,\s*|,\s*$/g, '') // Remove leading/trailing commas
    .trim();

  if (!cleanLocation || cleanLocation === 'N/A' || cleanLocation === '...') {
    console.warn('Invalid location provided for geocoding:', location);
    return defaultCoordinates;
  }
  
  try {
    // Try backend endpoint first.
    const apiBase = getApiBase();
    const response = await fetch(
      `${apiBase}/admin/geocode/?address=${encodeURIComponent(cleanLocation)}`
    );

    if (!response.ok) {
      if (response.status === 403) {
        console.warn('🔄 Backend API returned 403, trying fallback geocoding...');
        return await fallbackGeocode(cleanLocation);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.latitude && data.longitude) {
      const { latitude, longitude } = data;
      
      // Validate coordinates are reasonable
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return { lat: latitude, lng: longitude };
      } else {
        console.warn('Invalid coordinates received:', { latitude, longitude });
        return await fallbackGeocode(cleanLocation);
      }
    } else {
      console.error('No results found for the given location query:', cleanLocation);
      return await fallbackGeocode(cleanLocation);
    }
  } catch (error) {
    console.error('Error during geocoding for location:', cleanLocation, error);
    // Try fallback geocoding if backend fails
    return await fallbackGeocode(cleanLocation);
  }
};