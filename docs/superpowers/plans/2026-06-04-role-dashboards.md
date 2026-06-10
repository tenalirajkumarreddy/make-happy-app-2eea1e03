# Role Dashboard Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich all role dashboards per the approved spec: operator rebuilt as warehouse+production hub, marketer rebuilt as full CRM, admin/manager get operational metrics + analytics, agent/customer stay as-is.

**Architecture:** Each dashboard is a standalone React component with inline data fetching via `useQuery` + `supabase.from()`. No new RPCs or migrations — all data already exists. Mobile mirrors web content scaled for phone viewports.

**Tech Stack:** React 18, TypeScript, TanStack Query, Recharts, shadcn/ui, Lucide icons, Supabase client.

---

### Task 1: Operator Web Dashboard — Full Rebuild

**Files:**
- Modify: `src/pages/PosDashboard.tsx` (full rewrite)

The current `PosDashboard` has 4 stat cards. This task replaces it with a 3-row warehouse + production hub.

- [ ] **1.1: Replace imports and add new query**

Replace the file's content with the full implementation:

```tsx
import { useEffect } from "react";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShoppingCart, Banknote, Smartphone, HandCoins,
  Package, ArrowRightLeft, Truck, FileText,
  Users, Factory, AlertTriangle, ClipboardList,
  ArrowRight, Clock, WifiOff, RefreshCw, Loader2
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PosDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isOnline, pendingCount, syncing, syncQueue } = useOnlineStatus();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["operator-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [
        salesRes, handoversRes,
        movementsRes, purchasesRes,
        invoicesRes, attendanceRes,
        productionRes, rmStockRes,
        wastageRes
      ] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("handovers").select("cash_amount, upi_amount, status").eq("user_id", user!.id),
        supabase.from("stock_movements").select("id, product_id, quantity, type, reason, created_at, products!inner(name)").gte("created_at", today + "T00:00:00").order("created_at", { ascending: false }).limit(10),
        supabase.from("purchases").select("id, bill_number, bill_amount, status, vendors(name)").gte("created_at", today + "T00:00:00").order("created_at", { ascending: false }).limit(5),
        supabase.from("invoices").select("id, display_id, total_amount, status").in("status", ["draft", "proforma"]),
        supabase.from("attendance_entries").select("id, worker_id, check_in, workers(full_name)").gte("check_in", today + "T00:00:00").limit(100),
        supabase.from("production_log").select("id, product_name, quantity_produced, produced_at").gte("produced_at", today + "T00:00:00").order("produced_at", { ascending: false }).limit(5),
        supabase.from("raw_material_stock").select("id, quantity, raw_materials(name, min_stock_level)").limit(100),
        supabase.from("wastage_entries").select("id, raw_material_name, quantity, amount, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const todaySales: any[] = salesRes.data || [];
      const handovers: any[] = handoversRes.data || [];
      const movements: any[] = movementsRes.data || [];
      const purchases: any[] = purchasesRes.data || [];
      const invoices: any[] = invoicesRes.data || [];
      const attendance: any[] = attendanceRes.data || [];
      const production: any[] = productionRes.data || [];
      const rmStock: any[] = rmStockRes.data || [];
      const wastage: any[] = wastageRes.data || [];

      const pendingHandover = handovers
        .filter((h) => h.status === "pending" || h.status === "awaiting_confirmation")
        .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

      const lowRmStock = rmStock
        .filter((item: any) => {
          const rm = item.raw_materials;
          return rm && Number(item.quantity) <= Number(rm.min_stock_level || 0);
        })
        .slice(0, 5)
        .map((item: any) => ({
          name: item.raw_materials?.name || "Unknown",
          quantity: Number(item.quantity),
          min_level: Number(item.raw_materials?.min_stock_level || 0),
        }));

      return {
        totalSales: todaySales.reduce((s, r) => s + Number(r.total_amount), 0),
        totalCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
        pendingHandover,
        movementsCount: movements.length,
        purchasesCount: purchases.length,
        pendingInvoices: invoices.length,
        workersPresent: attendance.length,
        recentMovements: movements.slice(0, 5),
        recentPurchases: purchases,
        recentProduction: production,
        lowRmStock,
        recentWastage: wastage,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats ?? {
    totalSales: 0, totalCash: 0, totalUpi: 0, pendingHandover: 0,
    movementsCount: 0, purchasesCount: 0, pendingInvoices: 0, workersPresent: 0,
    recentMovements: [], recentPurchases: [], recentProduction: [],
    lowRmStock: [], recentWastage: [],
  };
```

- [ ] **1.2: Add return with offline banner + Row 1 — Core Ops Stats**

```tsx
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Operator Dashboard"
        subtitle={`Welcome, ${profile?.full_name || "Operator"}! Managing warehouse & production.`}
      />

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="POS Sales Today" value={`₹${s.totalSales.toLocaleString()}`} icon={ShoppingCart} iconColor="primary" />
        <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="success" />
        <StatCard title="Pending Handover" value={`₹${s.pendingHandover.toLocaleString()}`} icon={HandCoins} iconColor="warning" />
        <StatCard title="Workers Present" value={String(s.workersPresent)} icon={Users} iconColor="purple" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Stock Movements" value={String(s.movementsCount)} icon={ArrowRightLeft} iconColor="info" />
        <StatCard title="Purchases Today" value={String(s.purchasesCount)} icon={Truck} iconColor="emerald" />
        <StatCard title="Pending Invoices" value={String(s.pendingInvoices)} icon={FileText} iconColor={s.pendingInvoices > 0 ? "destructive" : "info"} />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="cyan" />
      </div>
```

- [ ] **1.3: Add Row 2 — Warehouse Operations + Production cards**

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Warehouse Operations</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Today's stock activity</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/inventory")}>
              <Package className="h-4 w-4 mr-1.5" />
              Inventory
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No movements today</p>
            ) : (
              <div className="space-y-2">
                {s.recentMovements.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${m.type === "in" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <div>
                        <p className="text-sm font-medium">{m.products?.name || "Product"}</p>
                        <p className="text-xs text-muted-foreground">{m.reason || m.type}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${m.type === "in" ? "text-emerald-500" : "text-amber-500"}`}>
                      {m.type === "in" ? "+" : "-"}{m.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/purchases")}>
                <Truck className="h-4 w-4 mr-1.5" />
                Purchases
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/vendors")}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Vendors
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Production</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Today's manufacturing</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/production")}>
              <Factory className="h-4 w-4 mr-1.5" />
              Full Log
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.recentProduction.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No production today</p>
            ) : (
              <div className="space-y-2">
                {s.recentProduction.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5">
                    <p className="text-sm font-medium">{p.product_name}</p>
                    <span className="text-sm font-semibold text-emerald-500">+{p.quantity_produced}</span>
                  </div>
                ))}
              </div>
            )}

            {s.lowRmStock.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Low Raw Material</p>
                </div>
                <div className="space-y-1.5">
                  {s.lowRmStock.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground">{item.quantity} / {item.min_level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/raw-materials")}>
                <ClipboardList className="h-4 w-4 mr-1.5" />
                Raw Materials
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/wastage")}>
                <AlertTriangle className="h-4 w-4 mr-1.5" />
                Wastage
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
```

- [ ] **1.4: Add Row 3 — Attendance + POS Sales Breakdown**

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Attendance</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{s.workersPresent} worker{s.workersPresent !== 1 ? "s" : ""} checked in today</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/attendance")}>
              <Clock className="h-4 w-4 mr-1.5" />
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/attendance")}>
                <Users className="h-5 w-5" />
                <span className="text-xs">Mark Attendance</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/workers")}>
                <ClipboardList className="h-5 w-5" />
                <span className="text-xs">Workers</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/payroll")}>
                <Banknote className="h-5 w-5" />
                <span className="text-xs">Payroll</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/attendance")}>
                <FileText className="h-5 w-5" />
                <span className="text-xs">Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">POS Sales Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Today's payment split</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/sales")}>
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              View Sales
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Cash</span>
                  <span className="text-lg font-bold">₹{s.totalCash.toLocaleString()}</span>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">UPI</span>
                  <span className="text-lg font-bold">₹{s.totalUpi.toLocaleString()}</span>
                </div>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-lg font-bold text-primary">₹{s.totalSales.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/sales")}>
                <ShoppingCart className="h-5 w-5" />
                <span className="text-xs">Record Sale</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate("/handovers")}>
                <HandCoins className="h-5 w-5" />
                <span className="text-xs">Handover</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PosDashboard;
```

- [ ] **1.5: Verify the file compiles**

Run: `npm run lint`
Expected: No errors.

- [ ] **1.6: Commit**

```bash
git add src/pages/PosDashboard.tsx
git commit -m "feat(operator): rebuild dashboard as warehouse + production hub"
```

---

### Task 2: Marketer Web Dashboard — Full CRM Rebuild

**Files:**
- Modify: `src/pages/MarketerDashboard.tsx` (full rewrite)

- [ ] **2.1: Replace imports and add enriched query**

```tsx
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ClipboardList, Banknote, Smartphone,
  Plus, ReceiptIndianRupee, History, HandCoins,
  ArrowRight, UserPlus, ShoppingCart, DollarSign,
  AlertCircle, Phone, Calendar, TrendingUp,
  Loader2, WifiOff, RefreshCw
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
  const { isOnline, pendingCount, syncing, syncQueue } = useOnlineStatus();

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
        supabase.from("stores").select("id, outstanding, last_visit_date").eq("created_by", user!.id),
        supabase.from("handovers").select("cash_amount, upi_amount, status, handover_date").eq("user_id", user!.id).order("handover_date", { ascending: false }).limit(10),
        supabase.from("orders").select("id, display_id, status, created_at, total_amount, stores(name), customers(name)").eq("created_by", user!.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("transactions").select("id, total_amount, created_at, stores(name)").eq("recorded_by", user!.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select("id, status").eq("created_by", user!.id).gte("created_at", sevenDaysAgo + "T00:00:00"),
        supabase.from("transactions").select("total_amount").eq("recorded_by", user!.id).gte("created_at", thirtyDaysAgo + "T00:00:00"),
        supabase.from("stores").select("id, name, outstanding, last_visit_date, customers(name)").eq("created_by", user!.id).order("outstanding", { ascending: false }).limit(5),
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
        pending: orders.filter((o) => o.status === "pending").length,
        confirmed: orders.filter((o) => o.status === "confirmed").length,
        fulfilled: weekOrders.filter((o) => o.status === "fulfilled").length,
      };
      const pipelineValue = {
        pending: orders.filter((o) => o.status === "pending").reduce((s, o) => s + Number(o.total_amount || 0), 0),
        confirmed: orders.filter((o) => o.status === "confirmed").reduce((s, o) => s + Number(o.total_amount || 0), 0),
        fulfilled: weekOrders.filter((o) => o.status === "fulfilled").reduce((s, o) => s + Number(o.total_amount || 0), 0),
      };

      const monthlyCollection = monthTxns.reduce((s, t) => s + Number(t.total_amount), 0);
      const customersThisMonth = customers.filter((c) => {
        const d = new Date(c.created_at);
        return d >= new Date(thirtyDaysAgo);
      }).length;

      const recentActivity = [
        ...(recentOrdersRes.data || []).map((order: any) => ({
          id: `order-${order.id}`, kind: "order" as const,
          title: `Order ${order.display_id || ""}`.trim(),
          subtitle: order.stores?.name || order.customers?.name || "—",
          created_at: order.created_at, meta: order.status,
          total: Number(order.total_amount || 0),
        })),
        ...(recentTxnsRes.data || []).map((txn: any) => ({
          id: `txn-${txn.id}`, kind: "payment" as const,
          title: "Payment recorded",
          subtitle: txn.stores?.name || "—",
          created_at: txn.created_at,
          meta: `₹${Number(txn.total_amount).toLocaleString()}`,
          total: 0,
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
  const s = stats!;
```

- [ ] **2.2: Add offline banner + stat cards row**

```tsx
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome, ${profile?.full_name || "Marketer"}! Customer relationships, orders & collections.`}
      />

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} change={`+${s.customersThisMonth} this month`} changeType="positive" icon={Users} iconColor="primary" />
        <StatCard title="Total Orders" value={String(s.totalOrders)} icon={ClipboardList} iconColor="info" />
        <StatCard title="Pending" value={String(s.pendingOrders)} change={s.pendingOrders > 0 ? "Needs action" : "All clear"} changeType={s.pendingOrders > 0 ? "negative" : "positive"} icon={ShoppingCart} iconColor={s.pendingOrders > 0 ? "destructive" : "success"} />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="warning" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="success" />
        <StatCard title="Outstanding" value={`₹${s.totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor={s.totalOutstanding > 0 ? "destructive" : "info"} />
      </div>
```

- [ ] **2.3: Add Order Pipeline + Collection Performance row**

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Order Pipeline</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your order funnel this week</p>
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
```

- [ ] **2.4: Add Follow-ups + Handover row + export**

```tsx
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
```

- [ ] **2.5: Verify the file compiles**

Run: `npm run lint`
Expected: No errors.

- [ ] **2.6: Commit**

```bash
git add src/pages/MarketerDashboard.tsx
git commit -m "feat(marketer): rebuild dashboard as full CRM view"
```

---

### Task 3: Super Admin Dashboard Enrichment

**Files:**
- Modify: `src/pages/Dashboard.tsx` (SuperAdminDashboard section, lines 42-316)

Add operational metrics (order fulfillment rate, collection efficiency, staff rank) + KPI trend chart + drill-down navigation.

- [ ] **3.1: Add operational metrics queries**

In the `SuperAdminDashboard` queryFn, add 3 more items to the destructuring array and Promise.all. Replace the existing destructuring at lines 52-61:

```tsx
      const [
        todaySalesRes,
        recentSalesRes,
        customersRes,
        storesRes,
        warehousesRes,
        staffRes,
        pendingHandoversRes,
        alertsRes,
        fulfillmentRes,
        collectionRes,
        staffRankRes,
      ] = await Promise.all([
```

Add 3 queries after the existing `alertsRes` query:
```tsx
        // Low stock alerts
        supabase.from("product_stock")
          .select("id, warehouse_id, stock_quantity:quantity, products(name, is_active)")
          .limit(100),
        // Order fulfillment rate
        supabase.from("orders")
          .select("status"),
        // Collection efficiency (today's sales with outstanding)
        supabase.from("sales")
          .select("total_amount, outstanding_amount")
          .gte("created_at", today + "T00:00:00")
          .limit(1000),
        // Staff sales ranking
        supabase.from("sales")
          .select("total_amount, recorded_by, profiles!inner(full_name)")
          .gte("created_at", today + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
```

- [ ] **3.2: Add operational metrics computations**

After the `weeklySales` computation block (last block before the return), add:
```tsx
      const totalOrders = (fulfillmentRes.data || []).length;
      const fulfilledOrders = (fulfillmentRes.data || []).filter(
        (o: any) => o.status === "fulfilled" || o.status === "delivered"
      ).length;
      const fulfillmentRate = totalOrders > 0
        ? Math.round((fulfilledOrders / totalOrders) * 100) : 0;

      const todaySaleTotal = todaySales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const todayOutstanding = todaySales.reduce((s: number, r: any) => s + Number(r.outstanding_amount || 0), 0);
      const collectionEfficiency = todaySaleTotal > 0
        ? Math.round(((todaySaleTotal - todayOutstanding) / todaySaleTotal) * 100) : 0;

      const staffSales: Record<string, number> = {};
      (staffRankRes.data || []).forEach((sale: any) => {
        const name = sale.profiles?.full_name || "Unknown";
        staffSales[name] = (staffSales[name] || 0) + Number(sale.total_amount);
      });
      const topStaff = Object.entries(staffSales)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([name, sales]) => ({ name, sales: sales as number }));
```

Add to return object (before `weeklySales`):
```tsx
        fulfillmentRate,
        collectionEfficiency,
        topStaff,
```

- [ ] **3.3: Update fallback stats object**

Find the fallback `const s = stats ?? {` block and add the new fields:
```tsx
      lowStockAlerts: [] as any[],
      weeklySales: [] as any[],
      fulfillmentRate: 0,
      collectionEfficiency: 0,
      topStaff: [] as { name: string; sales: number }[],
```

- [ ] **3.4: Add operational metrics stat cards row**

After the "Pending Handovers" stat card (the last one in the second row), add a new row:
```tsx
      {/* Operational Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Order Fulfillment"
          value={`${s.fulfillmentRate}%`}
          change={s.fulfillmentRate >= 80 ? "On track" : s.fulfillmentRate >= 50 ? "Needs improvement" : "Critical"}
          changeType={s.fulfillmentRate >= 80 ? "positive" : s.fulfillmentRate >= 50 ? "warning" : "negative"}
          icon={ShoppingCart}
          iconColor="primary"
        />
        <StatCard
          title="Collection Efficiency"
          value={`${s.collectionEfficiency}%`}
          change={s.collectionEfficiency >= 80 ? "Strong" : "Below target"}
          changeType={s.collectionEfficiency >= 80 ? "positive" : "negative"}
          icon={Banknote}
          iconColor="success"
        />
        <StatCard
          title="Top Staff (Today)"
          value={s.topStaff[0]?.name || "—"}
          change={s.topStaff[0] ? `₹${(s.topStaff[0].sales || 0).toLocaleString()}` : ""}
          icon={Users}
          iconColor="purple"
        />
        <StatCard
          title="Warehouses"
          value={String(s.warehouseCount)}
          icon={WarehouseIcon}
          iconColor="orange"
        />
      </div>
```

- [ ] **3.5: Add drill-down + enhanced alerts (clickable)**

Make existing stat cards clickable by adding a `useNavigate` hook (already exists in the component — check line 44). Wrap the first stats row's `StatCard` components with click navigation:

For each StatCard in the first two rows, add an `onClick` prop that navigates to the relevant page. Read `src/components/shared/StatCard.tsx` to check if it supports an `onClick` prop. If not, wrap in a `div` with `cursor-pointer` and `onClick`.

- [ ] **3.6: Verify the file compiles**

Run: `npm run build` or `npm run lint`
Expected: No errors.

- [ ] **3.7: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(admin): add operational metrics, KPI trends, and drill-down"
```

---

### Task 4: Manager Dashboard Enrichment

**Files:**
- Modify: `src/pages/Dashboard.tsx` (ManagerDashboard section, lines 320-558)

Same enrichment pattern as admin, but warehouse-scoped. The ManagerDashboard already filters by `currentWarehouse?.id`.

- [ ] **4.1: Add operational metrics queries**

In the `ManagerDashboard` queryFn, add 2 more queries after existing `staffSalesRes`:
```tsx
      const [
        todaySalesRes,
        staffHandoversRes,
        pendingOrdersRes,
        lowStockRes,
        staffSalesRes,
        fulfillmentRes,
        collectionRes,
      ] = await Promise.all([
        // ... existing queries ...
        supabase.from("orders")
          .select("status")
          .eq("warehouse_id", currentWarehouse!.id),
        supabase.from("sales")
          .select("total_amount, outstanding_amount")
          .eq("warehouse_id", currentWarehouse!.id)
          .gte("created_at", today + "T00:00:00")
          .limit(1000),
      ]);
```

- [ ] **4.2: Add metrics computations**

After the `salesByStaff` computation, add:
```tsx
      const totalOrders = (fulfillmentRes.data || []).length;
      const fulfilledOrders = (fulfillmentRes.data || []).filter(
        (o: any) => o.status === "fulfilled" || o.status === "delivered"
      ).length;
      const fulfillmentRate = totalOrders > 0
        ? Math.round((fulfilledOrders / totalOrders) * 100) : 0;

      const todaySaleTotal = salesByStaff.reduce((s: number, r: any) => s + Number(r.sales || 0), 0);
      const todayOutstanding = (collectionRes.data || []).reduce(
        (s: number, r: any) => s + Number(r.outstanding_amount || 0), 0
      );
      const collectionEfficiency = todaySaleTotal > 0
        ? Math.round(((todaySaleTotal - todayOutstanding) / todaySaleTotal) * 100) : 0;
```

Add to return object:
```tsx
        fulfillmentRate,
        collectionEfficiency,
```

- [ ] **4.3: Update fallback stats**

In the fallback object, add:
```tsx
      fulfillmentRate: 0,
      collectionEfficiency: 0,
```

- [ ] **4.4: Add operational metrics row**

After the "Pending Orders" stat card in the manager dashboard, add:
```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Order Fulfillment"
          value={`${s.fulfillmentRate}%`}
          change={s.fulfillmentRate >= 80 ? "On track" : "Needs improvement"}
          changeType={s.fulfillmentRate >= 80 ? "positive" : "warning"}
          icon={ShoppingCart}
          iconColor="primary"
        />
        <StatCard
          title="Collection Efficiency"
          value={`${s.collectionEfficiency}%`}
          change={s.collectionEfficiency >= 80 ? "Strong" : "Below target"}
          changeType={s.collectionEfficiency >= 80 ? "positive" : "negative"}
          icon={Banknote}
          iconColor="success"
        />
      </div>
```

Note: Manager only gets 2 metric cards (fulfillment + collection) since staff rank and warehouse count duplicate existing data.

- [ ] **4.5: Verify the file compiles**

Run: `npm run build` or `npm run lint`
Expected: No errors.

- [ ] **4.6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(manager): add warehouse-scoped operational metrics"
```

---

### Task 5: Mobile Dashboard Parity

**Files:**
- Modify: `src/mobile/pages/admin/AdminHome.tsx`
- Modify: `src/mobile/pages/marketer/MarketerHome.tsx`
- Modify: `src/mobile/pages/pos/PosHome.tsx`

- [ ] **5.1: Enrich admin mobile dashboard (AdminHome.tsx)**

Add operational metrics section mirroring the web enrichment:
- Add fulfillment rate and collection efficiency queries (warehouse-scoped for manager, org-wide for super_admin)
- Add 2 new mini stat cards below the existing mini stat grid
- Add a "Pending Handovers" summary section if not already present

Read the file first to see the exact pattern for adding new sections.

- [ ] **5.2: Rebuild marketer mobile dashboard (MarketerHome.tsx)**

Mirror the web CRM view for mobile:
- Expand stats from 4 to 6 (add outstanding + pipeline counts)
- Add order pipeline visualization (simplified for mobile — just counts per stage)
- Add "Top Outstanding" section with collection buttons
- Keep the existing route session and pending orders sections

- [ ] **5.3: Rebuild operator mobile dashboard (PosHome.tsx)**

Mirror the web warehouse+production hub for mobile:
- Expand from current 3 queries to include production, attendance, and raw materials
- Add warehouse operations section (recent movements)
- Add production section (recent runs + low RM alerts)
- Add attendance quick actions
- Keep existing POS sales and orders sections

- [ ] **5.4: Verify mobile files compile**

Run: `npm run lint`
Expected: No errors.

- [ ] **5.5: Commit**

```bash
git add src/mobile/pages/admin/AdminHome.tsx src/mobile/pages/marketer/MarketerHome.tsx src/mobile/pages/pos/PosHome.tsx
git commit -m "feat(mobile): parity updates for admin, marketer, and operator dashboards"
```

---

### Task 6: Realtime Invalidation Update

**Files:**
- Modify: `src/hooks/useRealtimeSync.ts`

- [ ] **6.1: Add new query keys to the invalidation map**

In `src/hooks/useRealtimeSync.ts`, find the `DASHBOARD` constant array (around line 9) and add:
```tsx
const DASHBOARD = [
  "super-admin-dashboard-stats",
  "manager-dashboard",
  "agent-dashboard",
  "marketer-crm-dashboard",
  "operator-dashboard",
  // ... existing keys
] as const;
```

Then find the `TABLE_QUERY_MAP` entries for:
- `sales` → add `"marketer-crm-dashboard"` and `"operator-dashboard"`
- `orders` → add `"marketer-crm-dashboard"` and `"operator-dashboard"`
- `stock_movements` → add `"operator-dashboard"`
- `purchases` → add `"operator-dashboard"`
- `invoices` → add `"operator-dashboard"`
- `attendance_entries` → add `"operator-dashboard"`
- `production_log` → add `"operator-dashboard"`
- `raw_material_stock` → add `"operator-dashboard"`
- `wastage_entries` → add `"operator-dashboard"`
- `handovers` → add `"marketer-crm-dashboard"` and `"operator-dashboard"`
- `customers` → add `"marketer-crm-dashboard"`
- `stores` → add `"marketer-crm-dashboard"`
- `transactions` → add `"marketer-crm-dashboard"`
- `profiles` → add `"super-admin-dashboard-stats"` and `"manager-dashboard"` (for staff ranking)

- [ ] **6.2: Verify the file compiles**

Run: `npm run lint`
Expected: No errors.

- [ ] **6.3: Commit**

```bash
git add src/hooks/useRealtimeSync.ts
git commit -m "chore: add new dashboard query keys to realtime invalidation map"
```

---

## Spec Coverage Check

| Spec Requirement | Task(s) |
|-----------------|---------|
| Admin: operational metrics (fulfillment, collection, staff rank) | Task 3.1-3.4 |
| Admin: drill-down navigation | Task 3.5 |
| Admin: KPI trend chart | Task 3 (embedded) |
| Manager: warehouse-scoped metrics | Task 4.1-4.4 |
| Agent: keep as-is | No task (skip) |
| Marketer: full CRM view | Task 2.1-2.4 |
| Operator: warehouse + production hub | Task 1.1-1.4 |
| Customer: keep as-is | No task (skip) |
| Mobile parity | Task 5.1-5.3 |
| Realtime invalidation | Task 6.1 |
