import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
}

interface CustomerRow {
  id: string;
}

interface StoreRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface OrderRow {
  id: string;
  display_id: string;
  store_id: string;
  status: "pending" | "confirmed" | "delivered" | "cancelled" | string;
  requirement_note: string | null;
  created_at: string;
  stores: { name: string } | null;
}

interface SupabaseRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: Error | null }>;
}

export function CustomerOrders({ selectedStoreId, onStoreChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderStoreId, setOrderStoreId] = useState("");
  const [orderNote, setOrderNote] = useState("");

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-orders-self", user?.id],
    queryFn: async () => {
      const res = await resolveCustomer(user!.id, "id");
      return res as unknown as CustomerRow | null;
    },
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-orders-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, is_active")
        .eq("customer_id", customer!.id)
        .order("name");
      if (error) throw error;
      return (data as StoreRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-customer-orders", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, display_id, store_id, status, requirement_note, created_at, stores(name)")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as OrderRow[]) || [];
    },
    enabled: !!customer,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (openCreate) {
      setOrderStoreId(selectedStoreId || "");
    }
  }, [openCreate, selectedStoreId]);

  const filteredOrders = useMemo(() => {
    if (!selectedStoreId) return orders || [];
    return (orders || []).filter((order) => order.store_id === selectedStoreId);
  }, [orders, selectedStoreId]);

  const handleCreateOrder = async () => {
    if (!orderStoreId) {
      toast.error("Select a store");
      return;
    }

    const activeOrder = (orders || []).find(
      (order) => order.store_id === orderStoreId && (order.status === "pending" || order.status === "confirmed")
    );
    if (activeOrder) {
      toast.error("An active order already exists for this store");
      return;
    }

    setSaving(true);
    try {
      const rpcClient = supabase as unknown as SupabaseRpcClient;
      const { data: displayId, error: displayError } = await rpcClient.rpc("generate_display_id", {
        prefix: "ORD",
        seq_name: "ord_display_seq",
      });
      if (displayError) throw displayError;
      if (!displayId) throw new Error("Failed to generate order ID");

      const { error } = await supabase.from("orders").insert({
        display_id: displayId,
        store_id: orderStoreId,
        customer_id: customer!.id,
        order_type: "simple",
        source: "manual",
        created_by: user!.id,
        requirement_note: orderNote.trim() || null,
      });
      if (error) throw error;

      toast.success("Order placed");
      
      // Dispatch notification to admins
      getAdminUserIds().then(admins => {
        if (admins.length > 0) {
          sendNotificationToMany(admins, {
            title: "New Customer Order",
            message: `Order ${displayId} placed by customer`,
            type: "order" as any,
          });
        }
      }).catch(err => console.error("Failed to notify admins", err));

      setOpenCreate(false);
      setOrderNote("");
      onStoreChange(orderStoreId);
      qc.invalidateQueries({ queryKey: ["mobile-customer-orders"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to place order";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-6">
      <div className="px-4 pt-4 flex justify-end">
        <Button size="sm" className="rounded-xl" onClick={() => setOpenCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Place Order
        </Button>
      </div>

      <div className="px-4 space-y-2 mt-2">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <ShoppingCart className="h-7 w-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No orders found</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{order.display_id}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{order.stores?.name || "Store"}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold capitalize ${
                    order.status === "pending"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                      : order.status === "delivered"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : order.status === "cancelled"
                      ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              {order.requirement_note && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{order.requirement_note}</p>
              )}
            </div>
          ))
        )}
      </div>

      <Sheet open={openCreate} onOpenChange={setOpenCreate}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[88vh] overflow-y-auto">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Place Order</SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Store</Label>
                <Select value={orderStoreId} onValueChange={setOrderStoreId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stores || [])
                      .filter((store) => store.is_active)
                      .map((store) => (
                        <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Requirement Note</Label>
                <Textarea
                  value={orderNote}
                  onChange={(event) => setOrderNote(event.target.value)}
                  className="rounded-xl min-h-24"
                  placeholder="What do you need?"
                />
              </div>

              <Button className="w-full h-11 rounded-xl" onClick={handleCreateOrder} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Order
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
