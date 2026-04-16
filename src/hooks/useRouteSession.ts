import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RouteSession {
  id: string;
  agent_id: string;
  date: string;
  optimized_order: string[];
  estimated_duration: number;
  actual_duration?: number;
  total_distance: number;
  starting_location: { lat: number; lng: number } | null;
  status: "planned" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface StoreVisit {
  id: string;
  session_id: string;
  store_id: string;
  store_name?: string;
  lat?: number;
  lng?: number;
  visited_at: string | null;
  visit_duration?: number;
  notes?: string;
  order_completed?: boolean;
  payment_collected?: number;
}

export interface RouteStore {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  visit_priority?: number;
  avg_visit_duration?: number;
  outstanding_balance?: number;
  is_active: boolean;
}

export interface RouteProgress {
  totalStores: number;
  visitedStores: number;
  remainingStores: number;
  completionPercentage: number;
  estimatedRemainingTime: number;
  currentLocation?: { lat: number; lng: number };
}

/**
 * useRouteSession - Hook for managing route sessions
 * Handles CRUD operations, visit tracking, and route optimization
 */
export function useRouteSession(agentId?: string) {
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<RouteSession | null>(null);

  // Fetch today's route session for agent
  const { data: todaySession, isLoading: isLoadingSession, refetch: refetchSession } = useQuery({
    queryKey: ["route-session", agentId, "today"],
    queryFn: async () => {
      if (!agentId) return null;
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("route_sessions")
        .select("*")
        .eq("agent_id", agentId)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching route session:", error);
        throw error;
      }

      return data as RouteSession | null;
    },
    enabled: !!agentId,
  });

  // Update active session when data changes
  useEffect(() => {
    if (todaySession) {
      setActiveSession(todaySession);
    }
  }, [todaySession]);

  // Fetch route stores with details
  const { data: routeStores, isLoading: isLoadingStores } = useQuery({
    queryKey: ["route-stores", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.optimized_order?.length) return [];

      const { data: stores, error } = await supabase
        .from("stores")
        .select("id, name, address, latitude, longitude, visit_priority, avg_visit_duration, outstanding_balance, is_active")
        .in("id", activeSession.optimized_order);

      if (error) {
        console.error("Error fetching route stores:", error);
        throw error;
      }

      // Sort by optimized order
      const storeMap = new Map(stores?.map(s => [s.id, s]) || []);
      return activeSession.optimized_order
        .map(id => storeMap.get(id))
        .filter((s): s is RouteStore => !!s);
    },
    enabled: !!activeSession?.optimized_order?.length,
  });

  // Fetch store visits for current session
  const { data: storeVisits, isLoading: isLoadingVisits, refetch: refetchVisits } = useQuery({
    queryKey: ["store-visits", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      
      const { data, error } = await supabase
        .from("store_visits")
        .select(`
          *,
          stores(name, latitude, longitude)
        `)
        .eq("session_id", activeSession.id);

      if (error) {
        console.error("Error fetching store visits:", error);
        throw error;
      }

      return data.map((visit: any) => ({
        ...visit,
        store_name: visit.stores?.name,
        lat: visit.stores?.latitude,
        lng: visit.stores?.longitude,
      })) as StoreVisit[];
    },
    enabled: !!activeSession?.id,
  });

  // Calculate route progress
  const progress: RouteProgress | null = activeSession && routeStores ? {
    totalStores: routeStores.length,
    visitedStores: storeVisits?.filter(v => v.visited_at).length || 0,
    remainingStores: routeStores.length - (storeVisits?.filter(v => v.visited_at).length || 0),
    completionPercentage: routeStores.length > 0 
      ? ((storeVisits?.filter(v => v.visited_at).length || 0) / routeStores.length) * 100 
      : 0,
    estimatedRemainingTime: calculateRemainingTime(routeStores, storeVisits),
  } : null;

  // Create new route session
  const createSession = useMutation({
    mutationFn: async (params: {
      agentId: string;
      storeIds: string[];
      startingLocation?: { lat: number; lng: number };
    }) => {
      const { data, error } = await supabase
        .from("route_sessions")
        .insert({
          agent_id: params.agentId,
          date: new Date().toISOString().split("T")[0],
          optimized_order: params.storeIds,
          starting_location: params.startingLocation || null,
          status: "planned",
        })
        .select()
        .single();

      if (error) throw error;
      return data as RouteSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-session"] });
      toast.success("Route session created");
    },
    onError: (error) => {
      console.error("Error creating route session:", error);
      toast.error("Failed to create route session");
    },
  });

  // Update session status
  const updateSessionStatus = useMutation({
    mutationFn: async ({
      sessionId,
      status,
    }: {
      sessionId: string;
      status: RouteSession["status"];
    }) => {
      const updates: Partial<RouteSession> = { status };
      
      if (status === "completed") {
        updates.actual_duration = calculateActualDuration(storeVisits);
      }

      const { data, error } = await supabase
        .from("route_sessions")
        .update(updates)
        .eq("id", sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as RouteSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-session"] });
      toast.success("Route session updated");
    },
    onError: (error) => {
      console.error("Error updating route session:", error);
      toast.error("Failed to update route session");
    },
  });

  // Record store visit
  const recordVisit = useMutation({
    mutationFn: async ({
      sessionId,
      storeId,
      location,
      notes,
      orderCompleted,
      paymentCollected,
    }: {
      sessionId: string;
      storeId: string;
      location?: { lat: number; lng: number };
      notes?: string;
      orderCompleted?: boolean;
      paymentCollected?: number;
    }) => {
      const { data: existingVisit } = await supabase
        .from("store_visits")
        .select("id")
        .eq("session_id", sessionId)
        .eq("store_id", storeId)
        .maybeSingle();

      let result;
      if (existingVisit?.id) {
        // Update existing visit
        result = await supabase
          .from("store_visits")
          .update({
            visited_at: new Date().toISOString(),
            lat: location?.lat,
            lng: location?.lng,
            notes,
            order_completed: orderCompleted,
            payment_collected: paymentCollected,
          })
          .eq("id", existingVisit.id)
          .select()
          .single();
      } else {
        // Create new visit
        result = await supabase
          .from("store_visits")
          .insert({
            session_id: sessionId,
            store_id: storeId,
            visited_at: new Date().toISOString(),
            lat: location?.lat,
            lng: location?.lng,
            notes,
            order_completed: orderCompleted,
            payment_collected: paymentCollected,
          })
          .select()
          .single();
      }

      if (result.error) throw result.error;
      return result.data as StoreVisit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-visits"] });
      toast.success("Visit recorded");
    },
    onError: (error) => {
      console.error("Error recording visit:", error);
      toast.error("Failed to record visit");
    },
  });

  // Reorder route
  const reorderRoute = useMutation({
    mutationFn: async ({
      sessionId,
      newOrder,
    }: {
      sessionId: string;
      newOrder: string[];
    }) => {
      const { data, error } = await supabase
        .from("route_sessions")
        .update({ optimized_order: newOrder })
        .eq("id", sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as RouteSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-session"] });
      queryClient.invalidateQueries({ queryKey: ["route-stores"] });
      toast.success("Route reordered");
    },
    onError: (error) => {
      console.error("Error reordering route:", error);
      toast.error("Failed to reorder route");
    },
  });

  // Get next unvisited store
  const getNextStore = useCallback((): RouteStore | null => {
    if (!routeStores || !storeVisits) return null;
    
    const visitedIds = new Set(storeVisits.filter(v => v.visited_at).map(v => v.store_id));
    return routeStores.find(s => !visitedIds.has(s.id)) || null;
  }, [routeStores, storeVisits]);

  // Check if store is visited
  const isStoreVisited = useCallback((storeId: string): boolean => {
    return storeVisits?.some(v => v.store_id === storeId && v.visited_at) || false;
  }, [storeVisits]);

  // Get visit details for store
  const getStoreVisit = useCallback((storeId: string): StoreVisit | undefined => {
    return storeVisits?.find(v => v.store_id === storeId);
  }, [storeVisits]);

  return {
    // Data
    session: activeSession,
    stores: routeStores,
    visits: storeVisits,
    progress,
    
    // Loading states
    isLoading: isLoadingSession || isLoadingStores || isLoadingVisits,
    isLoadingSession,
    isLoadingStores,
    isLoadingVisits,
    
    // Actions
    createSession,
    updateSessionStatus,
    recordVisit,
    reorderRoute,
    
    // Helpers
    getNextStore,
    isStoreVisited,
    getStoreVisit,
    
    // Refetch
    refetchSession,
    refetchVisits,
  };
}

/**
 * useRouteOptimizer - Hook for optimizing routes
 */
export function useRouteOptimizer() {
  const queryClient = useQueryClient();

  const optimize = useMutation({
    mutationFn: async ({
      agentId,
      storeIds,
      startingPoint,
    }: {
      agentId: string;
      storeIds: string[];
      startingPoint?: { lat: number; lng: number };
    }) => {
      // Call the route optimization function
      const { optimizeRoute } = await import("@/lib/routeOptimization");
      const result = await optimizeRoute(agentId, storeIds, startingPoint);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-session"] });
      toast.success("Route optimized");
    },
    onError: (error) => {
      console.error("Error optimizing route:", error);
      toast.error("Failed to optimize route");
    },
  });

  return {
    optimize,
    isOptimizing: optimize.isPending,
  };
}

// Helper functions
function calculateRemainingTime(
  stores: RouteStore[],
  visits: StoreVisit[] | undefined
): number {
  const visitedIds = new Set(visits?.filter(v => v.visited_at).map(v => v.store_id) || []);
  const remainingStores = stores.filter(s => !visitedIds.has(s.id));
  
  let totalTime = 0;
  for (const store of remainingStores) {
    // Travel time (2 min per km)
    totalTime += 2;
    // Visit time
    totalTime += store.avg_visit_duration || 15;
  }
  
  return Math.round(totalTime);
}

function calculateActualDuration(visits: StoreVisit[] | undefined): number {
  if (!visits?.length) return 0;
  
  const firstVisit = visits
    .filter(v => v.visited_at)
    .sort((a, b) => new Date(a.visited_at!).getTime() - new Date(b.visited_at!).getTime())[0];
  
  const lastVisit = visits
    .filter(v => v.visited_at)
    .sort((a, b) => new Date(b.visited_at!).getTime() - new Date(a.visited_at!).getTime())[0];
  
  if (!firstVisit?.visited_at || !lastVisit?.visited_at) return 0;
  
  const start = new Date(firstVisit.visited_at).getTime();
  const end = new Date(lastVisit.visited_at).getTime();
  
  // Add last visit duration
  const lastVisitDuration = lastVisit.visit_duration || 15;
  
  return Math.round((end - start) / 60000) + lastVisitDuration;
}

export default useRouteSession;
