import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  MapPin,
  Navigation2,
  Phone,
  Store,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

interface Props {
  store: StoreOption;
  onBack: () => void;
  onGoRecord: (store: StoreOption) => void;
  onGoOrders: (store: StoreOption) => void;
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
  customers: { name: string; phone: string | null } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

export function MarketerStoreProfile({ store, onBack, onGoRecord, onGoOrders }: Props) {
  const { data: storeRow } = useQuery({
    queryKey: ["mobile-marketer-store-profile", store.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, address, phone, lat, lng, route_id, customers(name, phone), store_types(name), routes(name)")
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

  const openDirections = () => {
    if (currentStore.lat != null && currentStore.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`, "_blank");
      return;
    }

    if (currentStore.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStore.address)}`, "_blank");
    }
  };

  const handleCall = () => {
    const phone = currentStore.phone || null;
    if (!phone) return;
    window.open(`tel:${phone}`, "_self");
  };

  const phone = currentStore.phone || null;
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
              {currentStore.store_types?.name && <Badge variant="outline" className="text-[10px] font-semibold">{currentStore.store_types.name}</Badge>}
              {currentStore.routes?.name && <Badge variant="outline" className="text-[10px] font-semibold">{currentStore.routes.name}</Badge>}
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onGoOrders(currentStore)}
              className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              <ClipboardList className="h-5 w-5 text-white" />
              <span className="text-[11px] font-bold text-white text-center">Create Order</span>
            </button>
            <button
              onClick={() => onGoRecord(currentStore)}
              className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <Wallet className="h-5 w-5 text-emerald-500" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center">Record Transaction</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
