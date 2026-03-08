import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Store, DollarSign, ShoppingCart, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: stores } = useQuery({
    queryKey: ["customer-stores", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("*, store_types(name), routes(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sales } = useQuery({
    queryKey: ["customer-sales", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, stores(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ["customer-orders", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, stores(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) {
    return <div className="text-center py-20 text-muted-foreground">Customer not found</div>;
  }

  const totalSales = sales?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalOutstanding = stores?.reduce((s, r) => s + Number(r.outstanding), 0) || 0;

  const storeColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Name", accessor: "name" as const, className: "font-medium cursor-pointer hover:text-primary", onClick: (row: any) => navigate(`/stores/${row.id}`) },
    { header: "Type", accessor: (row: any) => row.store_types?.name || "—" },
    { header: "Route", accessor: (row: any) => row.routes?.name || "—" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}` },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}` },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Type", accessor: "order_type" as const },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">{customer.display_id} • {customer.phone || "No phone"} • {customer.email || "No email"}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={customer.is_active ? "active" : "inactive"} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      <Tabs defaultValue="stores">
        <TabsList>
          <TabsTrigger value="stores">Stores ({stores?.length || 0})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="stores" className="mt-4">
          {(stores?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No stores</div>
          ) : (
            <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." />
          )}
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No sales recorded</div>
          ) : (
            <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No orders</div>
          ) : (
            <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerDetail;
