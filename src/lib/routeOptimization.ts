// Route optimization utilities
// Phase 4: Scale & Polish - Issue #13

import { supabase } from "@/integrations/supabase/client";

interface Store {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  visit_priority?: number;
  avg_visit_duration?: number;
}

interface OptimizedRoute {
  optimizedOrder: string[];
  estimatedDuration: number; // minutes
  totalDistance: number; // km
  startingLocation: { lat: number; lng: number } | null;
}

interface RouteSession {
  id: string;
  agent_id: string;
  date: string;
  optimized_order: string[];
  estimated_duration: number;
  actual_duration?: number;
  total_distance: number;
  starting_location: { lat: number; lng: number } | null;
  status: "planned" | "active" | "completed" | "cancelled";
}

/**
 * Optimize route for a set of stores
 */
export async function optimizeRoute(
  agentId: string,
  storeIds: string[],
  startingPoint?: { lat: number; lng: number }
): Promise<OptimizedRoute> {
  // Fetch store coordinates
  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, name, latitude, longitude, visit_priority, avg_visit_duration")
    .in("id", storeIds);

  if (error || !stores) {
    console.error("Error fetching stores for route optimization:", error);
    // Return original order if error
    return {
      optimizedOrder: storeIds,
      estimatedDuration: 0,
      totalDistance: 0,
      startingLocation: startingPoint || null,
    };
  }

  // Filter stores with coordinates
  const storesWithCoords = stores.filter(
    (s): s is Store & { latitude: number; longitude: number } =>
      s.latitude != null && s.longitude != null
  );

  if (storesWithCoords.length < 2) {
    // Not enough coordinates for optimization
    return {
      optimizedOrder: storeIds,
      estimatedDuration: calculateEstimatedDuration(stores),
      totalDistance: 0,
      startingLocation: startingPoint || null,
    };
  }

  // Try to call optimization API (Mapbox or Google Maps)
  try {
    const optimized = await callOptimizationAPI(
      storesWithCoords,
      startingPoint
    );

    // Create route session
    const { data: session, error: sessionError } = await supabase
      .from("route_sessions")
      .insert({
        agent_id: agentId,
        date: new Date().toISOString().split("T")[0],
        optimized_order: optimized.optimizedOrder,
        estimated_duration: optimized.estimatedDuration,
        total_distance: optimized.totalDistance,
        starting_location: optimized.startingLocation,
        status: "planned",
      })
      .select()
      .single();

    if (sessionError) {
      console.error("Error creating route session:", sessionError);
    }

    return optimized;
  } catch (apiError) {
    console.error("Route optimization API error:", apiError);
    // Fallback: return original order sorted by priority
    return fallbackOptimization(stores, startingPoint);
  }
}

/**
 * Get or create route session for agent on specific date
 */
export async function getOrCreateRouteSession(
  agentId: string,
  date: Date = new Date()
): Promise<RouteSession | null> {
  const dateStr = date.toISOString().split("T")[0];

  // Check for existing session
  const { data: existing, error } = await supabase
    .from("route_sessions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("date", dateStr)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching route session:", error);
  }

  if (existing) {
    return existing;
  }

  // No session exists - return null (caller should create)
  return null;
}

/**
 * Calculate route metrics for an ordered list of stores
 */
export function calculateRouteMetrics(stores: Store[]): {
  estimatedDuration: number;
  totalDistance: number;
} {
  const estimatedDuration = calculateEstimatedDuration(stores);

  // Calculate approximate distance (Haversine formula)
  let totalDistance = 0;
  for (let i = 0; i < stores.length - 1; i++) {
    const store1 = stores[i];
    const store2 = stores[i + 1];
    if (store1.latitude && store1.longitude && store2.latitude && store2.longitude) {
      totalDistance += calculateDistance(
        store1.latitude,
        store1.longitude,
        store2.latitude,
        store2.longitude
      );
    }
  }

  return { estimatedDuration, totalDistance };
}

/**
 * Update route session status
 */
export async function updateRouteSessionStatus(
  sessionId: string,
  status: RouteSession["status"]
): Promise<void> {
  const updates: Partial<RouteSession> = { status };
  
  if (status === "completed") {
    updates.actual_duration = 0; // Will be calculated
  }

  const { error } = await supabase
    .from("route_sessions")
    .update(updates)
    .eq("id", sessionId);

  if (error) {
    console.error("Error updating route session:", error);
    throw error;
  }
}

/**
 * Manual reorder of route
 */
export async function reorderRoute(
  sessionId: string,
  newOrder: string[]
): Promise<void> {
  const { error } = await supabase
    .from("route_sessions")
    .update({
      optimized_order: newOrder,
    })
    .eq("id", sessionId);

  if (error) {
    console.error("Error reordering route:", error);
    throw error;
  }
}

// Private helper functions

async function callOptimizationAPI(
  stores: (Store & { latitude: number; longitude: number })[],
  startingPoint?: { lat: number; lng: number }
): Promise<OptimizedRoute> {
  // This would integrate with Mapbox or Google Maps Directions API
  // For now, use nearest neighbor algorithm as fallback
  
  const start = startingPoint || {
    lat: stores[0].latitude,
    lng: stores[0].longitude,
  };

  // Nearest neighbor algorithm
  const unvisited = [...stores];
  const optimized: Store[] = [];
  let current = { lat: start.lat, lng: start.lng };

  while (unvisited.length > 0) {
    let nearest = unvisited[0];
    let minDistance = Infinity;
    let nearestIndex = 0;

    for (let i = 0; i < unvisited.length; i++) {
      const store = unvisited[i];
      const dist = calculateDistance(
        current.lat,
        current.lng,
        store.latitude,
        store.longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearest = store;
        nearestIndex = i;
      }
    }

    optimized.push(nearest);
    current = { lat: nearest.latitude, lng: nearest.longitude };
    unvisited.splice(nearestIndex, 1);
  }

  const { estimatedDuration, totalDistance } = calculateRouteMetrics(optimized);

  return {
    optimizedOrder: optimized.map((s) => s.id),
    estimatedDuration,
    totalDistance,
    startingLocation: startingPoint || null,
  };
}

function fallbackOptimization(
  stores: Store[],
  startingPoint?: { lat: number; lng: number }
): OptimizedRoute {
  // Sort by priority (high priority first), then by name
  const sorted = [...stores].sort((a, b) => {
    const priorityDiff = (b.visit_priority || 0) - (a.visit_priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (a.name || "").localeCompare(b.name || "");
  });

  const { estimatedDuration, totalDistance } = calculateRouteMetrics(sorted);

  return {
    optimizedOrder: sorted.map((s) => s.id),
    estimatedDuration,
    totalDistance,
    startingLocation: startingPoint || null,
  };
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function calculateEstimatedDuration(stores: Store[]): number {
  let duration = 0;
  for (const store of stores) {
    // Travel time (estimated 2 min per km average in city)
    duration += 2;
    // Visit time
    duration += store.avg_visit_duration || 15;
  }
  return duration;
}

// Types export
export type { Store, OptimizedRoute, RouteSession };
