import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, Banknote, Smartphone, Plus, ReceiptIndianRupee, History, HandCoins, ArrowRight } from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";

const MarketerDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["marketer-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [ordersRes, txnRes, customersRes, storesRes, handoversRes, recentOrdersRes, recentTxnsRes] = await Promise.all([
        supabase.from("orders").select("id, status").eq("created_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("customers").select("id").eq("is_active", true),
        supabase.from("stores").select("id").eq("created_by", user!.id),
        supabase.from("handovers").select("cash_amount, upi_amount, status, handover_date").eq("user_id", user!.id).order("handover_date", { ascending: false }).limit(10),
        supabase.from("orders").select("id, display_id, status, created_at, stores(name)").eq("created_by", user!.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("transactions").select("id, total_amount, created_at, stores(name)").eq("recorded_by", user!.id).order("created_at", { ascending: false }).limit(5),
      ]);

      const orders = ordersRes.data || [];
      const todayTxns = txnRes.data || [];
      const handovers = handoversRes.data || [];
      const pendingHandover = handovers
        .filter((handover) => handover.status === "pending" || handover.status === "awaiting_confirmation")
        .reduce((sum, handover) => sum + Number(handover.cash_amount) + Number(handover.upi_amount), 0);
      const recentHandover = handovers[0] || null;
      const recentActivity = [
        ...(recentOrdersRes.data || []).map((order) => ({
          id: `order-${order.id}`,
          kind: "order" as const,
          title: `Order ${order.display_id || ""}`.trim(),
          subtitle: order.stores?.name || "Store not available",
          created_at: order.created_at,
          meta: order.status,
        })),
        ...(recentTxnsRes.data || []).map((txn) => ({
          id: `txn-${txn.id}`,
          kind: "payment" as const,
          title: `Payment recorded`,
          subtitle: txn.stores?.name || "Store not available",
          created_at: txn.created_at,
          meta: `₹${Number(txn.total_amount).toLocaleString()}`,
        })),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      return {
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
        todayCash: todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0),
        customerCount: customersRes.data?.length || 0,
        storeCount: storesRes.data?.length || 0,
        pendingHandover,
        recentHandover,
        recentActivity,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome, ${profile?.full_name || "Marketer"}! Focus on collections, relationship follow-ups, and new orders.`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} icon={Users} iconColor="primary" />
        <StatCard title="My Orders" value={String(s.totalOrders)} change={`${s.pendingOrders} pending`} changeType={s.pendingOrders > 0 ? "negative" : "positive"} icon={ClipboardList} iconColor="info" />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="warning" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold">Quick Actions</h3>
              <p className="text-xs text-muted-foreground mt-1">Jump straight into the workflows marketers use most.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="gap-1.5">
              View all
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/customers")}>
              <Plus className="h-5 w-5" />
              Add Customer
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/orders")}>
              <ClipboardList className="h-5 w-5" />
              Create Order
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/transactions")}>
              <ReceiptIndianRupee className="h-5 w-5" />
              Record Payment
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/handovers")}>
              <HandCoins className="h-5 w-5" />
              Review Handover
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Handover Status</h3>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending handover</p>
              <p className="mt-2 text-2xl font-bold">₹{s.pendingHandover.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last handover</p>
              {s.recentHandover ? (
                <>
                  <p className="mt-2 font-medium">{formatDate(s.recentHandover.handover_date)}</p>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">{String(s.recentHandover.status).replaceAll("_", " ")}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No handovers yet.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Stores added</p>
                <p className="mt-1 font-semibold">{s.storeCount}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Pending orders</p>
                <p className="mt-1 font-semibold">{s.pendingOrders}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <p className="text-xs text-muted-foreground mt-1">A quick look at your latest field work.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")} className="gap-1.5">
            <History className="h-4 w-4" />
            History
          </Button>
        </div>
        {s.recentActivity.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity yet for today. Start by creating an order or recording a payment.</p>
        ) : (
          <div className="space-y-3">
            {s.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{activity.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{activity.subtitle}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium capitalize">{activity.meta}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(activity.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketerDashboard;
