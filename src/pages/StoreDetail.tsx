import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, ArrowLeft, DollarSign, ShoppingCart, Banknote,
  MapPin, Store as StoreIcon, Phone, User, Tag, Navigation, Calendar,
  Pencil, X, Save, AlertTriangle, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const StoreDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    alternate_phone: "",
    street: "",
    area: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
  });

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(name, is_active), store_types(name), routes(name)")
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
      const { data } = await supabase.from("sales").select("*, stores(name)").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
  const getRecorder = (uid: string) => profileMap.get(uid);


  const { data: transactions } = useQuery({
    queryKey: ["store-transactions", id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ["store-orders", id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: visits } = useQuery({
    queryKey: ["store-visits", id],
    queryFn: async () => {
      const { data } = await supabase.from("store_visits").select("*, route_sessions(routes(name))").eq("store_id", id!).order("visited_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const startEditing = () => {
    if (!store || !store.is_active) return;
    setForm({
      name: store.name || "",
      phone: store.phone || "",
      alternate_phone: store.alternate_phone || "",
      street: store.street || "",
      area: store.area || "",
      city: store.city || "",
      district: store.district || "",
      state: store.state || "",
      pincode: store.pincode || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const address = [form.street, form.area, form.city, form.district, form.state, form.pincode].filter(Boolean).join(", ");
    const { error } = await supabase
      .from("stores")
      .update({
        name: form.name,
        phone: form.phone || null,
        alternate_phone: form.alternate_phone || null,
        street: form.street || null,
        area: form.area || null,
        city: form.city || null,
        district: form.district || null,
        state: form.state || null,
        pincode: form.pincode || null,
        address: address || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Store updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const handleToggleActive = async () => {
    if (!store || !id) return;
    // Prevent activating store if customer is inactive
    const customerActive = (store as any).customers?.is_active;
    if (!store.is_active && customerActive === false) {
      toast.error("Cannot activate store: the customer is inactive. Activate the customer first.");
      return;
    }
    const newVal = !store.is_active;
    setToggling(true);
    const { error } = await supabase.from("stores").update({ is_active: newVal }).eq("id", id);
    setToggling(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Store ${newVal ? "activated" : "deactivated"}`);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
    qc.invalidateQueries({ queryKey: ["customer-stores", store.customer_id] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!store) {
    return <div className="text-center py-20 text-muted-foreground">Store not found</div>;
  }

  const isInactive = !store.is_active;
  const totalSales = sales?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalCollected = transactions?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const fullAddress = [store.street, store.area, store.city, store.district, store.state, store.pincode].filter(Boolean).join(", ") || store.address || "Not provided";

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Total", accessor: (row: any) => <span className="font-semibold">₹{Number(row.total_amount).toLocaleString()}</span> },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => (
      <span className={Number(row.outstanding_amount) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
        ₹{Number(row.outstanding_amount).toLocaleString()}
      </span>
    ), className: "hidden sm:table-cell" },
    { header: "Recorded By", accessor: (row: any) => {
      const p = getRecorder(row.recorded_by);
      return (
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            <AvatarImage src={p?.avatar_url || undefined} />
            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{(p?.full_name || "?").charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-xs">{p?.full_name || "—"}</span>
        </div>
      );
    }, className: "hidden lg:table-cell" },
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
      <Button variant="ghost" size="sm" onClick={() => navigate("/stores")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Stores
      </Button>

      {isInactive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">This store is inactive</p>
            <p className="text-xs text-muted-foreground mt-0.5">No sales, orders, or modifications can be made. Activate the store to resume operations.</p>
          </div>
        </div>
      )}

      <Card className={`overflow-hidden ${isInactive ? "opacity-75" : ""}`}>
        <div className="h-20 sm:h-28 bg-gradient-to-r from-accent/40 via-primary/15 to-accent/20" />
        <CardContent className="relative px-4 sm:px-6 pb-6 -mt-10 sm:-mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {store.photo_url ? (
                <img src={store.photo_url} alt={store.name} className="w-full h-full object-cover" />
              ) : (
                <StoreIcon className="h-10 w-10 text-muted-foreground/40" />
              )}
            </div>

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

            <div className="flex items-center gap-3 shrink-0 sm:pb-1 flex-wrap">
              {canEdit && (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="store-active-toggle" className="text-xs text-muted-foreground">
                      {store.is_active ? "Active" : "Inactive"}
                    </Label>
                    <Switch
                      id="store-active-toggle"
                      checked={store.is_active}
                      onCheckedChange={handleToggleActive}
                      disabled={toggling}
                    />
                  </div>
                  {!isInactive && (
                    !editing ? (
                      <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                      </div>
                    )
                  )}
                </>
              )}
              {store.lat && store.lng && (
                <a href={`https://www.google.com/maps?q=${store.lat},${store.lng}`} target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <MapPin className="h-4 w-4" /> Map
                </a>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Store Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Alt. Phone</Label><Input value={form.alternate_phone} onChange={(e) => setForm({ ...form, alternate_phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Street</Label><Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Area</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">District</Label><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
            </div>
          ) : (
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
                  <a href={`https://www.google.com/maps?q=${store.lat},${store.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3 text-primary hover:bg-primary/15 transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm"><MapPin className="h-4 w-4" /></div>
                    <div className="min-w-0 pt-0.5"><p className="text-sm font-medium">View on Map</p></div>
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Collections" value={`₹${totalCollected.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="Outstanding" value={`₹${Number(store.outstanding).toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm">Collections ({transactions?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders ({orders?.length || 0})</TabsTrigger>
          <TabsTrigger value="visits" className="text-xs sm:text-sm">Visits ({visits?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? <EmptyTab label="No sales yet" /> : (
            <DataTable
              columns={salesColumns}
              data={sales || []}
              searchKey="display_id"
              searchPlaceholder="Search sales..."
              renderMobileCard={(row: any) => {
                const p = getRecorder(row.recorded_by);
                return (
                  <div className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">{row.display_id}</span>
                      <span className="text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</span>
                      <span className={`text-xs font-medium ${Number(row.outstanding_amount) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        Due: ₹{Number(row.outstanding_amount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                      <span>Cash ₹{Number(row.cash_amount).toLocaleString()} · UPI ₹{Number(row.upi_amount).toLocaleString()}</span>
                      <div className="flex items-center gap-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={p?.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{(p?.full_name || "?").charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{p?.full_name || "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          {(transactions?.length || 0) === 0 ? <EmptyTab label="No collections yet" /> : <DataTable columns={txnColumns} data={transactions || []} searchKey="display_id" searchPlaceholder="Search..." />}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? <EmptyTab label="No orders yet" /> : <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />}
        </TabsContent>
        <TabsContent value="visits" className="mt-4">
          {(visits?.length || 0) === 0 ? <EmptyTab label="No visits recorded" /> : <DataTable columns={visitColumns} data={visits || []} searchKey="notes" searchPlaceholder="Search..." />}
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
  return <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">{label}</div>;
}

export default StoreDetail;
