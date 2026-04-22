import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, XCircle, Package, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
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
  stores: { name: string } | null;
  customers: { name: string } | null;
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
}

interface OrderItemInput {
  product_id: string;
  quantity: number;
}

interface FulfillOrder {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  status: string;
  requirement_note: string | null;
  order_items?: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number | null;
    products?: {
      id: string;
      name: string;
      sku: string;
      base_price: number;
      image_url?: string;
    };
  }>;
  stores?: {
    id: string;
    name: string;
    store_type_id: string | null;
    customer_id: string | null;
  };
}

interface SupabaseRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: Error | null }>;
}

export function MarketerOrders({ preselectStore, onStoreConsumed }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { role } = useAuth();
  const { canAccessRoute } = useRouteAccess(user?.id, role);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "delivered" | "cancelled"
  >("all");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderType, setOrderType] = useState<"simple" | "detailed">("simple");
  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([
    { product_id: "", quantity: 1 },
  ]);

  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [fulfillOrder, setFulfillOrder] = useState<FulfillOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!preselectStore) return;
    setCustomerId(preselectStore.customer_id || "");
    setStoreId(preselectStore.id);
    setShowCreate(true);
    onStoreConsumed?.();
  }, [onStoreConsumed, preselectStore]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-marketer-orders", user?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "id, display_id, status, order_type, requirement_note, cancellation_reason, created_at, store_id, customer_id, stores(name), customers(name)",
        )
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
  });

  const { data: customers } = useQuery({
    queryKey: ["mobile-marketer-order-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as CustomerItem[]) || [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-marketer-order-stores", customerId],
    queryFn: async () => {
      let query = supabase
        .from("stores")
        .select("id, name, route_id")
        .eq("is_active", true)
        .order("name");

      if (customerId) query = query.eq("customer_id", customerId);

      const { data, error } = await query;
      if (error) throw error;
      return ((data as StoreItem[]) || []).filter((store) =>
        canAccessRoute(store.route_id),
      );
    },
    enabled: !!customerId,
  });

  const { data: products } = useQuery({
    queryKey: ["mobile-marketer-order-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as ProductItem[]) || [];
    },
  });

  const pendingCount = useMemo(
    () => (orders || []).filter((order) => order.status === "pending").length,
    [orders],
  );

  const addItem = () =>
    setOrderItems((prev) => [...prev, { product_id: "", quantity: 1 }]);
  const removeItem = (index: number) =>
    setOrderItems((prev) => prev.filter((_, idx) => idx !== index));

  const resetForm = () => {
    setCustomerId("");
    setStoreId("");
    setOrderType("simple");
    setRequirementNote("");
    setOrderItems([{ product_id: "", quantity: 1 }]);
  };

  const handleCreateOrder = async () => {
    if (!storeId || !customerId) {
      toast.error("Select customer and store");
      return;
    }
    if (orderType === "simple" && !requirementNote.trim()) {
      toast.error("Enter requirement note");
      return;
    }
    if (
      orderType === "detailed" &&
      !orderItems.some((item) => item.product_id)
    ) {
      toast.error("Add at least one product");
      return;
    }

    setSaving(true);
    try {
      const rpcClient = supabase as unknown as SupabaseRpcClient;
      const { data: displayId, error: displayError } = await rpcClient.rpc(
        "generate_display_id",
        {
          prefix: "ORD",
          seq_name: "ord_display_seq",
        },
      );
      if (displayError) throw displayError;
      if (!displayId) throw new Error("Failed to generate order ID");

      const { data: orderRow, error: orderError } = await supabase
        .from("orders")
        .insert({
          display_id: displayId,
          store_id: storeId,
          customer_id: customerId,
          order_type: orderType,
          source: "manual",
          created_by: user!.id,
          requirement_note: orderType === "simple" ? requirementNote : null,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      if (orderType === "detailed") {
        const validItems = orderItems.filter((item) => item.product_id);
        if (validItems.length > 0) {
          const { error: itemError } = await supabase
            .from("order_items")
            .insert(
              validItems.map((item) => ({
                order_id: orderRow.id,
                product_id: item.product_id,
                quantity: item.quantity,
              })),
            );
          if (itemError) throw itemError;
        }
      }

      toast.success("Order created");
      setShowCreate(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create order";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error("Add cancellation reason");
      return;
    }
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancellation_reason: cancelReason,
          cancelled_by: user!.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", cancelOrderId)
        .eq("status", "pending");
      if (error) throw error;

      toast.success("Order cancelled");
      setCancelOrderId(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel order";
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  };

  // Open fulfillment dialog for an order
  const handleOpenFulfillment = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          stores(id, name, store_type_id, customer_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `,
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;
      setFulfillOrder(orderData as unknown as FulfillOrder);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load order details";
      toast.error(message);
    } finally {
      setLoadingOrderId(null);
    }
  };

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">
              Orders
            </p>
            <h2 className="text-white text-xl font-bold mt-0.5">My Orders</h2>
            <p className="text-blue-200/80 text-xs mt-1">
              {pendingCount} pending
            </p>
          </div>
          <Button
            size="sm"
            className="rounded-xl bg-background text-blue-700 hover:bg-background/90"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-card text-card-foreground border border-border p-1 flex gap-1">
          {(["all", "pending", "delivered", "cancelled"] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold capitalize ${
                  statusFilter === status
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted dark:hover:bg-slate-700/50"
                }`}
              >
                {status}
              </button>
            ),
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : (orders?.length || 0) === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center bg-muted/30">
            <Package className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">
              No orders found
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(orders || []).map((order) => (
              <div
                key={order.id}
                className="rounded-2xl bg-card text-card-foreground border border-border p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {order.display_id}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${
                          order.status === "pending"
                            ? "border-amber-200 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                            : order.status === "delivered"
                              ? "border-emerald-200 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                              : "border-red-200 text-red-600 dark:border-red-700 dark:text-red-400"
                        }`}
                      >
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.stores?.name || "Store"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span>{order.order_type}</span>
                      <span>•</span>
                      <span>
                        {new Date(order.created_at).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {order.requirement_note && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {order.requirement_note}
                      </p>
                    )}
                    {order.status === "cancelled" &&
                      order.cancellation_reason && (
                        <p className="text-xs text-red-500 mt-2">
                          Reason: {order.cancellation_reason}
                        </p>
                      )}
                  </div>
                </div>

                {order.status === "pending" && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button
                      size="sm"
                      className="h-9 rounded-xl"
                      onClick={() => handleOpenFulfillment(order.id)}
                      disabled={loadingOrderId === order.id}
                    >
                      {loadingOrderId === order.id ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Package className="h-4 w-4 mr-1.5" />
                      )}
                      Fulfill
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={() => setCancelOrderId(order.id)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto"
        >
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">
                Create Order
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                  Customer
                </Label>
                <Select
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(value);
                    setStoreId("");
                  }}
                >
                  <SelectTrigger className="rounded-xl h-11 border-border">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers || []).map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                  Store
                </Label>
                <Select
                  value={storeId}
                  onValueChange={setStoreId}
                  disabled={!customerId}
                >
                  <SelectTrigger className="rounded-xl h-11 border-border">
                    <SelectValue
                      placeholder={
                        customerId ? "Select store..." : "Select customer first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(stores || []).map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                  Order Type
                </Label>
                <Select
                  value={orderType}
                  onValueChange={(value) =>
                    setOrderType(value as "simple" | "detailed")
                  }
                >
                  <SelectTrigger className="rounded-xl h-11 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">
                      Simple (requirement note)
                    </SelectItem>
                    <SelectItem value="detailed">
                      Detailed (products + qty)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {orderType === "simple" ? (
                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                    Requirement
                  </Label>
                  <Textarea
                    value={requirementNote}
                    onChange={(event) => setRequirementNote(event.target.value)}
                    placeholder="What does the store need?"
                    rows={3}
                    className="rounded-xl resize-none border-border"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Products
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      onClick={addItem}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {orderItems.map((item, index) => (
                      <div
                        key={`${index}-${item.product_id}`}
                        className="grid grid-cols-[1fr_90px_36px] gap-2"
                      >
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => {
                            setOrderItems((prev) =>
                              prev.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, product_id: value }
                                  : row,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-10 border-border">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {(products || []).map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => {
                            const quantity = Math.max(
                              1,
                              Number(event.target.value || 1),
                            );
                            setOrderItems((prev) =>
                              prev.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, quantity } : row,
                              ),
                            );
                          }}
                          className="h-10 rounded-xl"
                        />

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-9 rounded-xl"
                          onClick={() => removeItem(index)}
                          disabled={orderItems.length === 1}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  saving
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                }`}
                onClick={handleCreateOrder}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    Create Order
                  </>
                )}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!cancelOrderId}
        onOpenChange={(open) => !open && setCancelOrderId(null)}
      >
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">
                Cancel Order
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Reason
              </Label>
              <Textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Why are you cancelling this order?"
                rows={3}
                className="rounded-xl resize-none border-border"
              />
              <button
                className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  cancelling
                    ? "bg-red-300 text-white cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white"
                }`}
                onClick={handleCancelOrder}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Cancel Order
                  </>
                )}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Order Fulfillment Dialog */}
      <OrderFulfillmentDialog
        order={fulfillOrder}
        open={!!fulfillOrder}
        onOpenChange={(open) => {
          if (!open) setFulfillOrder(null);
        }}
        onFulfilled={() => {
          qc.invalidateQueries({ queryKey: ["mobile-marketer-orders"] });
          qc.invalidateQueries({ queryKey: ["orders"] });
          qc.invalidateQueries({ queryKey: ["sales"] });
        }}
      />
    </div>
  );
}
