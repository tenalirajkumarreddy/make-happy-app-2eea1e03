/**
 * Proximity validation utility.
 * Checks if the user is within a given radius of a target location.
 */
export const PROXIMITY_RADIUS_METERS = 100;
export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
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
  /** true when the check was skipped because the store has no GPS coordinates */
  skippedNoGps: boolean;
}
/**
 * Checks if the user is within PROXIMITY_RADIUS_METERS of the target store.
 * Returns { withinRange, distance, userLocation, message, skippedNoGps }.
 * If store has no GPS, returns withinRange: true with skippedNoGps: true so
 * callers can surface a warning instead of silently bypassing the check.
 */
export async function checkProximity(
  storeLat: number | null,
  storeLng: number | null
): Promise<ProximityResult> {
  const currentPos = await getCurrentPosition();
  if (!currentPos) {
    return {
      withinRange: false,
      distance: null,
      userLocation: null,
      message: "Could not retrieve user location.",
      skippedNoGps: false,
    };
  }

  if (storeLat === null || storeLng === null) {
    return {
      withinRange: true, // Allow bypassing if store has no GPS
      distance: null,
      userLocation: currentPos,
      message: "Store has no GPS coordinates set. Proceeding...",
      skippedNoGps: true,
    };
  }

  const dist = getDistanceMeters(currentPos.lat, currentPos.lng, storeLat, storeLng);
  const withinRange = dist <= PROXIMITY_RADIUS_METERS;

  return {
    withinRange,
    distance: dist,
    userLocation: currentPos,
    message: withinRange
      ? "You are at the location."
      : `You are ${(dist - PROXIMITY_RADIUS_METERS).toFixed(0)}m too far.`,
    skippedNoGps: false,
  };
}

/**
 * Sorts a list of locations using a greedy Nearest Neighbor algorithm starting from the origin.
 * Locations with missing coordinates are excluded from optimization but appended at the end.
 */
export function nearestNeighborOrder<T extends { id: string; lat: number | null; lng: number | null }>(
  origin: { lat: number; lng: number },
  locations: T[]
): T[] {
  const withCoords: T[] = [];
  const withoutCoords: T[] = [];

  locations.forEach((loc) => {
    if (loc.lat != null && loc.lng != null) {
      withCoords.push(loc);
    } else {
      withoutCoords.push(loc);
    }
  });

  const sorted: T[] = [];
  let currentPos = origin;

  while (withCoords.length > 0) {
    let nearestIndex = -1;
    let minDist = Infinity;

    for (let i = 0; i < withCoords.length; i++) {
        // We know lat/lng are not null here because of the filter above
        const dist = getDistanceMeters(currentPos.lat, currentPos.lng, withCoords[i].lat!, withCoords[i].lng!);
        if (dist < minDist) {
            minDist = dist;
            nearestIndex = i;
        }
    }

    if (nearestIndex !== -1) {
        const nearest = withCoords[nearestIndex];
        sorted.push(nearest);
        withCoords.splice(nearestIndex, 1);
        currentPos = { lat: nearest.lat!, lng: nearest.lng! };
    } else {
        break; 
    }
  }

  return [...sorted, ...withoutCoords];
}
