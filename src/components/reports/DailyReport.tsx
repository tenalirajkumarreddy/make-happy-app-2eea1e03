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
    const dateStr = new Date(date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Daily Report - ${date}</title>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#111820;--mid:#4a5560;--muted:#8a9aa8;--rule:#dde4ea;--accent:#0f2d4a;--tint:#e8f0f8;--pos:#155a38;--neg:#7a1c1c;--pay:#6a4a10}
body{background:#c8d4de;display:flex;justify-content:center;padding:24px;font-family:'DM Sans',sans-serif}
.page{width:297mm;min-height:210mm;background:#fff;padding:7mm 9mm 6mm;box-shadow:0 6px 40px rgba(0,0,0,.20);display:flex;flex-direction:column;gap:3.5mm}
.header{display:grid;grid-template-columns:70mm 1fr 58mm;border:1.5px solid var(--accent)}
.hd-brand{background:var(--accent);color:#fff;padding:3.5mm 5mm;display:flex;flex-direction:column;justify-content:center}
.hd-brand .biz{font-family:'Crimson Pro',serif;font-size:18pt;line-height:1}
.hd-brand .sub{font-size:6.5pt;letter-spacing:2.5px;text-transform:uppercase;opacity:.6;margin-top:2px}
.hd-center{border-left:1.5px solid var(--accent);border-right:1.5px solid var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3mm}
.hd-center .title{font-size:11pt;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--accent)}
.hd-center .date{font-size:8.5pt;color:var(--mid);font-weight:300;margin-top:2px}
.hd-meta{padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;gap:3px}
.hd-meta .mrow{display:flex;justify-content:space-between;font-size:7pt}
.hd-meta .ml{color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.hd-meta .mv{font-family:'DM Mono',monospace;font-weight:500;color:var(--ink)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(28mm,1fr));border:1.5px solid var(--accent)}
.card{padding:2.5mm 3mm;border-right:1px solid var(--rule);text-align:center}
.card:last-child{border-right:none}
.card.hi{background:var(--tint)}
.card-label{font-size:5.5pt;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:500;margin-bottom:2px}
.card-value{font-family:'DM Mono',monospace;font-size:12pt;font-weight:500;color:var(--ink)}
.card-value.accent{color:var(--accent);font-size:13pt;font-weight:600}
.card-value.pos{color:var(--pos)}
.card-value.neg{color:var(--neg)}
.card-sub{font-size:5.5pt;color:var(--muted);margin-top:1px}
.mid-row{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}
.box{border:1.5px solid var(--accent);overflow:hidden}
.box-head{background:var(--accent);color:#fff;padding:1.5mm 3mm;font-size:6.5pt;font-weight:600;letter-spacing:2px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center}
.box-head em{opacity:.5;font-style:normal;font-size:6pt;font-weight:400}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
thead th{background:var(--tint);color:var(--accent);font-weight:600;font-size:6.5pt;text-transform:uppercase;letter-spacing:.5px;padding:1.5mm 2.5mm;border-bottom:1.5px solid var(--rule);text-align:left;white-space:nowrap}
th.r,td.r{text-align:right}
th.c,td.c{text-align:center}
tbody tr{border-bottom:1px solid var(--rule)}
tbody tr:last-child{border-bottom:none}
tbody tr:nth-child(even){background:#fafcfe}
td{padding:1.5mm 2.5mm;color:var(--ink);vertical-align:middle}
td.mono{font-family:'DM Mono',monospace;font-size:7pt}
td.muted{color:var(--muted);font-size:7pt}
td.pos{color:var(--pos);font-family:'DM Mono',monospace}
td.neg{color:var(--neg);font-family:'DM Mono',monospace}
td.num{font-family:'DM Mono',monospace}
.pill{display:inline-block;padding:1px 5px;border-radius:2px;font-size:6pt;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.pill.sale{background:#dff0eb;color:var(--pos)}
.pill.pay{background:#fff0d5;color:var(--pay)}
.footer{border-top:1.5px solid var(--accent);padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:6.5pt;color:var(--muted);margin-top:auto}
.sig{border-bottom:1px solid var(--rule);display:inline-block;width:40mm;margin-left:2mm;vertical-align:bottom}
@media print{body{background:none;padding:0}.page{box-shadow:none;width:297mm;height:210mm}}
@page{size:A4 landscape;margin:0}
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="hd-brand">
      <div class="biz">BizManager</div>
      <div class="sub">Daily Operations Report</div>
    </div>
    <div class="hd-center">
      <div class="title">Daily Report</div>
      <div class="date">${dateStr}</div>
    </div>
    <div class="hd-meta">
      <div class="mrow"><span class="ml">Sales Count</span><span class="mv">${d.salesCount}</span></div>
      <div class="mrow"><span class="ml">Payments</span><span class="mv">${d.txnCount}</span></div>
      <div class="mrow"><span class="ml">Delivered</span><span class="mv">${d.ordersDelivered}</span></div>
      <div class="mrow"><span class="ml">Pending</span><span class="mv">${d.ordersPending}</span></div>
    </div>
  </div>

  <div class="cards">
    <div class="card hi">
      <div class="card-label">Total Sales</div>
      <div class="card-value accent">${fmt(d.totalSaleAmount)}</div>
      <div class="card-sub">${d.salesCount} sales</div>
    </div>
    <div class="card hi">
      <div class="card-label">Collections</div>
      <div class="card-value accent">${fmt(d.totalCollections)}</div>
      <div class="card-sub">${d.txnCount} payments</div>
    </div>
    <div class="card hi">
      <div class="card-label">Total Income</div>
      <div class="card-value accent">${fmt(d.totalIncome)}</div>
      <div class="card-sub">Sales + Collections</div>
    </div>
    <div class="card">
      <div class="card-label">Cash Collected</div>
      <div class="card-value pos">${fmt(d.totalCash)}</div>
    </div>
    <div class="card">
      <div class="card-label">UPI Collected</div>
      <div class="card-value pos">${fmt(d.totalUpi)}</div>
    </div>
    <div class="card">
      <div class="card-label">Credit Given</div>
      <div class="card-value neg">${fmt(d.salesOutstanding)}</div>
      <div class="card-sub">Today's outstanding</div>
    </div>
    <div class="card">
      <div class="card-label">All-Store Outstanding</div>
      <div class="card-value neg">${fmt(d.totalOutstanding)}</div>
      <div class="card-sub">Cumulative</div>
    </div>
  </div>

  <div class="mid-row">
    <div class="box">
      <div class="box-head">Products Sold</div>
      <table>
        <thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Avg Price</th><th class="r">Revenue</th></tr></thead>
        <tbody>
          ${d.productBreakdown.length === 0 
            ? '<tr><td colspan="4" class="muted" style="text-align:center">No products sold</td></tr>'
            : d.productBreakdown.map((p: any) => `<tr>
              <td>${p.name}</td>
              <td class="r num">${p.qty} ${p.unit}</td>
              <td class="r num">${fmt(Math.round(p.revenue / p.qty))}</td>
              <td class="r num">${fmt(p.revenue)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="box">
      <div class="box-head">Staff Balances</div>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th class="r">Collected</th><th class="r">Handed Over</th><th class="r">Received</th><th class="r">Balance</th></tr></thead>
        <tbody>
          ${d.staffBalances.length === 0
            ? '<tr><td colspan="6" class="muted" style="text-align:center">No staff activity</td></tr>'
            : d.staffBalances.map((s: any) => `<tr>
              <td><strong>${s.name}</strong></td>
              <td><span class="pill ${s.role === "agent" ? "pay" : "sale"}">${s.role.replace("_", " ")}</span></td>
              <td class="r num">${fmt(s.collected)}</td>
              <td class="r num">${fmt(s.handed_over)}</td>
              <td class="r num">${fmt(s.received)}</td>
              <td class="r ${s.balance > 0 ? "pos" : s.balance < 0 ? "neg" : "num"}">${fmt(s.balance)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <div class="box">
    <div class="box-head">Sales &amp; Payments — Chronological <em>${chronological.length} entries</em></div>
    <table>
      <thead><tr>
        <th class="c" style="width:14mm">Time</th>
        <th style="width:16mm">Type</th>
        <th style="width:24mm">ID</th>
        <th>Store</th>
        <th>Product / Note</th>
        <th class="r">Total</th>
        <th class="r">Cash</th>
        <th class="r">UPI</th>
        <th class="r">Credit</th>
      </tr></thead>
      <tbody>
        ${chronological.length === 0
          ? '<tr><td colspan="9" class="muted" style="text-align:center">No entries</td></tr>'
          : chronological.map((e: any) => `<tr>
            <td class="mono c">${e.time}</td>
            <td><span class="pill ${e.type === "Sale" ? "sale" : "pay"}">${e.type}</span></td>
            <td class="mono muted">${e.id}</td>
            <td>${e.store}</td>
            <td class="muted">${e.detail}</td>
            <td class="r num">${fmt(e.total)}</td>
            <td class="r ${e.cash > 0 ? "pos" : "num"}">${fmt(e.cash)}</td>
            <td class="r ${e.upi > 0 ? "pos" : "num"}">${fmt(e.upi)}</td>
            <td class="r ${e.type === "Sale" && e.credit > 0 ? "neg" : "num"}">${e.type === "Payment" ? "—" : fmt(e.credit)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span>Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · BizManager · Confidential</span>
    <span>Authorised Signature <span class="sig"></span></span>
    <span>Total Outstanding (All Stores): <strong style="color:var(--neg)">${fmt(d.totalOutstanding)}</strong> · Page 1 of 1</span>
  </div>

</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      // Auto-trigger print dialog after fonts load
      setTimeout(() => win.print(), 800);
    }
    toast.success("Report opened — use Print → Save as PDF");
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
