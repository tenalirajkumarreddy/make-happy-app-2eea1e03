import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Phone, Navigation2, TrendingUp, Store, ShoppingCart, 
  Banknote, Wallet, ArrowRight, CheckCircle2, Package, Plus, 
  Route, Clock, Users, Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatDateLong } from "@/lib/utils";
import { toast } from "sonner";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { addToQueue } from "@/lib/offlineQueue";
import { Card, CardContent } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { QuickAction, QuickActionsGrid } from "../../components/ui/QuickAction";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";

interface Props {
  onOpenStore?: (store: StoreOption) => void;
  onGoRecord?: (store: StoreOption, action: "sale" | "payment") => void;
  onGoProducts?: () => void;
  onOpenAddEntity?: () => void;
  onGoRoutes?: () => void;
}

interface StoreOption {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  outstanding: number;
  customer_id: string | null;
  route_id: string | null;
  customers?: { name: string } | null;
}

interface RouteStoreLite {
  id: string;
  name: string;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  outstanding: number;
  store_order: number | null;
  route_id: string | null;
  store_type_id: string | null;
  customer_id: string | null;
  display_id: string;
  is_active: boolean;
  customers: { name: string } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AgentHome({ onOpenStore, onGoRecord, onGoProducts, onOpenAddEntity, onGoRoutes }: Props = {}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Navigation handlers
  const handleOpenStore = (store: StoreOption) => {
    if (onOpenStore) {
      onOpenStore(store);
    } else {
      navigate(`/agent/stores/${store.id}`);
    }
  };

  const handleGoRecord = (store: StoreOption, action: "sale" | "payment") => {
    if (onGoRecord) {
      onGoRecord(store, action);
    } else {
      navigate(`/agent/record/${store.id}?mode=${action}`);
    }
  };

  const handleGoProducts = () => {
    if (onGoProducts) {
      onGoProducts();
    } else {
      navigate("/agent/products");
    }
  };

  const handleOpenAddEntity = () => {
    if (onOpenAddEntity) {
      onOpenAddEntity();
    } else {
      navigate("/agent/customers?add=true");
    }
  };

  const handleGoRoutes = () => {
    if (onGoRoutes) {
      onGoRoutes();
    } else {
      navigate("/agent/routes");
    }
  };

  useEffect(() => {
    getCurrentPosition().then(pos => {
      if (pos) setCurrentPosition({ lat: pos.lat, lng: pos.lng });
      else setCurrentPosition(null);
    }).catch((error) => {
      console.error("Failed to get current position:", error);
      setCurrentPosition(null);
    });
  }, []);

  // Today's sales data
  const { data: salesData } = useQuery({
    queryKey: ["mobile-v2-agent-sales-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("total_amount, cash_amount, upi_amount")
        .eq("recorded_by", user!.id)
        .gte("created_at", today);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Today's transactions data
  const { data: txData } = useQuery({
    queryKey: ["mobile-v2-agent-tx-today", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("total_amount, cash_amount, upi_amount")
        .eq("recorded_by", user!.id)
        .gte("created_at", today);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Visit count
  const { data: visitCount } = useQuery({
    queryKey: ["mobile-v2-agent-visits-today", user?.id, today],
    queryFn: async () => {
      const { count } = await supabase
        .from("store_visits")
        .select("id", { count: "exact", head: true })
        .gte("visited_at", today);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Active session
  const { data: activeSession, isLoading: sessionLoading } = useQuery({
    queryKey: ["mobile-v2-active-session", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, display_id, photo_url, address, lat, lng, store_order, phone, outstanding, route_id, store_type_id, customer_id, customers(name), store_types(name), routes(name)))")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data || null;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Visited stores in session
  const { data: visits } = useQuery({
    queryKey: ["mobile-v2-session-visits", activeSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .eq("session_id", activeSession!.id);
      return new Set((data || []).map((visit) => visit.store_id));
    },
    enabled: !!activeSession,
  });

  // Pending orders
  const { data: pendingOrders } = useQuery({
    queryKey: ["mobile-v2-pending-orders", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, display_id, notes, stores(name), customers(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Calculations
  const totalSales = useMemo(() => 
    (salesData || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0), 
    [salesData]
  );

  const totalCollected = useMemo(() => 
    (txData || []).reduce((sum, row) => sum + Number(row.cash_amount || 0) + Number(row.upi_amount || 0), 0), 
    [txData]
  );

  const routeStores = useMemo(() => {
    if (!activeSession?.routes?.stores) return [];
    return [...activeSession.routes.stores]
      .filter(s => s.is_active !== false)
      .sort((a, b) => (a.store_order ?? 999) - (b.store_order ?? 999));
  }, [activeSession]);

  const sortedByDistance = useMemo(() => {
    if (!currentPosition) return routeStores;
    return [...routeStores].sort((a, b) => {
      if (!a.lat || !a.lng) return 1;
      if (!b.lat || !b.lng) return -1;
      const distA = haversineKm(currentPosition.lat, currentPosition.lng, a.lat, a.lng);
      const distB = haversineKm(currentPosition.lat, currentPosition.lng, b.lat, b.lng);
      return distA - distB;
    });
  }, [routeStores, currentPosition]);

  const firstName = (profile?.full_name ?? "Agent").split(" ")[0];
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Hero Section */}
        <div className="mv2-hero">
          <p className="mv2-hero-label">{greeting},</p>
          <h1 className="mv2-hero-title">{firstName} 👋</h1>
          <p className="mv2-hero-subtitle mt-1">
            {formatDateLong(new Date())}
          </p>
        </div>

        {/* Stats Cards - Pull up */}
        <div className="mv2-pull-up px-1">
          <div className="mv2-grid mv2-grid-cols-2 mv2-gap-3">
            <StatCard 
              label="Today's Sales" 
              value={`₹${totalSales.toLocaleString("en-IN")}`}
              icon={TrendingUp}
            />
            <StatCard 
              label="Collected" 
              value={`₹${totalCollected.toLocaleString("en-IN")}`}
              icon={Wallet}
            />
            <StatCard 
              label="Stores Visited" 
              value={visitCount ?? 0}
              icon={Store}
            />
            <StatCard 
              label="Pending Orders" 
              value={pendingOrders?.length ?? 0}
              icon={ShoppingCart}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <Section title="Quick Actions" className="mt-6">
          <QuickActionsGrid columns={4}>
            <QuickAction 
              label="View Routes" 
              icon={Route} 
              onClick={handleGoRoutes}
            />
            <QuickAction 
              label="Products" 
              icon={Package} 
              onClick={handleGoProducts}
            />
            <QuickAction 
              label="Add Store" 
              icon={Plus} 
              onClick={handleOpenAddEntity}
            />
            <QuickAction 
              label="Customers" 
              icon={Users} 
              onClick={() => navigate("/agent/customers")}
            />
          </QuickActionsGrid>
        </Section>

        {/* Active Route Session */}
        {sessionLoading ? (
          <LoadingCenter className="mt-6" />
        ) : activeSession ? (
          <Section 
            title="Active Route" 
            action={{ label: "View All", onClick: handleGoRoutes }}
            className="mt-6"
          >
            <Card className="mb-3" padding="md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{activeSession.routes?.name || "Route"}</p>
                  <p className="text-xs mv2-text-muted mt-0.5">
                    {visits?.size ?? 0} of {routeStores.length} stores visited
                  </p>
                </div>
                <Badge variant={visits?.size === routeStores.length ? "success" : "warning"}>
                  {Math.round(((visits?.size ?? 0) / Math.max(routeStores.length, 1)) * 100)}%
                </Badge>
              </div>
              {/* Progress bar */}
              <div className="mv2-progress mt-3">
                <div 
                  className="mv2-progress-bar" 
                  style={{ width: `${((visits?.size ?? 0) / Math.max(routeStores.length, 1)) * 100}%` }}
                />
              </div>
            </Card>

            {/* Nearest Stores */}
            <div className="mv2-list">
              {sortedByDistance.slice(0, 3).map((store) => {
                const isVisited = visits?.has(store.id);
                const distance = currentPosition && store.lat && store.lng
                  ? haversineKm(currentPosition.lat, currentPosition.lng, store.lat, store.lng)
                  : null;

                return (
                  <ListItem
                    key={store.id}
                    title={store.name}
                    subtitle={store.customers?.name || store.address || "No address"}
                    meta={distance ? `${distance.toFixed(1)} km away` : undefined}
                    icon={isVisited ? CheckCircle2 : Store}
                    iconBgClass={isVisited ? "!bg-green-100 !text-green-600 dark:!bg-green-900/30 dark:!text-green-400" : undefined}
                    badge={
                      store.outstanding > 0 ? (
                        <Badge variant="warning">₹{store.outstanding.toLocaleString("en-IN")}</Badge>
                      ) : undefined
                    }
                    onClick={() => handleOpenStore({
                      id: store.id,
                      name: store.name,
                      display_id: store.display_id,
                      photo_url: store.photo_url,
                      address: store.address,
                      lat: store.lat,
                      lng: store.lng,
                      phone: store.phone,
                      outstanding: store.outstanding,
                      customer_id: store.customer_id,
                      route_id: store.route_id,
                      customers: store.customers,
                    })}
                  />
                );
              })}
            </div>
          </Section>
        ) : (
          <Section title="Route Session" className="mt-6">
            <Card padding="lg">
              <EmptyState
                icon={Route}
                title="No Active Route"
                description="Start a route session to begin visiting stores on your assigned route."
                action={{
                  label: "View Routes",
                  onClick: handleGoRoutes,
                }}
              />
            </Card>
          </Section>
        )}

        {/* Pending Orders */}
        {(pendingOrders?.length ?? 0) > 0 && (
          <Section 
            title="Pending Orders" 
            action={{ label: "View All", onClick: () => navigate("/agent/orders") }}
            className="mt-6"
          >
            <div className="mv2-list">
              {pendingOrders?.slice(0, 3).map((order) => (
                <ListItem
                  key={order.id}
                  title={order.display_id || "Order"}
                  subtitle={order.stores?.name || order.customers?.name || "Unknown store"}
                  meta={order.notes || undefined}
                  icon={ShoppingCart}
                  badge={<Badge variant="warning">Pending</Badge>}
                  onClick={() => {}}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
