import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/lib/proximity";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, MapPin, Store as StoreIcon, Navigation, LocateFixed,
  Loader2, Route as RouteIcon, RefreshCw, Building2, AlertTriangle,
  ChevronRight, DollarSign, CheckCircle2,
} from "lucide-react";
import { nearestNeighborOrder, getDistanceMeters as haversineDistance } from "@/lib/proximity";

// Local types compensate for migration columns not yet in generated types
type RouteRow = {
  id: string;
  name: string;
  is_active: boolean;
  store_type_id: string;
  created_at: string;
  factory_lat: number | null;
  factory_lng: number | null;
  store_types: { name: string } | null;
};

type StoreRow = {
  id: string;
  display_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  outstanding: number | string;
  store_order: number | null;
  photo_url: string | null;
  customers: { name: string } | null;
};

export default function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "manager";

  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/routes")} className="gap-1.5 -ml-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Routes
        </Button>
        <p className="text-muted-foreground">Invalid route ID.</p>
      </div>
    );
  }

  const [showSetFactory, setShowSetFactory] = useState(false);
  const [factoryLatInput, setFactoryLatInput] = useState("");
  const [factoryLngInput, setFactoryLngInput] = useState("");
  const [savingFactory, setSavingFactory] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);

  // ── Company settings (fallback factory location) ──────────────────────────
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      return Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    },
  });
  const companyLat = companySettings?.company_lat ? parseFloat(companySettings.company_lat) : null;
  const companyLng = companySettings?.company_lng ? parseFloat(companySettings.company_lng) : null;
  const companyLocationAvailable = companyLat != null && !isNaN(companyLat) && companyLng != null && !isNaN(companyLng);

  // ── Data ──────────────────────────────────────────────────────────────────
   const { data: route, isLoading: routeLoading } = useQuery<RouteRow | null>({
     queryKey: ["route-detail", id],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("routes")
         .select("*, store_types(name)")
         .eq("id", id!)
         .single();
       if (error) throw error;
       return data as RouteRow;
     },
     enabled: !!id,
   });

   const { data: stores, isLoading: storesLoading } = useQuery<StoreRow[]>({
     queryKey: ["route-stores", id],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("stores")
         .select("id, display_id, name, address, lat, lng, outstanding, store_order, photo_url, customers(name)")
         .eq("route_id", id!)
         .order("store_order", { ascending: true, nullsFirst: false });
       if (error) throw error;
       return (data || []) as StoreRow[];
     },
     enabled: !!id,
   });

  // Today's visited store IDs (across any route session for this route)
  const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00";
   const { data: visitedStoreIds } = useQuery<Set<string>>({
     queryKey: ["route-visits-today", id],
     queryFn: async () => {
       const { data } = await supabase
         .from("store_visits")
         .select("store_id, route_sessions!inner(route_id)")
         .eq("route_sessions.route_id", id!)
         .gte("visited_at", todayStart);
      return new Set((data || []).map((v: any) => v.store_id));
    },
    enabled: !!id,
  });

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalOutstanding = useMemo(
    () => (stores || []).reduce((s, st) => s + Number(st.outstanding || 0), 0),
    [stores]
  );
  const storesWithCoords = useMemo(
    () => (stores || []).filter((s) => s.lat != null && s.lng != null).length,
    [stores]
  );

  // Pre-compute distances between consecutive stops for display
  const storesWithDist = useMemo(() => {
    if (!stores) return [];
    const hasFactory = route?.factory_lat != null && route?.factory_lng != null;
    return stores.map((store, idx) => {
      let distFromPrev: number | null = null;
      if (idx === 0 && hasFactory && store.lat && store.lng) {
        distFromPrev = haversineDistance(route.factory_lat!, route.factory_lng!, store.lat, store.lng);
      } else if (idx > 0) {
        const prev = stores[idx - 1];
        if (prev.lat && prev.lng && store.lat && store.lng) {
          distFromPrev = haversineDistance(prev.lat, prev.lng, store.lat, store.lng);
        }
      }
      return { ...store, distFromPrev };
    });
  }, [stores, route]);

  // Open factory dialog — pre-fill from existing route value or fall back to company coords
  const openFactoryDialog = () => {
    if (route?.factory_lat) {
      setFactoryLatInput(String(route.factory_lat));
      setFactoryLngInput(String(route.factory_lng));
    } else if (companyLocationAvailable) {
      setFactoryLatInput(String(companyLat));
      setFactoryLngInput(String(companyLng));
    } else {
      setFactoryLatInput("");
      setFactoryLngInput("");
    }
    setShowSetFactory(true);
  };

  const handleUseCompanyLocation = () => {
    if (!companyLocationAvailable) return;
    setFactoryLatInput(String(companyLat));
    setFactoryLngInput(String(companyLng));
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleUseGps = async () => {
    setGettingGps(true);
    const pos = await getCurrentPosition();
    if (pos) {
      setFactoryLatInput(String(pos.lat));
      setFactoryLngInput(String(pos.lng));
    } else {
      toast.error("Could not get GPS location");
    }
    setGettingGps(false);
  };

  const handleSaveFactory = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(factoryLatInput);
    const lng = parseFloat(factoryLngInput);
    if (isNaN(lat) || isNaN(lng)) { toast.error("Enter valid coordinates"); return; }
    if (lat < -90 || lat > 90) { toast.error("Latitude must be between -90 and 90"); return; }
    if (lng < -180 || lng > 180) { toast.error("Longitude must be between -180 and 180"); return; }
    setSavingFactory(true);
     const { error } = await supabase.from("routes").update({ factory_lat: lat, factory_lng: lng }).eq("id", id!);
    setSavingFactory(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Factory location saved");
    setShowSetFactory(false);
    qc.invalidateQueries({ queryKey: ["route-detail", id] });
    qc.invalidateQueries({ queryKey: ["routes-with-stores"] });
  };

  const handleRecomputeOrder = async () => {
    if (!route?.factory_lat || !route?.factory_lng) {
      toast.error("Set a factory/depot location first");
      setShowSetFactory(true);
      return;
    }
    if (!stores || stores.length === 0) {
      toast.error("No stores on this route");
      return;
    }
    setRecomputing(true);
    const ordered = nearestNeighborOrder(
      { lat: route.factory_lat, lng: route.factory_lng },
      stores
    );
    // Persist store_order for each store
     const updates = ordered.map((store, idx) =>
       supabase.from("stores").update({ store_order: idx + 1 }).eq("id", store.id)
     );
    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    setRecomputing(false);
    if (firstError?.error) {
      toast.error("Failed to save order: " + firstError.error.message);
    } else {
      toast.success(`Optimal order computed for ${ordered.length} stores`);
      qc.invalidateQueries({ queryKey: ["route-stores", id] });
      qc.invalidateQueries({ queryKey: ["routes-with-stores"] });
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (routeLoading || storesLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/routes")} className="gap-1.5 -ml-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Routes
        </Button>
        <p className="text-muted-foreground">Route not found.</p>
      </div>
    );
  }

  const factorySet = route.factory_lat != null && route.factory_lng != null;

  useEffect(() => {
    document.title = `${route.name} — Routes`;
  }, [route.name]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/routes")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" /> Routes
      </Button>

      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="h-20 sm:h-28 bg-gradient-to-br from-primary/20 via-accent/30 to-primary/10" />
        <CardContent className="relative px-4 sm:px-6 pb-5 -mt-8">
          <div className="flex items-end gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl border-4 border-card bg-primary/10 flex items-center justify-center shadow-md shrink-0">
              <RouteIcon className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{route.name}</h1>
                <Badge variant={route.is_active ? "default" : "secondary"}>
                  {route.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {(route as any).store_types?.name && (
                <Badge variant="outline" className="mt-1 text-xs">{(route as any).store_types.name}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <StoreIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stores</p>
            <p className="text-lg font-bold">{stores?.length || 0}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold">₹{totalOutstanding.toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
            <MapPin className="h-4 w-4 text-info" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">With GPS</p>
            <p className="text-lg font-bold">{storesWithCoords}<span className="text-sm font-normal text-muted-foreground">/{stores?.length || 0}</span></p>
          </div>
        </div>
        <div
          className={`rounded-xl border bg-card p-4 flex items-center gap-3 ${canEdit ? "cursor-pointer hover:bg-accent/30 transition-colors" : ""}`}
          onClick={canEdit ? openFactoryDialog : undefined}
        >
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${factorySet ? "bg-success/10" : "bg-muted"}`}>
            <Building2 className={`h-4 w-4 ${factorySet ? "text-success" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Factory / Depot</p>
            {factorySet ? (
              <p className="text-xs font-mono font-medium text-success truncate">
                {Number(route.factory_lat).toFixed(4)}, {Number(route.factory_lng).toFixed(4)}
              </p>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">{canEdit ? "Tap to set" : "Not set"}</p>
            )}
          </div>
        </div>
      </div>

      {/* Warning when no factory set */}
      {!factorySet && (stores?.length || 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Factory / depot location not set</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {companyLocationAvailable
                  ? "Click below to use the company location from Settings, or set a custom one."
                  : "Set the factory/depot starting point to compute the optimal navigation order."}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              {companyLocationAvailable && (
                <Button variant="default" size="sm" onClick={() => { handleUseCompanyLocation(); setSavingFactory(false); openFactoryDialog(); }} className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Use Company Location
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={openFactoryDialog} className="gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Set Custom
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openFactoryDialog} className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> {factorySet ? "Update Factory" : "Set Factory Location"}
          </Button>
          <Button
            size="sm"
            onClick={handleRecomputeOrder}
            disabled={recomputing || !stores || stores.length === 0}
            className="gap-1.5"
          >
            {recomputing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Recompute Optimal Order
          </Button>
        </div>
      )}

      {/* Store list */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <h2 className="font-semibold text-base">Stores on Route</h2>
            <span className="text-xs text-muted-foreground">{stores?.length || 0} stores · sorted by navigation order</span>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-5">
          {storesLoading ? (
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading stores…</span>
            </div>
          ) : !stores || stores.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-10 text-center text-muted-foreground">
              <StoreIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No stores assigned to this route yet.</p>
              <p className="text-xs mt-1">Assign stores via the Stores page.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Factory origin row */}
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${factorySet ? "border-primary/30 bg-primary/5" : "border-dashed opacity-50"}`}>
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  ⌂
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Factory / Depot</p>
                  <p className="text-xs text-muted-foreground">
                    {factorySet
                      ? `${Number(route.factory_lat).toFixed(5)}, ${Number(route.factory_lng).toFixed(5)}`
                      : "Not set — click 'Set Factory Location'"}
                  </p>
                </div>
              </div>

              {/* Stores */}
              {storesWithDist.map((store, idx) => {
                const hasCoords = store.lat != null && store.lng != null;
                const visitedToday = visitedStoreIds?.has(store.id) ?? false;
                return (
                  <div
                    key={store.id}
                    className="flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2.5 sm:p-3 hover:bg-accent/30 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/stores/${store.id}`)}
                  >
                    {/* Order badge */}
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${store.store_order ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {store.store_order ?? "?"}
                    </div>

                    {/* Photo — hidden on very small screens */}
                    <div className="hidden xs:flex h-10 w-10 rounded-lg bg-muted overflow-hidden shrink-0 items-center justify-center sm:flex">
                      {store.photo_url ? (
                        <img src={store.photo_url} alt={store.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <StoreIcon className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate">{store.name}</p>
                        <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground shrink-0">{store.display_id}</span>
                        {visitedToday && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-success/10 text-success shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Visited
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {store.address || "No address"}
                        {!hasCoords && <span className="ml-1 text-warning">· No GPS</span>}
                      </p>
                      {store.distFromPrev != null && store.store_order != null && (
                        <p className="text-[10px] text-muted-foreground">
                          {idx === 0 ? "From depot: " : "From prev: "}
                          {store.distFromPrev < 1000
                            ? `${Math.round(store.distFromPrev)} m`
                            : `${(store.distFromPrev / 1000).toFixed(1)} km`}
                        </p>
                      )}
                    </div>

                    {/* Outstanding — hidden on mobile */}
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="text-sm font-bold">₹{(Number(store.outstanding) || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">outstanding</p>
                    </div>

                    {/* Nav button */}
                    {hasCoords && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
                        }}
                        title="Get directions"
                        aria-label={`Get directions to ${store.name}`}
                      >
                        <Navigation className="h-4 w-4" />
                      </Button>
                    )}

                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set Factory Dialog */}
      <Dialog open={showSetFactory} onOpenChange={setShowSetFactory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Factory / Depot Location</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The factory/depot is the starting point for computing the optimal navigation order
            of stores on this route.
          </p>
          <form onSubmit={handleSaveFactory} className="space-y-4 mt-2">
            <div className={`grid gap-2 ${companyLocationAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
              {companyLocationAvailable && (
                <Button
                  type="button"
                  variant="default"
                  className="w-full gap-2"
                  onClick={handleUseCompanyLocation}
                >
                  <Building2 className="h-4 w-4" /> Company Location
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={handleUseGps}
                disabled={gettingGps}
              >
                {gettingGps ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                My GPS
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input
                  placeholder="e.g. 15.8281"
                  value={factoryLatInput}
                  onChange={(e) => setFactoryLatInput(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input
                  placeholder="e.g. 80.4417"
                  value={factoryLngInput}
                  onChange={(e) => setFactoryLngInput(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowSetFactory(false)}>Cancel</Button>
              <Button type="submit" disabled={savingFactory} className="gap-1.5">
                {savingFactory && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Location
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
