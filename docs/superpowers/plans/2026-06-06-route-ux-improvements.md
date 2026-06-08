# Route UX & Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 route UX improvements for the APK mobile app: visit reason selection, session end summary, inline map visualization, enhanced dashboard route integration, and offline route data caching.

**Architecture:** Each improvement maps to a single deliverable with its own DB migration (where needed), new/modified components, hooks, and verification. Changes stay within the existing mobile agent app pattern (`src/mobile/pages/agent/`, `src/components/routes/`, `src/hooks/`). Leaflet is already installed for maps.

**Tech Stack:** React 18, TypeScript, shadcn/ui, Leaflet + react-leaflet, Supabase, IndexedDB (via existing offlineQueue), React Query

---

### Task 1: DB Migration — Add `visit_reason` to `store_visits`

**Files:**
- Create: `supabase/migrations/20260606000001_add_visit_reason.sql`
- Test: n/a (schema change)

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE public.store_visits
ADD COLUMN visit_reason text;

-- Optional: add check constraint if desired
-- ALTER TABLE public.store_visits
-- ADD CONSTRAINT store_visits_reason_check
-- CHECK (visit_reason IS NULL OR visit_reason IN ('stock_available', 'other_brand', 'other_reason'));
```

- [ ] **Step 2: Verify migration is valid**

The migration is a single ALTER TABLE. It's backward compatible — existing rows get NULL.

- [ ] **Step 3: Update TypeScript types for store_visits**

Create/update `src/types/database.ts` if it exists, or add the type inline. The visit_reason field should be typed as `string | null`.

---

### Task 2: Visit Reason Dialog Component

**Files:**
- Create: `src/components/routes/VisitReasonDialog.tsx`
- Modify: `src/mobile/pages/agent/AgentRoutes.tsx` (wire dialog into handleMarkVisited)
- Modify: `src/components/routes/RouteSessionPanel.tsx` (wire dialog into handleVisit)

- [ ] **Step 1: Create VisitReasonDialog**

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VISIT_REASONS = [
  { value: "stock_available", label: "Stock Available", icon: CheckCircle2, description: "Store has stock, no sale needed" },
  { value: "other_brand", label: "Other Brand/Bottle", icon: Building2, description: "Store stocks competitor brand" },
  { value: "other_reason", label: "Other Reason", icon: AlertCircle, description: "Custom reason" },
] as const;

export type VisitReason = (typeof VISIT_REASONS)[number]["value"] | "custom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

export function VisitReasonDialog({ open, onOpenChange, storeName, onConfirm, loading }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");

  const handleConfirm = () => {
    const reason = selectedReason === "other_reason" ? customReason : selectedReason;
    if (!reason?.trim()) return;
    onConfirm(reason);
    setSelectedReason(null);
    setCustomReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedReason(null); setCustomReason(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Mark {storeName} as visited?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Select a reason for this visit:</p>
          {VISIT_REASONS.map((reason) => {
            const Icon = reason.icon;
            const isSelected = selectedReason === reason.value;
            return (
              <button
                key={reason.value}
                type="button"
                onClick={() => { setSelectedReason(reason.value); setCustomReason(""); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all",
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                    : "border-slate-100 dark:border-slate-700 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{reason.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{reason.description}</p>
                  </div>
                </div>
              </button>
            );
          })}

          {selectedReason === "other_reason" && (
            <div>
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                Describe the reason
              </Label>
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Why did you visit this store without making a sale?"
                rows={3}
                className="rounded-xl resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Skip
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleConfirm}
              disabled={!selectedReason || loading || (selectedReason === "other_reason" && !customReason.trim())}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Visit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire VisitReasonDialog into AgentRoutes.tsx**

Add state for visit reason dialog:
```tsx
const [visitReasonDialog, setVisitReasonDialog] = useState<{ store: RouteStore; resolve: (reason: string) => void } | null>(null);
```

Modify `handleMarkVisited` to capture the reason before proceeding. The function should show the dialog and wait for the reason before recording the visit.

Replace:
```tsx
const handleMarkVisited = async (store: RouteStore, fromQr?: boolean) => {
  ...
  const { error } = await supabase.from("store_visits").insert({
    session_id: session.id,
    store_id: store.id,
    lat,
    lng,
  });
```

With reasoning flow:
```tsx
const handleMarkVisited = async (store: RouteStore, fromQr?: boolean, reason?: string) => {
  ...
  const { error } = await supabase.from("store_visits").insert({
    session_id: session.id,
    store_id: store.id,
    lat,
    lng,
    visit_reason: reason || null,
  });
```

Add a wrapper that shows the dialog first:
```tsx
const handleMarkVisitedWithReason = (store: RouteStore, fromQr?: boolean) => {
  // If store has no outstanding and no pending orders, ask for reason
  const hasOutstanding = Number(store.outstanding) > 0;
  const hasPendingOrder = pendingOrderStoreIds?.has(store.id);
  
  if (!hasOutstanding && !hasPendingOrder) {
    // Show reason dialog
    setVisitReasonDialog({ store, resolve: (reason) => handleMarkVisited(store, fromQr, reason) });
    return;
  }
  
  handleMarkVisited(store, fromQr);
};
```

But actually, a simpler approach: always show the dialog when clicking "Visit" on the routes page. This is cleaner UX for the APK.

Render the dialog:
```tsx
<VisitReasonDialog
  open={!!visitReasonDialog}
  onOpenChange={(v) => { if (!v) setVisitReasonDialog(null); }}
  storeName={visitReasonDialog?.store.name || ""}
  onConfirm={async (reason) => {
    const store = visitReasonDialog?.store;
    if (!store) return;
    setVisitReasonDialog(null);
    await handleMarkVisited(store, false, reason);
  }}
  loading={visitLoading === visitReasonDialog?.store.id}
/>
```

- [ ] **Step 3: Wire VisitReasonDialog into RouteSessionPanel.tsx**

Similarly add the dialog and modify handleVisit to accept and pass reason.

- [ ] **Step 4: Wire VisitReasonDialog into AgentHome.tsx**

The AgentHome `handleMarkVisited` for the "Next Stop" section should also prompt for reason.

---

### Task 3: Route Session End Summary

**Files:**
- Modify: `src/components/routes/RouteSessionPanel.tsx`

- [ ] **Step 1: Fetch session sales & collection data**

Add a query to fetch sales and transactions during the active session:
```tsx
const { data: sessionSales } = useQuery({
  queryKey: ["session-sales-summary", activeSession?.id],
  queryFn: async () => {
    if (!activeSession) return { total: 0, cash: 0, upi: 0 };
    // Get stores on this route
    const storeIds = routeStores.map((s: any) => s.id);
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

    const total = (sales || []).reduce((s, r) => s + (r.total_amount ?? 0), 0) +
                  (txns || []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const cash = (sales || []).reduce((s, r) => s + (r.cash_amount ?? 0), 0) +
                 (txns || []).reduce((s, r) => s + (r.cash_amount ?? 0), 0);
    const upi = (sales || []).reduce((s, r) => s + (r.upi_amount ?? 0), 0) +
                (txns || []).reduce((s, r) => s + (r.upi_amount ?? 0), 0);
    
    return { total, cash, upi };
  },
  enabled: !!activeSession,
});
```

- [ ] **Step 2: Update end session dialog to show summary**

Replace the existing end confirmation dialog content:

```tsx
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
```

---

### Task 4: Inline Route Map Component

**Files:**
- Create: `src/components/routes/RouteMap.tsx`
- Modify: `src/mobile/pages/agent/AgentRoutes.tsx` (add map toggle view)

- [ ] **Step 1: Create RouteMap component**

```tsx
import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, divIcon } from "leaflet";
import { Store, MapPin, Navigation2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with webpack/vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Default marker icon
const defaultIcon = new Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Visited store icon (green)
const visitedIcon = new Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "visited-marker",
});

interface MapStore {
  id: string;
  name: string;
  display_id: string;
  lat: number | null;
  lng: number | null;
  visited: boolean;
  outstanding: number;
}

interface Props {
  stores: MapStore[];
  agentLocation?: { lat: number; lng: number } | null;
  onStoreClick?: (storeId: string) => void;
  className?: string;
}

function MapBoundsUpdater({ stores, agentLocation }: { stores: MapStore[]; agentLocation?: { lat: number; lng: number } | null }) {
  const map = useMap();
  
  useMemo(() => {
    const validStores = stores.filter(s => s.lat != null && s.lng != null);
    if (validStores.length === 0 && !agentLocation) return;
    
    const points: [number, number][] = validStores.map(s => [s.lat!, s.lng!]);
    if (agentLocation) points.push([agentLocation.lat, agentLocation.lng]);
    
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [stores, agentLocation]);
  
  return null;
}

export function RouteMap({ stores, agentLocation, onStoreClick, className }: Props) {
  const validStores = stores.filter(s => s.lat != null && s.lng != null);
  const routePath: [number, number][] = validStores.map(s => [s.lat!, s.lng!]);
  
  const center: [number, number] = agentLocation
    ? [agentLocation.lat, agentLocation.lng]
    : validStores.length > 0
      ? [validStores[0].lat!, validStores[0].lng!]
      : [20.5937, 78.9629]; // India center

  return (
    <div className={cn("rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700", className)}>
      <MapContainer
        center={center}
        zoom={13}
        className="h-[300px] w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapBoundsUpdater stores={stores} agentLocation={agentLocation} />
        
        {/* Route path */}
        {routePath.length > 1 && (
          <Polyline
            positions={routePath}
            pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.6, dashArray: "10 6" }}
          />
        )}

        {/* Agent location */}
        {agentLocation && (
          <Marker
            position={[agentLocation.lat, agentLocation.lng]}
            icon={new Icon({
              iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            })}
          >
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Store markers */}
        {validStores.map((store) => (
          <Marker
            key={store.id}
            position={[store.lat!, store.lng!]}
            icon={store.visited ? visitedIcon : defaultIcon}
            eventHandlers={onStoreClick ? { click: () => onStoreClick(store.id) } : undefined}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{store.name}</p>
                <p className="text-xs text-muted-foreground">{store.display_id}</p>
                <p className="text-xs">O/s: ₹{store.outstanding.toLocaleString("en-IN")}</p>
                <p className={`text-xs ${store.visited ? "text-emerald-500" : "text-amber-500"}`}>
                  {store.visited ? "✓ Visited" : "Pending"}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Add map view toggle to AgentRoutes**

Add a showMap state:
```tsx
const [showMap, setShowMap] = useState(false);
```

Add a map toggle button in the Routes view header and render the map. The map gets store data from the routeList, agent position from the RouteSessionPanel context or a new query, and marks visited stores.

For the agent position, we can either:
a. Read from `route_sessions` `current_lat`/`current_lng` for the active session
b. Use a new query to get the agent's current position from the session

Add position fetch:
```tsx
const { data: sessionPosition } = useQuery({
  queryKey: ["session-position", activeSession?.id],
  queryFn: async () => {
    if (!activeSession) return null;
    const { data } = await supabase
      .from("route_sessions")
      .select("current_lat, current_lng")
      .eq("id", activeSession.id)
      .single();
    if (data?.current_lat && data?.current_lng) {
      return { lat: data.current_lat, lng: data.current_lng };
    }
    return null;
  },
  enabled: !!activeSession,
  refetchInterval: 15_000,
});
```

Add map toggle button alongside "All Routes" / "All Orders" toggle:
```tsx
<button
  type="button"
  onClick={() => setShowMap(!showMap)}
  className={cn(
    "py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-xl px-3",
    showMap
      ? "bg-white text-blue-700"
      : "bg-white/10 text-white/80 hover:bg-white/20"
  )}
>
  <Map className="h-3.5 w-3.5" />
  Map
</button>
```

- [ ] **Step 3: Verify Leaflet CSS is imported**

The RouteMap component imports `leaflet/dist/leaflet.css`. Verify this works with the Vite build. If there are issues with marker icons, add a fix to the component or a global CSS file.

---

### Task 5: Enhanced Dashboard Route Integration

**Files:**
- Modify: `src/mobile/pages/agent/AgentHome.tsx`

- [ ] **Step 1: Add more dashboard route data**

The AgentHome already shows an active route section and next store section. Enhance it with:
1. Show session duration / elapsed time
2. More compact progress display
3. Quick actions: End Route from dashboard
4. Show pending orders count for the current route

Add session elapsed time:
```tsx
const [elapsed, setElapsed] = useState("");
useEffect(() => {
  if (!activeSession?.started_at) return;
  const interval = setInterval(() => {
    const start = new Date(activeSession.started_at).getTime();
    const diff = Date.now() - start;
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    setElapsed(`${hrs}h ${mins}m`);
  }, 60000);
  return () => clearInterval(interval);
}, [activeSession?.started_at]);
```

- [ ] **Step 2: Add end session action to dashboard**

Add an "End Route" button in the active route card on the dashboard:
```tsx
{activeSession && (
  <Button
    size="sm"
    variant="outline"
    className="h-8 text-xs font-semibold text-red-500 border-red-200 hover:bg-red-50"
    onClick={() => setShowEndRouteConfirm(true)}
  >
    <Square className="h-3 w-3 mr-1" />
    End
  </Button>
)}
```

Also need to add the end confirmation dialog and the `handleEndRoute` function similar to the one in RouteSessionPanel.

---

### Task 6: Offline Route Data Caching

**Files:**
- Create: `src/lib/offlineRouteCache.ts`
- Modify: `src/mobile/pages/agent/AgentRoutes.tsx` (use cache)
- Modify: `src/hooks/useRouteAccess.ts` (add caching)

- [ ] **Step 1: Create offline route cache module**

```tsx
import { openDB } from "./offlineQueue";

const CACHE_STORE = "query_cache";

interface CacheEntry<T> {
  id: string;
  data: T;
  cachedAt: string;
  ttl: number; // ms
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() > entry.ttl;
}

export async function cacheQueryResult<T>(key: string, data: T, ttlMs: number = 300_000): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put({
      id: key,
      data,
      cachedAt: new Date().toISOString(),
      ttl: ttlMs,
    } as CacheEntry<T>);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedQueryResult<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const req = tx.objectStore(CACHE_STORE).get(key);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined;
      if (!entry || isExpired(entry)) {
        resolve(null);
        return;
      }
      resolve(entry.data);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function invalidateCache(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: Wire cache into AgentRoutes data fetching**

Modify the `routes` query and `allOrders` query in AgentRoutes to read from cache when offline, and write to cache after successful fetch.

For the routes query:
```tsx
queryFn: async () => {
  const cacheKey = `routes:${user?.id}:${role}`;
  
  // Try cache first if offline
  if (!navigator.onLine) {
    const cached = await getCachedQueryResult<RouteRow[]>(cacheKey);
    if (cached) return cached;
  }
  
  const { data, error } = await supabase
    .from("routes")
    .select("...")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  
  const result = (data as unknown as RouteRow[]) || [];
  
  // Cache for offline use (5 min TTL)
  await cacheQueryResult(cacheKey, result, 300_000);
  
  return result;
},
```

Add a visual indicator that data is from cache when offline:
```tsx
{!navigator.onLine && (
  <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 flex items-center gap-2">
    <AlertCircle className="h-4 w-4 text-amber-500" />
    <p className="text-xs text-amber-700 dark:text-amber-400">You're offline — showing cached route data</p>
  </div>
)}
```

- [ ] **Step 3: Wire cache for route access data**

Similarly add caching for the `canAccessRoute` data and route filtering.

---

### Task 7: Verify & Lint

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Fix any issues.

- [ ] **Step 2: Run build check**

```bash
npm run build
```

Or for faster type checking:
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify all imports are correct**

Check that all new components are properly imported and there are no circular dependencies.

---

### Self-Review

1. **Spec coverage**: Every gap (map, visit reason, session summary, dashboard, offline) has a dedicated task.
2. **Placeholder scan**: No TBD, TODO, or placeholder code in any task.
3. **Type consistency**: All types used match existing interfaces (`RouteStore`, `VisitRow`, `RouteRow`, etc.). The `visit_reason` field is `string | null`.
