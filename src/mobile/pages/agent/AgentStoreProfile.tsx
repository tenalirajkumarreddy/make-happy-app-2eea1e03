import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation2,
  Package,
  Phone,
  Store,
  Wallet,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { addToQueue } from "@/lib/offlineQueue";

interface Props {
  store: StoreOption;
  onBack: () => void;
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
}

interface StoreProfileRow {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  outstanding: number;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  route_id: string | null;
  store_type_id: string | null;
  customers: { name: string; phone: string | null } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

export function AgentStoreProfile({ store, onBack, onGoRecord }: Props) {
  const { user } = useAuth();
  const [visitLoading, setVisitLoading] = useState(false);

  const { data: storeRow, isLoading } = useQuery({
    queryKey: ["mobile-store-profile", store.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, address, phone, lat, lng, route_id, store_type_id, customers(name, phone), store_types(name), routes(name)")
        .eq("id", store.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StoreProfileRow | null) || null;
    },
    enabled: !!store.id,
  });

  const currentStore: StoreOption = useMemo(() => ({
    ...store,
    ...(storeRow || {}),
    customers: storeRow?.customers || store.customers || null,
    store_types: storeRow?.store_types || store.store_types || null,
    routes: storeRow?.routes || store.routes || null,
  }), [store, storeRow]);

  const storeTypeId = storeRow?.store_type_id || null;

  const { data: storeProducts } = useQuery({
    queryKey: ["mobile-store-products", store.id, storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) {
        const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
        return data || [];
      }
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);
      if (accessData && accessData.length > 0) {
        return accessData.map((a: any) => a.products).filter(Boolean);
      }
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!storeRow,
  });

  const { data: typeP } = useQuery({
    queryKey: ["mobile-store-type-pricing", storeTypeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", storeTypeId!);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!storeTypeId,
  });

  const { data: storeP } = useQuery({
    queryKey: ["mobile-store-pricing", store.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", store.id);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!store.id,
  });

  const getPrice = (productId: string, basePrice: number) => {
    if (storeP && productId in storeP) return { price: storeP[productId], label: "store" as const };
    if (typeP && productId in typeP) return { price: typeP[productId], label: "type" as const };
    return { price: basePrice, label: "base" as const };
  };
    if (currentStore.lat != null && currentStore.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`, "_blank");
      return;
    }

    if (currentStore.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStore.address)}`, "_blank");
    }
  };

  const handleCall = () => {
    const phone = currentStore.phone || (currentStore.customers as any)?.phone || null;
    if (!phone) return;
    window.open(`tel:${phone}`, "_self");
  };

  const handleMarkVisited = async () => {
    if (!user) return;

    setVisitLoading(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      const pos = await getCurrentPosition();
      if (pos) {
        lat = pos.lat;
        lng = pos.lng;
      }

      if (!navigator.onLine) {
        await addToQueue({
          id: crypto.randomUUID(),
          type: "visit",
          payload: {
            userId: user.id,
            storeId: currentStore.id,
            lat,
            lng,
          },
          createdAt: new Date().toISOString(),
        });
        toast.warning(`Offline — visit queued for ${currentStore.name}`);
        return;
      }

      const { data: session } = await supabase
        .from("route_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!session) {
        toast.error("No active route session. Start a route first.");
        setVisitLoading(false);
        return;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: session.id,
        store_id: currentStore.id,
        lat,
        lng,
      });

      if (error) throw error;
      toast.success(`Visit recorded for ${currentStore.name}`);
    } catch {
      toast.error("Failed to record visit");
    } finally {
      setVisitLoading(false);
    }
  };

  const phone = currentStore.phone || (currentStore.customers as any)?.phone || null;
  const canNavigate = (currentStore.lat != null && currentStore.lng != null) || !!currentStore.address;

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <button
          type="button"
          className="h-9 px-3 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mt-3">Store Profile</p>
        <h2 className="text-white text-xl font-bold mt-0.5">{currentStore.name}</h2>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="h-44 w-full bg-slate-100 dark:bg-slate-700">
            {currentStore.photo_url ? (
              <img src={currentStore.photo_url} alt={currentStore.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Store className="h-10 w-10 text-slate-400" />
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-white">{currentStore.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{currentStore.display_id}</p>
              </div>
              <p className={`text-base font-bold ${Number(currentStore.outstanding || 0) > 0 ? "text-red-500" : "text-emerald-500"}`}>
                ₹{Number(currentStore.outstanding || 0).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="flex gap-2 mt-2 flex-wrap">
              {currentStore.store_types?.name && (
                <Badge variant="outline" className="text-[10px] font-semibold">{currentStore.store_types.name}</Badge>
              )}
              {currentStore.routes?.name && (
                <Badge variant="outline" className="text-[10px] font-semibold">{currentStore.routes.name}</Badge>
              )}
            </div>

            {currentStore.address && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{currentStore.address}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={openDirections} disabled={!canNavigate}>
                <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
                Navigate
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={handleCall} disabled={!phone}>
                <Phone className="h-3.5 w-3.5 mr-1.5" />
                Call
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Quick Actions</p>
          {isLoading ? (
            <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onGoRecord(currentStore, "sale")}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              >
                <ShoppingCart className="h-5 w-5 text-white" />
                <span className="text-[11px] font-bold text-white text-center">Record Sale</span>
              </button>
              <button
                onClick={() => onGoRecord(currentStore, "payment")}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
              >
                <Wallet className="h-5 w-5 text-emerald-500" />
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Record Transaction</span>
              </button>
              <button
                onClick={handleMarkVisited}
                disabled={visitLoading}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-95 transition-all shadow-sm disabled:opacity-60"
              >
                {visitLoading ? <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 text-center">Mark Visited</span>
              </button>
            </div>
          )}
        </div>

        {/* Products Section */}
        {storeProducts && storeProducts.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Products & Pricing ({storeProducts.length})
            </p>
            <div className="space-y-2">
              {storeProducts.map((p: any) => {
                const { price, label } = getPrice(p.id, Number(p.base_price));
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{p.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono">{p.sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">₹{price.toLocaleString("en-IN")}</p>
                      <span className={`text-[10px] font-semibold capitalize ${
                        label === "store" ? "text-blue-600 dark:text-blue-400" :
                        label === "type" ? "text-violet-600 dark:text-violet-400" :
                        "text-slate-400"
                      }`}>{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
