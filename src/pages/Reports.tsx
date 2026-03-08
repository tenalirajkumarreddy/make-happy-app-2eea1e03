import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/shared/DataTable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BarChart3, FileText, TrendingUp, Users, DollarSign, Banknote, Smartphone } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Reports = () => {
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", reportDate],
    queryFn: async () => {
      const startOfDay = reportDate + "T00:00:00";
      const endOfDay = reportDate + "T23:59:59";

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
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const d = data!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reports" subtitle="Generate and view business reports" />

      <div className="flex items-center gap-3">
        <Label>Report Date</Label>
        <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-44" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Sales" value={`₹${d.totalSales.toLocaleString()}`} change={`${d.salesCount} sales`} changeType="neutral" icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Cash Collected" value={`₹${d.totalCash.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="UPI Collected" value={`₹${d.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="bg-info" />
        <StatCard title="Collections" value={`₹${d.totalCollections.toLocaleString()}`} change={`${d.txnCount} transactions`} changeType="neutral" icon={TrendingUp} iconColor="bg-warning" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales ({d.salesCount})</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding ({d.outstandingStores.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          {d.sales.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No sales recorded on this date</div>
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
