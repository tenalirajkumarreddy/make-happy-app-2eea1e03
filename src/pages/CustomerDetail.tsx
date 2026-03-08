import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, ArrowLeft, Store, DollarSign, ShoppingCart, Banknote,
  User, Phone, Mail, MapPin, Calendar, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs", hideOnMobile: true },
    { header: "Name", accessor: "name" as const, className: "font-medium" },
    { header: "Type", accessor: (row: any) => row.store_types?.name || "—", className: "hidden sm:table-cell" },
    { header: "Route", accessor: (row: any) => row.routes?.name || "—", className: "hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "hidden sm:table-cell" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "hidden sm:table-cell" },
    { header: "Type", accessor: "order_type" as const, className: "hidden sm:table-cell" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const kycLabel = customer.kyc_status?.replace("_", " ") || "not requested";
  const kycVariant = customer.kyc_status === "verified" ? "verified" : customer.kyc_status === "pending" ? "pending" : "inactive";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Customers
      </Button>

      {/* Profile Card */}
      <Card className="overflow-hidden">
        <div className="h-20 sm:h-28 bg-gradient-to-r from-primary/20 via-accent/30 to-primary/10" />
        <CardContent className="relative px-4 sm:px-6 pb-6 -mt-10 sm:-mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            {/* Avatar */}
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {customer.photo_url ? (
                <img src={customer.photo_url} alt={customer.name} className="w-full h-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-muted-foreground/40" />
              )}
            </div>

            {/* Name & badges */}
            <div className="flex-1 min-w-0 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{customer.name}</h1>
                <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{customer.display_id}</p>
            </div>

            {/* KYC badge on desktop */}
            <div className="hidden sm:block shrink-0 pb-1">
              <StatusBadge status={kycVariant} label={`KYC: ${kycLabel}`} />
            </div>
          </div>

          <Separator className="my-4" />

          {/* Contact details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoItem icon={Phone} label="Phone" value={customer.phone || "Not provided"} />
            <InfoItem icon={Mail} label="Email" value={customer.email || "Not provided"} />
            <InfoItem icon={MapPin} label="Address" value={customer.address || "Not provided"} />
            <InfoItem icon={Calendar} label="Joined" value={new Date(customer.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })} />
          </div>

          {/* KYC badge on mobile */}
          <div className="sm:hidden mt-3">
            <InfoItem icon={Shield} label="KYC Status" value={kycLabel} />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stores">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="stores" className="text-xs sm:text-sm">Stores ({stores?.length || 0})</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders ({orders?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="stores" className="mt-4">
          {(stores?.length || 0) === 0 ? (
            <EmptyTab label="No stores yet" />
          ) : (
            <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." onRowClick={(row) => navigate(`/stores/${row.id}`)} />
          )}
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? (
            <EmptyTab label="No sales recorded" />
          ) : (
            <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? (
            <EmptyTab label="No orders" />
          ) : (
            <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
      {label}
    </div>
  );
}

export default CustomerDetail;
