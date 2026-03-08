import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ArrowLeft, Store, DollarSign, ShoppingCart, Banknote,
  User, Phone, Mail, MapPin, Calendar, Shield, Pencil, X, Save, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const CustomerDetail = () => {
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
    email: "",
    address: "",
    gst_number: "",
  });

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

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
  const getRecorder = (uid: string) => profileMap.get(uid);

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

  const startEditing = () => {
    if (!customer || !customer.is_active) return;
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      gst_number: customer.gst_number || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        gst_number: form.gst_number || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Customer updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const handleToggleActive = async () => {
    if (!customer || !id) return;
    const newVal = !customer.is_active;
    setToggling(true);

    // Update customer status
    const { error } = await supabase
      .from("customers")
      .update({ is_active: newVal })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      setToggling(false);
      return;
    }

    // If deactivating customer, cascade: deactivate ALL their stores
    if (!newVal && stores && stores.length > 0) {
      const storeIds = stores.map((s) => s.id);
      const { error: storeError } = await supabase
        .from("stores")
        .update({ is_active: false })
        .in("id", storeIds);
      if (storeError) {
        toast.error("Customer deactivated but failed to deactivate stores: " + storeError.message);
      } else {
        toast.success(`Customer deactivated along with ${storeIds.length} store(s)`);
      }
    } else {
      toast.success(`Customer ${newVal ? "activated" : "deactivated"}`);
    }

    setToggling(false);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["customer-stores", id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) {
    return <div className="text-center py-20 text-muted-foreground">Customer not found</div>;
  }

  const isInactive = !customer.is_active;
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
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Customers
      </Button>

      {/* Inactive banner */}
      {isInactive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">This customer is inactive</p>
            <p className="text-xs text-muted-foreground mt-0.5">No sales, orders, or modifications can be made. Activate the customer to resume operations.</p>
          </div>
        </div>
      )}

      {/* Profile Card */}
      <Card className={`overflow-hidden ${isInactive ? "opacity-75" : ""}`}>
        <div className="h-20 sm:h-28 bg-gradient-to-r from-primary/20 via-accent/30 to-primary/10" />
        <CardContent className="relative px-4 sm:px-6 pb-6 -mt-10 sm:-mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {customer.photo_url ? (
                <img src={customer.photo_url} alt={customer.name} className="w-full h-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-muted-foreground/40" />
              )}
            </div>

            <div className="flex-1 min-w-0 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{customer.name}</h1>
                <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{customer.display_id}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0 sm:pb-1 flex-wrap">
              {canEdit && (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="customer-active-toggle" className="text-xs text-muted-foreground">
                      {customer.is_active ? "Active" : "Inactive"}
                    </Label>
                    <Switch
                      id="customer-active-toggle"
                      checked={customer.is_active}
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
              <div className="hidden sm:block">
                <StatusBadge status={kycVariant} label={`KYC: ${kycLabel}`} />
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs">Name</Label>
                <Input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
                <Input id="edit-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs">Email</Label>
                <Input id="edit-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-gst" className="text-xs">GST Number</Label>
                <Input id="edit-gst" value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-address" className="text-xs">Address</Label>
                <Textarea id="edit-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <InfoItem icon={Phone} label="Phone" value={customer.phone || "Not provided"} />
                <InfoItem icon={Mail} label="Email" value={customer.email || "Not provided"} />
                <InfoItem icon={MapPin} label="Address" value={customer.address || "Not provided"} />
                <InfoItem icon={Calendar} label="Joined" value={new Date(customer.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })} />
              </div>
              <div className="sm:hidden mt-3">
                <InfoItem icon={Shield} label="KYC Status" value={kycLabel} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      <Tabs defaultValue="stores">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="stores" className="text-xs sm:text-sm">Stores ({stores?.length || 0})</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales ({sales?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders ({orders?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="stores" className="mt-4">
          {(stores?.length || 0) === 0 ? <EmptyTab label="No stores yet" /> : (
            <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." onRowClick={(row) => navigate(`/stores/${row.id}`)} />
          )}
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          {(sales?.length || 0) === 0 ? <EmptyTab label="No sales recorded" /> : (
            <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search sales..." />
          )}
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? <EmptyTab label="No orders" /> : (
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
