import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { enqueueWithContext } from "@/lib/conflictResolver";
import { toast } from "sonner";

export interface MarkVisitOptions {
  storeId: string;
  storeName?: string;
  userId: string;
  sessionId?: string;
  reason?: string;
}

export function useMarkVisit() {
  const [isVisiting, setIsVisiting] = useState(false);
  const qc = useQueryClient();

  const markVisit = useCallback(async (options: MarkVisitOptions) => {
    const { storeId, storeName, userId, sessionId, reason } = options;
    setIsVisiting(true);

    try {
      let lat: number | null = null;
      let lng: number | null = null;

      const pos = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
      });

      if (pos) {
        lat = pos.lat;
        lng = pos.lng;
      }

      if (!navigator.onLine) {
        const bizKey = generateBusinessKey("visit", {
          userId,
          storeId,
          timestamp: new Date().toISOString(),
        });
        await enqueueWithContext({
          id: crypto.randomUUID(),
          type: "visit",
          payload: { userId, storeId, lat, lng, visit_reason: reason || null },
          createdAt: new Date().toISOString(),
          businessKey: bizKey,
        });
        toast.warning(`Offline — visit queued for ${storeName || storeId}`);
        return;
      }

      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const { data: session } = await supabase
          .from("route_sessions")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();
        activeSessionId = session?.id;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: activeSessionId,
        store_id: storeId,
        lat,
        lng,
        visit_reason: reason || null,
      });

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["store-visits"] });
      toast.success(`Visit recorded for ${storeName || storeId}`);
    } catch (err: any) {
      if (err?.code === 1) {
        toast.error("Location access denied. Please enable GPS.");
      } else {
        toast.error(err?.message || "Failed to record visit");
      }
    } finally {
      setIsVisiting(false);
    }
  }, [qc]);

  return { markVisit, isVisiting };
}
