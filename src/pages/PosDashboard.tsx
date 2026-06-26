import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShoppingCart, Banknote, Smartphone, HandCoins,
  Package, ArrowRightLeft, Truck, FileText,
  Users, Factory, AlertTriangle, ClipboardList,
  ArrowRight, WifiOff,
  UserCheck, Calculator
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PosDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["operator-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [
        salesRes, handoversRes, movementsRes, purchasesRes,
        invoicesRes, attendanceRes, productionRes, rmStockRes
      ] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("handovers").select("cash_amount, upi_amount, status").eq("user_id", user!.id),
        supabase.from("stock_movements").select("id, movement_type, quantity, reason, created_at, product:products(name)").gte("created_at", today + "T00:00:00").order("created_at", { ascending: false }).limit(10),
        supabase.from("purchases").select("id, display_id, total_amount, status").gte("created_at", today + "T00:00:00").order("created_at", { ascending: false }).limit(5),
        supabase.from("invoices").select("id, invoice_number, status").eq("status", "draft").limit(20),
        supabase.from("attendance_entries").select("id, is_present, worker_id, user_id").gte("created_at", today + "T00:00:00"),
        supabase.from("production_log").select("id, product_id, quantity_produced, notes, created_at, product:products(name)").gte("production_date", today).order("created_at", { ascending: false }).limit(5),
        supabase.from("raw_material_stock").select("id, quantity, raw_material:raw_materials(name, min_stock_level, unit)"),
      ]);

      const todaySales: any[] = salesRes.data || [];
      const handovers: any[] = handoversRes.data || [];
      const movements: any[] = movementsRes.data || [];
      const purchases: any[] = purchasesRes.data || [];
      const invoices: any[] = invoicesRes.data || [];
      const attendance: any[] = attendanceRes.data || [];
      const production: any[] = productionRes.data || [];
      const rmStock: any[] = rmStockRes.data || [];

      const pendingHandover = handovers
        .filter((h) => h.status === "pending" || h.status === "awaiting_confirmation")
        .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

      const lowRmStock = rmStock.filter((r: any) => {
        const mat = r.raw_material;
        return mat && Number(r.quantity) <= Number(mat.min_stock_level);
      });

      return {
        totalSales: todaySales.reduce((s, r) => s + Number(r.total_amount), 0),
        totalCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
        pendingHandover,
        movementsCount: movements.length,
        purchasesCount: purchases.length,
        pendingInvoices: invoices.length,
        workersPresent: attendance.filter((a: any) => a.worker_id && a.is_present).length,
        recentMovements: movements.slice(0, 5),
        recentPurchases: purchases,
        recentProduction: production,
        lowRmStock,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats ?? {
    totalSales: 0, totalCash: 0, totalUpi: 0, pendingHandover: 0,
    movementsCount: 0, purchasesCount: 0, pendingInvoices: 0, workersPresent: 0,
    recentMovements: [], recentPurchases: [], recentProduction: [],
    lowRmStock: [],
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Operator Dashboard" subtitle={`Welcome, ${profile?.full_name || "Operator"}! Here's your warehouse & production hub.`} />

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You are offline. Some features may be unavailable.</span>
        </div>
      )}

      {/* Row 1 — Core Ops Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="POS Sales Today" value={`₹${s.totalSales.toLocaleString()}`} icon={ShoppingCart} iconColor="primary" />
        <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="success" />
        <StatCard title="Pending Handover" value={`₹${s.pendingHandover.toLocaleString()}`} icon={HandCoins} iconColor="warning" />
        <StatCard title="Workers Present" value={String(s.workersPresent)} icon={Users} iconColor="purple" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Stock Movements" value={String(s.movementsCount)} icon={ArrowRightLeft} iconColor="cyan" />
        <StatCard title="Purchases Today" value={String(s.purchasesCount)} icon={Truck} iconColor="emerald" />
        <StatCard title="Pending Invoices" value={String(s.pendingInvoices)} icon={FileText} iconColor="orange" />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
      </div>

      {/* Row 2 — Warehouse Operations + Production */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Operations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Warehouse Operations
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Today's stock activity</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/inventory")}>
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Inventory
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No movements today</p>
            ) : (
              <div className="space-y-2">
                {s.recentMovements.map((m: any) => {
                  const isIn = m.movement_type === "purchase" || m.movement_type === "return" || m.movement_type === "production" || m.movement_type === "transfer_in";
                  const qty = Number(m.quantity);
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${isIn ? "bg-green-500" : "bg-amber-500"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.product?.name || "Unknown"}</p>
                          {m.reason && <p className="text-xs text-muted-foreground truncate">{m.reason}</p>}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ml-3 ${isIn ? "text-green-600" : "text-amber-600"}`}>
                        {isIn ? "+" : ""}{qty}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/inventory/purchases")}>
                <ShoppingCart className="h-4 w-4 mr-1.5" />
                Purchases
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/vendors")}>
                <Users className="h-4 w-4 mr-1.5" />
                Vendors
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Production */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Factory className="h-5 w-5 text-primary" />
                Production
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Today's manufacturing</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/production")}>
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Full Log
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.recentProduction.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No production today</p>
            ) : (
              <div className="space-y-2">
                {s.recentProduction.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                    <p className="text-sm font-medium truncate">{p.product?.name || "Unknown"}</p>
                    <span className="text-sm font-semibold text-green-600 shrink-0 ml-3">+{p.quantity_produced}</span>
                  </div>
                ))}
              </div>
            )}

            {s.lowRmStock.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Low Raw Material Alert
                </div>
                <div className="space-y-1.5">
                  {s.lowRmStock.slice(0, 4).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{r.raw_material?.name || "Unknown"}</span>
                      <span className="font-medium text-destructive">{Number(r.quantity)} {r.raw_material?.unit || "units"}</span>
                    </div>
                  ))}
                  {s.lowRmStock.length > 4 && (
                    <p className="text-xs text-muted-foreground">+{s.lowRmStock.length - 4} more items low</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/inventory/raw-materials")}>
                <Package className="h-4 w-4 mr-1.5" />
                Raw Materials
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/production")}>
                <AlertTriangle className="h-4 w-4 mr-1.5" />
                Wastage
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Attendance + POS Sales Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Attendance
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{s.workersPresent} worker{s.workersPresent !== 1 ? "s" : ""} present today</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/attendance")}>
              <ArrowRight className="h-4 w-4 mr-1.5" />
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/attendance")}>
                <UserCheck className="h-5 w-5" />
                <span className="text-xs">Mark Attendance</span>
              </Button>
              <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/attendance")}>
                <Users className="h-5 w-5" />
                <span className="text-xs">Workers</span>
              </Button>
              <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/hr/payroll")}>
                <Calculator className="h-5 w-5" />
                <span className="text-xs">Payroll</span>
              </Button>
              <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/attendance")}>
                <FileText className="h-5 w-5" />
                <span className="text-xs">Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* POS Sales Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              POS Sales Breakdown
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Today's payment split</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Cash</span>
              </div>
              <span className="text-sm font-semibold">₹{s.totalCash.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">UPI</span>
              </div>
              <span className="text-sm font-semibold">₹{s.totalUpi.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3 border border-primary/20">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Total</span>
              </div>
              <span className="text-base font-bold text-primary">₹{s.totalSales.toLocaleString()}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/sales")}>
                <ShoppingCart className="h-4 w-4 mr-1.5" />
                Record Sale
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate("/handovers")}>
                <HandCoins className="h-4 w-4 mr-1.5" />
                Handover
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PosDashboard;
