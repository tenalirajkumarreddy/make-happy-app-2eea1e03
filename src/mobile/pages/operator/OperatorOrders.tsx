import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { usePermission } from "@/hooks/usePermission";
import {Loader2, Package, AlertCircle, CheckCircle2, Ban, Plus, ShoppingCart, User, Calendar, X, Pencil, Edit, FileText} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendNotificationToMany, getApproverUserIds, getUsersByRole, getAgentsForStore } from "@/lib/notifications";
import { format } from "date-fns";
import { fmtINR } from "@/lib/utils";
import { CANCEL_REASONS } from "@/lib/constants";
import { OrderStockSummary } from "@/components/orders/OrderStockSummary";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { ProformaView } from "@/components/orders/ProformaView";
import { EditOrderSheet } from "@/components/orders/EditOrderSheet";

interface OrderItemData {
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: { name: string; sku: string; base_price: number };
}

interface Order {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string;
  status: string;
  order_type: "simple" | "detailed";
  requirement_note: string | null;
  total_amount: number;
  created_at: string;
  created_by: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  stores?: { name: string; display_id: string; store_type_id: string | null; store_types: { name: string } | null; routes: { name: string } | null };
  customers?: { name: string; display_id: string };
  order_items?: OrderItemData[];
  creator_profile?: { full_name: string } | null;
  updater_profile?: { full_name: string } | null;
  fulfiller_profile?: { full_name: string } | null;
  canceller_profile?: { full_name: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
  display_id: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  base_price: number;
}

export function OperatorOrders() {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const { allowed: canCancelOrders } = usePermission("cancel_orders");
  const { allowed: canModifyPrices } = usePermission("modify_order_item_prices");

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [viewProformaId, setViewProformaId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderType, setOrderType] = useState<"simple" | "detailed">("simple");
  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItemData[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ["operator-orders", statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(name, display_id, store_type_id, store_types(name), routes(name)),
          customers(name, display_id),
          order_items(id, product_id, quantity, unit_price, products(name, sku, base_price)),
          creator_profile:profiles!orders_created_by_fkey(full_name),
          updater_profile:profiles!orders_updated_by_fkey(full_name),
          fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name),
          canceller_profile:profiles!orders_cancelled_by_fkey(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (statusFilter !== "all") {
        return ((data || []) as unknown as Order[]).filter((o) => o.status === statusFilter);
      }
      return (data || []) as unknown as Order[];
    },
  });

  const allOrders = orders || [];

  const storeTypeOptions = useMemo(() => {
    const set = new Set<string>();
    allOrders.forEach((o) => {
      const n = o.stores?.store_types?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [allOrders]);

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    allOrders.forEach((o) => {
      const n = o.stores?.routes?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    let list = allOrders;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (o) =>
          o.display_id?.toLowerCase().includes(s) ||
          o.stores?.name?.toLowerCase().includes(s) ||
          o.customers?.name?.toLowerCase().includes(s)
      );
    }
    if (filterStoreType !== "all") {
      list = list.filter((o) => o.stores?.store_types?.name === filterStoreType);
    }
    if (filterRoute !== "all") {
      list = list.filter((o) => o.stores?.routes?.name === filterRoute);
    }
    return list;
  }, [allOrders, searchTerm, filterStoreType, filterRoute]);

  const { data: viewProforma } = useQuery({
    queryKey: ["operator-view-proforma", viewProformaId],
    queryFn: async () => {
      if (!viewProformaId) return null;
      const order = allOrders.find((o: any) => o.id === viewProformaId);
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
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["operator-create-customers", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name").limit(100);
      return (data || []) as Customer[];
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["operator-create-stores", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data } = await supabase
        .from("stores")
        .select("id, name, display_id")
        .eq("customer_id", customerId)
        .eq("is_active", true)
        .order("name");
      return (data || []) as Store[];
    },
    enabled: !!customerId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["operator-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, base_price")
        .eq("is_active", true)
        .order("name");
      return (data || []) as Product[];
    },
  });

  const statusFilters = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":   return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200";
      case "confirmed": return "text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200";
      case "delivered": return "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200";
      case "cancelled": return "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200";
      default:          return "text-gray-600 bg-gray-50 dark:bg-gray-950/20 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":   return <AlertCircle className="h-3 w-3" />;
      case "confirmed": return <CheckCircle2 className="h-3 w-3" />;
      case "delivered": return <Package className="h-3 w-3" />;
      case "cancelled": return <Ban className="h-3 w-3" />;
      default:          return null;
    }
  };

  const handleCancel = async (order: Order) => {
    if (!cancelReason.trim()) {
      toast.error("Add cancellation reason");
      return;
    }
    setIsActioning(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancellation_reason: cancelReason.trim(),
          cancelled_by: user!.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .in("status", ["pending", "confirmed"]);
      if (error) throw error;

      await supabase
        .from("proforma_invoices")
        .update({ status: "cancelled", deleted_at: new Date().toISOString() })
        .eq("order_id", order.id);

      toast.success(`Order ${order.display_id} cancelled`);
      qc.invalidateQueries({ queryKey: ["operator-orders"] });
      setCancelConfirmOrder(null);
      setCancelReason("");
      setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel order");
    } finally {
      setIsActioning(false);
    }
  };

  const addOrderItem = (product: Product) => {
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        { product_id: product.id, quantity: 1, unit_price: product.base_price, products: product },
      ];
    });
  };

  const updateItemQty = (productId: string, qty: number) => {
    setOrderItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.product_id !== productId)
        : prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
    );
  };

  const updateItemPrice = (productId: string, price: number) => {
    setOrderItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, unit_price: price } : i))
    );
  };

  const handleCreateOrder = async () => {
    if (!customerId || !storeId) {
      toast.error("Select customer and store");
      return;
    }
    if (orderType === "detailed" && orderItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSaving(true);
    try {
      const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "ORD", seq_name: "order_display_seq" }) as any;
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
          warehouse_id: currentWarehouse?.id,
          requirement_note: orderType === "simple" ? requirementNote : null,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      if (orderType === "detailed" && orderItems.length > 0) {
        const { error: itemError } = await supabase.from("order_items").insert(
          orderItems.map((item) => ({
            order_id: orderRow.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }))
        );
        if (itemError) throw itemError;
      }

      toast.success("Order created");

      const storeName = stores.find((s) => s.id === storeId)?.name || "store";
      getApproverUserIds().then((ids) => {
        const others = ids.filter((id) => id !== user!.id);
        if (others.length > 0) {
          sendNotificationToMany(others, {
            title: "New Order Created",
            message: `Order ${displayId} for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: orderRow.id,
          });
        }
      });
      getUsersByRole(["marketer"]).then((ids) => {
        const others = ids.filter((id) => id !== user!.id);
        if (others.length > 0) {
          sendNotificationToMany(others, {
            title: "New Order Created",
            message: `Order ${displayId} for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: orderRow.id,
          });
        }
      });
      getAgentsForStore(storeId).then((agentIds) => {
        if (agentIds.length > 0) {
          sendNotificationToMany(agentIds, {
            title: "New Order for Your Store",
            message: `Order ${displayId} for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: orderRow.id,
          });
        }
      });

      setShowCreate(false);
      setCustomerId("");
      setStoreId("");
      setOrderType("simple");
      setRequirementNote("");
      setOrderItems([]);
      qc.invalidateQueries({ queryKey: ["operator-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  const getItemTotal = () => {
    return orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  };

  if (isLoading) {
    return <CardSkeletonList count={5} />;
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Failed to load orders</p>
          <p className="text-xs text-red-500 mt-1">{(error as any)?.message || "Check RLS policies or network"}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 -mx-4 -mt-4 px-4 pt-4 pb-6 mb-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white text-lg font-bold">Warehouse Orders</h2>
                <p className="text-blue-200/80 text-xs mt-0.5">{currentWarehouse?.name || "Orders"}</p>
              </div>
              <Button
                size="sm"
                className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" /> Create
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Search order ID, store, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-9 text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-9 text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {statusFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <OrderStockSummary orders={allOrders} />

          {(storeTypeOptions.length > 0 || routeOptions.length > 0) && (
            <button
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? "Hide store type / route" : "Filter by store type / route"}
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

          <div className="space-y-2">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                className="rounded-xl border bg-card p-4 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    order.status === "delivered" ? "bg-green-100 text-green-600" :
                    order.status === "cancelled" ? "bg-red-100 text-red-600" :
                    order.status === "confirmed" ? "bg-blue-100 text-blue-600" :
                    "bg-yellow-100 text-yellow-600"
                  }`}>
                    {getStatusIcon(order.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{order.display_id}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {order.stores?.name || "—"}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-muted-foreground">
                        {order.customers?.name || "—"}
                      </p>
                      <p className="text-sm font-bold">{fmtINR(order.total_amount)}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {order.status === "cancelled"
                          ? `Cancelled by ${order.canceller_profile?.full_name || "—"}`
                          : `Created by ${order.creator_profile?.full_name || "—"}`}
                      </p>
                      {order.order_items && (
                        <p className="text-[10px] text-muted-foreground">
                          {order.order_items.length} item{order.order_items.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {(order.creator_profile || order.updater_profile || order.fulfiller_profile) && (
                  <div className="border-t border-border/50 mt-2 pt-2">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
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

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setViewProformaId(order.id); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 inline mr-1" />Proforma
                  </button>
                  {(order.status === "pending" || order.status === "confirmed") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditOrder(order); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5 inline mr-1" />Edit
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!filteredOrders.length && (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No orders found</p>
                <p className="text-xs mt-1">Try adjusting your filters or create a new order</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <span>{selectedOrder?.display_id}</span>
              {selectedOrder && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${getStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-xs font-medium">{selectedOrder.stores?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Customer</span>
                  <span className="text-xs font-medium">{selectedOrder.customers?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs font-medium">{format(new Date(selectedOrder.created_at), "dd MMM yyyy, h:mm a")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <span className="text-xs font-medium capitalize">{selectedOrder.order_type}</span>
                </div>
                {selectedOrder.creator_profile && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Created by</span>
                    <span className="text-xs font-medium">{selectedOrder.creator_profile.full_name}</span>
                  </div>
                )}
                {selectedOrder.status === "cancelled" && selectedOrder.canceller_profile && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Cancelled by</span>
                    <span className="text-xs font-medium text-red-600">{selectedOrder.canceller_profile.full_name}</span>
                  </div>
                )}
              </div>

              {selectedOrder.order_items && selectedOrder.order_items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Items</p>
                  {selectedOrder.order_items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.products?.name || "Product"}</p>
                        <p className="text-[10px] text-muted-foreground">x{item.quantity} @ {fmtINR(item.unit_price || 0)}</p>
                      </div>
                      <p className="text-xs font-semibold">{fmtINR(item.quantity * (item.unit_price || 0))}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedOrder.requirement_note && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Requirement Note</p>
                  <p className="text-sm">{selectedOrder.requirement_note}</p>
                </div>
              )}

              {selectedOrder.cancellation_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/10 p-3">
                  <p className="text-xs text-red-600 font-medium mb-1">Cancellation Reason</p>
                  <p className="text-sm text-red-700">{selectedOrder.cancellation_reason}</p>
                </div>
              )}

              <div className="flex justify-between items-center border-t pt-3">
                <span className="text-sm font-medium">Total</span>
                <span className="text-lg font-bold">{fmtINR(selectedOrder.total_amount)}</span>
              </div>

              {canCancelOrders && selectedOrder.status !== "delivered" && selectedOrder.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { setCancelConfirmOrder(selectedOrder); setCancelReason(""); }}
                >
                  <Ban className="h-3.5 w-3.5 mr-1" />
                  Cancel Order
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelConfirmOrder} onOpenChange={(open) => { if (!open) { setCancelReason(""); setCancelConfirmOrder(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order {cancelConfirmOrder?.display_id}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</Label>
            <Select value={cancelReason} onValueChange={setCancelReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
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
                className="mt-2"
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isActioning || !cancelReason.trim()}
              onClick={() => cancelConfirmOrder && handleCancel(cancelConfirmOrder)}
            >
              {isActioning ? "Cancelling..." : "Yes, Cancel Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Create Order</SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground mb-2 block">Customer</Label>
                <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setStoreId(""); }}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-muted-foreground mb-2 block">Store</Label>
                <Select value={storeId} onValueChange={setStoreId} disabled={!customerId}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder={customerId ? "Select store..." : "Select customer first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-muted-foreground mb-2 block">Order Type</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderType("simple")}
                    className={`flex-1 px-4 py-3 rounded-xl text-xs font-medium transition-colors ${
                      orderType === "simple"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    onClick={() => setOrderType("detailed")}
                    className={`flex-1 px-4 py-3 rounded-xl text-xs font-medium transition-colors ${
                      orderType === "detailed"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Detailed
                  </button>
                </div>
              </div>

              {orderType === "simple" ? (
                <div>
                  <Label className="text-xs font-bold text-muted-foreground mb-2 block">Requirement Note</Label>
                  <textarea
                    value={requirementNote}
                    onChange={(e) => setRequirementNote(e.target.value)}
                    placeholder="Describe what the customer needs..."
                    className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-muted-foreground mb-2 block">Products</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addOrderItem(p)}
                        className="px-3 py-1.5 rounded-full text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {orderItems.length > 0 && (
                    <div className="space-y-2">
                      {orderItems.map((item) => (
                        <div key={item.product_id} className="bg-muted/30 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">{(item.products as Product)?.name || "Product"}</p>
                            <button onClick={() => updateItemQty(item.product_id, 0)}>
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Label className="text-[10px] text-muted-foreground">Qty</Label>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateItemQty(item.product_id, Number(e.target.value))}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex-1">
                              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                Price
                                {canModifyPrices && <Pencil className="h-2.5 w-2.5" />}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unit_price}
                                onChange={(e) => updateItemPrice(item.product_id, Number(e.target.value))}
                                className="h-8 text-xs"
                                readOnly={!canModifyPrices}
                              />
                            </div>
                            <div className="text-right">
                              <Label className="text-[10px] text-muted-foreground">Total</Label>
                              <p className="text-xs font-semibold mt-1">{fmtINR(item.quantity * item.unit_price)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-xs font-medium">Order Total</span>
                        <span className="text-sm font-bold">{fmtINR(getItemTotal())}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                size="sm"
                className="w-full text-xs h-11"
                onClick={handleCreateOrder}
                disabled={saving || !customerId || !storeId}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-1" />
                )}
                {saving ? "Creating..." : "Create Order"}
              </Button>
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
        onSaved={() => qc.invalidateQueries({ queryKey: ["operator-orders"] })}
      />
    </div>
  );
}
