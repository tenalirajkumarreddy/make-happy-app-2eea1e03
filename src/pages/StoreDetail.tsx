import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ArrowLeft, DollarSign, ShoppingCart, Banknote,
  MapPin, Store as StoreIcon, Phone, User, Tag, Navigation, Calendar,
} from "lucide-react";
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

  const fullAddress = [store.street, store.area, store.city, store.district, store.state, store.pincode]
    .filter(Boolean)
    .join(", ") || store.address || "Not provided";

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding_amount).toLocaleString()}`, className: "hidden sm:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const txnColumns = [
    { header: "Txn ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Type", accessor: "order_type" as const, className: "hidden sm:table-cell" },
    { header: "Source", accessor: "source" as const, className: "hidden sm:table-cell" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const visitColumns = [
    { header: "Route", accessor: (row: any) => (row.route_sessions as any)?.routes?.name || "—" },
    { header: "Notes", accessor: (row: any) => row.notes || "—", className: "text-sm hidden sm:table-cell" },
    { header: "Location", accessor: (row: any) => row.lat ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}` : "—", className: "text-xs text-muted-foreground hidden md:table-cell" },
    { header: "Visited At", accessor: (row: any) => new Date(row.visited_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/stores")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Stores
      </Button>

      {/* Profile Card */}
      <Card className="overflow-hidden">
        <div className="h-20 sm:h-28 bg-gradient-to-r from-accent/40 via-primary/15 to-accent/20" />
        <CardContent className="relative px-4 sm:px-6 pb-6 -mt-10 sm:-mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            {/* Photo */}
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {store.photo_url ? (
                <img src={store.photo_url} alt={store.name} className="w-full h-full object-cover" />
              ) : (
                <StoreIcon className="h-10 w-10 text-muted-foreground/40" />
              )}
            </div>

            {/* Name & badges */}
            <div className="flex-1 min-w-0 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{store.name}</h1>
                <StatusBadge status={store.is_active ? "active" : "inactive"} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground font-mono">{store.display_id}</span>
                {(store as any).store_types?.name && (
                  <Badge variant="secondary" className="text-xs">{(store as any).store_types.name}</Badge>
                )}
              </div>
            </div>

            {/* Map link on desktop */}
            {store.lat && store.lng && (
              <a
                href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm text-primary hover:underline shrink-0 pb-1"
              >
                <MapPin className="h-4 w-4" /> View on Map
              </a>
            )}
          </div>

          <Separator className="my-4" />

          {/* Detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoItem icon={User} label="Customer" value={(store as any).customers?.name || "—"} />
            <InfoItem icon={Navigation} label="Route" value={(store as any).routes?.name || "Not assigned"} />
            <InfoItem icon={Phone} label="Phone" value={store.phone || "Not provided"} />
            <InfoItem icon={MapPin} label="Address" value={fullAddress} />
            <InfoItem icon={Tag} label="Opening Balance" value={`₹${Number(store.opening_balance).toLocaleString()}`} />
            <InfoItem icon={Calendar} label="Created" value={new Date(store.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })} />
            {store.alternate_phone && <InfoItem icon={Phone} label="Alt. Phone" value={store.alternate_phone} />}
            {store.lat && store.lng && (
              <div className="sm:hidden">
                <a
                  href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3 text-primary hover:bg-primary/15 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium">View on Map</p>
                  </div>
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Collections" value={`₹${totalCollected.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="Outstanding" value={`₹${Number(store.outstanding).toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sales">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm">Collections ({transactions?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders ({orders?.length || 0})</TabsTrigger>
          <TabsTrigger value="visits" className="text-xs sm:text-sm">Visits ({visits?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? <EmptyTab label="No sales yet" /> : (
            <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          {(transactions?.length || 0) === 0 ? <EmptyTab label="No collections yet" /> : (
            <DataTable columns={txnColumns} data={transactions || []} searchKey="display_id" searchPlaceholder="Search..." />
          )}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? <EmptyTab label="No orders yet" /> : (
            <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />
          )}
        </TabsContent>
        <TabsContent value="visits" className="mt-4">
          {(visits?.length || 0) === 0 ? <EmptyTab label="No visits recorded" /> : (
            <DataTable columns={visitColumns} data={visits || []} searchKey="notes" searchPlaceholder="Search..." />
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

export default StoreDetail;
