/**
 * Geofencing Utilities for Etihad OJE PWA
 * Calculates distance using the Haversine formula and queries browser geolocation.
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceResult {
  isWithin: boolean;
  distanceMeters: number;
  distanceKm: string;
  formattedDistance: string;
}

/**
 * Format meters cleanly for user alert display (e.g. "4,200 meters (4.20 km)")
 */
export function formatDistanceDisplay(meters: number): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(2);
    return `${meters.toLocaleString()} meters (${km} km)`;
  }
  return `${meters} meters`;
}

/**
 * Fetch high-accuracy device GPS position via HTML5 Geolocation API
 */
export async function getDeviceLocation(): Promise<{ success: boolean; coords?: LocationCoordinates; error?: string }> {
  if (!navigator.geolocation) {
    return {
      success: false,
      error: 'Geolocation is not supported by your browser or device.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      (err) => {
        let msg = 'Unable to retrieve location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please enable location permissions in your browser settings to log attendance or sign out.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location information is unavailable. Please ensure GPS/Location is turned on.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out. Please try again.';
        }
        resolve({ success: false, error: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Calculate distance in meters between two lat/lon points using Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Compare current device position against target center coordinates and radius
 */
export function checkGeofence(
  currentLat: number,
  currentLon: number,
  centerLat: number,
  centerLon: number,
  radiusMeters: number
): GeofenceResult {
  const distanceMeters = calculateDistanceMeters(currentLat, currentLon, centerLat, centerLon);
  const distanceKm = (distanceMeters / 1000).toFixed(2);
  const formattedDistance = formatDistanceDisplay(distanceMeters);
  const isWithin = distanceMeters <= radiusMeters;

  return {
    isWithin,
    distanceMeters,
    distanceKm,
    formattedDistance,
  };
}
