import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, DollarSign, ShoppingCart, Banknote, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

const StoreDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(name), store_types(name), routes(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: sales } = useQuery({
    queryKey: ["store-sales", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*")
        .eq("store_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: transactions } = useQuery({
    queryKey: ["store-transactions", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("store_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ["store-orders", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: visits } = useQuery({
    queryKey: ["store-visits", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_visits")
        .select("*, route_sessions(routes(name))")
        .eq("store_id", id!)
        .order("visited_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!store) {
    return <div className="text-center py-20 text-muted-foreground">Store not found</div>;
  }

  const totalSales = sales?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalCollected = transactions?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}` },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}` },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding_amount).toLocaleString()}` },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const txnColumns = [
    { header: "Txn ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}` },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}` },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Type", accessor: "order_type" as const },
    { header: "Source", accessor: "source" as const },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const visitColumns = [
    { header: "Route", accessor: (row: any) => (row.route_sessions as any)?.routes?.name || "—" },
    { header: "Notes", accessor: (row: any) => row.notes || "—", className: "text-sm" },
    { header: "Location", accessor: (row: any) => row.lat ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}` : "—", className: "text-xs text-muted-foreground" },
    { header: "Visited At", accessor: (row: any) => new Date(row.visited_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/stores")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span>{store.display_id}</span>
            <span>•</span>
            <span>{(store as any).customers?.name}</span>
            {(store as any).store_types?.name && <Badge variant="secondary" className="text-xs">{(store as any).store_types.name}</Badge>}
            {(store as any).routes?.name && <><span>•</span><span>{(store as any).routes.name}</span></>}
            {store.lat && store.lng && (
              <a href={`https://www.google.com/maps?q=${store.lat},${store.lng}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Map
              </a>
            )}
          </div>
        </div>
        <StatusBadge status={store.is_active ? "active" : "inactive"} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Collections" value={`₹${totalCollected.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="Outstanding" value={`₹${Number(store.outstanding).toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="transactions">Collections ({transactions?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders?.length || 0})</TabsTrigger>
          <TabsTrigger value="visits">Visits ({visits?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No sales</div>
          ) : (
            <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search..." />
          )}
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          {(transactions?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No collections</div>
          ) : (
            <DataTable columns={txnColumns} data={transactions || []} searchKey="display_id" searchPlaceholder="Search..." />
          )}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No orders</div>
          ) : (
            <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search..." />
          )}
        </TabsContent>
        <TabsContent value="visits" className="mt-4">
          {(visits?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No visits recorded</div>
          ) : (
            <DataTable columns={visitColumns} data={visits || []} searchKey="notes" searchPlaceholder="Search..." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StoreDetail;
