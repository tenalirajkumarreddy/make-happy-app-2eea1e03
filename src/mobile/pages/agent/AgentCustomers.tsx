import React, { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Navigation2, Plus, Loader2, MapPin, X, ShoppingCart, Wallet, CheckCircle2 } from "lucide-react";
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

interface Props {
  onOpenStore: (store: StoreOption) => void;
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
  onGoVisit: () => void;
}

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

export function AgentCustomers({ onOpenStore, onGoRecord, onGoVisit }: Props) {
  const { user, role, profile } = useAuth();
  const qc = useQueryClient();
  const { canAccessRoute, loading: loadingRouteAccess } = useRouteAccess(user?.id, role);
  const [query, setQuery] = useState("");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showCreateStore, setShowCreateStore] = useState(false);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-customers-stores", user?.id],
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
    queryKey: ["mobile-routes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true).order("name");
      return (data as RouteItem[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["mobile-store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return (data as StoreTypeItem[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (stores || []).filter((s) => {
    const matchAccess = canAccessRoute(s.route_id);
    const q = query.toLowerCase();
    const matchSearch =
      !q ||
      s.name?.toLowerCase().includes(q) ||
      s.customers?.name?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q) ||
      s.display_id?.toLowerCase().includes(q);
    const matchRoute = filterRoute === "all" || s.route_id === filterRoute;
    const matchType = filterType === "all" || s.store_types?.id === filterType;
    return matchAccess && matchSearch && matchRoute && matchType;
  });

  const accessibleRoutes = (routes || []).filter((route) => canAccessRoute(route.id));

  const handleCall = useCallback((phone: string) => {
    window.open(`tel:${phone}`, "_self");
  }, []);

  const handleNavigate = useCallback((s: StoreListItem) => {
    if (s.lat && s.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, "_blank");
    } else if (s.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`, "_blank");
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">My Stores</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{(profile?.full_name ?? "Agent").split(" ")[0]} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 pb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search store, customer, address..."
            className="pl-9 pr-9 h-12 rounded-xl"
          />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={filterRoute} onValueChange={setFilterRoute}>
            <SelectTrigger className="h-11 text-xs rounded-lg flex-1">
              <SelectValue placeholder="All Routes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {accessibleRoutes.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-11 text-xs rounded-lg flex-1">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(storeTypes || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading || loadingRouteAccess ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No stores found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const phone = s.phone || s.customers?.phone;
              const storeOption: StoreOption = {
                id: s.id,
                name: s.name,
                display_id: s.display_id,
                photo_url: s.photo_url || null,
                outstanding: Number(s.outstanding || 0),
                store_type_id: s.store_type_id,
                customer_id: s.customer_id,
                lat: s.lat,
                lng: s.lng,
                address: s.address,
                phone: s.phone,
                route_id: s.route_id,
                is_active: s.is_active,
                last_activity_at: s.last_activity_at,
                customers: s.customers,
                store_types: s.store_types,
                routes: s.routes,
              };
              const actions: StoreCardAction[] = [
                {
                  id: "sale",
                  label: "Sale",
                  icon: ShoppingCart,
                  onClick: () => onGoRecord(storeOption, "sale"),
                  className:
                    "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
                },
                {
                  id: "transaction",
                  label: "Transaction",
                  icon: Wallet,
                  onClick: () => onGoRecord(storeOption, "payment"),
                  className:
                    "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
                },
                {
                  id: "visit",
                  label: "Visit",
                  icon: CheckCircle2,
                  onClick: onGoVisit,
                  className:
                    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
                },
                {
                  id: "navigate",
                  label: "Navigate",
                  icon: Navigation2,
                  onClick: () => handleNavigate(s),
                  disabled: !s.lat && !s.lng && !s.address,
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
                  key={s.id}
                  store={s}
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
          qc.invalidateQueries({ queryKey: ["mobile-customers-stores"] });
          setShowCreateStore(false);
        }}
      />
    </div>
  );
}
