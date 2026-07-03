import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Navigation2, Plus, Loader2, MapPin, X, Wallet, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreCard, type StoreCardAction } from "@/mobile/components/StoreCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CreateStoreWizard } from "@/components/stores/CreateStoreWizard";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { useRouteAccess } from "@/hooks/useRouteAccess";

interface RouteItem {
  id: string;
  name: string;
}

interface StoreTypeItem {
  id: string;
  name: string;
}

interface StoreListItem {
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
  is_active: boolean;
  store_type_id: string | null;
  customer_id: string | null;
  last_activity_at: string | null;
  customers: { id: string; name: string; phone: string | null } | null;
  store_types: { id: string; name: string } | null;
  routes: { name: string } | null;
}

interface Props {
  onOpenStore: (store: StoreOption) => void;
  onGoRecord: (store: StoreOption) => void;
  onGoOrders?: (store: StoreOption) => void;
}

export function MarketerStores({ onOpenStore, onGoRecord, onGoOrders }: Props) {
  const { user, role, profile } = useAuth();
  const qc = useQueryClient();
  const { canAccessRoute, loading: loadingRouteAccess } = useRouteAccess(user?.id, role);
  const [query, setQuery] = useState("");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showCreateStore, setShowCreateStore] = useState(false);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-marketer-stores", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select(
          "id, name, display_id, photo_url, outstanding, address, phone, lat, lng, route_id, is_active, store_type_id, customer_id, last_activity_at, customers(id, name, phone), store_types(id, name), routes(name)"
        )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;

      return (data as unknown as StoreListItem[]) || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: routes } = useQuery({
    queryKey: ["mobile-marketer-routes"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true).order("name");
      return (data as RouteItem[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["mobile-marketer-store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return (data as StoreTypeItem[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (stores || []).filter((store) => {
    const matchAccess = canAccessRoute(store.route_id);
    const q = query.toLowerCase();
    const matchSearch =
      !q ||
      store.name?.toLowerCase().includes(q) ||
      store.customers?.name?.toLowerCase().includes(q) ||
      store.address?.toLowerCase().includes(q) ||
      store.display_id?.toLowerCase().includes(q);
    const matchRoute = filterRoute === "all" || store.route_id === filterRoute;
    const matchType = filterType === "all" || store.store_types?.id === filterType;
    return matchAccess && matchSearch && matchRoute && matchType;
  });

  const accessibleRoutes = (routes || []).filter((route) => canAccessRoute(route.id));

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleNavigate = (store: StoreListItem) => {
    if (store.lat && store.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
    } else if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">My Stores</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{(profile?.full_name ?? "Marketer").split(" ")[0]} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 pb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stores, customers..."
            className="pl-9 pr-9 h-10 rounded-xl border-slate-100 dark:border-slate-700"
          />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
              <X className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={filterRoute} onValueChange={setFilterRoute}>
            <SelectTrigger className="h-8 text-xs rounded-xl border-slate-100 dark:border-slate-700 flex-1">
              <SelectValue placeholder="All Routes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {accessibleRoutes.map((route) => (
                <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs rounded-xl border-slate-100 dark:border-slate-700 flex-1">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(storeTypes || []).map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">All Stores</p>
        {isLoading || loadingRouteAccess ? (
          <div className="flex justify-center items-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-400">Loading stores...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No stores found</p>
            <p className="text-xs text-slate-400 mt-1">Stores will appear here once assigned.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((store) => {
              const phone = store.phone || store.customers?.phone;
              const storeOption: StoreOption = {
                id: store.id,
                name: store.name,
                display_id: store.display_id,
                photo_url: store.photo_url || null,
                outstanding: Number(store.outstanding || 0),
                store_type_id: store.store_type_id,
                customer_id: store.customer_id,
                lat: store.lat,
                lng: store.lng,
                address: store.address,
                phone: store.phone,
                route_id: store.route_id,
                is_active: store.is_active,
                last_activity_at: store.last_activity_at,
                customers: store.customers,
                store_types: store.store_types,
                routes: store.routes,
              };

              const actions: StoreCardAction[] = [
                ...(onGoOrders
                  ? [
                      {
                        id: "order",
                        label: "Order",
                        icon: ClipboardList,
                        onClick: () => onGoOrders(storeOption),
                        className:
                          "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
                      } as StoreCardAction,
                    ]
                  : []),
                {
                  id: "transaction",
                  label: "Transaction",
                  icon: Wallet,
                  onClick: () => onGoRecord(storeOption),
                  className:
                    "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
                },
                {
                  id: "navigate",
                  label: "Navigate",
                  icon: Navigation2,
                  onClick: () => handleNavigate(store),
                  disabled: !store.lat && !store.lng && !store.address,
                  className:
                    "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800",
                },
                {
                  id: "call",
                  label: "Call",
                  icon: Phone,
                  onClick: () => phone && handleCall(phone),
                  disabled: !phone,
                  className:
                    "bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800",
                },
              ];

              return (
                <StoreCard
                  key={store.id}
                  store={store}
                  onOpenStore={() => onOpenStore(storeOption)}
                  actions={actions}
                />
              );
            })}
          </div>
        )}
      </div>

      <button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
        onClick={() => setShowCreateStore(true)}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateStoreWizard
        open={showCreateStore}
        onOpenChange={setShowCreateStore}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["mobile-marketer-stores"] });
          setShowCreateStore(false);
        }}
      />
    </div>
  );
}
