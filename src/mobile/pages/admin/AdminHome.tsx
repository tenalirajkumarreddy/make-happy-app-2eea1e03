import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { usePermission } from "@/hooks/usePermission";
import {
  ShoppingCart, ClipboardList, TrendingUp, TrendingDown, Wallet,
  Users, Store, Package, ArrowRight, AlertCircle, Receipt, Loader2,
  BarChart3, Warehouse, Settings, CheckCircle2, XCircle, MapPin, Navigation
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DashboardStats {
  totalOrders: number;
  outstandingAmount: number;
  lowStockCount: number;
  todaySales: number;
  todayCash: number;
  todayUpi: number;
  salesCount: number;
}

export function AdminHome({
  role,
  onNavigate,
}: {
  role: "super_admin" | "manager";
  onNavigate: (path: string) => void;
}) {
  const { profile, user } = useAuth();
  const { currentWarehouse } = useWarehouse();

  const warehouseFilter = (role === "manager" && currentWarehouse?.id)
    ? (q: any) => q.eq("warehouse_id", currentWarehouse!.id)
    : (q: any) => q;

  const { allowed: canApproveExpenses } = usePermission("approve_expenses");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["mobile-admin-dashboard", currentWarehouse?.id, role],
    queryFn: async () => {
      // Use local date instead of UTC to avoid timezone issues
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const [todaySalesRes, storesRes, stockRes, ordersCountRes] = await Promise.all([
        warehouseFilter(supabase.from("sales").select("total_amount, cash_amount, upi_amount"))
          .is("deleted_at", null)
          .eq("is_fully_returned", false)
          .gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
        warehouseFilter(supabase.from("stores").select("outstanding")),
        warehouseFilter(supabase.from("product_stock").select("quantity, reorder_level")),
        warehouseFilter(supabase.from("orders").select("*", { count: "exact", head: true })).eq("status", "pending"),
      ]);
      const td = todaySalesRes.data || [];
      return {
        totalOrders: ordersCountRes.count || 0,
        outstandingAmount: (storesRes.data || []).reduce((s, r) => s + (r.outstanding || 0), 0),
        lowStockCount: (stockRes.data || []).filter(i => i.quantity <= i.reorder_level).length,
        todaySales: td.reduce((s, r) => s + (r.total_amount || 0), 0),
        todayCash: td.reduce((s, r) => s + (r.cash_amount || 0), 0),
        todayUpi: td.reduce((s, r) => s + (r.upi_amount || 0), 0),
        salesCount: td.length,
      } as DashboardStats;
    },
});

  const { data: recentActivity } = useQuery({
    queryKey: ["mobile-recent-activity", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await warehouseFilter(supabase.from("sales"))
        .select("id, display_id, total_amount, created_at, stores(id, name)")
        .is("deleted_at", null)
        .eq("is_fully_returned", false)
        .order("created_at", { ascending: false }).limit(5);
      return (data || []).map(s => ({
        id: s.id, displayId: s.display_id, amount: s.total_amount,
        store: s.stores?.name ?? null, date: s.created_at,
      }));
    },
});

  const { data: pendingExpenses = [] } = useQuery({
    queryKey: ["mobile-pending-expense-widget", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase
        .from("expense_claims")
        .select("id, display_id, amount, description, status, created_at, bill_urls, expense_categories(name, color), profiles(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      // Apply warehouse filter for managers
      if (role === "manager" && currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }
      const { data } = await query;
      return data || [];
    },
  });

  const { data: routeSessions = [] } = useQuery({
    queryKey: ["mobile-admin-route-sessions", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase
        .from("route_sessions")
        .select("id, status, started_at, ended_at, routes(name), profiles(full_name)")
        .order("started_at", { ascending: false })
        .limit(3);
      const { data } = await query;
      return data || [];
    },
  });

  const { data: opsMetrics } = useQuery({
    queryKey: ["mobile-admin-ops", currentWarehouse?.id, role],
    queryFn: async () => {
      // Use local date instead of UTC
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

      const [ordersRes, salesRes] = await Promise.all([
        warehouseFilter(supabase.from("orders").select("status"))
          .gte("created_at", thirtyDaysAgoStr).limit(5000),
        warehouseFilter(supabase.from("sales").select("total_amount, outstanding_amount"))
          .is("deleted_at", null)
          .eq("is_fully_returned", false)
          .gte("created_at", today).limit(1000),
      ]);

      const orders = ordersRes.data || [];
      const sales = salesRes.data || [];
      const totalOrders = orders.length;
      const fulfilledOrders = orders.filter((o: any) => o.status === "fulfilled" || o.status === "delivered").length;
      const fulfillmentRate = totalOrders > 0 ? Math.round((fulfilledOrders / totalOrders) * 100) : 0;

      const totalSale = sales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const totalOutstanding = sales.reduce((s: number, r: any) => s + Number(r.outstanding_amount || 0), 0);
      const collectionEfficiency = totalSale > 0 ? Math.round(((totalSale - totalOutstanding) / totalSale) * 100) : 0;

      return { fulfillmentRate, collectionEfficiency };
    },
});

  const qc = useQueryClient();

  // Expense confirmation state
  const [pendingExpenseAction, setPendingExpenseAction] = useState<{
    id: string; amount: number; name: string; action: "approve" | "reject";
  } | null>(null);
  const [isProcessingExpense, setIsProcessingExpense] = useState(false);

  const handleApproveExpense = async (claimId: string) => {
    setIsProcessingExpense(true);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), approved_amount: null })
        .eq("id", claimId);
      if (error) throw error;
      toast.success("Expense approved");
      qc.invalidateQueries({ queryKey: ["mobile-pending-expense-widget"] });
      qc.invalidateQueries({ queryKey: ["mobile-pending-expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setIsProcessingExpense(false);
      setPendingExpenseAction(null);
    }
  };

  const handleRejectExpense = async (claimId: string) => {
    setIsProcessingExpense(true);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", claimId);
      if (error) throw error;
      toast.success("Expense rejected");
      qc.invalidateQueries({ queryKey: ["mobile-pending-expense-widget"] });
      qc.invalidateQueries({ queryKey: ["mobile-pending-expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject");
    } finally {
      setIsProcessingExpense(false);
      setPendingExpenseAction(null);
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  const firstName = (profile?.full_name ?? (role === "super_admin" ? "Admin" : "Manager")).split(" ")[0];
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-IN");

  const quickActions = [
    { label: "Sales", icon: ShoppingCart, path: "/sales", color: "from-blue-500 to-blue-600" },
    { label: "Orders", icon: ClipboardList, path: "/orders", color: "from-amber-500 to-orange-600" },
    { label: "Payments", icon: Receipt, path: "/transactions", color: "from-violet-500 to-purple-600" },
    { label: "Reports", icon: BarChart3, path: "/reports", color: "from-emerald-500 to-green-600" },
    { label: "Inventory", icon: Warehouse, path: "/inventory", color: "from-cyan-500 to-teal-600" },
    { label: "Stores", icon: Store, path: "/stores", color: "from-rose-500 to-pink-600" },
    { label: "Customers", icon: Users, path: "/customers", color: "from-sky-500 to-blue-600" },
    { label: "Products", icon: Package, path: "/products", color: "from-orange-500 to-red-600" },
  ];

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}<span className="capitalize">{role === "super_admin" ? "Admin" : "Manager"}</span>
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        {/* Floating Revenue Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Today's Revenue</p>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
              <ShoppingCart className="h-3 w-3 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {statsLoading ? "…" : `${stats?.salesCount ?? 0} sales`}
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {statsLoading ? <Loader2 className="h-6 w-6 animate-spin text-blue-500" /> : `₹${(stats?.todaySales ?? 0).toLocaleString("en-IN")}`}
          </p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Cash <strong className="text-slate-800 dark:text-white">₹{(stats?.todayCash ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">UPI <strong className="text-slate-800 dark:text-white">₹{(stats?.todayUpi ?? 0).toLocaleString("en-IN")}</strong></span>
            </div>
          </div>
        </div>

        {/* Mini Stat Grid */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Outstanding" value={`₹${fmtK(stats?.outstandingAmount ?? 0)}`} color="from-red-500 to-rose-600" icon={TrendingDown} />
          <MiniStat label="Pending" value={String(stats?.totalOrders ?? 0)} color="from-amber-500 to-orange-600" icon={ClipboardList} />
          <MiniStat label="Low Stock" value={String(stats?.lowStockCount ?? 0)} color="from-orange-500 to-red-600" icon={Package} alert={(stats?.lowStockCount ?? 0) > 0} />
        </div>

        {/* Operational Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <MiniStat
            label="Fulfillment"
            value={opsMetrics ? `${opsMetrics.fulfillmentRate}%` : "—"}
            color={opsMetrics && opsMetrics.fulfillmentRate >= 80 ? "from-emerald-500 to-green-600" : opsMetrics && opsMetrics.fulfillmentRate >= 50 ? "from-amber-500 to-orange-600" : "from-red-500 to-rose-600"}
            icon={ShoppingCart}
          />
          <MiniStat
            label="Collection"
            value={opsMetrics ? `${opsMetrics.collectionEfficiency}%` : "—"}
            color={opsMetrics && opsMetrics.collectionEfficiency >= 80 ? "from-emerald-500 to-green-600" : opsMetrics && opsMetrics.collectionEfficiency >= 50 ? "from-amber-500 to-orange-600" : "from-red-500 to-rose-600"}
            icon={Wallet}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-5">
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.label} onClick={() => onNavigate(a.path)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all min-h-[80px]">
                <div className={cn("h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", a.color)}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-xs font-semibold text-slate-800 dark:text-white text-center leading-tight truncate w-full">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Sales */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel className="mb-0">Recent Sales</SectionLabel>
          <button className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400" onClick={() => onNavigate("/sales")}>
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {recentActivity && recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{a.store || "Unknown Store"}</p>
                  <p className="text-xs text-slate-400 truncate">{a.displayId} · {format(new Date(a.date), "hh:mm a")}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">₹{Math.round(a.amount).toLocaleString("en-IN")}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-5 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <ShoppingCart className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">No Recent Sales</p>
            <p className="text-xs text-slate-400 mt-1">Sales will appear here as they come in</p>
          </div>
        )}
      </div>

      {/* Route Sessions Widget */}
      {routeSessions.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <SectionLabel className="mb-0 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-indigo-500" />
              Recent Route Sessions
            </SectionLabel>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
              {routeSessions.length}
            </span>
          </div>
          <div className="space-y-2">
            {routeSessions.map((session: any) => (
              <div key={session.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3.5 flex items-center gap-3">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", session.status === 'active' ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-slate-50 dark:bg-slate-800")}>
                  {session.status === 'active' ? (
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </div>
                  ) : (
                    <Navigation className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                    {session.routes?.name || "Unknown Route"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {session.profiles?.full_name || "Unknown Agent"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {format(new Date(session.started_at), "hh:mm a")}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">
                    {session.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Expenses Widget */}
      {pendingExpenses.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <SectionLabel className="mb-0 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              Pending Expenses
            </SectionLabel>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              {pendingExpenses.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingExpenses.map((exp) => (
              <div key={exp.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {exp.expense_categories && (
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: exp.expense_categories.color || `hsl(var(--primary))` }} />
                      )}
                      <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                        ₹{Number(exp.amount).toLocaleString("en-IN")}
                      </p>
                      <span className="text-xs text-slate-400 truncate">
                        {exp.expense_categories?.name || "Unknown"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {exp.profiles?.full_name || "Unknown"} · {format(new Date(exp.created_at), "dd MMM hh:mm a")}
                    </p>
                    {exp.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{exp.description}</p>
                    )}
                    {exp.bill_urls && exp.bill_urls.length > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5">📎 {exp.bill_urls.length} attachment(s)</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {canApproveExpenses ? (
                      <>
                        <button
                          onClick={() => setPendingExpenseAction({ id: exp.id, amount: exp.amount, name: exp.profiles?.full_name ?? "Staff", action: "approve" })}
                          disabled={isProcessingExpense}
                          className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                          {isProcessingExpense && pendingExpenseAction?.id === exp.id ? (
                            <Loader2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                        <button
                          onClick={() => setPendingExpenseAction({ id: exp.id, amount: exp.amount, name: exp.profiles?.full_name ?? "Staff", action: "reject" })}
                          disabled={isProcessingExpense}
                          className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                          {isProcessingExpense && pendingExpenseAction?.id === exp.id ? (
                            <Loader2 className="h-4 w-4 text-red-600 dark:text-red-400 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground px-2">No access</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tools — Analytics & Settings only (Customers/Stores/Inventory etc. already in Quick Actions) */}
      <div className="px-4 mt-5">
        <SectionLabel>Tools</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label="Analytics" sub="Reports & data" icon={TrendingUp} color="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400" onClick={() => onNavigate("/analytics")} />
          <ActionCard label="Settings" sub="App config" icon={Settings} color="bg-slate-100 dark:bg-slate-700" iconColor="text-slate-600 dark:text-slate-400" onClick={() => onNavigate("/settings")} />
        </div>
      </div>

      {/* Expense Confirm Dialog */}
      <AlertDialog open={!!pendingExpenseAction} onOpenChange={(o) => !o && setPendingExpenseAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingExpenseAction?.action === "approve" ? "Approve Expense?" : "Reject Expense?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingExpenseAction?.action === "approve"
                ? `Approve ₹${Math.round(pendingExpenseAction?.amount ?? 0).toLocaleString("en-IN")} expense from ${pendingExpenseAction?.name}?`
                : `Reject expense from ${pendingExpenseAction?.name}? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessingExpense}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessingExpense}
              className={pendingExpenseAction?.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => {
                if (!pendingExpenseAction) return;
                pendingExpenseAction.action === "approve"
                  ? handleApproveExpense(pendingExpenseAction.id)
                  : handleRejectExpense(pendingExpenseAction.id);
              }}
            >
              {isProcessingExpense
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : pendingExpenseAction?.action === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5", className)}>{children}</p>;
}

function MiniStat({ label, value, color, icon: Icon, alert }: { label: string; value: string; color: string; icon: React.ElementType; alert?: boolean }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3 flex flex-col gap-2">
      <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center", color)}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{value}</p>
          {alert && <AlertCircle className="h-3 w-3 text-orange-500" />}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ label, sub, icon: Icon, color, iconColor, onClick }: { label: string; sub: string; icon: React.ElementType; color: string; iconColor: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-[0.98] transition-all text-left">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white">{label}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
    </button>
  );
}
