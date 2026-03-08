import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Store, ShoppingCart, DollarSign, Clock, Upload, FileCheck } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const CustomerPortal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showOrder, setShowOrder] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [saving, setSaving] = useState(false);

  // Order form
  const [orderStoreId, setOrderStoreId] = useState("");
  const [orderNote, setOrderNote] = useState("");

  // KYC form
  const [kycConsent, setKycConsent] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [aadharFront, setAadharFront] = useState<File | null>(null);
  const [aadharBack, setAadharBack] = useState<File | null>(null);

  // Fetch customer data
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["my-stores", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("*, store_types(name), routes(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: orders } = useQuery({
    queryKey: ["my-orders", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, stores(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: sales } = useQuery({
    queryKey: ["my-sales", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, stores(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const totalOutstanding = stores?.reduce((s, st) => s + Number(st.outstanding), 0) || 0;
  const pendingOrders = orders?.filter((o) => o.status === "pending").length || 0;

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderStoreId) { toast.error("Select a store"); return; }
    setSaving(true);
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true });
    const displayId = `ORD-${String((count || 0) + 1).padStart(6, "0")}`;
    const { error } = await supabase.from("orders").insert({
      display_id: displayId,
      store_id: orderStoreId,
      customer_id: customer!.id,
      order_type: "simple",
      source: "manual",
      created_by: user!.id,
      requirement_note: orderNote || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Order placed!");
      setShowOrder(false);
      setOrderStoreId(""); setOrderNote("");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      logActivity(user!.id, "Created order", "order", displayId);
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfie || !aadharFront || !aadharBack) { toast.error("Upload all 3 documents"); return; }
    if (!kycConsent) { toast.error("Please provide consent"); return; }
    setSaving(true);

    const uploadFile = async (file: File, name: string) => {
      const path = `${user!.id}/${name}-${Date.now()}.${file.name.split(".").pop()}`;
      const { data, error } = await supabase.storage.from("kyc-documents").upload(path, file);
      if (error) throw error;
      return data.path;
    };

    try {
      const [selfieUrl, frontUrl, backUrl] = await Promise.all([
        uploadFile(selfie, "selfie"),
        uploadFile(aadharFront, "aadhar-front"),
        uploadFile(aadharBack, "aadhar-back"),
      ]);

      await supabase.from("customers").update({
        kyc_selfie_url: selfieUrl,
        kyc_aadhar_front_url: frontUrl,
        kyc_aadhar_back_url: backUrl,
        kyc_status: "pending",
        kyc_submitted_at: new Date().toISOString(),
      }).eq("id", customer!.id);

      toast.success("KYC documents submitted for verification!");
      setShowKyc(false);
      qc.invalidateQueries({ queryKey: ["my-customer"] });
      logActivity(user!.id, "Submitted KYC", "customer", customer!.name, customer!.id);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setSaving(false);
  };

  const storeColumns = [
    { header: "Store", accessor: "name" as const, className: "font-medium" },
    { header: "Type", accessor: (row: any) => <Badge variant="secondary">{row.store_types?.name || "—"}</Badge> },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const salesColumns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Paid", accessor: (row: any) => `₹${(Number(row.cash_amount) + Number(row.upi_amount)).toLocaleString()}` },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  if (loadingCustomer) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Customer Portal" subtitle="Your account is not linked to a customer profile yet." />
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          Please contact the admin to link your account to a customer profile.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Dashboard" subtitle={`Welcome, ${customer.name}`} primaryAction={{ label: "Place Order", onClick: () => setShowOrder(true) }} />

      {/* KYC Banner */}
      {customer.kyc_status === "not_requested" && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCheck className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium">Complete KYC Verification</p>
              <p className="text-xs text-muted-foreground">Verify your identity to unlock higher credit limits</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowKyc(true)}>
            <Upload className="mr-2 h-4 w-4" />Upload Documents
          </Button>
        </div>
      )}
      {customer.kyc_status === "pending" && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-info animate-spin" />
          <p className="text-sm font-medium">KYC verification is under review</p>
        </div>
      )}
      {customer.kyc_status === "rejected" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">KYC Rejected</p>
            <p className="text-xs text-muted-foreground">{customer.kyc_rejection_reason || "Please re-upload with clearer documents"}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowKyc(true)}>Re-upload</Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="My Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor="bg-warning" />
        <StatCard title="Pending Orders" value={String(pendingOrders)} icon={ShoppingCart} />
        <StatCard title="KYC Status" value={customer.kyc_status.replace("_", " ")} icon={FileCheck} iconColor={customer.kyc_status === "verified" ? "bg-success" : "bg-muted"} />
      </div>

      <Tabs defaultValue="stores">
        <TabsList>
          <TabsTrigger value="stores">Stores ({stores?.length || 0})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders?.length || 0})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({sales?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="stores" className="mt-4">
          <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <DataTable columns={salesColumns} data={sales || []} searchKey="display_id" searchPlaceholder="Search sales..." />
        </TabsContent>
      </Tabs>

      {/* Create Order Dialog */}
      <Dialog open={showOrder} onOpenChange={setShowOrder}>
        <DialogContent>
          <DialogHeader><DialogTitle>Place Order</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <Label>Store</Label>
              <Select value={orderStoreId} onValueChange={setOrderStoreId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores?.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requirement</Label>
              <Textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} className="mt-1" placeholder="What do you need?" />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place Order
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* KYC Upload Dialog */}
      <Dialog open={showKyc} onOpenChange={setShowKyc}>
        <DialogContent>
          <DialogHeader><DialogTitle>KYC Verification</DialogTitle></DialogHeader>
          <form onSubmit={handleKycSubmit} className="space-y-4">
            <div>
              <Label>Live Photo (Selfie)</Label>
              <Input type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div>
              <Label>Aadhar Card (Front)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setAadharFront(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div>
              <Label>Aadhar Card (Back)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setAadharBack(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox checked={kycConsent} onCheckedChange={(v) => setKycConsent(!!v)} id="kyc-consent" />
              <label htmlFor="kyc-consent" className="text-xs text-muted-foreground leading-tight">
                I consent to share my identity documents for verification purposes. I confirm these documents belong to me.
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={saving || !kycConsent}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for Verification
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerPortal;
