import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { DataTable } from "@/components/shared/DataTable";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign, Banknote, Smartphone, TrendingUp, Download,
  ShoppingCart, Package, Users, HandCoins, FileText, FileSpreadsheet,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function DailyReport() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const startOfDay = date + "T00:00:00";
  const endOfDay = date + "T23:59:59";

  const { data, isLoading } = useQuery({
    queryKey: ["daily-report", date],
    queryFn: async () => {
      const [salesRes, txnRes, ordersRes, saleItemsRes, storesRes, handoversRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("sales").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("transactions").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("orders").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("sale_items").select("*, products(name, unit)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("stores").select("id, name, display_id, outstanding").eq("is_active", true),
        supabase.from("handovers").select("*").eq("handover_date", date),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id, role").neq("role", "customer"),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const orders = ordersRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const stores = storesRes.data || [];
      const handovers = handoversRes.data || [];
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];

      const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name]));

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

      // Staff-wise balance calculation
      const staffIds = roles.map((r) => r.user_id);
      const staffBalances = staffIds.map((uid) => {
        const name = profileMap[uid] || "Unknown";
        const role = roles.find((r) => r.user_id === uid)?.role || "";

        // Sales recorded by this user (cash + upi collected)
        const userSales = sales.filter((s) => s.recorded_by === uid);
        const collectedFromSales = userSales.reduce((s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);

        // Transactions/payments recorded by this user
        const userTxns = txns.filter((t) => t.recorded_by === uid);
        const collectedFromTxns = userTxns.reduce((s, r) => s + Number(r.total_amount), 0);

        const totalCollected = collectedFromSales + collectedFromTxns;

        // Handovers sent (confirmed)
        const sentConfirmed = handovers.filter((h) => h.user_id === uid && h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        // Handovers sent (pending)
        const sentPending = handovers.filter((h) => h.user_id === uid && h.status === "pending")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        // Handovers received (confirmed)
        const receivedConfirmed = handovers.filter((h) => h.handed_to === uid && h.status === "confirmed")
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

      return {
        sales, txns, orders, saleItems, productBreakdown, staffBalances,
        storesWithOutstanding,
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
  const generatePDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date(date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    doc.setFontSize(18);
    doc.text("Daily Business Report", 14, 20);
    doc.setFontSize(11);
    doc.text(dateStr, 14, 28);

    let y = 36;

    // Summary
    doc.setFontSize(13);
    doc.text("Summary", 14, y); y += 6;
    const summaryData = [
      ["Total Sale Amount", fmt(d.totalSaleAmount)],
      ["Total Collections (Payments)", fmt(d.totalCollections)],
      ["Total Income (Sales + Collections)", fmt(d.totalIncome)],
      ["Cash Collected", fmt(d.totalCash)],
      ["UPI Collected", fmt(d.totalUpi)],
      ["Credit Given (Outstanding from Sales)", fmt(d.salesOutstanding)],
      ["Total Items Sold", String(d.totalItemsSold)],
      ["Sales Count", String(d.salesCount)],
      ["Payments Count", String(d.txnCount)],
      ["Orders Delivered", String(d.ordersDelivered)],
      ["Orders Pending", String(d.ordersPending)],
      ["Total Outstanding (All Stores)", fmt(d.totalOutstanding)],
    ];
    autoTable(doc, { startY: y, head: [["Metric", "Value"]], body: summaryData, theme: "grid", headStyles: { fillColor: [30, 30, 30] } });
    y = (doc as any).lastAutoTable.finalY + 10;

    // Sales
    if (d.sales.length > 0) {
      doc.setFontSize(13);
      doc.text("Sales", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [["ID", "Store", "Total", "Cash", "UPI", "Credit", "Time"]],
        body: d.sales.map((s: any) => [
          s.display_id, s.stores?.name || "—", fmt(Number(s.total_amount)), fmt(Number(s.cash_amount)),
          fmt(Number(s.upi_amount)), fmt(Number(s.outstanding_amount)),
          new Date(s.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        ]),
        theme: "striped", headStyles: { fillColor: [30, 30, 30] }, styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Payments
    if (d.txns.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.text("Payments / Collections", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [["ID", "Store", "Total", "Cash", "UPI", "Time"]],
        body: d.txns.map((t: any) => [
          t.display_id, t.stores?.name || "—", fmt(Number(t.total_amount)), fmt(Number(t.cash_amount)),
          fmt(Number(t.upi_amount)),
          new Date(t.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        ]),
        theme: "striped", headStyles: { fillColor: [30, 30, 30] }, styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Products
    if (d.productBreakdown.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.text("Products Sold", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Product", "Quantity", "Revenue"]],
        body: d.productBreakdown.map((p) => [p.name, `${p.qty} ${p.unit}`, fmt(p.revenue)]),
        theme: "striped", headStyles: { fillColor: [30, 30, 30] }, styles: { fontSize: 9 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Staff balances
    if (d.staffBalances.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.text("Staff Balances", 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Staff", "Role", "Collected", "Handed Over", "Pending", "Received", "Balance"]],
        body: d.staffBalances.map((s) => [s.name, s.role, fmt(s.collected), fmt(s.handed_over), fmt(s.pending_handover), fmt(s.received), fmt(s.balance)]),
        theme: "striped", headStyles: { fillColor: [30, 30, 30] }, styles: { fontSize: 8 },
      });
    }

    doc.save(`daily-report-${date}.pdf`);
    toast.success("PDF downloaded");
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
    <div className="space-y-6">
      {/* Date picker & export */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 mt-1" />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={generatePDF}>
          <FileText className="mr-1.5 h-4 w-4" />
          Download PDF
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={generateExcel}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          Download Excel
        </Button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total Income" value={fmt(d.totalIncome)} change="Sales + Collections" changeType="positive" icon={TrendingUp} iconColor="bg-primary" />
        <StatCard title="Sale Amount" value={fmt(d.totalSaleAmount)} change={`${d.salesCount} sales`} changeType="neutral" icon={ShoppingCart} />
        <StatCard title="Collections" value={fmt(d.totalCollections)} change={`${d.txnCount} payments`} changeType="neutral" icon={DollarSign} iconColor="bg-success" />
        <StatCard title="Cash" value={fmt(d.totalCash)} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="UPI" value={fmt(d.totalUpi)} icon={Smartphone} iconColor="bg-info" />
        <StatCard title="Items Sold" value={String(d.totalItemsSold)} icon={Package} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Credit Given" value={fmt(d.salesOutstanding)} icon={HandCoins} iconColor="bg-destructive" />
        <StatCard title="Total Outstanding" value={fmt(d.totalOutstanding)} icon={DollarSign} iconColor="bg-destructive" />
        <StatCard title="Orders Delivered" value={String(d.ordersDelivered)} change={`${d.ordersPending} pending`} changeType="neutral" icon={ShoppingCart} iconColor="bg-success" />
        <StatCard title="Orders Cancelled" value={String(d.ordersCancelled)} icon={ShoppingCart} iconColor="bg-destructive" />
      </div>

      {/* Detailed tabs */}
      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sales">Sales ({d.salesCount})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({d.txnCount})</TabsTrigger>
          <TabsTrigger value="products">Products ({d.productBreakdown.length})</TabsTrigger>
          <TabsTrigger value="staff">Staff Balances ({d.staffBalances.length})</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding ({d.storesWithOutstanding.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          {d.sales.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No sales recorded</CardContent></Card>
          ) : (
            <DataTable columns={salesCols} data={d.sales} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {d.txns.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No payments recorded</CardContent></Card>
          ) : (
            <DataTable columns={txnCols} data={d.txns} searchKey="display_id" searchPlaceholder="Search payments..." />
          )}
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          {d.productBreakdown.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No products sold</CardContent></Card>
          ) : (
            <DataTable columns={productCols} data={d.productBreakdown} searchKey="name" searchPlaceholder="Search products..." />
          )}
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          {d.staffBalances.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No staff activity</CardContent></Card>
          ) : (
            <>
              <Card className="mb-4 border-warning/30 bg-warning/5">
                <CardContent className="py-3 px-4 text-sm text-muted-foreground">
                  Balance = Total Collected − Handed Over − Pending Handover + Received from others
                </CardContent>
              </Card>
              <DataTable columns={staffCols} data={d.staffBalances} searchKey="name" searchPlaceholder="Search staff..." />
            </>
          )}
        </TabsContent>

        <TabsContent value="outstanding" className="mt-4">
          {d.storesWithOutstanding.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No stores with outstanding</CardContent></Card>
          ) : (
            <DataTable
              columns={[
                { header: "Store ID", accessor: "display_id" as const, className: "font-mono text-xs" },
                { header: "Store", accessor: "name" as const, className: "font-medium" },
                { header: "Outstanding", accessor: (r: any) => fmt(Number(r.outstanding)), className: "font-semibold text-destructive" },
              ]}
              data={d.storesWithOutstanding}
              searchKey="name"
              searchPlaceholder="Search stores..."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
