import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { StorePricingDialog } from "@/components/stores/StorePricingDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, DollarSign } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const Stores = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [pricingStore, setPricingStore] = useState<any>(null);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const canManagePricing = role === "super_admin" || role === "manager";

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(name), store_types(name), routes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, display_id").eq("is_active", true);
      return data || [];
    },
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true);
      return data || [];
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-list", storeTypeId],
    queryFn: async () => {
      let q = supabase.from("routes").select("*").eq("is_active", true);
      if (storeTypeId) q = q.eq("store_type_id", storeTypeId);
      const { data } = await q;
      return data || [];
    },
    enabled: true,
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const count = (stores?.length || 0) + 1;
    const displayId = `STR-${String(count).padStart(6, "0")}`;

    const { error } = await supabase.from("stores").insert({
      display_id: displayId,
      name,
      customer_id: customerId,
      store_type_id: storeTypeId,
      route_id: routeId || null,
      address: address || null,
      phone: phone || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Store added");
      setShowAdd(false);
      setName(""); setCustomerId(""); setStoreTypeId(""); setRouteId(""); setAddress(""); setPhone("");
      qc.invalidateQueries({ queryKey: ["stores"] });
    }
  };

  const columns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store Name", accessor: "name" as const, className: "font-medium" },
    { header: "Customer", accessor: (row: any) => row.customers?.name || "—", className: "text-muted-foreground text-sm" },
    { header: "Type", accessor: (row: any) => row.store_types?.name ? <Badge variant="secondary">{row.store_types.name}</Badge> : "—" },
    { header: "Route", accessor: (row: any) => row.routes?.name || "—", className: "text-sm" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    ...(canManagePricing ? [{ header: "Pricing", accessor: (row: any) => (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPricingStore(row)}>
        <DollarSign className="mr-1 h-3 w-3" />Set Prices
      </Button>
    )}] : []),
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Stores" subtitle="Manage store locations and assignments" actionLabel="Add Store" onAction={() => setShowAdd(true)} />
      <DataTable columns={columns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." onRowClick={(row) => navigate(`/stores/${row.id}`)} />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Store</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div><Label>Store Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
            <div>
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId} required>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.display_id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store Type</Label>
              <Select value={storeTypeId} onValueChange={setStoreTypeId} required>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {storeTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Route (optional)</Label>
              <Select value={routeId} onValueChange={setRouteId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select route" /></SelectTrigger>
                <SelectContent>
                  {routes?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Store
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <StorePricingDialog
        store={pricingStore}
        open={!!pricingStore}
        onOpenChange={(open) => { if (!open) setPricingStore(null); }}
      />
    </div>
  );
};

export default Stores;
