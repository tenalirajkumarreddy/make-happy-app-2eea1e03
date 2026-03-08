/**
 * Proximity validation utility.
 * Checks if the user is within a given radius of a target location.
 */

const PROXIMITY_RADIUS_METERS = 100;

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export interface ProximityResult {
  withinRange: boolean;
  distance: number | null;
  userLocation: { lat: number; lng: number } | null;
  message: string;
}

/**
 * Checks if the user is within PROXIMITY_RADIUS_METERS of the target store.
 * Returns { withinRange, distance, userLocation, message }.
 * If store has no GPS, returns withinRange: true (skip check).
 */
export async function checkProximity(
  storeLat: number | null,
  storeLng: number | null
): Promise<ProximityResult> {
  // No store GPS → skip proximity check
  if (!storeLat || !storeLng) {
    return { withinRange: true, distance: null, userLocation: null, message: "Store has no GPS coordinates — proximity check skipped" };
  }

  const loc = await getCurrentPosition();
  if (!loc) {
    return { withinRange: false, distance: null, userLocation: null, message: "Could not get your location. Please enable GPS and try again." };
  }

  const dist = getDistanceMeters(loc.lat, loc.lng, storeLat, storeLng);
  if (dist <= PROXIMITY_RADIUS_METERS) {
    return { withinRange: true, distance: Math.round(dist), userLocation: loc, message: `You are ${Math.round(dist)}m from the store` };
  }

  return {
    withinRange: false,
    distance: Math.round(dist),
    userLocation: loc,
    message: `You are ${Math.round(dist)}m away. Must be within ${PROXIMITY_RADIUS_METERS}m of the store.`,
  };
}

export { PROXIMITY_RADIUS_METERS, getDistanceMeters, getCurrentPosition };
