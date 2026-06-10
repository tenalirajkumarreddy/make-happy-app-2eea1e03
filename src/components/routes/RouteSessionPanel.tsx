import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, getDistanceMeters as haversineDistance } from "@/lib/proximity";
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
import { VisitReasonDialog } from "@/components/routes/VisitReasonDialog";
import { toast } from "sonner";

export function RouteSessionPanel() {
  const { user, role } = useAuth();
  const isScopedStaff = role === "agent" || role === "marketer" || role === "operator";
  const qc = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [saving, setSaving] = useState(false);
  const [agentLocation, setAgentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [visitReasonDialog, setVisitReasonDialog] = useState<{ storeId: string; storeName: string } | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  const { data: activeSession, isLoading: loadingSession } = useQuery({
     queryKey: ["active-route-session", user?.id],
     queryFn: async () => {
       const { data } = await supabase
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

  const { data: sessionSales } = useQuery({
    queryKey: ["session-sales-summary", activeSession?.id, storeIds],
    queryFn: async () => {
      if (!activeSession || storeIds.length === 0) return { total: 0, cash: 0, upi: 0 };
      const todayStart = new Date(activeSession.started_at).toISOString();

      const { data: sales } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount")
        .in("store_id", storeIds)
        .gte("created_at", todayStart);

      const { data: txns } = await supabase
        .from("transactions")
        .select("total_amount, cash_amount, upi_amount")
        .in("store_id", storeIds)
        .gte("created_at", todayStart);

      const total = ((sales || []).reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0) +
                     (txns || []).reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0));
      const cash = ((sales || []).reduce((s: number, r: any) => s + Number(r.cash_amount ?? 0), 0) +
                    (txns || []).reduce((s: number, r: any) => s + Number(r.cash_amount ?? 0), 0));
      const upi = ((sales || []).reduce((s: number, r: any) => s + Number(r.upi_amount ?? 0), 0) +
                   (txns || []).reduce((s: number, r: any) => s + Number(r.upi_amount ?? 0), 0));

      return { total, cash, upi };
    },
    enabled: !!activeSession && storeIds.length > 0,
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-list-active", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase.from("routes").select("id, name").eq("is_active", true);
      if (error) throw error;

      const allRoutes: any[] = data || [];
      if (!user?.id || !isScopedStaff) return allRoutes;

      const { data: accessRows, error: accessError } = await supabase
        .from("agent_routes")
        .select("route_id, enabled")
        .eq("user_id", user.id);
      if (accessError) throw accessError;

      // No matrix configured for this user → unrestricted, show all routes
      if (!accessRows || accessRows.length === 0) return allRoutes;

      // Deny-by-default: only show routes explicitly enabled in the matrix
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
       // Throttle DB writes to at most once per 15 seconds
       if (now - lastPushRef.current < 15000) return;
       lastPushRef.current = now;
       await supabase.from("route_sessions").update({
         current_lat: lat,
         current_lng: lng,
         location_updated_at: new Date().toISOString(),
       }).eq("id", activeSession.id);
    };

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (operator) => pushLocation(operator.coords.latitude, operator.coords.longitude),
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

    const { data: locSetting } = await supabase.from("company_settings").select("value").eq("key", "location_validation").maybeSingle() as any;
    const enforceProximity = locSetting && locSetting.value === "true";

    if (enforceProximity) {
      const { checkProximity } = await import("@/lib/proximity");
      const result = await checkProximity(null, null);
      if (result.withinRange === false && !result.skippedNoGps) {
        setSaving(false);
        toast.error(result.message);
        return;
      }
    }

    const loc = await getCurrentPosition();
    if (!loc) {
      setSaving(false);
      toast.error("Could not get your location. Please enable GPS and try again.");
      return;
    }

    const { error } = await supabase.from("route_sessions").insert({
      user_id: user!.id,
      route_id: selectedRoute,
      start_lat: loc.lat,
      start_lng: loc.lng,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["active-route-session"] });
    } else {
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
    const loc = await getCurrentPosition();
    const { error } = await supabase.from("route_sessions").update({
      status: "completed",
      ended_at: new Date().toISOString(),
      end_lat: loc?.lat || null,
      end_lng: loc?.lng || null,
    }).eq("id", activeSession.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Route session ended");
      qc.invalidateQueries({ queryKey: ["active-route-session"] });
      logActivity(user!.id, "Ended route session", "route_session");
    }
  };

  const handleVisit = async (storeId: string, reason?: string) => {
    if (!activeSession) return;
    const store = routeStores.find((s: any) => s.id === storeId);
    // Proximity check — only when geofencing is enabled in settings
    if (store?.lat && store?.lng) {
      const { data: locSetting } = await supabase.from("company_settings").select("value").eq("key", "location_validation").maybeSingle() as any;
      if (locSetting && locSetting.value === "true") {
        const { checkProximity } = await import("@/lib/proximity");
        const result = await checkProximity(store.lat, store.lng);
        if (!result.withinRange) {
          toast.error(result.message);
          return;
        }
      }
    }
    const loc = await getCurrentPosition();
    const { error } = await supabase.from("store_visits").insert({
      session_id: activeSession.id,
      store_id: storeId,
      lat: loc?.lat || null,
      lng: loc?.lng || null,
      visit_reason: reason || null,
    });
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["session-visits"] });
    } else {
      toast.success("Store marked as visited");
      qc.invalidateQueries({ queryKey: ["session-visits"] });
    }
  };

  const handleVisitClick = (storeId: string, storeName: string) => {
    setVisitReasonDialog({ storeId, storeName });
  };

  const openDirections = (store: any) => {
    if (store.lat && store.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
    } else if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  if (loadingSession) return null;

  const visitedCount = visits?.size ?? 0;

  return (
    <>
      {activeSession ? (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
              <span className="sr-only">Active session in progress: </span>
              <div>
                <p className="font-semibold">Active Session: {(activeSession as any)?.routes?.name}</p>
                <p className="text-xs text-muted-foreground">
                  Started {new Date(activeSession.started_at).toLocaleTimeString("en-IN")} · {visitedCount}/{routeStores.length} visited
                </p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowEndConfirm(true)} disabled={saving}>
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
                      <Button size="sm" variant="outline" onClick={() => handleVisitClick(store.id, store.name)}>
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
        <div className="p-4">
          <div className="flex flex-col items-center text-center py-2">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/25">
              <MapPin className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">No Active Session</p>
            <p className="text-xs text-slate-400 mt-1">Start a route session to begin visiting stores</p>
          </div>
          <Button
            onClick={() => setShowStart(true)}
            className="w-full mt-4 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
          >
            <Play className="mr-2 h-5 w-5" />Start Route Session
          </Button>
        </div>
      )}

      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>End Route Session?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You visited {visitedCount} of {routeStores.length} stores.
            </p>

            {sessionSales && sessionSales.total > 0 && (
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Session Summary</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Collection</span>
                  <span className="text-lg font-bold">₹{sessionSales.total.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex gap-4 pt-1 border-t">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs text-muted-foreground">Cash <strong>₹{sessionSales.cash.toLocaleString("en-IN")}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-violet-400" />
                    <span className="text-xs text-muted-foreground">UPI <strong>₹{sessionSales.upi.toLocaleString("en-IN")}</strong></span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Ending now will mark this session as complete. Continue?
            </p>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => { setShowEndConfirm(false); handleEnd(); }} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                End Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VisitReasonDialog
        open={!!visitReasonDialog}
        onOpenChange={(v) => { if (!v) setVisitReasonDialog(null); }}
        storeName={visitReasonDialog?.storeName || ""}
        onConfirm={async (reason) => {
          const storeId = visitReasonDialog?.storeId;
          if (!storeId) return;
          setVisitReasonDialog(null);
          setVisitLoading(true);
          await handleVisit(storeId, reason);
          setVisitLoading(false);
        }}
        loading={visitLoading}
      />

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
