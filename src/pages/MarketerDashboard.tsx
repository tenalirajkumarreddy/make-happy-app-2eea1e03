import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ClipboardList, Banknote, Smartphone,
  Plus, History, HandCoins,
  ArrowRight, ShoppingCart, DollarSign,
  WifiOff
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const MarketerDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["marketer-crm-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        ordersRes, txnRes, customersRes, storesRes,
        handoversRes, recentOrdersRes, recentTxnsRes,
        allOrdersRes, lastWeekTxnsRes, flaggedStoresRes
      ] = await Promise.all([
        supabase.from("orders").select("id, status, total_amount").eq("created_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount, total_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("customers").select("id, created_at").eq("is_active", true),
        supabase.from("stores").select("id, outstanding").eq("created_by", user!.id),
        supabase.from("handovers").select("cash_amount, upi_amount, status, handover_date").eq("user_id", user!.id).order("handover_date", { ascending: false }).limit(10),
        supabase.from("orders").select("id, display_id, status, created_at, total_amount, stores(name), customers(name)").eq("created_by", user!.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("transactions").select("id, total_amount, created_at, stores(name)").eq("recorded_by", user!.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select("id, status, total_amount").eq("created_by", user!.id).gte("created_at", sevenDaysAgo + "T00:00:00"),
        supabase.from("transactions").select("total_amount").eq("recorded_by", user!.id).gte("created_at", thirtyDaysAgo + "T00:00:00"),
        supabase.from("stores").select("id, name, outstanding, customers(name)").eq("created_by", user!.id).order("outstanding", { ascending: false }).limit(5),
      ]);

      const orders: any[] = ordersRes.data || [];
      const todayTxns: any[] = txnRes.data || [];
      const customers: any[] = customersRes.data || [];
      const allStores: any[] = storesRes.data || [];
      const handovers: any[] = handoversRes.data || [];
      const flaggedStores: any[] = flaggedStoresRes.data || [];
      const weekOrders: any[] = allOrdersRes.data || [];
      const monthTxns: any[] = lastWeekTxnsRes.data || [];

      const pendingHandover = handovers
        .filter((h) => h.status === "pending" || h.status === "awaiting_confirmation")
        .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

      const pipeline = {
        pending: weekOrders.filter((o) => o.status === "pending").length,
        confirmed: weekOrders.filter((o) => o.status === "confirmed").length,
        fulfilled: weekOrders.filter((o) => o.status === "fulfilled").length,
      };
      const pipelineValue = {
        pending: weekOrders.filter((o) => o.status === "pending").reduce((s, o) => s + Number(o.total_amount || 0), 0),
        confirmed: weekOrders.filter((o) => o.status === "confirmed").reduce((s, o) => s + Number(o.total_amount || 0), 0),
        fulfilled: weekOrders.filter((o) => o.status === "fulfilled").reduce((s, o) => s + Number(o.total_amount || 0), 0),
      };

      const monthlyCollection = monthTxns.reduce((s, t) => s + Number(t.total_amount), 0);
      const customersThisMonth = customers.filter((c) => {
        const d = new Date(c.created_at);
        return d >= new Date(thirtyDaysAgo);
      }).length;

      const recentActivity = [
        ...(recentOrdersRes.data || []).map((order: any) => ({
          id: `order-${order.id}`,
          title: `Order ${order.display_id || ""}`.trim(),
          subtitle: order.stores?.name || order.customers?.name || "—",
          created_at: order.created_at, meta: order.status,
        })),
        ...(recentTxnsRes.data || []).map((txn: any) => ({
          id: `txn-${txn.id}`,
          title: "Payment recorded",
          subtitle: txn.stores?.name || "—",
          created_at: txn.created_at,
          meta: `₹${Number(txn.total_amount).toLocaleString()}`,
        })),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      return {
        customerCount: customers.length,
        customersThisMonth,
        totalOrders: orders.length,
        pendingOrders: pipeline.pending,
        todayCash: todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0),
        storeCount: allStores.length,
        totalOutstanding: allStores.reduce((s, st) => s + Number(st.outstanding), 0),
        pendingHandover,
        recentHandover: handovers[0] || null,
        recentActivity,
        pipeline,
        pipelineValue,
        monthlyCollection,
        flaggedStores,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats ?? {
    customerCount: 0, customersThisMonth: 0,
    totalOrders: 0, pendingOrders: 0,
    todayCash: 0, todayUpi: 0,
    storeCount: 0, totalOutstanding: 0,
    pendingHandover: 0, recentHandover: null,
    recentActivity: [],
    pipeline: { pending: 0, confirmed: 0, fulfilled: 0 },
    pipelineValue: { pending: 0, confirmed: 0, fulfilled: 0 },
    monthlyCollection: 0,
    flaggedStores: [],
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome, ${profile?.full_name || "Marketer"}! Customer relationships, orders & collections.`}
      />

      {!isOnline && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You are offline. Some features may be unavailable.</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} change={`+${s.customersThisMonth} this month`} changeType="positive" icon={Users} iconColor="primary" />
        <StatCard title="Total Orders" value={String(s.totalOrders)} icon={ClipboardList} iconColor="info" />
        <StatCard title="Pending" value={String(s.pendingOrders)} change={s.pendingOrders > 0 ? "Needs action" : "All clear"} changeType={s.pendingOrders > 0 ? "negative" : "positive"} icon={ShoppingCart} iconColor={s.pendingOrders > 0 ? "destructive" : "success"} />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="warning" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="success" />
        <StatCard title="Outstanding" value={`₹${s.totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor={s.totalOutstanding > 0 ? "destructive" : "info"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Order Pipeline</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your orders this week</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
              View all <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Pending", count: s.pipeline.pending, value: s.pipelineValue.pending, color: "bg-amber-500" },
                { label: "Confirmed", count: s.pipeline.confirmed, value: s.pipelineValue.confirmed, color: "bg-blue-500" },
                { label: "Fulfilled", count: s.pipeline.fulfilled, value: s.pipelineValue.fulfilled, color: "bg-emerald-500" },
              ].map((stage) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-muted-foreground">{stage.count} orders · {formatCurrency(stage.value)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" onClick={() => navigate("/orders")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create New Order
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Collection Performance</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Top outstanding customers</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")}>
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
          </CardHeader>
          <CardContent>
            {s.flaggedStores.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No outstanding balances</p>
            ) : (
              <div className="space-y-2">
                {s.flaggedStores.map((store: any) => (
                  <div key={store.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{store.name}</p>
                      <p className="text-xs text-muted-foreground">{store.customers?.name || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-destructive">
                        ₹{Number(store.outstanding).toLocaleString()}
                      </span>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/transactions")}>
                        Collect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {s.monthlyCollection > 0 && (
              <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs text-muted-foreground">30-day collection total</p>
                <p className="text-lg font-bold">{formatCurrency(s.monthlyCollection)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follow-ups & Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {s.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity. Create an order or record a payment to get started.</p>
            ) : (
              <div className="space-y-3">
                {s.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.subtitle}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-xs capitalize">{activity.meta}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(activity.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Handover Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending handover</p>
                <p className="mt-2 text-2xl font-bold">₹{s.pendingHandover.toLocaleString()}</p>
              </div>
              {s.recentHandover ? (
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Last handover</p>
                  <p className="mt-1 font-medium">{formatDate(s.recentHandover.handover_date)}</p>
                  <Badge variant="outline" className="mt-1 capitalize">
                    {String(s.recentHandover.status).split("_").join(" ")}
                  </Badge>
                </div>
              ) : (
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground text-center">No handovers yet</p>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => navigate("/handovers")}>
                <HandCoins className="h-4 w-4 mr-1.5" />
                Review Handover
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MarketerDashboard;
