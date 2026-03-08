import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/shared/DataTable";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Banknote, Smartphone, TrendingUp, Download, Printer } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function exportCSV(data: any[], columns: { header: string; key: string }[], filename: string) {
  const header = columns.map((c) => c.header).join(",");
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = c.key.includes(".") ? c.key.split(".").reduce((o: any, k) => o?.[k], row) : row[c.key];
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${data.length} rows`);
}

const Reports = () => {
  const today = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", fromDate, toDate],
    queryFn: async () => {
      const startOfDay = fromDate + "T00:00:00";
      const endOfDay = toDate + "T23:59:59";

      const [salesRes, txnRes, ordersRes, storesRes] = await Promise.all([
        supabase.from("sales").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("transactions").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at", { ascending: false }),
        supabase.from("orders").select("*, stores(name)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("stores").select("id, name, display_id, outstanding").eq("is_active", true).gt("outstanding", 0).order("outstanding", { ascending: false }),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];

      return {
        sales,
        transactions: txns,
        orders: ordersRes.data || [],
        outstandingStores: storesRes.data || [],
        totalSales: sales.reduce((s, r) => s + Number(r.total_amount), 0),
        totalCash: sales.reduce((s, r) => s + Number(r.cash_amount), 0) + txns.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: sales.reduce((s, r) => s + Number(r.upi_amount), 0) + txns.reduce((s, r) => s + Number(r.upi_amount), 0),
        totalCollections: txns.reduce((s, r) => s + Number(r.total_amount), 0),
        salesCount: sales.length,
        txnCount: txns.length,
        ordersDelivered: (ordersRes.data || []).filter((o) => o.status === "delivered").length,
        ordersPending: (ordersRes.data || []).filter((o) => o.status === "pending").length,
      };
    },
  });

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}` },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}` },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), className: "text-muted-foreground text-xs" },
  ];

  const outstandingColumns = [
    { header: "Store ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: "name" as const, className: "font-medium" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold text-destructive" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={5} rows={6} />;
  }

  const d = data!;

  return (
    <div className="space-y-6 animate-fade-in print-report">
      <PageHeader title="Reports" subtitle="Generate and view business reports" />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40 mt-1" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40 mt-1" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            exportCSV(
              d.sales.map((s: any) => ({ ...s, store_name: s.stores?.name || "" })),
              [
                { header: "Sale ID", key: "display_id" },
                { header: "Store", key: "store_name" },
                { header: "Total", key: "total_amount" },
                { header: "Cash", key: "cash_amount" },
                { header: "UPI", key: "upi_amount" },
                { header: "Outstanding", key: "outstanding_amount" },
                { header: "Date", key: "created_at" },
              ],
              `sales-report-${fromDate}-to-${toDate}.csv`
            );
          }}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export Sales CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            exportCSV(
              d.outstandingStores,
              [
                { header: "Store ID", key: "display_id" },
                { header: "Store", key: "name" },
                { header: "Outstanding", key: "outstanding" },
              ],
              `outstanding-report-${fromDate}.csv`
            );
          }}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export Outstanding CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => window.print()}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block mb-4">
        <h2 className="text-lg font-bold">Business Report</h2>
        <p className="text-sm text-muted-foreground">Period: {fromDate} to {toDate}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Sales" value={`₹${d.totalSales.toLocaleString()}`} change={`${d.salesCount} sales`} changeType="neutral" icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Cash Collected" value={`₹${d.totalCash.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="UPI Collected" value={`₹${d.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="bg-info" />
        <StatCard title="Collections" value={`₹${d.totalCollections.toLocaleString()}`} change={`${d.txnCount} transactions`} changeType="neutral" icon={TrendingUp} iconColor="bg-warning" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="print:hidden">
          <TabsTrigger value="sales">Sales ({d.salesCount})</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding ({d.outstandingStores.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          {d.sales.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No sales recorded in this period</div>
          ) : (
            <DataTable columns={salesColumns} data={d.sales} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>
        <TabsContent value="outstanding" className="mt-4">
          {d.outstandingStores.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No stores with outstanding balance</div>
          ) : (
            <DataTable columns={outstandingColumns} data={d.outstandingStores} searchKey="name" searchPlaceholder="Search stores..." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;