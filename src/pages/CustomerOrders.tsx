import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const CustomerOrders = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showOrder, setShowOrder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderStoreId, setOrderStoreId] = useState("");
  const [orderNote, setOrderNote] = useState("");

  const { data: customer } = useQuery({
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
      const { data } = await supabase.from("stores").select("id, name, is_active").eq("customer_id", customer!.id);
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", customer?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, stores(name)")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderStoreId) { toast.error("Select a store"); return; }

    // Check for existing active order for this store
    const activeOrder = orders?.find(o => o.store_id === orderStoreId && (o.status === "pending" || o.status === "confirmed"));
    if (activeOrder) {
      toast.error("You already have an active order for this store. Wait until it's delivered or cancelled.");
      return;
    }

    setSaving(true);
    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "ORD", seq_name: "ord_display_seq" });
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
      setOrderStoreId("");
      setOrderNote("");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      logActivity(user!.id, "Created order", "order", displayId);
    }
  };

  const columns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Type", accessor: (row: any) => row.order_type === "simple" ? "Simple" : "Detailed" },
    { header: "Note", accessor: (row: any) => row.requirement_note || "—", className: "max-w-[200px] truncate text-muted-foreground text-xs" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Orders" subtitle="Place and track your orders" primaryAction={{ label: "Place Order", onClick: () => setShowOrder(true) }} />
      <DataTable columns={columns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..." />

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
    </div>
  );
};

export default CustomerOrders;
