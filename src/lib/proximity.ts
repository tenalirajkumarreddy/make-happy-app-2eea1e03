/**
 * Proximity validation utility.
 * Checks if the user is within a given radius of a target location.
 */

import { getCurrentPosition } from "./capacitorUtils";

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

// Re-exporting getCurrentPosition for backward compatibility
export { getCurrentPosition };

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
  // No store GPS → skip proximity check, but flag it explicitly
  if (!storeLat || !storeLng) {
    return { withinRange: true, distance: null, userLocation: null, message: "Store has no GPS coordinates — proximity check skipped", skippedNoGps: true };
  }

  const loc = await getCurrentPosition();
  if (!loc) {
    return { withinRange: false, distance: null, userLocation: null, message: "Could not get your location. Please enable GPS and try again.", skippedNoGps: false };
  }

  const dist = getDistanceMeters(loc.lat, loc.lng, storeLat, storeLng);
  if (dist <= PROXIMITY_RADIUS_METERS) {
    return { withinRange: true, distance: Math.round(dist), userLocation: loc, message: `You are ${Math.round(dist)}m from the store`, skippedNoGps: false };
  }

  return {
    withinRange: false,
    distance: Math.round(dist),
    userLocation: loc,
    message: `You are ${Math.round(dist)}m away. Must be within ${PROXIMITY_RADIUS_METERS}m of the store.`,
    skippedNoGps: false,
  };
}

export { PROXIMITY_RADIUS_METERS, getDistanceMeters };
