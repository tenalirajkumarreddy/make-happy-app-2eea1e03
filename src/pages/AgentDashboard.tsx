import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Store, ShoppingCart, Banknote, Smartphone, MapPin, Clock } from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { QuickActionDrawer } from "@/components/agent/QuickActionDrawer";

const AgentDashboard = () => {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["agent-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [salesRes, txnRes, visitsRes, ordersRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("store_visits").select("id, stores(name)").gte("visited_at", today + "T00:00:00"),
        supabase.from("orders").select("id, display_id, stores(name), created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
      ]);

      const todaySales = salesRes.data || [];
      const todayTxns = txnRes.data || [];

      const totalSale = todaySales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = todaySales.reduce((s, r) => s + Number(r.cash_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = todaySales.reduce((s, r) => s + Number(r.upi_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0);

      return {
        storesCovered: visitsRes.data?.length || 0,
        totalSale,
        totalCash,
        totalUpi,
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

      {/* Quick Action Button - Floating */}
      <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
        <QuickActionDrawer />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Stores Covered" value={String(s.storesCovered)} icon={MapPin} iconColor="bg-primary" />
        <StatCard title="Sales Recorded" value={`₹${s.totalSale.toLocaleString()}`} icon={ShoppingCart} iconColor="bg-success" />
        <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="bg-info" />
      </div>

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
