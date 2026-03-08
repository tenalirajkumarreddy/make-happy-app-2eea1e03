import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Square, MapPin, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function RouteSessionPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: activeSession, isLoading: loadingSession } = useQuery({
    queryKey: ["active-route-session", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, address))")
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

  const { data: routes } = useQuery({
    queryKey: ["routes-list-active"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const getLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const handleStart = async () => {
    if (!selectedRoute) { toast.error("Select a route"); return; }
    setSaving(true);
    const loc = await getLocation();
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

  if (loadingSession) return null;

  const routeStores = (activeSession as any)?.routes?.stores || [];

  return (
    <>
      {activeSession ? (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="font-semibold">Active Session: {(activeSession as any)?.routes?.name}</p>
                <p className="text-xs text-muted-foreground">Started {new Date(activeSession.started_at).toLocaleTimeString("en-IN")}</p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleEnd} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              End Session
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Stores on route ({routeStores.length})</p>
            {routeStores.map((store: any) => {
              const visited = visits?.has(store.id);
              return (
                <div key={store.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {visited ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{store.name}</p>
                      {store.address && <p className="text-xs text-muted-foreground">{store.address}</p>}
                    </div>
                  </div>
                  {!visited && (
                    <Button size="sm" variant="outline" onClick={() => handleVisit(store.id)}>
                      Mark Visited
                    </Button>
                  )}
                  {visited && <Badge variant="secondary">Visited</Badge>}
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
