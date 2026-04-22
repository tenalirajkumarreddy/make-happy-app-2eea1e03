import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Phone, Navigation2, TrendingUp, Store, ShoppingCart,
  Banknote, Wallet, ArrowRight, CheckCircle2, Package, Plus,
  Route, Clock, Users, Eye, Receipt, CreditCard, Smartphone,
  ChevronRight, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatDateLong } from "@/lib/utils";
import { toast } from "sonner";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { Card, CardContent } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { QuickAction, QuickActionsGrid } from "../../components/ui/QuickAction";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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

  // Get agent stats
  const { data: agentStats, isLoading: statsLoading } = useQuery({
    queryKey: ["mobile-v2-agent-stats", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return null;

      const [
        salesRes,
        transactionsRes,
        visitsRes,
        staffStockRes,
        pendingOrdersRes,
      ] = await Promise.all([
        // Today's sales
        supabase
          .from("sales")
          .select("total_amount, cash_amount, upi_amount, payment_type")
          .eq("recorded_by", user.id)
          .gte("created_at", today + "T00:00:00"),
        // Today's transactions
        supabase
          .from("transactions")
          .select("total_amount, cash_amount, upi_amount, transaction_type")
          .eq("recorded_by", user.id)
          .gte("created_at", today + "T00:00:00"),
        // Visits today
        supabase
          .from("store_visits")
          .select("id, store_id, stores(name)")
          .eq("visited_by", user.id)
          .gte("visited_at", today + "T00:00:00"),
        // Current stock
        supabase
          .from("staff_stock")
          .select("quantity, products(name)")
          .eq("user_id", user.id),
        // Pending orders
        supabase
          .from("orders")
          .select("id, display_id, notes, stores(name), customers(name), total_amount")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const sales = salesRes.data || [];
      const transactions = transactionsRes.data || [];
      const visits = visitsRes.data || [];
      const stock = staffStockRes.data || [];

      // Calculate totals
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0) +
        transactions.reduce((s, r) => s + Number(r.cash_amount || 0), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0) +
        transactions.reduce((s, r) => s + Number(r.upi_amount || 0), 0);
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalTransactions = transactions.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalOrders = sales.length + transactions.length;
      const completedOrders = sales.filter(s => s.payment_type).length;
      const totalStock = stock.reduce((s, r) => s + Number(r.quantity || 0), 0);

      return {
        totalCash,
        totalUpi,
        totalAmount: totalCash + totalUpi,
        totalOrders,
        completedOrders,
        visited: visits.length,
        totalStock,
        pendingOrders: pendingOrdersRes.data || [],
      };
    },
    enabled: !!user?.id,
  });

  // Get today's route
  const { data: todayRoute } = useQuery({
    queryKey: ["mobile-v2-today-route", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const today = new Date().toISOString().split("T")[0];
      
      const { data } = await supabase
        .from("route_sessions")
        .select("*, routes(name, stores(id, name, address, lat, lng, phone, outstanding, customers(name)))")
        .eq("agent_id", user.id)
        .eq("session_date", today)
        .eq("status", "active")
        .maybeSingle();
      
      return data;
    },
    enabled: !!user?.id,
  });

  // Calculate visited stores
  const { data: visitedStores } = useQuery({
    queryKey: ["mobile-v2-visited-stores", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("store_visits")
        .select("store_id")
        .eq("visited_by", user.id)
        .gte("visited_at", today + "T00:00:00");
      return (data || []).map(v => v.store_id);
    },
    enabled: !!user?.id,
  });

  // Get location
  useEffect(() => {
    getCurrentPosition().then((pos) => {
      if (pos) setCurrentPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }).catch(() => {});
  }, []);

  const firstName = (profile?.full_name ?? "Agent").split(" ")[0];
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  // Route stores
  const routeStores = useMemo(() => {
    if (!todayRoute?.routes?.stores) return [];
    return todayRoute.routes.stores.filter((s: any) => s.is_active !== false);
  }, [todayRoute]);

  const visitedCount = visitedStores?.length || 0;
  const totalRouteStores = routeStores.length;
  const progress = totalRouteStores > 0 ? (visitedCount / totalRouteStores) * 100 : 0;

  const s = agentStats;

  return (
    <div className="mv2-page">
      <div className="mv2-page-content pb-24">
        {/* Hero Section */}
        <div className="mv2-hero">
          <p className="mv2-hero-label">{greeting},</p>
          <h1 className="mv2-hero-title">{firstName} 👋</h1>
          <p className="mv2-hero-subtitle mt-1">
            {formatDateLong(new Date())}
          </p>
        </div>

        {/* Cash Stats - 3 cards in a row */}
        <div className="mv2-pull-up px-1">
          <Section title="Today's Collections" className="mb-2">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Cash"
                value={`₹${(s?.totalCash || 0).toLocaleString("en-IN")}`}
                icon={Banknote}
                variant="success"
                className="text-xs"
              />
              <StatCard
                label="UPI"
                value={`₹${(s?.totalUpi || 0).toLocaleString("en-IN")}`}
                icon={Smartphone}
                variant="info"
                className="text-xs"
              />
              <StatCard
                label="Total"
                value={`₹${(s?.totalAmount || 0).toLocaleString("en-IN")}`}
                icon={Wallet}
                variant="primary"
                className="text-xs"
              />
            </div>
          </Section>

          {/* Order Stats - 3 cards in a row */}
          <Section title="Orders" className="mb-2">
            <div className="grid grid-cols-3 gap-2">
              <div 
                onClick={() => navigate("/sales")}
                className="cursor-pointer"
              >
                <StatCard
                  label="Total"
                  value={String(s?.totalOrders || 0)}
                  icon={ShoppingCart}
                  variant="default"
                  className="text-xs"
                />
              </div>
              <StatCard
                label="Completed"
                value={String(s?.completedOrders || 0)}
                icon={CheckCircle2}
                variant="success"
                className="text-xs"
              />
              <StatCard
                label="Visited"
                value={`${visitedCount}/${totalRouteStores}`}
                icon={Store}
                variant={visitedCount === totalRouteStores ? "success" : "warning"}
                className="text-xs"
              />
            </div>
          </Section>

          {/* Stock Stats */}
          <Section title="Stock" className="mb-2">
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Current Stock"
                value={String(s?.totalStock || 0)}
                icon={Package}
                variant="default"
              />
              <StatCard
                label="Sold Today"
                value={String(s?.totalOrders || 0)}
                icon={TrendingUp}
                variant="success"
              />
            </div>
          </Section>
        </div>

        {/* Quick Actions */}
        <Section title="Quick Actions" className="mt-4">
          <QuickActionsGrid columns={4}>
            <QuickAction
              label="Record Sale"
              icon={Receipt}
              href="/agent/record"
              variant="primary"
            />
            <QuickAction
              label="My Route"
              icon={Route}
              href="/agent/routes"
            />
            <QuickAction
              label="Stores"
              icon={Store}
              href="/agent/stores"
            />
            <QuickAction
              label="History"
              icon={Clock}
              href="/agent/history"
            />
          </QuickActionsGrid>
        </Section>

        {/* Route Progress */}
        {todayRoute && (
          <Section title="Today's Route" className="mt-4">
            <Card className="p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">{todayRoute.routes?.name || "Today's Route"}</p>
                  <p className="text-xs text-muted-foreground">
                    {visitedCount} of {totalRouteStores} stores visited
                  </p>
                </div>
                <Badge variant={progress === 100 ? "success" : "default"}>
                  {Math.round(progress)}%
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
            </Card>

            {/* Next Store */}
            {routeStores.length > 0 && (
              <Card className="p-3 mb-3 bg-primary/5 border-primary/20">
                <p className="text-xs text-muted-foreground mb-2">Next Stop</p>
                {(() => {
                  const nextStore = routeStores.find((s: any) => !visitedStores?.includes(s.id));
                  if (!nextStore) return (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Route completed!</span>
                    </div>
                  );
                  
                  const distance = currentPosition && nextStore.lat && nextStore.lng
                    ? haversineKm(currentPosition.lat, currentPosition.lng, nextStore.lat, nextStore.lng).toFixed(1)
                    : null;

                  return (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{nextStore.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {nextStore.address || "No address"}
                          {distance && ` • ${distance} km away`}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => navigate(`/agent/record/${nextStore.id}`)}>
                        Record
                      </Button>
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Store List */}
            {routeStores.length > 0 && (
              <div className="space-y-2">
                {routeStores.slice(0, 5).map((store: any) => {
                  const isVisited = visitedStores?.includes(store.id);
                  const distance = currentPosition && store.lat && store.lng
                    ? haversineKm(currentPosition.lat, currentPosition.lng, store.lat, store.lng).toFixed(1)
                    : null;

                  return (
                    <Card
                      key={store.id}
                      className={cn(
                        "p-3 flex items-center gap-3 cursor-pointer",
                        isVisited && "bg-green-50 dark:bg-green-900/20 border-green-200"
                      )}
                      onClick={() => handleOpenStore(store)}
                    >
                      {isVisited ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium truncate", isVisited && "text-green-700")}>
                          {store.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {distance && `${distance} km • `}
                          {store.customers?.name || "No customer"}
                        </p>
                      </div>
                      {store.outstanding > 0 && (
                        <Badge variant="warning" className="text-xs shrink-0">
                          ₹{store.outstanding.toLocaleString()}
                        </Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Card>
                  );
                })}
                {routeStores.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-sm" 
                    onClick={() => navigate("/agent/routes")}
                  >
                    View all {routeStores.length} stores
                  </Button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Pending Orders */}
        <Section title="Pending Orders" className="mt-4">
          {s?.pendingOrders && s.pendingOrders.length > 0 ? (
            <div className="space-y-2">
              {s.pendingOrders.slice(0, 3).map((order: any) => (
                <Card key={order.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {order.stores?.name || order.customers?.name || "Order"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.display_id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        ₹{(order.total_amount || 0).toLocaleString()}
                      </p>
                      <Badge variant="warning" className="text-xs">
                        Pending
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
              {s.pendingOrders.length > 3 && (
                <Button variant="ghost" className="w-full text-sm" onClick={() => navigate("/agent/orders")}>
                  View all {s.pendingOrders.length} orders
                </Button>
              )}
            </div>
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="No pending orders"
              description="You're all caught up!"
            />
          )}
        </Section>
      </div>
    </div>
  );
}
