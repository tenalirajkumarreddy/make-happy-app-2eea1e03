import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign, Banknote, Smartphone, TrendingUp,
  ShoppingCart, Package, Calendar,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function DailyReport() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const { data: companyInfo } = useCompanySettings();

  const startOfDay = date + "T00:00:00";
  const endOfDay = date + "T23:59:59";

  const { data, isLoading } = useQuery({
    queryKey: ["daily-report", date],
    queryFn: async () => {
      const [salesRes, txnRes, ordersRes, saleItemsRes, storesRes, handoversRes, profilesRes, rolesRes, routesRes, visitsRes] = await Promise.all([
        supabase.from("sales").select("*, stores(name, route_id)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("transactions").select("*, stores(name, route_id)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("orders").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("sale_items").select("*, products(name, unit)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("stores").select("id, name, display_id, outstanding, route_id").eq("is_active", true),
        supabase.from("handovers").select("*").eq("handover_date", date),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id, role").neq("role", "customer"),
        supabase.from("routes").select("id, name").eq("is_active", true).order("name"),
        supabase.from("store_visits").select("store_id, stores(route_id)").gte("visited_at", startOfDay).lte("visited_at", endOfDay),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const orders = ordersRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const stores = storesRes.data || [];
      const handovers = handoversRes.data || [];
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const routes = routesRes.data || [];
      const visits = visitsRes.data || [];

      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name]));
      
      // Pre-build lookup maps for O(1) access instead of O(n) find/filter in loops
      const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));
      const salesByUser = new Map<string, typeof sales>();
      const txnsByUser = new Map<string, typeof txns>();
      const handoversBySender = new Map<string, typeof handovers>();
      const handoversByReceiver = new Map<string, typeof handovers>();
      const storesByRoute = new Map<string, typeof stores>();
      const visitsByRoute = new Map<string, typeof visits>();
      
      // Group data by user/route for O(1) lookups
      sales.forEach((s) => {
        const key = s.recorded_by;
        if (!salesByUser.has(key)) salesByUser.set(key, []);
        salesByUser.get(key)!.push(s);
      });
      txns.forEach((t) => {
        const key = t.recorded_by;
        if (!txnsByUser.has(key)) txnsByUser.set(key, []);
        txnsByUser.get(key)!.push(t);
      });
      handovers.forEach((h) => {
        if (!handoversBySender.has(h.user_id)) handoversBySender.set(h.user_id, []);
        handoversBySender.get(h.user_id)!.push(h);
        if (!handoversByReceiver.has(h.handed_to)) handoversByReceiver.set(h.handed_to, []);
        handoversByReceiver.get(h.handed_to)!.push(h);
      });
      stores.forEach((s) => {
        const key = s.route_id;
        if (key) {
          if (!storesByRoute.has(key)) storesByRoute.set(key, []);
          storesByRoute.get(key)!.push(s);
        }
      });
      visits.forEach((v: any) => {
        const key = v.stores?.route_id;
        if (key) {
          if (!visitsByRoute.has(key)) visitsByRoute.set(key, []);
          visitsByRoute.get(key)!.push(v);
        }
      });

      // Sales metrics
      const totalSaleAmount = sales.reduce((s, r) => s + Number(r.total_amount), 0);
      const salesCash = sales.reduce((s, r) => s + Number(r.cash_amount), 0);
      const salesUpi = sales.reduce((s, r) => s + Number(r.upi_amount), 0);
      const salesOutstanding = sales.reduce((s, r) => s + Number(r.outstanding_amount), 0);

      // Payment/Collections metrics
      const totalCollections = txns.reduce((s, r) => s + Number(r.total_amount), 0);
      const txnCash = txns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const txnUpi = txns.reduce((s, r) => s + Number(r.upi_amount), 0);

      // Total cash & UPI collected across sales + payments
      const totalCash = salesCash + txnCash;
      const totalUpi = salesUpi + txnUpi;

      // Total income = sale amount + collections
      const totalIncome = totalSaleAmount + totalCollections;

      // Items sold
      const totalItemsSold = saleItems.reduce((s, r) => s + Number(r.quantity), 0);

      // Product-wise breakdown
      const productMap: Record<string, { name: string; unit: string; qty: number; revenue: number }> = {};
      saleItems.forEach((item: any) => {
        const key = item.product_id;
        if (!productMap[key]) {
          productMap[key] = { name: item.products?.name || "Unknown", unit: item.products?.unit || "PCS", qty: 0, revenue: 0 };
        }
        productMap[key].qty += Number(item.quantity);
        productMap[key].revenue += Number(item.total_price);
      });
      const productBreakdown = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

      // Staff-wise balance calculation using pre-built maps (O(n) instead of O(n²))
      const staffIds = roles.map((r) => r.user_id);
      const staffBalances = staffIds.map((uid) => {
        const name = profileMap[uid] || "Unknown";
        const role = roleMap.get(uid) || "";

        // Sales recorded by this user (cash + upi collected) - O(1) lookup
        const userSales = salesByUser.get(uid) || [];
        const collectedFromSales = userSales.reduce((s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);

        // Transactions/payments recorded by this user - O(1) lookup
        const userTxns = txnsByUser.get(uid) || [];
        const collectedFromTxns = userTxns.reduce((s, r) => s + Number(r.total_amount), 0);

        const totalCollected = collectedFromSales + collectedFromTxns;

        // Handovers - O(1) lookup for sender/receiver
        const sentHandovers = handoversBySender.get(uid) || [];
        const receivedHandovers = handoversByReceiver.get(uid) || [];
        
        const sentConfirmed = sentHandovers.filter((h) => h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const sentPending = sentHandovers.filter((h) => h.status === "pending")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const receivedConfirmed = receivedHandovers.filter((h) => h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

        const balance = totalCollected - sentConfirmed - sentPending + receivedConfirmed;

        return {
          user_id: uid,
          name,
          role,
          sales_count: userSales.length,
          txn_count: userTxns.length,
          collected: totalCollected,
          handed_over: sentConfirmed,
          pending_handover: sentPending,
          received: receivedConfirmed,
          balance,
        };
      }).filter((s) => s.collected > 0 || s.balance > 0 || s.received > 0);

      // Outstanding totals
      const totalOutstanding = stores.reduce((s, st) => s + Number(st.outstanding), 0);
      const storesWithOutstanding = stores.filter((s) => Number(s.outstanding) > 0)
        .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));

      // Orders
      const delivered = orders.filter((o) => o.status === "delivered").length;
      const pending = orders.filter((o) => o.status === "pending").length;
      const cancelled = orders.filter((o) => o.status === "cancelled").length;

      // Route performance using pre-built maps (O(n) instead of O(n²))
      const routePerformance = routes.map((route) => {
        const routeStores = storesByRoute.get(route.id) || [];
        const totalStores = routeStores.length;
        const routeVisits = visitsByRoute.get(route.id) || [];
        const visitedStoreIds = new Set(routeVisits.map((v: any) => v.store_id));
        const storesCovered = visitedStoreIds.size;
        const pctCovered = totalStores > 0 ? Math.round((storesCovered / totalStores) * 100) : 0;
        const routeSales = sales.filter((s: any) => s.stores?.route_id === route.id)
          .reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
        const routeCollected = txns.filter((t: any) => t.stores?.route_id === route.id)
          .reduce((sum: number, t: any) => sum + Number(t.total_amount), 0);
        const routePending = routeStores.reduce((sum, s) => sum + Number(s.outstanding), 0);
        return { name: route.name, totalStores, storesCovered, pctCovered, sales: routeSales, collected: routeCollected, pending: routePending };
      }).filter((r) => r.totalStores > 0);

      return {
        sales, txns, orders, saleItems, productBreakdown, staffBalances,
        storesWithOutstanding, routePerformance,
        totalSaleAmount, salesCash, salesUpi, salesOutstanding,
        totalCollections, txnCash, txnUpi,
        totalCash, totalUpi, totalIncome,
        totalItemsSold, totalOutstanding,
        salesCount: sales.length, txnCount: txns.length,
        ordersDelivered: delivered, ordersPending: pending, ordersCancelled: cancelled,
      };
    },
  });

  if (isLoading) return <TableSkeleton columns={5} rows={6} />;

  const d = data!;

  // ── Sales table columns ──
  const salesCols = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (r: any) => r.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (r: any) => fmt(Number(r.total_amount)), className: "font-semibold" },
    { header: "Cash", accessor: (r: any) => fmt(Number(r.cash_amount)) },
    { header: "UPI", accessor: (r: any) => fmt(Number(r.upi_amount)) },
    { header: "Credit", accessor: (r: any) => fmt(Number(r.outstanding_amount)) },
    { header: "Time", accessor: (r: any) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), className: "text-muted-foreground text-xs" },
  ];

  const txnCols = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (r: any) => r.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (r: any) => fmt(Number(r.total_amount)), className: "font-semibold" },
    { header: "Cash", accessor: (r: any) => fmt(Number(r.cash_amount)) },
    { header: "UPI", accessor: (r: any) => fmt(Number(r.upi_amount)) },
    { header: "Time", accessor: (r: any) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), className: "text-muted-foreground text-xs" },
  ];

  const productCols = [
    { header: "Product", accessor: "name" as const, className: "font-medium" },
    { header: "Qty", accessor: (r: any) => `${r.qty} ${r.unit}`, className: "font-semibold" },
    { header: "Revenue", accessor: (r: any) => fmt(r.revenue), className: "font-semibold" },
  ];

  const staffCols = [
    { header: "Staff", accessor: "name" as const, className: "font-medium" },
    { header: "Role", accessor: (r: any) => <Badge variant="outline" className="text-xs capitalize">{r.role.replace("_", " ")}</Badge> },
    { header: "Collected", accessor: (r: any) => fmt(r.collected), className: "font-medium" },
    { header: "Handed Over", accessor: (r: any) => fmt(r.handed_over), className: "text-success" },
    { header: "Pending", accessor: (r: any) => fmt(r.pending_handover), className: "text-warning" },
    { header: "Received", accessor: (r: any) => fmt(r.received) },
    { header: "Balance", accessor: (r: any) => fmt(r.balance), className: "font-bold" },
  ];

  // ── Export functions ──
  const generateHTML = () => {
    // Combine sales + payments into chronological list
    const chronological = [
      ...d.sales.map((s: any) => ({
        time: new Date(s.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase(),
        type: "Sale",
        id: s.display_id,
        store: s.stores?.name || "—",
        detail: d.saleItems
          .filter((si: any) => si.sale_id === s.id)
          .map((si: any) => si.products?.name || "")
          .filter(Boolean)
          .join(", ") || "—",
        total: Number(s.total_amount),
        cash: Number(s.cash_amount),
        upi: Number(s.upi_amount),
        credit: Number(s.outstanding_amount),
        sortKey: new Date(s.created_at).getTime(),
      })),
      ...d.txns.map((t: any) => ({
        time: new Date(t.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase(),
        type: "Payment",
        id: t.display_id,
        store: t.stores?.name || "—",
        detail: "Collection received",
        total: Number(t.total_amount),
        cash: Number(t.cash_amount),
        upi: Number(t.upi_amount),
        credit: 0,
        sortKey: new Date(t.created_at).getTime(),
      })),
    ].sort((a, b) => a.sortKey - b.sortKey);

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Sales</div>
          <div class="kpi-value">${fmt(d.totalSaleAmount)}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Collections</div>
          <div class="kpi-value">${fmt(d.totalCollections)}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Income</div>
          <div class="kpi-value">${fmt(d.totalIncome)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cash In</div>
          <div class="kpi-value text-pos">${fmt(d.totalCash)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">UPI In</div>
          <div class="kpi-value text-pos">${fmt(d.totalUpi)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Credit Given</div>
          <div class="kpi-value text-neg">${fmt(d.salesOutstanding)}</div>
        </div>
      </div>

      <div style="display: flex; gap: 20pt; margin-bottom: 20pt; page-break-inside: avoid;">
        <div style="flex: 1;">
          <h2>Products Sold</h2>
          <table>
            <thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Revenue</th></tr></thead>
            <tbody>
              ${d.productBreakdown.length === 0 
                ? '<tr><td colspan="3" class="empty-state">No products sold</td></tr>'
                : d.productBreakdown.map((p: any) => `<tr>
                  <td>${p.name}</td>
                  <td class="font-mono text-right">${p.qty} ${p.unit}</td>
                  <td class="font-mono text-right">${fmt(p.revenue)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>

        <div style="flex: 1;">
          <h2>Route Performance</h2>
          <table>
            <thead><tr><th>Route</th><th class="text-center">Target</th><th class="text-right">Sales</th><th class="text-right">Coll.</th></tr></thead>
            <tbody>
              ${d.routePerformance.length === 0
                ? '<tr><td colspan="4" class="empty-state">No route activity</td></tr>'
                : d.routePerformance.map((r: any) => `<tr>
                  <td class="font-medium">${r.name}</td>
                  <td class="text-center font-mono">${r.storesCovered}/${r.totalStores} <span class="text-muted">(${r.pctCovered}%)</span></td>
                  <td class="text-right font-mono">${fmt(r.sales)}</td>
                  <td class="text-right font-mono text-pos">${fmt(r.collected)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div style="page-break-inside: avoid;">
        <h2>Order Fulfillment</h2>
        <table>
          <thead><tr><th>Metric</th><th>Count</th></tr></thead>
          <tbody>
            <tr><td>Orders Delivered</td><td class="font-mono">${d.ordersDelivered}</td></tr>
            <tr><td>Orders Pending</td><td class="font-mono">${d.ordersPending}</td></tr>
            <tr><td>Orders Cancelled</td><td class="font-mono">${d.ordersCancelled}</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Staff Balances</h2>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th class="text-right">Collected</th><th class="text-right">Handover</th><th class="text-right">Received</th><th class="text-right">Balance</th></tr></thead>
        <tbody>
          ${d.staffBalances.length === 0
            ? '<tr><td colspan="6" class="empty-state">No staff activity</td></tr>'
            : d.staffBalances.map((s: any) => `<tr>
              <td class="font-bold">${s.name}</td>
              <td><span class="pill pill-${s.role === "agent" ? "warning" : "success"}">${s.role.replace("_", " ")}</span></td>
              <td class="text-right font-mono">${fmt(s.collected)}</td>
              <td class="text-right font-mono">${fmt(s.handed_over)}</td>
              <td class="text-right font-mono">${fmt(s.received)}</td>
              <td class="text-right font-mono ${s.balance > 0 ? "text-pos font-bold" : s.balance < 0 ? "text-neg" : ""}">${fmt(s.balance)}</td>
            </tr>`).join("")}
        </tbody>
      </table>

      <h2>Sales & Payments Timeline</h2>
      <table>
        <thead><tr>
          <th class="text-center">Time</th>
          <th>Type</th>
          <th>Store</th>
          <th>Notes</th>
          <th class="text-right">Cash</th>
          <th class="text-right">UPI</th>
          <th class="text-right">Credit</th>
          <th class="text-right">Total</th>
        </tr></thead>
        <tbody>
          ${chronological.length === 0
            ? '<tr><td colspan="8" class="empty-state">No entries in timeline</td></tr>'
            : chronological.map((e: any) => `<tr>
              <td class="font-mono text-center text-muted">${e.time}</td>
              <td><span class="pill pill-${e.type === "Sale" ? "success" : "warning"}">${e.type}</span></td>
              <td class="font-medium">${e.store} <div class="font-mono text-muted" style="font-size: 8pt;">${e.id}</div></td>
              <td class="text-muted" style="font-size: 9pt;">${e.detail}</td>
              <td class="text-right font-mono ${e.cash > 0 ? "text-pos" : ""}">${fmt(e.cash)}</td>
              <td class="text-right font-mono ${e.upi > 0 ? "text-pos" : ""}">${fmt(e.upi)}</td>
              <td class="text-right font-mono ${e.type === "Sale" && e.credit > 0 ? "text-neg" : ""}">${e.type === "Payment" ? "—" : fmt(e.credit)}</td>
              <td class="text-right font-mono font-bold">${fmt(e.total)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;

    return generatePrintHTML({
      title: "Daily Operations Report",
      dateRange: date,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
      metadata: {
        "Sales Count": String(d.salesCount),
        "Payments Count": String(d.txnCount),
        "Total Outstanding MTD": fmt(d.totalOutstanding),
      }
    });
  };

  const generateExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = [
      ["Daily Business Report", ""],
      ["Date", new Date(date).toLocaleDateString("en-IN")],
      ["", ""],
      ["Metric", "Value"],
      ["Total Sale Amount", d.totalSaleAmount],
      ["Total Collections", d.totalCollections],
      ["Total Income (Sales + Collections)", d.totalIncome],
      ["Cash Collected", d.totalCash],
      ["UPI Collected", d.totalUpi],
      ["Credit Given", d.salesOutstanding],
      ["Total Items Sold", d.totalItemsSold],
      ["Sales Count", d.salesCount],
      ["Payments Count", d.txnCount],
      ["Orders Delivered", d.ordersDelivered],
      ["Orders Pending", d.ordersPending],
      ["Total Outstanding", d.totalOutstanding],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

    // Sales sheet
    if (d.sales.length > 0) {
      const salesData = d.sales.map((s: any) => ({
        "Sale ID": s.display_id, Store: s.stores?.name || "", Total: Number(s.total_amount),
        Cash: Number(s.cash_amount), UPI: Number(s.upi_amount), Credit: Number(s.outstanding_amount),
        "Old Outstanding": Number(s.old_outstanding), "New Outstanding": Number(s.new_outstanding),
        Time: new Date(s.created_at).toLocaleTimeString("en-IN"),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), "Sales");
    }

    // Payments sheet
    if (d.txns.length > 0) {
      const txnData = d.txns.map((t: any) => ({
        "Payment ID": t.display_id, Store: t.stores?.name || "", Total: Number(t.total_amount),
        Cash: Number(t.cash_amount), UPI: Number(t.upi_amount),
        "Old Outstanding": Number(t.old_outstanding), "New Outstanding": Number(t.new_outstanding),
        Time: new Date(t.created_at).toLocaleTimeString("en-IN"),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnData), "Payments");
    }

    // Products sheet
    if (d.productBreakdown.length > 0) {
      const prodData = d.productBreakdown.map((p) => ({ Product: p.name, Quantity: p.qty, Unit: p.unit, Revenue: p.revenue }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodData), "Products Sold");
    }

    // Staff balances sheet
    if (d.staffBalances.length > 0) {
      const staffData = d.staffBalances.map((s) => ({
        Staff: s.name, Role: s.role, Collected: s.collected, "Handed Over": s.handed_over,
        "Pending Handover": s.pending_handover, Received: s.received, Balance: s.balance,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffData), "Staff Balances");
    }

    // Outstanding sheet
    if (d.storesWithOutstanding.length > 0) {
      const outData = d.storesWithOutstanding.map((s: any) => ({ "Store ID": s.display_id, Store: s.name, Outstanding: Number(s.outstanding) }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outData), "Outstanding");
    }

    XLSX.writeFile(wb, `daily-report-${date}.xlsx`);
    toast.success("Excel downloaded");
  };

  return (
    <ReportContainer
      title="Daily Operations Report"
      subtitle="Complete daily summary of sales, collections, and operations"
      icon={<Calendar className="h-5 w-5" />}
      dateRange={new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      onPrint={() => {
        const html = generateHTML();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }}
      onExportExcel={generateExcel}
      isLoading={isLoading}
      filters={
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 mt-1 h-9" />
        </div>
      }
      summaryCards={
        <>
          <ReportKPICard label="Total Income" value={fmt(d.totalIncome)} highlight subValue="Sales + Collections" icon={<TrendingUp className="h-4 w-4" />} />
          <ReportKPICard label="Sale Amount" value={fmt(d.totalSaleAmount)} subValue={`${d.salesCount} sales`} icon={<ShoppingCart className="h-4 w-4" />} />
          <ReportKPICard label="Collections" value={fmt(d.totalCollections)} subValue={`${d.txnCount} payments`} trend="up" icon={<DollarSign className="h-4 w-4" />} />
          <ReportKPICard label="Cash Collected" value={fmt(d.totalCash)} icon={<Banknote className="h-4 w-4" />} />
          <ReportKPICard label="UPI Collected" value={fmt(d.totalUpi)} icon={<Smartphone className="h-4 w-4" />} />
          <ReportKPICard label="Items Sold" value={String(d.totalItemsSold)} icon={<Package className="h-4 w-4" />} />
        </>
      }
    >
      <div className="space-y-6">
        {/* Secondary Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 uppercase tracking-wider">Credit Given</p>
              <p className="text-xl font-bold mt-1 text-red-900 dark:text-red-100">{fmt(d.salesOutstanding)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20 border-orange-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-orange-700 dark:text-orange-300 uppercase tracking-wider">Total Outstanding</p>
              <p className="text-xl font-bold mt-1 text-orange-900 dark:text-orange-100">{fmt(d.totalOutstanding)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider">Orders Delivered</p>
              <p className="text-xl font-bold mt-1 text-green-900 dark:text-green-100">{d.ordersDelivered}</p>
              <p className="text-xs text-muted-foreground">{d.ordersPending} pending</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950/30 dark:to-gray-900/20 border-gray-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Orders Cancelled</p>
              <p className="text-xl font-bold mt-1 text-gray-900 dark:text-gray-100">{d.ordersCancelled}</p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed tabs */}
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
            <TabsTrigger value="sales" className="text-xs">Sales ({d.salesCount})</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs">Payments ({d.txnCount})</TabsTrigger>
            <TabsTrigger value="products" className="text-xs">Products ({d.productBreakdown.length})</TabsTrigger>
            <TabsTrigger value="routes" className="text-xs">Routes ({d.routePerformance.length})</TabsTrigger>
            <TabsTrigger value="staff" className="text-xs">Staff ({d.staffBalances.length})</TabsTrigger>
            <TabsTrigger value="outstanding" className="text-xs">Outstanding ({d.storesWithOutstanding.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            {d.sales.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No sales recorded for this date</CardContent></Card>
            ) : (
              <DataTable columns={salesCols} data={d.sales} searchKey="display_id" searchPlaceholder="Search sales..." />
            )}
          </TabsContent>

          <TabsContent value="payments">
            {d.txns.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No payments recorded for this date</CardContent></Card>
            ) : (
              <DataTable columns={txnCols} data={d.txns} searchKey="display_id" searchPlaceholder="Search payments..." />
            )}
          </TabsContent>

          <TabsContent value="products">
            {d.productBreakdown.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No products sold</CardContent></Card>
            ) : (
              <DataTable columns={productCols} data={d.productBreakdown} searchKey="name" searchPlaceholder="Search products..." />
            )}
          </TabsContent>

          <TabsContent value="routes">
            {d.routePerformance.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No routes configured</CardContent></Card>
            ) : (
              <DataTable
                columns={[
                  { header: "Route", accessor: "name" as const, className: "font-medium" },
                  { header: "Total Stores", accessor: "totalStores" as const, className: "text-center" },
                  { header: "Covered", accessor: (r: any) => `${r.storesCovered} / ${r.totalStores}`, className: "text-center" },
                  { header: "% Done", accessor: (r: any) => (
                    <span className={r.pctCovered === 100 ? "text-green-600 font-bold" : r.pctCovered >= 50 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold"}>
                      {r.pctCovered}%
                    </span>
                  ), className: "text-center" },
                  { header: "Sales", accessor: (r: any) => fmt(r.sales), className: "font-semibold" },
                  { header: "Collected", accessor: (r: any) => fmt(r.collected), className: "text-green-600" },
                  { header: "Outstanding", accessor: (r: any) => fmt(r.pending), className: "text-red-600" },
                ]}
                data={d.routePerformance}
                searchKey="name"
                searchPlaceholder="Search routes..."
              />
            )}
          </TabsContent>

          <TabsContent value="staff">
            {d.staffBalances.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No staff activity</CardContent></Card>
            ) : (
              <>
                <Card className="mb-4 border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/20">
                  <CardContent className="py-3 px-4 text-sm text-amber-800 dark:text-amber-200">
                    <strong>Balance Formula:</strong> Total Collected − Handed Over − Pending Handover + Received from others
                  </CardContent>
                </Card>
                <DataTable columns={staffCols} data={d.staffBalances} searchKey="name" searchPlaceholder="Search staff..." />
              </>
            )}
          </TabsContent>

          <TabsContent value="outstanding">
            {d.storesWithOutstanding.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No stores with outstanding balances</CardContent></Card>
            ) : (
              <DataTable
                columns={[
                  { header: "Store ID", accessor: "display_id" as const, className: "font-mono text-xs" },
                  { header: "Store", accessor: "name" as const, className: "font-medium" },
                  { header: "Outstanding", accessor: (r: any) => fmt(Number(r.outstanding)), className: "font-semibold text-red-600" },
                ]}
                data={d.storesWithOutstanding}
                searchKey="name"
                searchPlaceholder="Search stores..."
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ReportContainer>
  );
}
