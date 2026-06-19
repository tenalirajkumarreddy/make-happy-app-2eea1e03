import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, XCircle, CheckCircle2, Package, ShoppingCart, Edit, FileText, Minus, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { getActiveOrderForStore, type ActiveOrderInfo } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
import { CANCEL_REASONS } from "@/lib/constants";
import { OrderStockSummary } from "@/components/orders/OrderStockSummary";
import { ProformaView } from "@/components/orders/ProformaView";
import { EditOrderSheet } from "@/components/orders/EditOrderSheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { fmtINR } from "@/lib/utils";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

interface Props {
  preselectStore?: StoreOption | null;
  onStoreConsumed?: () => void;
}

interface OrderRow {
  id: string;
  display_id: string;
  status: "pending" | "delivered" | "cancelled" | string;
  order_type: "simple" | "detailed" | string;
  requirement_note: string | null;
  cancellation_reason: string | null;
  created_at: string;
  store_id: string;
  customer_id: string;
  stores: { name: string; store_type_id: string | null; store_types: { name: string } | null; routes: { name: string } | null } | null;
  customers: { name: string } | null;
  creator_profile?: { full_name: string } | null;
  updater_profile?: { full_name: string } | null;
  fulfiller_profile?: { full_name: string } | null;
  canceller_profile?: { full_name: string } | null;
  order_items?: Array<{ id: string; product_id: string; quantity: number; products?: { name: string; base_price: number } | null }>;
}

interface CustomerItem {
  id: string;
  name: string;
}

interface StoreItem {
  id: string;
  name: string;
  route_id: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  base_price: number;
}

interface OrderItemInput {
  product_id: string;
  quantity: number;
  unit_price?: number;
  products?: { name: string; base_price: number };
}

interface SupabaseRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: Error | null }>;
}

export function MarketerOrders({ preselectStore, onStoreConsumed }: Props) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const { role } = useAuth();
  const { canAccessRoute } = useRouteAccess(user?.id, role);

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "delivered" | "cancelled">("all");
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createStoreSearch, setCreateStoreSearch] = useState("");
  const [createStoreId, setCreateStoreId] = useState("");
  const [createOrderType, setCreateOrderType] = useState<"simple" | "detailed">("simple");
  const [createRequirementNote, setCreateRequirementNote] = useState("");
  const [createOrderItems, setCreateOrderItems] = useState<OrderItemInput[]>([]);
  const [createUrgent, setCreateUrgent] = useState(false);

  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [viewProformaId, setViewProformaId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
  const [existingOrderStoreName, setExistingOrderStoreName] = useState("");

  useEffect(() => {
    if (!preselectStore) return;
    setCreateStoreId(preselectStore.id);
    setShowCreate(true);
    onStoreConsumed?.();
  }, [onStoreConsumed, preselectStore]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-marketer-orders", user?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, display_id, status, order_type, requirement_note, cancellation_reason, created_at, updater_profile:profiles!orders_updated_by_fkey(full_name), creator_profile:profiles!orders_created_by_profiles_fkey_temp(full_name), fulfiller_profile:profiles!orders_fulfilled_by_profiles_fkey(full_name), canceller_profile:profiles!orders_cancelled_by_profiles_fkey(full_name), store_id, customer_id, stores(name, store_type_id, store_types(name), routes(name)), customers(name), order_items(id, product_id, quantity, products(name, base_price))")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as OrderRow[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const storeTypeOptions = useMemo(() => {
    const set = new Set<string>();
    (orders ?? []).forEach((o) => {
      const n = o.stores?.store_types?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [orders]);

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    (orders ?? []).forEach((o) => {
      const n = o.stores?.routes?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    if (filterStoreType !== "all") {
      list = list.filter((o) => o.stores?.store_types?.name === filterStoreType);
    }
    if (filterRoute !== "all") {
      list = list.filter((o) => o.stores?.routes?.name === filterRoute);
    }
    return list;
  }, [orders, filterStoreType, filterRoute]);

  const { data: createStores } = useQuery({
    queryKey: ["mobile-marketer-create-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, customer_id, route_id")
        .eq("is_active", true)
        .order("name")
        .limit(100);
      if (error) throw error;
      return ((data as any[]) || []).filter((store) => canAccessRoute(store.route_id));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: createProducts } = useQuery({
    queryKey: ["mobile-marketer-create-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, base_price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as ProductItem[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const pendingCount = useMemo(() => (orders || []).filter((order) => order.status === "pending").length, [orders]);

  const { data: viewProforma } = useQuery({
    queryKey: ["marketer-view-proforma", viewProformaId],
    queryFn: async () => {
      if (!viewProformaId) return null;
      const order = (orders ?? []).find((o: any) => o.id === viewProformaId);
      const { data: pf } = await supabase.from("proforma_invoices").select("*").eq("order_id", viewProformaId).maybeSingle();
      if (!pf) return null;
      return {
        id: pf.id, display_id: pf.display_id, order_id: pf.order_id,
        store_name: order?.stores?.name || "—",
        customer_name: order?.customers?.name || "—",
        customer_phone: (order as any)?.customers?.phone || "—",
        items: pf.items || [], total_amount: Number(pf.total_amount) || 0,
        status: pf.status, created_at: pf.created_at,
      };
    },
    enabled: !!viewProformaId,
    staleTime: 5 * 60 * 1000,
  });

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

  const resetForm = () => {
    setCreateStoreSearch("");
    setCreateStoreId("");
    setCreateOrderType("simple");
    setCreateRequirementNote("");
    setCreateOrderItems([]);
    setCreateUrgent(false);
  };

  const handleCreateOrder = async () => {
    if (!createStoreId) {
      toast.error("Select a store");
      return;
    }
    if (createOrderType === "simple" && !createRequirementNote.trim()) {
      toast.error("Enter requirement note");
      return;
    }
    if (createOrderType === "detailed" && createOrderItems.length === 0) {
      toast.error("Add at least one product");
      return;
    }

    setCreateSaving(true);
    try {
      const store = (createStores || []).find((s: any) => s.id === createStoreId);

      // Use create_order RPC (handles active order check, display ID, auto-confirm setting)
      const { data: orderResult, error: orderError } = await supabase.rpc("create_order", {
        p_store_id: createStoreId,
        p_customer_id: store?.customer_id || null,
        p_order_type: createOrderType,
        p_requirement_note: createOrderType === "simple" ? createRequirementNote : null,
        p_total_amount: 0,
        p_created_by: profile!.id,
        p_is_urgent: createUrgent,
      }) as any;

      if (orderError) throw orderError;

      const orderRow = Array.isArray(orderResult) ? orderResult[0] : orderResult;
      if (!orderRow?.order_id) throw new Error("Failed to create order");

      if (createOrderType === "detailed") {
        const validItems = createOrderItems.filter((item) => item.product_id);
        if (validItems.length > 0) {
          const { error: itemError } = await supabase.from("order_items").insert(
            validItems.map((item) => ({
              order_id: orderRow.order_id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price || 0,
            }))
          );
          if (itemError) throw itemError;
        }
      }

      toast.success("Order created");
      setShowCreate(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create order";
      toast.error(message);
    } finally {
      setCreateSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error("Add cancellation reason");
      return;
    }
    setCancelling(true);
    try {
      const { data: result, error } = await (supabase as any).rpc("cancel_order", {
        p_order_id: cancelOrderId,
        p_reason: cancelReason,
      });
      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || "Failed to cancel order");

      toast.success("Order cancelled");
      setCancelOrderId(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["proforma-invoices"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel order";
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  };

  const handleReorder = (order: OrderRow) => {
    setCreateStoreId(order.store_id);
    setCreateOrderType(order.order_type === "detailed" ? "detailed" : "simple");
    setCreateRequirementNote(order.requirement_note || "");
    if (order.order_items && order.order_items.length > 0) {
      setCreateOrderItems(
        order.order_items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.products?.base_price || 0,
          products: item.products ? { name: item.products.name, base_price: item.products.base_price } : undefined,
        }))
      );
    } else {
      setCreateOrderItems([]);
    }
    setShowCreate(true);
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Orders</p>
            <h2 className="text-white text-xl font-bold mt-0.5">My Orders</h2>
            <p className="text-blue-200/80 text-xs mt-1">{pendingCount} pending</p>
          </div>
          <Button size="sm" className="rounded-xl bg-white text-blue-700 hover:bg-white/90" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-1 flex gap-1">
          {(["all", "pending", "confirmed", "delivered", "cancelled"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold capitalize ${
                statusFilter === status
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {(storeTypeOptions.length > 0 || routeOptions.length > 0) && (
          <button
            className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? "Hide filters" : "Filter by store type / route"}
          </button>
        )}

        {showFilters && (
          <div className="flex gap-2">
            {storeTypeOptions.length > 0 && (
              <Select value={filterStoreType} onValueChange={setFilterStoreType}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Store type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {storeTypeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {routeOptions.length > 0 && (
              <Select value={filterRoute} onValueChange={setFilterRoute}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All routes</SelectItem>
                  {routeOptions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <OrderStockSummary orders={orders ?? []} />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
            <Package className="h-7 w-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No orders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => (
              <div key={order.id} id={`order-card-${order.id}`} className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                <div className={`h-1 ${
                  order.status === "pending" ? "bg-amber-400" :
                  order.status === "delivered" ? "bg-emerald-400" :
                  order.status === "cancelled" ? "bg-red-400" : "bg-slate-300"
                }`} />
                <div className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary font-mono">{order.display_id}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          order.status === "pending" ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700" :
                          order.status === "delivered" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700" :
                          "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700"
                        }`}>{order.status}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-1">{order.stores?.name || "Store"}</p>
                      <p className="text-xs text-muted-foreground">{order.order_type} • {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                  </div>
                  {order.requirement_note && (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 italic">"{order.requirement_note}"</p>
                  )}
                  {order.status === "cancelled" && order.cancellation_reason && (
                    <p className="text-xs text-red-500">Reason: {order.cancellation_reason}</p>
                  )}
                  {(order.creator_profile || order.updater_profile || order.fulfiller_profile) && (
                    <div className="border-t border-border/50 pt-2 mt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                        {order.creator_profile && <span>Created by {order.creator_profile.full_name}</span>}
                        {order.updater_profile && order.updater_profile.full_name !== order.creator_profile?.full_name && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span>Edited by {order.updater_profile.full_name}</span>
                          </>
                        )}
                        {order.fulfiller_profile && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span>Fulfilled by {order.fulfiller_profile.full_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-9 rounded-xl flex-1 min-w-[120px]" onClick={() => { setViewProformaId(order.id); }}>
                      <FileText className="h-4 w-4 mr-1.5" /> Proforma
                    </Button>
                    {(order.status === "pending" || order.status === "confirmed") && (
                      <>
                        <Button size="sm" variant="outline" className="h-9 rounded-xl flex-1 min-w-[80px]" onClick={() => { setEditOrder(order); }}>
                          <Edit className="h-4 w-4 mr-1.5" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 rounded-xl flex-1 min-w-[90px]" onClick={() => setCancelOrderId(order.id)}>
                          <XCircle className="h-4 w-4 mr-1.5" /> Cancel
                        </Button>
                      </>
                    )}
                    {(order.status === "delivered" || order.status === "cancelled") && (
                      <Button size="sm" variant="outline" className="h-9 rounded-xl flex-1 min-w-[100px]" onClick={() => handleReorder(order)}>
                        <Copy className="h-4 w-4 mr-1.5" /> Reorder
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={showCreate} onOpenChange={(v) => { if (!v) resetForm(); setShowCreate(v); }}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Create Order</SheetTitle>
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
                    {(createStores || [])
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
                    <span className="text-sm font-medium">{(createStores || []).find((s: any) => s.id === createStoreId)?.name || "Store selected"}</span>
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
                    value={createRequirementNote}
                    onChange={(e) => setCreateRequirementNote(e.target.value)}
                    placeholder="Describe what the customer needs..."
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
                              {inCart ? ` × ${inCart.quantity} = ${fmtINR(inCart.quantity * (inCart.unit_price || p.base_price))}` : ""}
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
                      <span className="text-base font-bold">{fmtINR(createOrderItems.reduce((s, i) => s + i.quantity * (i.unit_price || 0), 0))}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm cursor-pointer font-medium">Urgent Order</Label>
                <div
                  className="relative w-11 h-6 bg-muted rounded-full cursor-pointer transition-colors"
                  style={createUrgent ? { backgroundColor: 'hsl(0 84% 60%)' } : {}}
                  onClick={() => setCreateUrgent(!createUrgent)}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: createUrgent ? '22px' : '2px',
                    width: '20px', height: '20px',
                    backgroundColor: 'white', borderRadius: '50%',
                    transition: 'left 0.2s'
                  }} />
                </div>
              </div>

              <button
                className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  createSaving
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                }`}
                onClick={handleCreateOrder}
                disabled={createSaving || !createStoreId}
              >
                {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4" />Create Order</>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>


      <Sheet open={!!cancelOrderId} onOpenChange={(open) => { if (!open) { setCancelOrderId(null); setCancelReason(""); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Cancel Order</SheetTitle>
            </SheetHeader>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cancelReason === "Other" && (
                <Textarea
                  placeholder="Type the cancellation reason..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                />
              )}
              <button
                className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  cancelling
                    ? "bg-red-300 text-white cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white"
                }`}
                onClick={handleCancelOrder}
                disabled={cancelling || !cancelReason}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" />Cancel Order</>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!viewProformaId && !!viewProforma} onOpenChange={(o) => { if (!o) setViewProformaId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Proforma Invoice</DialogTitle></DialogHeader>
          {viewProforma && <ProformaView proforma={viewProforma} />}
        </DialogContent>
      </Dialog>

      <EditOrderSheet
        order={editOrder}
        open={!!editOrder}
        onOpenChange={(o) => { if (!o) setEditOrder(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] })}
      />

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
          const order = existingOrderForStore;
          if (!order) return;
          setExistingOrderForStore(null);
          setTimeout(() => {
            const found = orders?.find((o: any) => o.id === order.id);
            if (found) setEditOrder(found as any);
          }, 100);
        }}
      />
    </div>
  );
}
