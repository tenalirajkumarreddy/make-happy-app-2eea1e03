import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface OrderItem {
  product_id: string;
  quantity: number;
}

const Orders = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderType, setOrderType] = useState("simple");
  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ product_id: "", quantity: 1 }]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, stores(name), customers(name), profiles:created_by(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-for-order", customerId],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, display_id").eq("is_active", true);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!customerId,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku").eq("is_active", true);
      return data || [];
    },
  });

  const addItem = () => setOrderItems([...orderItems, { product_id: "", quantity: 1 }]);
  const removeItem = (idx: number) => setOrderItems(orderItems.filter((_, i) => i !== idx));

  const resetForm = () => {
    setCustomerId(""); setStoreId(""); setOrderType("simple"); setRequirementNote("");
    setOrderItems([{ product_id: "", quantity: 1 }]);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) { toast.error("Please select a store"); return; }
    setSaving(true);

    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true });
    const displayId = `ORD-${String((count || 0) + 1).padStart(6, "0")}`;

    const { data: order, error } = await supabase.from("orders").insert({
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId,
      order_type: orderType,
      source: "manual",
      created_by: user!.id,
      requirement_note: requirementNote || null,
    }).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    if (orderType === "detailed") {
      const validItems = orderItems.filter((i) => i.product_id);
      if (validItems.length > 0) {
        await supabase.from("order_items").insert(
          validItems.map((i) => ({ order_id: order.id, product_id: i.product_id, quantity: i.quantity }))
        );
      }
    }

    toast.success("Order created");
    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const filteredOrders = statusFilter === "all"
    ? orders
    : orders?.filter((o) => o.status === statusFilter);

  const columns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Type", accessor: (row: any) => <Badge variant="secondary">{row.order_type}</Badge> },
    { header: "Source", accessor: (row: any) => <Badge variant="outline">{row.source}</Badge> },
    { header: "Created By", accessor: (row: any) => row.profiles?.full_name || "—", className: "text-muted-foreground text-sm" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs" },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Orders" subtitle="Manage customer orders and fulfillment" actionLabel="Create Order" onAction={() => setShowAdd(true)} />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={filteredOrders || []} searchKey="display_id" searchPlaceholder="Search by order ID..." />

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Order</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setStoreId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store</Label>
              <Select value={storeId} onValueChange={setStoreId} disabled={!customerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>{stores?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Type</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple (Note only)</SelectItem>
                  <SelectItem value="detailed">Detailed (Products + Qty)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Requirement Note</Label>
              <Textarea value={requirementNote} onChange={(e) => setRequirementNote(e.target.value)} className="mt-1" placeholder="e.g., Need water bottles urgently" />
            </div>

            {orderType === "detailed" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Products</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                <div className="space-y-2">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={item.product_id} onValueChange={(v) => { const u = [...orderItems]; u[idx].product_id = v; setOrderItems(u); }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => { const u = [...orderItems]; u[idx].quantity = Number(e.target.value); setOrderItems(u); }} className="w-20" placeholder="Qty" />
                      {orderItems.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Order
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
