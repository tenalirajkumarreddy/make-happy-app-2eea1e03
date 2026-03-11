import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Banknote, Smartphone, MapPin, HandCoins, AlertCircle, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { QuickActionDrawer } from "@/components/agent/QuickActionDrawer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";

const AgentDashboard = () => {
  const { user, profile } = useAuth();
  const { isOnline, pendingCount, syncing, syncQueue } = useOnlineStatus();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["agent-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [salesRes, txnRes, visitsRes, ordersRes, allSalesRes, allTxnsRes, confirmedHandoversRes, todayHandoverRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("store_visits").select("id, stores(name)").gte("visited_at", today + "T00:00:00"),
        supabase.from("orders").select("id, display_id, stores(name), created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
        supabase.from("sales").select("cash_amount, upi_amount").eq("recorded_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount").eq("recorded_by", user!.id),
        supabase.from("handovers").select("cash_amount, upi_amount").eq("user_id", user!.id).eq("status", "confirmed"),
        supabase.from("handovers").select("cash_amount, upi_amount, status").eq("user_id", user!.id).eq("handover_date", today).maybeSingle(),
      ]);

      const todaySales = salesRes.data || [];
      const todayTxns = txnRes.data || [];

      const totalSale = todaySales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = todaySales.reduce((s, r) => s + Number(r.cash_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = todaySales.reduce((s, r) => s + Number(r.upi_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0);

      const allTimeCash = (allSalesRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0) + (allTxnsRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0);
      const allTimeUpi = (allSalesRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0) + (allTxnsRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0);
      const confirmedCash = (confirmedHandoversRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0);
      const confirmedUpi = (confirmedHandoversRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0);

      const todayHandover = todayHandoverRes.data;
      const todayConfirmed = todayHandover?.status === "confirmed" ? Number(todayHandover.cash_amount) + Number(todayHandover.upi_amount) : 0;
      const todayHandoverable = Math.max(0, totalCash + totalUpi - todayConfirmed);
      const totalPendingHandoverable = Math.max(0, allTimeCash + allTimeUpi - confirmedCash - confirmedUpi);

      return {
        storesCovered: visitsRes.data?.length || 0,
        totalSale,
        totalCash,
        totalUpi,
        todayHandoverable,
        totalPendingHandoverable,
        pendingOrders: ordersRes.data || [],
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${profile?.full_name || "Agent"}! Here's your daily summary.`} />

      {/* Offline / pending sync banner */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${!isOnline ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/30 bg-warning/5 text-warning"}`}>
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              {!isOnline
                ? `You're offline${pendingCount > 0 ? ` — ${pendingCount} action${pendingCount > 1 ? "s" : ""} queued` : ""}`
                : `${pendingCount} action${pendingCount > 1 ? "s" : ""} pending sync`}
            </span>
          </div>
          {isOnline && pendingCount > 0 && (
            <Button size="sm" variant="outline" onClick={syncQueue} disabled={syncing} className="h-7 gap-1.5 text-xs shrink-0">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync Now
            </Button>
          )}
        </div>
      )}

      {/* Quick Action Button - Floating */}
      <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
        <QuickActionDrawer />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Stores Covered" value={String(s.storesCovered)} icon={MapPin} iconColor="bg-primary" />
        <StatCard title="Sales Recorded" value={`₹${s.totalSale.toLocaleString()}`} icon={ShoppingCart} iconColor="bg-success" />
        <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="bg-info" />
        <StatCard title="Today's Handoverable" value={`₹${s.todayHandoverable.toLocaleString()}`} icon={HandCoins} iconColor="bg-orange-500" />
        <StatCard title="Pending Handover" value={`₹${s.totalPendingHandoverable.toLocaleString()}`} icon={AlertCircle} iconColor="bg-destructive" />
      </div>

      {/* Route session — next store navigation */}
      <RouteSessionPanel />

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Pending Orders</h3>
        {s.pendingOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending orders</p>
        ) : (
          <div className="space-y-3">
            {s.pendingOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{order.stores?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.display_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-warning">Pending</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("en-IN")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentDashboard;
