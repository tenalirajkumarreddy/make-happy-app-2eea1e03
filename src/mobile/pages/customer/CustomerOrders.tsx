import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShoppingCart, Package, Minus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { getActiveOrderForStore, type ActiveOrderInfo } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtINR } from "@/lib/utils";

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
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createStoreSearch, setCreateStoreSearch] = useState("");
  const [createStoreId, setCreateStoreId] = useState("");
  const [createOrderType, setCreateOrderType] = useState<"simple" | "detailed">("simple");
  const [createNote, setCreateNote] = useState("");
  const [createOrderItems, setCreateOrderItems] = useState<{ product_id: string; quantity: number; unit_price: number; products?: { name: string; base_price: number } }[]>([]);
  const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
  const [existingOrderStoreName, setExistingOrderStoreName] = useState("");

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-orders-self", user?.id],
    queryFn: async () => {
      const res = await resolveCustomer(user!.id, "id");
      return res as unknown as CustomerRow | null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-orders-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, is_active, warehouse_id")
        .eq("customer_id", customer!.id)
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
  });

  const { data: createProducts } = useQuery({
    queryKey: ["mobile-customer-create-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, base_price")
        .eq("is_active", true)
        .order("name");
      return (data || []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-customer-orders", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, display_id, store_id, status, requirement_note, created_at, stores(id, name)")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as OrderRow[]) || [];
    },
    enabled: !!customer,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (openCreate) {
      setCreateStoreId(selectedStoreId || "");
    }
  }, [openCreate, selectedStoreId]);

  const filteredOrders = useMemo(() => {
    if (!selectedStoreId) return orders || [];
    return (orders || []).filter((order) => order.store_id === selectedStoreId);
  }, [orders, selectedStoreId]);

  const addCreateItem = (product: any) => {
    setCreateOrderItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        { product_id: product.id, quantity: 1, unit_price: product.base_price, products: { name: product.name, base_price: product.base_price } },
      ];
    });
  };

  const updateCreateQty = (productId: string, qty: number) => {
    setCreateOrderItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.product_id !== productId)
        : prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
    );
  };

  const handleCreateOrder = async () => {
    if (!createStoreId) {
      toast.error("Select a store");
      return;
    }

    const activeOrder = await getActiveOrderForStore(supabase, createStoreId);
    if (activeOrder) {
      const store = (stores || []).find((s: any) => s.id === createStoreId);
      setExistingOrderStoreName(store?.name || "");
      setExistingOrderForStore(activeOrder);
      return;
    }

    if (createOrderType === "detailed" && createOrderItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setCreateSaving(true);
    try {
      const rpcClient = supabase as unknown as SupabaseRpcClient;
      const { data: displayId, error: displayError } = await rpcClient.rpc("generate_display_id", {
        prefix: "ORD",
        seq_name: "ord_display_seq",
      });
      if (displayError) throw displayError;
      if (!displayId) throw new Error("Failed to generate order ID");

      const store = (stores || []).find((s: any) => s.id === createStoreId);

      const { data: orderRow, error: orderError } = await supabase
        .from("orders")
        .insert({
          display_id: displayId,
          store_id: createStoreId,
          customer_id: customer!.id,
          order_type: createOrderType,
          source: "manual",
          created_by: profile!.id,
          status: "confirmed",
          requirement_note: createOrderType === "simple" ? createNote.trim() || null : null,
          warehouse_id: store?.warehouse_id || null,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      if (createOrderType === "detailed" && createOrderItems.length > 0) {
        const { error: itemError } = await supabase.from("order_items").insert(
          createOrderItems.map((item) => ({
            order_id: orderRow.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }))
        );
        if (itemError) throw itemError;
      }

      toast.success("Order placed");
      
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
      setCreateStoreSearch("");
      setCreateStoreId("");
      setCreateOrderType("simple");
      setCreateNote("");
      setCreateOrderItems([]);
      onStoreChange(createStoreId);
      qc.invalidateQueries({ queryKey: ["mobile-customer-orders"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to place order";
      toast.error(message);
    } finally {
      setCreateSaving(false);
    }
  };

  const scrollToOrder = (orderId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`order-card-${orderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-sm font-medium">My Orders</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{(profile?.full_name ?? customer?.name ?? "Customer").split(" ")[0]} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="px-4 -mt-5 flex justify-end">
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
            <div key={order.id} id={`order-card-${order.id}`} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{order.display_id}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{order.stores?.name || "Store"}</p>
                  <p className="text-xs text-slate-400 mt-1">{new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${
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

      <Sheet open={openCreate} onOpenChange={(v) => { if (!v) { setCreateStoreSearch(""); setCreateStoreId(""); setCreateOrderType("simple"); setCreateNote(""); setCreateOrderItems([]); } setOpenCreate(v); }}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Place Order</SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground mb-2 block">Store</Label>
                <Input
                  placeholder="Search stores by name or ID..."
                  value={createStoreSearch}
                  onChange={(e) => setCreateStoreSearch(e.target.value)}
                  className="text-sm h-10 rounded-xl"
                />
                {createStoreSearch && (
                  <div className="mt-1 max-h-36 overflow-y-auto border rounded-xl divide-y bg-background">
                    {(stores || [])
                      .filter((s: any) => s.is_active)
                      .filter((s: any) =>
                        s.name.toLowerCase().includes(createStoreSearch.toLowerCase()) ||
                        (s.display_id || "").toLowerCase().includes(createStoreSearch.toLowerCase())
                      )
                      .map((s: any) => (
                        <button key={s.id} type="button"
                          onClick={() => { setCreateStoreId(s.id); setCreateStoreSearch(""); }}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-accent ${createStoreId === s.id ? "bg-primary/10 font-semibold text-primary" : "text-foreground"}`}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{s.display_id}</span>
                        </button>
                      ))}
                  </div>
                )}
                {createStoreId && !createStoreSearch && (
                  <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5 flex items-center justify-between mt-1">
                    <span className="text-sm font-medium">{(stores || []).find((s: any) => s.id === createStoreId)?.name || "Store selected"}</span>
                    <button type="button" onClick={() => { setCreateStoreId(""); }} className="text-xs text-muted-foreground hover:text-foreground font-medium">Change</button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-bold text-muted-foreground mb-2 block">Order Type</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCreateOrderType("simple")}
                    className={`flex-1 px-4 py-3 rounded-xl text-xs font-medium transition-colors ${
                      createOrderType === "simple"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    onClick={() => setCreateOrderType("detailed")}
                    className={`flex-1 px-4 py-3 rounded-xl text-xs font-medium transition-colors ${
                      createOrderType === "detailed"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Detailed
                  </button>
                </div>
              </div>

              {createOrderType === "simple" ? (
                <div>
                  <Label className="text-xs font-bold text-muted-foreground mb-2 block">Requirement Note</Label>
                  <textarea
                    value={createNote}
                    onChange={(e) => setCreateNote(e.target.value)}
                    placeholder="What do you need?"
                    className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-muted-foreground mb-2 block">Products</Label>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {(createProducts || []).map((p: any) => {
                      const inCart = createOrderItems.find((i) => i.product_id === p.id);
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl border bg-card">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtINR(p.base_price)}
                              {inCart ? ` × ${inCart.quantity} = ${fmtINR(inCart.quantity * inCart.unit_price)}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {inCart ? (
                              <>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                  onClick={() => updateCreateQty(p.id, inCart.quantity - 1)}>
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <span className="text-sm font-bold w-6 text-center">{inCart.quantity}</span>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                  onClick={() => updateCreateQty(p.id, inCart.quantity + 1)}>
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                onClick={() => addCreateItem(p)}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {createOrderItems.length > 0 && (
                    <div className="flex justify-between items-center p-3 rounded-xl border bg-muted/50">
                      <span className="text-sm font-medium">Order Total ({createOrderItems.length} items)</span>
                      <span className="text-base font-bold">{fmtINR(createOrderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0))}</span>
                    </div>
                  )}
                </div>
              )}

              <Button className="w-full h-11 rounded-xl" onClick={handleCreateOrder} disabled={createSaving || !createStoreId}>
                {createSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {createSaving ? "Placing..." : "Submit Order"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ActiveOrderExistsDialog
        open={!!existingOrderForStore}
        onOpenChange={(o) => { if (!o) setExistingOrderForStore(null); }}
        orderDisplayId={existingOrderForStore?.display_id || ""}
        storeName={existingOrderStoreName}
        onView={() => {
          const id = existingOrderForStore?.id;
          setExistingOrderForStore(null);
          if (id) scrollToOrder(id);
        }}
        onEdit={() => {
          const id = existingOrderForStore?.id;
          setExistingOrderForStore(null);
          if (id) scrollToOrder(id);
        }}
      />
    </div>
  );
}
