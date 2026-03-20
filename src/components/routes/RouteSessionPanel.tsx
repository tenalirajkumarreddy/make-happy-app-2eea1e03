import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/lib/proximity";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Square, MapPin, CheckCircle2, Navigation, ShoppingCart, CircleDot } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function RouteSessionPanel() {
  const { user, role } = useAuth();
  const isScopedStaff = role === "agent" || role === "marketer" || role === "pos" || role === "manager";
  const qc = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [saving, setSaving] = useState(false);
  const [agentLocation, setAgentLocation] = useState<{ lat: number; lng: number } | null>(null);

  const { data: activeSession, isLoading: loadingSession } = useQuery({
    queryKey: ["active-route-session", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, address, lat, lng, store_order))")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: visits } = useQuery({
    queryKey: ["session-visits", activeSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .eq("session_id", activeSession!.id);
      return new Set((data || []).map((v) => v.store_id));
    },
    enabled: !!activeSession,
  });

  // Check for pending orders on route stores
  const routeStores = (activeSession as any)?.routes?.stores || [];
  const storeIds = routeStores.map((s: any) => s.id);

  const { data: pendingOrderStores } = useQuery({
    queryKey: ["pending-order-stores", storeIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("store_id")
        .in("store_id", storeIds)
        .eq("status", "pending");
      return new Set((data || []).map((o) => o.store_id));
    },
    enabled: storeIds.length > 0,
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-list-active", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase.from("routes").select("id, name").eq("is_active", true);
      if (error) throw error;

      const allRoutes = data || [];
      if (!user?.id || !isScopedStaff) return allRoutes;

      const { data: accessRows, error: accessError } = await supabase
        .from("agent_routes")
        .select("route_id, enabled")
        .eq("user_id", user.id);
      if (accessError) throw accessError;

      if (!accessRows || accessRows.length === 0) return allRoutes;

      const enabledRouteIds = new Set(
        accessRows.filter((row: any) => row.enabled).map((row: any) => row.route_id)
      );
      return allRoutes.filter((route: any) => enabledRouteIds.has(route.id));
    },
    enabled: !!user,
  });

  // Continuously track agent location during an active session and push to DB
  const locationWatchRef = useRef<number | null>(null);
  const lastPushRef = useRef<number>(0);
  useEffect(() => {
    if (!activeSession || !navigator.geolocation) return;

    const pushLocation = async (lat: number, lng: number) => {
      setAgentLocation({ lat, lng });
      const now = Date.now();
      // Throttle DB writes to at most once per 30 seconds
      if (now - lastPushRef.current < 30000) return;
      lastPushRef.current = now;
      const ts = new Date().toISOString();
      await Promise.all([
        supabase.from("route_sessions").update({
          current_lat: lat,
          current_lng: lng,
          location_updated_at: ts,
        }).eq("id", activeSession.id),
        supabase.from("location_pings").insert({
          session_id: activeSession.id,
          user_id: user!.id,
          lat,
          lng,
          recorded_at: ts,
        }),
      ]);
    };

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => pushLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, [activeSession?.id]);

  // Sort stores: unvisited first, then by pre-computed store_order (optimal route),
  // falling back to live distance from agent if no order set.
  const sortedStores = useMemo(() => {
    const stores = [...routeStores];
    stores.sort((a: any, b: any) => {
      const aVisited = visits?.has(a.id) ? 1 : 0;
      const bVisited = visits?.has(b.id) ? 1 : 0;
      if (aVisited !== bVisited) return aVisited - bVisited;
      // Primary: pre-computed optimal order
      if (a.store_order != null && b.store_order != null) return a.store_order - b.store_order;
      if (a.store_order != null) return -1;
      if (b.store_order != null) return 1;
      // Fallback: live distance from agent
      if (agentLocation && a.lat && a.lng && b.lat && b.lng) {
        const distA = haversineDistance(agentLocation.lat, agentLocation.lng, a.lat, a.lng);
        const distB = haversineDistance(agentLocation.lat, agentLocation.lng, b.lat, b.lng);
        return distA - distB;
      }
      return 0;
    });
    return stores;
  }, [routeStores, visits, agentLocation]);

  const nextStore = sortedStores.find((s: any) => !visits?.has(s.id));

  const handleStart = async () => {
    if (!selectedRoute) { toast.error("Select a route"); return; }
    setSaving(true);
    const loc = await getCurrentPosition();
    const { error } = await supabase.from("route_sessions").insert({
      user_id: user!.id,
      route_id: selectedRoute,
      start_lat: loc?.lat || null,
      start_lng: loc?.lng || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Route session started!");
      setShowStart(false);
      setSelectedRoute("");
      qc.invalidateQueries({ queryKey: ["active-route-session"] });
      logActivity(user!.id, "Started route session", "route_session");
    }
  };

  const handleEnd = async () => {
    if (!activeSession) return;
    setSaving(true);
    const loc = await getLocation();
    await supabase.from("route_sessions").update({
      status: "completed",
      ended_at: new Date().toISOString(),
      end_lat: loc?.lat || null,
      end_lng: loc?.lng || null,
    }).eq("id", activeSession.id);
    setSaving(false);
    toast.success("Route session ended");
    qc.invalidateQueries({ queryKey: ["active-route-session"] });
    logActivity(user!.id, "Ended route session", "route_session");
  };

  const handleVisit = async (storeId: string) => {
    if (!activeSession) return;
    const store = routeStores.find((s: any) => s.id === storeId);
    // Proximity check
    if (store?.lat && store?.lng) {
      const { checkProximity } = await import("@/lib/proximity");
      const result = await checkProximity(store.lat, store.lng);
      if (!result.withinRange) {
        toast.error(result.message);
        return;
      }
    }
    const loc = await getLocation();
    const { error } = await supabase.from("store_visits").insert({
      session_id: activeSession.id,
      store_id: storeId,
      lat: loc?.lat || null,
      lng: loc?.lng || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Store marked as visited");
      qc.invalidateQueries({ queryKey: ["session-visits"] });
    }
  };

  const openDirections = (store: any) => {
    if (store.lat && store.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
    } else if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  if (loadingSession) return null;

  const visitedCount = routeStores.filter((s: any) => visits?.has(s.id)).length;

  return (
    <>
      {activeSession ? (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="font-semibold">Active Session: {(activeSession as any)?.routes?.name}</p>
                <p className="text-xs text-muted-foreground">
                  Started {new Date(activeSession.started_at).toLocaleTimeString("en-IN")} · {visitedCount}/{routeStores.length} visited
                </p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleEnd} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              End Session
            </Button>
          </div>

          {/* Next nearest store highlight */}
          {nextStore && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">Next: {nextStore.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextStore.address || "No address"}
                    {agentLocation && nextStore.lat && nextStore.lng && (
                      <> · {(haversineDistance(agentLocation.lat, agentLocation.lng, nextStore.lat, nextStore.lng) / 1000).toFixed(1)} km away</>
                    )}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => openDirections(nextStore)}>
                <Navigation className="mr-1 h-3 w-3" />Directions
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Stores on route ({routeStores.length})</p>
            {sortedStores.map((store: any) => {
              const visited = visits?.has(store.id);
              const hasOrder = pendingOrderStores?.has(store.id);
              const isNext = nextStore?.id === store.id;
              return (
                <div key={store.id} className={`flex items-center justify-between rounded-lg border p-3 ${isNext ? "border-primary/30 bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    {visited ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{store.name}</p>
                        {/* Colored badges */}
                        {!visited && activeSession && (
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" />
                        )}
                        {hasOrder && (
                          <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {store.address || "No address"}
                        {agentLocation && store.lat && store.lng && (
                          <> · {(haversineDistance(agentLocation.lat, agentLocation.lng, store.lat, store.lng) / 1000).toFixed(1)} km</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(store.lat || store.address) && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDirections(store)} title="Get directions">
                        <Navigation className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!visited && (
                      <Button size="sm" variant="outline" onClick={() => handleVisit(store.id)}>
                        Mark Visited
                      </Button>
                    )}
                    {visited && <Badge variant="secondary">Visited</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowStart(true)}>
          <Play className="mr-2 h-4 w-4" />Start Route Session
        </Button>
      )}

      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start Route Session</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Route</Label>
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose route" /></SelectTrigger>
                <SelectContent>
                  {routes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleStart} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
