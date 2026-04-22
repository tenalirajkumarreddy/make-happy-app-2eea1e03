/**
 * Proximity validation utility.
 * Checks if the user is within a given radius of a target location.
 */

const PROXIMITY_RADIUS_METERS = 100;

// Configuration for handling stores without GPS coordinates
export type NoGpsHandling = "skip" | "block" | "require_manager_override";

// Default behavior can be configured per organization
const DEFAULT_NO_GPS_HANDLING: NoGpsHandling = "require_manager_override";

type LocationPoint = { lat: number; lng: number };
type RouteStorePoint = { id: string; lat: number | null; lng: number | null };

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
  /** true when the check was skipped because the store has no GPS coordinates */
  skippedNoGps: boolean;
  /** true when manager override is required for stores without GPS */
  requiresManagerOverride: boolean;
}

/**
 * Checks if the user is within PROXIMITY_RADIUS_METERS of the target store.
 * Returns { withinRange, distance, userLocation, message, skippedNoGps, requiresManagerOverride }.
 *
 * For stores without GPS coordinates, behavior depends on noGpsHandling:
 * - "skip": Returns withinRange: true with skippedNoGps: true (legacy behavior)
 * - "block": Returns withinRange: false, blocking the action
 * - "require_manager_override": Returns withinRange: false with requiresManagerOverride: true
 */
export async function checkProximity(
  storeLat: number | null,
  storeLng: number | null,
  options?: {
    noGpsHandling?: NoGpsHandling;
    userRole?: string;
  }
): Promise<ProximityResult> {
  const noGpsHandling = options?.noGpsHandling ?? DEFAULT_NO_GPS_HANDLING;
  const userRole = options?.userRole;

  // No store GPS → handle based on configuration
  if (!storeLat || !storeLng) {
    // Managers and above can bypass the check
    if (userRole === "super_admin" || userRole === "manager") {
      return {
        withinRange: true,
        distance: null,
        userLocation: null,
        message: "Store has no GPS coordinates — manager override applied",
        skippedNoGps: true,
        requiresManagerOverride: false,
      };
    }

    switch (noGpsHandling) {
      case "block":
        return {
          withinRange: false,
          distance: null,
          userLocation: null,
          message: "Store has no GPS coordinates. Please update store location before recording sales.",
          skippedNoGps: true,
          requiresManagerOverride: false,
        };
      case "require_manager_override":
        return {
          withinRange: false,
          distance: null,
          userLocation: null,
          message: "Store has no GPS coordinates. Manager approval required.",
          skippedNoGps: true,
          requiresManagerOverride: true,
        };
      case "skip":
      default:
        return {
          withinRange: true,
          distance: null,
          userLocation: null,
          message: "Store has no GPS coordinates — proximity check skipped",
          skippedNoGps: true,
          requiresManagerOverride: false,
        };
    }
  }

  const loc = await getCurrentPosition();
  if (!loc) {
    return {
      withinRange: false,
      distance: null,
      userLocation: null,
      message: "Could not get your location. Please enable GPS and try again.",
      skippedNoGps: false,
      requiresManagerOverride: false,
    };
  }

  const dist = getDistanceMeters(loc.lat, loc.lng, storeLat, storeLng);
  if (dist <= PROXIMITY_RADIUS_METERS) {
    return {
      withinRange: true,
      distance: Math.round(dist),
      userLocation: loc,
      message: `You are ${Math.round(dist)}m from the store`,
      skippedNoGps: false,
      requiresManagerOverride: false,
    };
  }

  return {
    withinRange: false,
    distance: Math.round(dist),
    userLocation: loc,
    message: `You are ${Math.round(dist)}m away. Must be within ${PROXIMITY_RADIUS_METERS}m of the store.`,
    skippedNoGps: false,
    requiresManagerOverride: false,
  };
}

export function nearestNeighborOrder<T extends RouteStorePoint>(
  origin: LocationPoint,
  stores: T[]
): T[] {
  const validStores = stores.filter((store) => store.lat != null && store.lng != null);
  const invalidStores = stores.filter((store) => store.lat == null || store.lng == null);

  const remaining = [...validStores];
  const ordered: T[] = [];
  let current = origin;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const store = remaining[index];
      const distance = getDistanceMeters(current.lat, current.lng, store.lat as number, store.lng as number);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    const [nextStore] = remaining.splice(nearestIndex, 1);
    ordered.push(nextStore);
    current = { lat: nextStore.lat as number, lng: nextStore.lng as number };
  }

  return [...ordered, ...invalidStores];
}

export { PROXIMITY_RADIUS_METERS, getDistanceMeters, getCurrentPosition };
