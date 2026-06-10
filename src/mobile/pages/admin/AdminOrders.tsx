import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { usePermission } from "@/hooks/usePermission";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { getActiveOrderForStore, type ActiveOrderInfo } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
import { Loader2, Plus, Eye, Package, AlertCircle, X, CheckCircle2, Ban, Edit, ArrowRightLeft, Calendar, Filter, Printer, ShoppingCart } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { fmtINR } from "@/lib/utils";
import { CANCEL_REASONS } from "@/lib/constants";
import { sendNotificationToMany, getApproverUserIds, getUsersByRole, getAgentsForStore } from "@/lib/notifications";
import { OrderStockSummary } from "@/components/orders/OrderStockSummary";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { ProformaView } from "@/components/orders/ProformaView";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { EditOrderSheet } from "@/components/orders/EditOrderSheet";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  products?: {
    name: string;
    sku: string;
    base_price: number;
  };
}

interface Order {
  id: string;
  display_id: string;
  store_id: string;
  status: string;
  order_type: "simple" | "detailed";
  requirement_note: string | null;
  total_amount: number;
  created_at: string;
  stores?: { name: string; display_id: string; store_type_id: string | null; store_types: { name: string } | null; routes: { name: string } | null };
  customers?: { name: string; display_id: string };
  order_items?: OrderItem[];
  assigned_to?: string | null;
  assigned_user?: { full_name: string } | null;
  fulfilled_by_sale_id?: string | null;
  creator_profile?: { full_name: string } | null;
  updater_profile?: { full_name: string } | null;
  fulfiller_profile?: { full_name: string } | null;
  canceller_profile?: { full_name: string } | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export function AdminOrders({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const { allowed: canFulfillOrders } = usePermission("fulfill_orders");
  const { allowed: canCancelOrders } = usePermission("cancel_orders");
  const { allowed: canTransferOrders } = usePermission("transfer_orders");
  const { allowed: canEditOrders } = usePermission("edit_orders" as any);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [fulfillConfirmOrder, setFulfillConfirmOrder] = useState<Order | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [transferOrder, setTransferOrder] = useState<Order | null>(null);
  const [transferToUser, setTransferToUser] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [fulfillCash, setFulfillCash] = useState("");
  const [fulfillUpi, setFulfillUpi] = useState("");
  const [viewProformaId, setViewProformaId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
  const [existingOrderStoreName, setExistingOrderStoreName] = useState("");

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createStoreId, setCreateStoreId] = useState("");
  const [createStoreSearch, setCreateStoreSearch] = useState("");
  const [createOrderType, setCreateOrderType] = useState<"simple" | "detailed">("simple");
  const [createRequirementNote, setCreateRequirementNote] = useState("");
  const [createOrderItems, setCreateOrderItems] = useState<{ product_id: string; quantity: number; unit_price: number; products?: { name: string; base_price: number } }[]>([]);
  const [createSaving, setCreateSaving] = useState(false);

  const { data: viewProforma } = useQuery({
    queryKey: ["mobile-view-proforma", viewProformaId],
    queryFn: async () => {
      if (!viewProformaId) return null;
      const order = (orders?.orders || []).find((o: any) => o.id === viewProformaId);
      const { data: pf } = await supabase.from("proforma_invoices").select("*").eq("order_id", viewProformaId).maybeSingle();
      if (!pf) return null;
      return {
        id: pf.id,
        display_id: pf.display_id,
        order_id: pf.order_id,
        store_name: order?.stores?.name || "—",
        customer_name: order?.customers?.name || "—",
        customer_phone: (order as any)?.customers?.phone || "—",
        items: pf.items || [],
        total_amount: Number(pf.total_amount) || 0,
        status: pf.status,
        created_at: pf.created_at,
      };
    },
    enabled: !!viewProformaId,
    staleTime: 5 * 60 * 1000,
  });

  const PAGE_SIZE = 20;

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["mobile-orders", currentWarehouse?.id, statusFilter, dateFrom, dateTo, customerFilter, storeFilter, assignedToFilter, page, user?.id],
    queryFn: async () => {
      const from = 0;
      const to = page * PAGE_SIZE - 1;
      let query = supabase
        .from("orders")
        .select(`
          *,
          stores(name, display_id, store_type_id, store_types(name), routes(name)),
          customers(name, display_id),
          order_items(id, product_id, quantity, products(name, sku, base_price)),
          updater_profile:profiles!orders_updated_by_fkey(full_name),
          creator_profile:profiles!orders_created_by_fkey(full_name),
          fulfiller_profile:profiles!orders_fulfilled_by_fkey(full_name),
          canceller_profile:profiles!orders_cancelled_by_fkey(full_name)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (storeFilter !== "all") query = query.eq("store_id", storeFilter);
      if (assignedToFilter !== "all") query = query.eq("assigned_to", assignedToFilter);

      const { data, error, count } = await query;
      if (error) throw error;
      return { orders: (data || []) as Order[], total: count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  const allOrders = orders?.orders || [];
  const totalOrders = orders?.total || 0;
  const hasMore = allOrders.length < totalOrders;

  // Filter options data
  const { data: customers = [] } = useQuery({
    queryKey: ["mobile-orders-customers", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name").limit(100);
      return data || [];
    },
    enabled: !!currentWarehouse,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["mobile-orders-stores", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, display_id, customer_id").order("name").limit(100);
      return data || [];
    },
    enabled: !!currentWarehouse,
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignedStaff = [] } = useQuery({
    queryKey: ["mobile-orders-staff"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").order("full_name").limit(100);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: createProducts = [] } = useQuery({
    queryKey: ["admin-create-products", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, base_price")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: showCreate,
    staleTime: 5 * 60 * 1000,
  });

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh: async () => { setPage(1); await refetch(); },
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, customerFilter, storeFilter, assignedToFilter]);

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
    let list = allOrders.filter((order) =>
      order.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.stores?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filterStoreType !== "all") {
      list = list.filter((o) => o.stores?.store_types?.name === filterStoreType);
    }
    if (filterRoute !== "all") {
      list = list.filter((o) => o.stores?.routes?.name === filterRoute);
    }
    return list;
  }, [allOrders, searchTerm, filterStoreType, filterRoute]);

  const loadMore = () => setPage((p) => p + 1);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":   return "bg-warning/20 text-warning border-warning/30 dark:bg-warning/30";
      case "confirmed": return "bg-info/20 text-info border-info/30 dark:bg-info/30";
      case "delivered": return "bg-success/20 text-success border-success/30 dark:bg-success/30";
      case "cancelled": return "bg-destructive/20 text-destructive border-destructive/30 dark:bg-destructive/30";
      default:          return "bg-muted text-muted-foreground border-border";
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

  const calculateOrderTotal = (order: Order) => {
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items.reduce((sum, item) => {
        return sum + (item.quantity * (item.products?.base_price || 0));
      }, 0);
    }
    return order.total_amount || 0;
  };

  const calculateItemTotal = (item: OrderItem) =>
    item.quantity * (item.products?.base_price || 0);

  const handleFulfill = async (order: Order) => {
    if (!order.store_id) { toast.error("Order has no store"); return; }
    const cash = Number(fulfillCash) || 0;
    const upi = Number(fulfillUpi) || 0;
    const total = cash + upi;
    if (total <= 0) { toast.error("Enter cash or UPI amount"); return; }

    setIsActioning(true);
    try {
      // Optimistic lock: verify order is still in fulfillable state
      const { data: currentOrder, error: lockError } = await supabase
        .from("orders")
        .select("status")
        .eq("id", order.id)
        .single();

      if (lockError) throw lockError;
      if (currentOrder.status !== "pending" && currentOrder.status !== "confirmed") {
        toast.error(`Order cannot be fulfilled — current status: ${currentOrder.status}`);
        setIsActioning(false);
        setFulfillConfirmOrder(null);
        return;
      }

      const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
      if (!displayId) throw new Error("Failed to generate sale ID");

      const saleItems = (order.order_items || []).map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price || item.products?.base_price || 0,
      }));

      // Calculate actual outstanding (not hardcoded 0)
      const orderTotal = saleItems.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0);
      const outstanding = Math.max(0, orderTotal - cash - upi);

      const { error: saleError } = await (supabase as any).rpc("record_sale", {
        p_display_id: displayId,
        p_store_id: order.store_id,
        p_customer_id: (order as any).customer_id || null,
        p_recorded_by: user!.id,
        p_logged_by: null,
        p_total_amount: orderTotal,
        p_cash_amount: cash,
        p_upi_amount: upi,
        p_outstanding_amount: outstanding,
        p_sale_items: saleItems,
        p_created_at: null,
        p_fulfilled_order_id: order.id,
      });
      if (saleError) throw saleError;

      toast.success(`Order ${order.display_id} fulfilled (${displayId})`);
      setFulfillConfirmOrder(null);
      setFulfillCash("");
      setFulfillUpi("");
      setShowDetailModal(false);
      afterSaleSaved(qc, { storeId: order.store_id });
    } catch (err: any) {
      toast.error(err.message || "Failed to fulfill order");
    } finally {
      setIsActioning(false);
    }
  };

  const handleCancel = async (order: Order) => {
    if (!cancelReason.trim()) {
      toast.error("Select or type a cancellation reason");
      return;
    }
    setIsActioning(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancellation_reason: cancelReason,
          cancelled_by: user!.id,
          cancelled_at: new Date().toISOString(),
          updated_by: user!.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .in("status", ["pending", "confirmed"]);
      if (error) throw error;

      try {
        await supabase
          .from("proforma_invoices")
          .update({ status: "cancelled", deleted_at: new Date().toISOString() })
          .eq("order_id", order.id);
      } catch { /* best-effort */ }

      toast.success(`Order ${order.display_id} cancelled`);
      qc.invalidateQueries({ queryKey: ["mobile-orders"] });
      setCancelConfirmOrder(null);
      setCancelReason("");
      setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel order");
    } finally {
      setIsActioning(false);
    }
  };

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

  const updateCreatePrice = (productId: string, price: number) => {
    setCreateOrderItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, unit_price: price } : i))
    );
  };

  const handleCreateOrder = async () => {
    if (!createStoreId) {
      toast.error("Select a store");
      return;
    }
    if (createOrderType === "detailed" && createOrderItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setCreateSaving(true);
    try {
      const store = stores.find((s: any) => s.id === createStoreId);

      // Use create_order RPC (handles active order check, display ID, auto-confirm setting)
      const { data: orderResult, error: orderError } = await supabase.rpc("create_order", {
        p_store_id: createStoreId,
        p_customer_id: store?.customer_id || null,
        p_warehouse_id: currentWarehouse?.id || null,
        p_order_type: createOrderType,
        p_requirement_note: createOrderType === "simple" ? createRequirementNote : null,
        p_total_amount: 0,
        p_created_by: user!.id,
      }) as any;

      if (orderError) throw orderError;

      const orderRow = Array.isArray(orderResult) ? orderResult[0] : orderResult;
      if (!orderRow?.order_id) throw new Error("Failed to create order");

      // Insert order items for detailed orders
      if (createOrderType === "detailed" && createOrderItems.length > 0) {
        const { error: itemError } = await supabase.from("order_items").insert(
          createOrderItems.map((item) => ({
            order_id: orderRow.order_id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }))
        );
        if (itemError) throw itemError;
      }

      const displayId = orderRow.display_id;
      toast.success("Order created");

      const storeName = store?.name || "store";
      getApproverUserIds().then((ids) => {
        if (ids.length > 0) {
          sendNotificationToMany(ids, {
            title: "New Order Created",
            message: `Order ${displayId} for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: orderRow.order_id,
          }, { excludeFromBroadcast: [user!.id] });
        }
      });
      getUsersByRole(["marketer"]).then((ids) => {
        if (ids.length > 0) {
          sendNotificationToMany(ids, {
            title: "New Order Created",
            message: `Order ${displayId} for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: orderRow.order_id,
          }, { excludeFromBroadcast: [user!.id] });
        }
      });
      getAgentsForStore(createStoreId).then((agentIds) => {
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
      setCreateStoreId("");
      setCreateStoreSearch("");
      setCreateOrderType("simple");
      setCreateRequirementNote("");
      setCreateOrderItems([]);
      qc.invalidateQueries({ queryKey: ["mobile-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setCreateSaving(false);
    }
  };

  const getCreateTotal = () => {
    return createOrderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  };

  const handleTransfer = async (order: Order) => {
    if (!transferToUser) {
      toast.error("Please select a staff member");
      return;
    }
    setIsActioning(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_to: transferToUser, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      toast.success(`Order ${order.display_id} transferred`);
      qc.invalidateQueries({ queryKey: ["mobile-orders"] });
      setTransferOrder(null);
      setTransferToUser("");
      setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to transfer order");
    } finally {
      setIsActioning(false);
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
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Orders</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">Manage all orders</p>
          </div>
          <Button size="sm" className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 -mt-3 space-y-2 mb-4">
        <Input placeholder="Search order ID or store..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />

        {/* Date Range */}
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

        {/* Filters Row */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
            <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Assigned To" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {assignedStaff.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters */}
        {(statusFilter !== "all" || dateFrom || dateTo || customerFilter !== "all" || storeFilter !== "all" || assignedToFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-10 text-xs text-muted-foreground"
            onClick={() => {
              setStatusFilter("all");
              setDateFrom("");
              setDateTo("");
              setCustomerFilter("all");
              setStoreFilter("all");
              setAssignedToFilter("all");
            }}
          >
            <Filter className="h-3 w-3 mr-1" /> Clear Filters
          </Button>
        )}
      </div>

      <div className="px-4 space-y-2">
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
      </div>

      {/* Orders List */}
      <div
        onTouchStart={pullHandlers.onTouchStart}
        onTouchMove={pullHandlers.onTouchMove}
        onTouchEnd={pullHandlers.onTouchEnd}
        className="overflow-y-auto"
      >
        <PullRefreshIndicator isRefreshing={isRefreshing} isPulling={isPulling} pullDistance={pullDistance} threshold={threshold} />
        {isLoading ? (
          <CardSkeletonList count={4} />
      ) : filteredOrders.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
            <Package className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No orders found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {statusFilter !== "all" || customerFilter !== "all" || storeFilter !== "all" || assignedToFilter !== "all"
              ? "Try adjusting your filters above"
              : "No orders match your current criteria"}
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredOrders.map((order) => {
            const orderTotal = calculateOrderTotal(order);
            const itemCount = order.order_items?.length || 0;

            return (
              <div
                key={order.id}
                id={`order-card-${order.id}`}
                className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
              >
                {/* Status bar */}
                <div className={`h-1 ${
                  order.status === "pending" ? "bg-amber-400" :
                  order.status === "delivered" ? "bg-emerald-400" :
                  order.status === "cancelled" ? "bg-red-400" : "bg-slate-300"
                }`} />
                {/* Card Body — tappable to open modal */}
                <div
                  onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-primary">{order.display_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.stores?.name || "Unknown Store"}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 border ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                      {order.status}
                    </span>
                  </div>

                  {order.order_type === "detailed" && order.order_items && order.order_items.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {order.order_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">
                            {item.products?.name} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">
                            {fmtINR(calculateItemTotal(item))}
                          </span>
                        </div>
                      ))}
                      {order.order_items.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{order.order_items.length - 2} more items
                        </p>
                      )}
                    </div>
                  )}

                  {order.order_type === "simple" && order.requirement_note && (
                    <p className="text-xs text-muted-foreground truncate mb-2">
                      Note: {order.requirement_note}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {itemCount > 0 ? `${itemCount} items` : order.order_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "dd MMM, hh:mm a")}
                      </span>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-primary">
                      {fmtINR(orderTotal)}
                    </p>
                  </div>
                </div>

                {/* Audit trail */}
                {(order.creator_profile || order.updater_profile || order.fulfiller_profile) && (
                  <div className="border-t border-border/50 px-3 py-1.5">
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

                {/* Action Buttons — card click = view, so first action is Fulfill */}
                <div className="flex border-t border-border/50">
                  {order.status === "pending" && canFulfillOrders && (
                    <button
                      onClick={() => setFulfillConfirmOrder(order)}
                      disabled={isActioning}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors border-r border-border/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Fulfill</span>
                    </button>
                  )}
                  <button
                    onClick={() => setViewProformaId(order.id)}
                    className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-sky-600 hover:bg-sky-50 active:bg-sky-100 transition-colors border-r border-border/50"
                  >
                    <Printer className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Proforma</span>
                  </button>
                  {(order.status === "pending" || order.status === "confirmed") && canEditOrders && (
                    <button
                      onClick={() => setEditOrder(order)}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-colors border-r border-border/50"
                    >
                      <Edit className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Edit</span>
                    </button>
                  )}
                  {(order.status === "pending" || order.status === "confirmed") && canCancelOrders && (
                    <button
                      onClick={() => setCancelConfirmOrder(order)}
                      disabled={isActioning}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Cancel</span>
                    </button>
                  )}
                  {order.status !== "pending" && order.status !== "confirmed" && (
                    <button
                      onClick={() => onNavigate(`/orders?highlight=${order.id}`)}
                      className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Details</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="px-4 py-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
              disabled={isLoading && page > 1}
            >
              {isLoading && page > 1 ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                `Load More (${allOrders.length} of ${totalOrders})`
              )}
            </Button>
          </div>
        )}
      </div>{/* end pull-to-refresh wrapper */}

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Order ID</span>
                  <span className="font-mono text-sm font-semibold">{selectedOrder.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedOrder.stores?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <span className="text-sm capitalize">{selectedOrder.order_type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${getStatusColor(selectedOrder.status)}`}>
                    {getStatusIcon(selectedOrder.status)}
                    {selectedOrder.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedOrder.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
              </div>

              {selectedOrder.order_type === "detailed" && selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Order Items ({selectedOrder.order_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedOrder.order_items.map((item, idx) => {
                      const unitPrice = item.products?.base_price || 0;
                      const totalPrice = calculateItemTotal(item);
                      return (
                        <div key={idx} className="px-3 py-2.5">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-medium">{item.products?.name}</span>
                            <span className="text-sm font-semibold tabular-nums">{fmtINR(totalPrice)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                            <span>Qty: {item.quantity} × {fmtINR(unitPrice)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2.5 border-t bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted-foreground">Total Amount</span>
                      <span className="text-base font-bold text-primary tabular-nums">{fmtINR(calculateOrderTotal(selectedOrder))}</span>
                    </div>
                  </div>
                </div>
              ) : selectedOrder.requirement_note ? (
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Requirement</p>
                  <p className="text-sm text-foreground">{selectedOrder.requirement_note}</p>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setShowDetailModal(false); onNavigate(`/orders?highlight=${selectedOrder.id}`); }}
                >
                  <Eye className="h-3 w-3 mr-1" /> View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={isActioning || !canTransferOrders}
                  onClick={() => { setShowDetailModal(false); setTransferOrder(selectedOrder); }}
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Transfer
                </Button>
                {selectedOrder.status === "pending" && canFulfillOrders && (
                  <Button
                    size="sm"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700"
                    disabled={isActioning}
                    onClick={() => { setShowDetailModal(false); setFulfillConfirmOrder(selectedOrder); }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Deliver
                  </Button>
                )}
                {(selectedOrder.status === "pending" || selectedOrder.status === "confirmed") && canCancelOrders && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                    disabled={isActioning}
                    onClick={() => { setShowDetailModal(false); setCancelConfirmOrder(selectedOrder); }}
                  >
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Proforma Dialog */}
      <Dialog open={!!viewProformaId && !!viewProforma} onOpenChange={(o) => { if (!o) setViewProformaId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Proforma Invoice</DialogTitle></DialogHeader>
          {viewProforma && <ProformaView proforma={viewProforma} />}
        </DialogContent>
      </Dialog>

      {/* Fulfill Payment Dialog */}
      <Dialog open={!!fulfillConfirmOrder} onOpenChange={(o) => { if (!o) { setFulfillConfirmOrder(null); setFulfillCash(""); setFulfillUpi(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fulfill Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-bold">{fulfillConfirmOrder?.display_id}</p>
              <p className="text-xs text-muted-foreground">{fulfillConfirmOrder?.stores?.name}</p>
            </div>
            {(fulfillConfirmOrder?.order_items || []).length > 0 && (
              <div className="border rounded-lg divide-y text-xs">
                {fulfillConfirmOrder?.order_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between px-3 py-2">
                    <span>{item.products?.name || "Product"} × {item.quantity}</span>
                    <span className="font-medium">₹{(Number(item.products?.base_price || 0) * item.quantity).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cash Received</label>
                <Input type="number" min="0" placeholder="0" value={fulfillCash} onChange={(e) => setFulfillCash(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">UPI Received</label>
                <Input type="number" min="0" placeholder="0" value={fulfillUpi} onChange={(e) => setFulfillUpi(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t">
              <span>Total</span>
              <span>₹{((Number(fulfillCash) || 0) + (Number(fulfillUpi) || 0)).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setFulfillConfirmOrder(null); setFulfillCash(""); setFulfillUpi(""); }}>Cancel</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={isActioning} onClick={() => fulfillConfirmOrder && handleFulfill(fulfillConfirmOrder)}>
                {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Sale & Deliver"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelConfirmOrder} onOpenChange={(o) => { if (!o) { setCancelReason(""); setCancelConfirmOrder(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order <strong>{cancelConfirmOrder?.display_id}</strong> will be cancelled.
              This action cannot be undone.
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
              disabled={isActioning || !cancelReason}
              onClick={() => cancelConfirmOrder && handleCancel(cancelConfirmOrder)}
            >
              {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Order Dialog */}
      <Dialog open={!!transferOrder} onOpenChange={(o) => { if (!o) setTransferToUser(""); setTransferOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Transfer Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Reassign order <strong>{transferOrder?.display_id}</strong> to another staff member.
            </p>
            <Select value={transferToUser} onValueChange={setTransferToUser}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {assignedStaff.filter(s => s.user_id !== transferOrder?.assigned_to).map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setTransferOrder(null); setTransferToUser(""); }}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={!transferToUser || isActioning}
              onClick={() => transferOrder && handleTransfer(transferOrder)}
            >
              {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Order Sheet */}
      <Sheet open={showCreate} onOpenChange={(v) => { if (!v) { setCreateStoreId(""); setCreateStoreSearch(""); setCreateOrderType("simple"); setCreateRequirementNote(""); setCreateOrderItems([]); } setShowCreate(v); }}>
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
                    {(stores || [])
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
                    <span className="text-sm font-medium">{(stores as any[])?.find((s: any) => s.id === createStoreId)?.name || "Store selected"}</span>
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
                    {createProducts.map((p: any) => {
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
                      <span className="text-base font-bold">{fmtINR(getCreateTotal())}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                size="sm"
                className="w-full text-xs h-11"
                onClick={handleCreateOrder}
                disabled={createSaving || !createStoreId}
              >
                {createSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-1" />
                )}
                {createSaving ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <EditOrderSheet
        order={editOrder}
        open={!!editOrder}
        onOpenChange={(o) => { if (!o) setEditOrder(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mobile-orders"] })}
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
            const found = filteredOrders?.find((o: any) => o.id === order.id);
            if (found) setEditOrder(found as any);
          }, 100);
        }}
      />
    </div>
  );
}
