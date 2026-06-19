import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay, format } from "date-fns";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Edit,
  Eye,
  List,
  Loader2,
  Map,
  MapPin,
  Minus,
  Navigation2,
  Package,
  Phone,
  Plus,
  QrCode,
  ShoppingBag,
  ShoppingCart,
  Store,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, fmtINR } from "@/lib/utils";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { CANCEL_REASONS } from "@/lib/constants";
import { OrderStockSummary } from "@/components/orders/OrderStockSummary";
import { ProformaView } from "@/components/orders/ProformaView";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { usePermission } from "@/hooks/usePermission";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { cacheQueryResult, getCachedQueryResult } from "@/lib/offlineRouteCache";
import { getActiveOrderForStore, type ActiveOrderInfo } from "@/lib/orders";
import { ActiveOrderExistsDialog } from "@/mobile/components/ActiveOrderExistsDialog";
import { VisitReasonDialog } from "@/components/routes/VisitReasonDialog";
import { RouteMap } from "@/components/routes/RouteMap";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

interface CustomerItem { id: string; name: string; }
interface StoreItem { id: string; name: string; route_id: string | null; }
interface ProductItem { id: string; name: string; }
interface OrderItemInput { product_id: string; quantity: number; }
interface SupabaseRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: Error | null }>;
}

export interface AgentRoutesProps {
  onOpenStore?: (store: StoreOption) => void;
  onGoRecord?: (store: StoreOption | null, action: "sale" | "payment") => void;
}

interface RouteStore {
  id: string;
  name: string;
  display_id: string;
  route_id: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  outstanding: number;
  store_order: number | null;
  customer_id: string | null;
  customers: { name: string } | null;
  store_types: { name: string } | null;
}

interface RouteRow {
  id: string;
  name: string;
  store_types: { name: string } | null;
  stores: RouteStore[];
}

interface VisitRow {
  store_id: string;
  route_sessions: { route_id: string } | { route_id: string }[] | null;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: { name: string; sku: string; base_price: number };
}

interface OrderRow {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string;
  status: string;
  order_type: "simple" | "detailed";
  requirement_note: string | null;
  total_amount: number;
  created_at: string;
  stores: { id: string; name: string; display_id: string; address: string | null; phone: string | null; lat: number | null; lng: number | null; route_id: string | null; store_type_id: string | null; customer_id: string | null; outstanding: number; routes: { name: string } | null; store_types: { name: string } | null } | null;
  customers?: { name: string; display_id: string } | null;
  order_items?: OrderItemRow[];
  creator_profile?: { full_name: string } | null;
  updater_profile?: { full_name: string } | null;
  fulfiller_profile?: { full_name: string } | null;
  canceller_profile?: { full_name: string } | null;
}

const toStoreOption = (s: RouteStore): StoreOption => ({
  id: s.id,
  name: s.name,
  display_id: s.display_id,
  outstanding: s.outstanding,
  lat: s.lat,
  lng: s.lng,
  address: s.address,
  phone: s.phone,
  photo_url: null,
  store_type_id: null,
  customer_id: s.customer_id,
});

export function AgentRoutes({ onOpenStore, onGoRecord }: AgentRoutesProps = {}) {
  const { user, role, profile } = useAuth();
  const qc = useQueryClient();
  const { allowed: canFulfillOrders } = usePermission("fulfill_orders");
  const { allowed: canModifyOrders } = usePermission("modify_orders");
  const { allowed: canCancelOrders } = usePermission("cancel_orders");
  const { allowed: canRecordSale } = usePermission("record_sale");
  const [view, setView] = useState<"routes" | "orders">("routes");
  const [showMap, setShowMap] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [agentPos, setAgentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [fetchingPos, setFetchingPos] = useState(false);
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const todayStart = startOfDay(new Date()).toISOString();
  const { canAccessRoute, loading: loadingRouteAccess } = useRouteAccess(user?.id, role);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const { data: routes, isLoading } = useQuery({
    queryKey: ["mobile-agent-routes", user?.id, role],
    queryFn: async () => {
      const cacheKey = `routes:${user?.id}:${role}`;

      if (!navigator.onLine) {
        const cached = await getCachedQueryResult<RouteRow[]>(cacheKey);
        if (cached) {
          setIsOfflineData(true);
          return cached;
        }
      }

      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, name, store_types(name), stores(id, name, display_id, route_id, address, phone, lat, lng, outstanding, store_order, customer_id, customers(name), store_types(name))"
        )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;

      const result = (data as unknown as RouteRow[]) || [];
      setIsOfflineData(false);

      await cacheQueryResult(cacheKey, result);

      return result;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const routeList = (((routes as RouteRow[] | undefined) || [])
    .filter((route) => canAccessRoute(route.id))
    .map((route) => ({
      ...route,
      stores: Array.isArray(route.stores)
        ? route.stores.filter((store) => canAccessRoute(store.route_id ?? route.id))
        : [],
    })));

  const allStoreIds = useMemo(
    () => routeList.flatMap((route) => route.stores.map((store) => store.id)),
    [routeList]
  );

  const { data: activeSession } = useQuery({
    queryKey: ["active-route-session", user?.id, "mobile-routes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_sessions")
        .select("id, route_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: pendingOrderStoreIds } = useQuery({
    queryKey: ["mobile-route-pending-orders", allStoreIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("store_id")
        .in("store_id", allStoreIds)
        .in("status", ["pending", "confirmed"]);
      if (error) throw error;
      return new Set((data || []).map((row) => row.store_id));
    },
    enabled: allStoreIds.length > 0,
    staleTime: 30_000,
  });

  // Orders: assigned to agent, created by agent, or for stores on their routes
  const { data: allOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ["mobile-agent-all-orders", user?.id, allStoreIds],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, stores(id, name, display_id, address, phone, lat, lng, route_id, store_type_id, customer_id, outstanding, routes(name), store_types(name)), customers(name, display_id), order_items(id, product_id, quantity, unit_price, products(name, sku, base_price)), creator_profile:profiles!orders_created_by_profiles_fkey_temp(full_name), updater_profile:profiles!orders_updated_by_fkey(full_name), fulfiller_profile:profiles!orders_fulfilled_by_profiles_fkey(full_name), canceller_profile:profiles!orders_cancelled_by_profiles_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (allStoreIds.length > 0) {
        query = query.or(`store_id.in.(${allStoreIds.join(",")}),assigned_to.eq.${user!.id}`);
      } else {
        query = query.or(`assigned_to.eq.${user!.id},created_by.eq.${user!.id}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as OrderRow[]) || [];
    },
    enabled: view === "orders" && !!user,
    staleTime: 30_000,
  });

  const storeTypeOptions = useMemo(() => {
    const set = new Set<string>();
    (allOrders ?? []).forEach((o) => {
      const n = o.stores?.store_types?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [allOrders]);

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    (allOrders ?? []).forEach((o) => {
      const n = o.stores?.routes?.name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    let list = allOrders ?? [];
    if (filterStoreType !== "all") {
      list = list.filter((o) => o.stores?.store_types?.name === filterStoreType);
    }
    if (filterRoute !== "all") {
      list = list.filter((o) => o.stores?.routes?.name === filterRoute);
    }
    if (filterStatus !== "all") {
      list = list.filter((o) => o.status === filterStatus);
    }
    return list;
  }, [allOrders, filterStoreType, filterRoute, filterStatus]);

  const { data: visitedStoresByRoute } = useQuery({
    queryKey: ["store-visits", user?.id, "mobile-routes", todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_visits")
        .select("store_id, route_sessions!inner(route_id, user_id)")
        .eq("route_sessions.user_id", user!.id)
        .gte("visited_at", todayStart);
      if (error) throw error;

      const visitMap = new Map<string, Set<string>>();
      const visits = (data || []) as unknown as VisitRow[];
      visits.forEach((visit) => {
        const routeSession = Array.isArray(visit.route_sessions) ? visit.route_sessions[0] : visit.route_sessions;
        const routeId = routeSession?.route_id;
        if (!routeId) return;
        const routeVisits = visitMap.get(routeId) || new Set<string>();
        routeVisits.add(visit.store_id);
        visitMap.set(routeId, routeVisits);
      });

      return visitMap;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: sessionPosition } = useQuery({
    queryKey: ["session-position", activeSession?.id],
    queryFn: async () => {
      if (!activeSession) return null;
      const { data } = await supabase
        .from("route_sessions")
        .select("current_lat, current_lng")
        .eq("id", activeSession.id)
        .maybeSingle();
      if (data?.current_lat && data?.current_lng) {
        return { lat: data.current_lat, lng: data.current_lng };
      }
      return null;
    },
    enabled: !!activeSession,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [fulfillOrder, setFulfillOrder] = useState<OrderRow | null>(null);
  const [fulfillCash, setFulfillCash] = useState("");
  const [fulfillUpi, setFulfillUpi] = useState("");
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [viewProformaId, setViewProformaId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [visitLoading, setVisitLoading] = useState<string | null>(null);
  const [visitReasonDialog, setVisitReasonDialog] = useState<{ store: RouteStore; resolve?: (reason: string) => void } | null>(null);
  const [createStoreSearch, setCreateStoreSearch] = useState("");
  const [createStoreId, setCreateStoreId] = useState("");
  const [createSelectedStoreName, setCreateSelectedStoreName] = useState("");
  const [createSelectedStoreTypeId, setCreateSelectedStoreTypeId] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [createOrderType, setCreateOrderType] = useState<"simple" | "detailed">("simple");
  const [createRequirementNote, setCreateRequirementNote] = useState("");
  const [createOrderItems, setCreateOrderItems] = useState<OrderItemInput[]>([{ product_id: "", quantity: 1 }]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [existingOrderForStore, setExistingOrderForStore] = useState<ActiveOrderInfo | null>(null);
  const [existingOrderStoreName, setExistingOrderStoreName] = useState("");

  const { data: createAllStores } = useQuery({
    queryKey: ["mobile-agent-create-all-stores", allStoreIds],
    queryFn: async () => {
      if (allStoreIds.length === 0) return [];
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, store_type_id")
        .in("id", allStoreIds)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: allStoreIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: createStoreProducts } = useQuery({
    queryKey: ["mobile-agent-create-store-products", createSelectedStoreTypeId, createStoreId],
    queryFn: async () => {
      if (!createSelectedStoreTypeId) return [];
      const { data: typeProducts } = await supabase
        .from("store_type_products")
        .select("product_id")
        .eq("store_type_id", createSelectedStoreTypeId);
      const productIds = (typeProducts || []).map((tp: any) => tp.product_id);
      if (productIds.length === 0) return [];
      const { data: products } = await supabase
        .from("products")
        .select("id, name, base_price")
        .in("id", productIds)
        .eq("is_active", true)
        .order("name");
      const { data: storePrices } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", createStoreId);
      const storePriceMap = new Map((storePrices || []).map((sp: any) => [sp.product_id, sp.price]));
      const { data: typePrices } = await supabase
        .from("store_type_pricing")
        .select("product_id, price")
        .eq("store_type_id", createSelectedStoreTypeId);
      const typePriceMap = new Map((typePrices || []).map((tp: any) => [tp.product_id, tp.price]));
      return ((products || []) as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        effective_price: storePriceMap.get(p.id) ?? typePriceMap.get(p.id) ?? Number(p.base_price ?? 0),
      }));
    },
    enabled: !!createSelectedStoreTypeId && !!createStoreId,
    staleTime: 5 * 60 * 1000,
  });

  const handleCancelOrder = async () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error("Select or type a cancellation reason");
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
      qc.invalidateQueries({ queryKey: ["mobile-agent-all-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["proforma-invoices"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  const handleFulfill = async () => {
    if (!canRecordSale) { toast.error("You don't have permission to record sales"); return; }
    if (!fulfillOrder) return;
    const cash = Number(fulfillCash) || 0;
    const upi = Number(fulfillUpi) || 0;
    const totalPaid = cash + upi;
    const saleItems = (fulfillOrder.order_items || []).map((item: any) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price || item.products?.base_price || 0,
      total_price: item.quantity * (item.unit_price || item.products?.base_price || 0),
    }));
    const subtotal = saleItems.reduce((s: number, i: any) => s + i.total_price, 0);
    if (subtotal <= 0) { toast.error("Order has no items with valid prices"); return; }
    if (totalPaid <= 0) { toast.error("Enter cash or UPI amount"); return; }
    if (totalPaid > subtotal) { toast.error("Payment exceeds order total. Reduce payment."); return; }
    const outstandingFromSale = subtotal - totalPaid;
    const customerId = fulfillOrder.customer_id || fulfillOrder.stores?.customer_id;
    if (!customerId) { toast.error("Cannot determine customer for this order"); return; }
    const oldOutstanding = Number(fulfillOrder.stores?.outstanding || 0);
    setIsFulfilling(true);
    try {
      // Stock check via RPC
      const saleItemPayload = saleItems.filter((i: any) => i.quantity > 0);
      if (saleItemPayload.length > 0) {
        const { data: stockCheck, error: stockErr } = await supabase.rpc("check_stock_availability", {
          p_user_id: user!.id,
          p_recorded_for: null,
          p_items: saleItemPayload.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity })),
        } as any) as any;
        if (stockErr) throw new Error("Stock check failed. Please try again.");
        const insufficient = (Array.isArray(stockCheck) ? stockCheck : []).filter((s: any) => !s.out_available);
        if (insufficient.length > 0) {
          const details = insufficient.map((s: any) => `${s.out_product_name} (Avail: ${s.out_available_qty})`).join(", ");
          toast.error(`Insufficient stock: ${details}`);
          setIsFulfilling(false);
          return;
        }
      }

      const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
      if (!displayId) throw new Error("Failed to generate sale ID");
      const { error: saleError } = await (supabase as any).rpc("record_sale", {
        p_display_id: displayId,
        p_store_id: fulfillOrder.store_id,
        p_customer_id: customerId,
        p_recorded_by: user!.id,
        p_logged_by: null,
        p_total_amount: subtotal,
        p_cash_amount: cash,
        p_upi_amount: upi,
        p_outstanding_amount: Math.max(outstandingFromSale, 0),
        p_expected_outstanding: oldOutstanding,
        p_sale_items: saleItems,
        p_created_at: null,
        p_fulfilled_order_id: fulfillOrder.id,
      });
      if (saleError) throw saleError;
      toast.success(`Order ${fulfillOrder.display_id} fulfilled (${displayId})`);
      setFulfillOrder(null);
      setFulfillCash("");
      setFulfillUpi("");
      afterSaleSaved(qc, { storeId: fulfillOrder.store_id });
    } catch (err: any) {
      toast.error(err.message || "Failed to fulfill order");
    } finally {
      setIsFulfilling(false);
    }
  };

  const createAddItem = (product: any) => {
    setCreateOrderItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product_id: product.id, quantity: 1, unit_price: product.effective_price }];
    });
  };

  const createUpdateQty = (productId: string, qty: number) => {
    setCreateOrderItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.product_id !== productId)
        : prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
    );
  };

  const handleStoreFromQr = async (storeId: string) => {
    const { data: store } = await supabase
      .from("stores")
      .select("id, name, store_type_id")
      .eq("id", storeId)
      .single();
    if (store) {
      setCreateStoreId(store.id);
      setCreateSelectedStoreName(store.name);
      setCreateSelectedStoreTypeId(store.store_type_id);
      setShowQrScanner(false);
      toast.success("Store selected via QR");
    }
  };

  const resetCreateForm = () => {
    setCreateStoreSearch("");
    setCreateStoreId("");
    setCreateSelectedStoreName("");
    setCreateSelectedStoreTypeId(null);
    setCreateOrderType("simple");
    setCreateRequirementNote("");
    setCreateOrderItems([{ product_id: "", quantity: 1 }]);
    setEditingOrderId(null);
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
    if (createOrderType === "detailed" && !createOrderItems.some((item) => item.product_id)) {
      toast.error("Add at least one product");
      return;
    }
    setCreateSaving(true);
    try {
      if (!editingOrderId) {
        const activeOrder = await getActiveOrderForStore(supabase, createStoreId);
        if (activeOrder) {
          const store = routeList.flatMap((r) => r.stores).find((s) => s.id === createStoreId);
          setExistingOrderStoreName(store?.name || "");
          setExistingOrderForStore(activeOrder);
          setCreateSaving(false);
          return;
        }
      }

      if (editingOrderId) {
        const { error: orderError } = await supabase
          .from("orders")
          .update({
            order_type: createOrderType,
            requirement_note: createOrderType === "simple" ? createRequirementNote : createRequirementNote || null,
            updated_by: user!.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingOrderId)
          .in("status", ["pending", "confirmed"]);
        if (orderError) throw orderError;

        if (createOrderType === "detailed") {
          const validItems = createOrderItems.filter((item) => item.product_id);
          await supabase.from("order_items").delete().eq("order_id", editingOrderId);
          if (validItems.length > 0) {
            const { error: itemError } = await supabase.from("order_items").insert(
              validItems.map((item) => ({
                order_id: editingOrderId,
                product_id: item.product_id,
                quantity: item.quantity,
              }))
            );
            if (itemError) throw itemError;
          }
        }

        toast.success("Order updated");
      } else {
        const rpcClient = supabase as unknown as SupabaseRpcClient;
        const { data: displayId, error: displayError } = await rpcClient.rpc("generate_display_id", {
          prefix: "ORD",
          seq_name: "ord_display_seq",
        });
        if (displayError) throw displayError;
        if (!displayId) throw new Error("Failed to generate order ID");

        const storeData = routeList.flatMap((r) => r.stores).find((s) => s.id === createStoreId);

        const { data: orderRow, error: orderError } = await supabase
          .from("orders")
          .insert({
            display_id: displayId,
            store_id: createStoreId,
            customer_id: storeData?.customer_id || null,
            order_type: createOrderType,
            source: "manual",
            created_by: profile!.id,
            status: "confirmed",
            requirement_note: createOrderType === "simple" ? createRequirementNote : null,
          })
          .select("id")
          .single();

        if (orderError) throw orderError;

        if (createOrderType === "detailed") {
          const validItems = createOrderItems.filter((item) => item.product_id);
          if (validItems.length > 0) {
            const { error: itemError } = await supabase.from("order_items").insert(
              validItems.map((item) => ({
                order_id: orderRow.id,
                product_id: item.product_id,
                quantity: item.quantity,
              }))
            );
            if (itemError) throw itemError;
          }
        }
      }

      toast.success(editingOrderId ? "Order updated" : "Order created");
      setShowCreate(false);
      resetCreateForm();
      qc.invalidateQueries({ queryKey: ["mobile-agent-all-orders"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save order";
      toast.error(message);
    } finally {
      setCreateSaving(false);
    }
  };

  const scrollToOrder = (orderId: string) => {
    setView("orders");
    setTimeout(() => {
      const el = document.getElementById(`order-card-${orderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const { data: viewProforma } = useQuery({
    queryKey: ["agent-view-proforma", viewProformaId],
    queryFn: async () => {
      if (!viewProformaId) return null;
      const order = allOrders?.find((o: any) => o.id === viewProformaId);
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

  const calculateItemTotal = (item: OrderItemRow) =>
    item.quantity * (item.products?.base_price || 0);

  const calculateOrderTotal = (order: OrderRow) => {
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    }
    return order.total_amount || 0;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":   return "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700";
      case "confirmed": return "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700";
      case "delivered": return "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700";
      case "cancelled": return "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700";
      default:          return "bg-slate-100 dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600";
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

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const openDirections = (store: { lat: number | null; lng: number | null; address: string | null; name?: string }) => {
    if (store.lat != null && store.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
      return;
    }
    if (store.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`, "_blank");
    }
  };

  const handleMarkVisited = async (store: RouteStore, fromQr?: boolean, reason?: string) => {
    if (!user) return;
    setVisitLoading(store.id);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      const pos = await getCurrentPosition();
      if (pos) { lat = pos.lat; lng = pos.lng; }

      if (!fromQr && store.lat != null && store.lng != null) {
        const { data: locSetting } = await supabase
          .from("company_settings")
          .select("value")
          .eq("key", "location_validation")
          .maybeSingle();
        if (locSetting?.value === "true") {
          const { checkProximity } = await import("@/lib/proximity");
          const result = await checkProximity(store.lat, store.lng);
          if (!result.withinRange) {
            toast.error(result.message);
            return;
          }
        }
      }

      if (!navigator.onLine) {
        const { addToQueue } = await import("@/lib/offlineQueue");
        await addToQueue({
          id: crypto.randomUUID(),
          type: "visit",
          payload: { userId: user.id, storeId: store.id, lat, lng },
          createdAt: new Date().toISOString(),
        });
        toast.warning(`Offline — visit queued for ${store.name}`);
        return;
      }

      const { data: session } = await supabase
        .from("route_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!session) {
        toast.error("No active route session. Start a route first.");
        return;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: session.id,
        store_id: store.id,
        lat,
        lng,
        visit_reason: reason || null,
      });
      if (error) throw error;
      toast.success(`Visit recorded for ${store.name}`);
      qc.invalidateQueries({ queryKey: ["store-visits"] });
    } catch {
      toast.error("Failed to record visit");
    } finally {
      setVisitLoading(null);
    }
  };

  const handleMarkVisitedClick = (store: RouteStore) => {
    setVisitReasonDialog({ store });
  };

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-8">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Today</p>
        <h2 className="text-white text-xl font-bold mt-0.5">My Routes</h2>

        {/* View toggle */}
        <div className="flex mt-4 rounded-2xl bg-white/15 border border-white/20 p-0.5">
          <button
            type="button"
            onClick={() => setView("routes")}
            className={cn(
              "flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-xl",
              view === "routes"
                ? "bg-white text-blue-700"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            )}
          >
            <MapPin className="h-3.5 w-3.5" />
            All Routes
          </button>
          <button
            type="button"
            onClick={() => setView("orders")}
            className={cn(
              "flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-xl",
              view === "orders"
                ? "bg-white text-blue-700"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            )}
          >
            {fetchingPos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <List className="h-3.5 w-3.5" />}
            All Orders
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={cn(
            "w-full mt-2 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-xl",
            showMap
              ? "bg-white text-blue-700"
              : "bg-white/10 text-white/80 hover:bg-white/20"
          )}
        >
          <Map className="h-3.5 w-3.5" />
          {showMap ? "Hide Map" : "Show Map"}
        </button>
      </div>

      <div className="px-4 -mt-5 space-y-4">
        {/* ── ROUTES VIEW ── */}
        {view === "routes" && (
          <>
            <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
              <RouteSessionPanel />
            </div>

            {showMap && (
              <RouteMap
                stores={routeList.flatMap(r => r.stores).map(s => ({
                  id: s.id,
                  name: s.name,
                  display_id: s.display_id,
                  lat: s.lat,
                  lng: s.lng,
                  visited: (visitedStoresByRoute?.get(
                    routeList.find(r => r.stores.some(st => st.id === s.id))?.id || ""
                  ) || new Set()).has(s.id),
                  outstanding: Number(s.outstanding || 0),
                }))}
                agentLocation={sessionPosition}
                className="mb-4"
              />
            )}

            <div>
              {isOfflineData && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">Offline — showing cached route data</p>
                </div>
              )}
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
                Available Routes
              </p>

              {isLoading || loadingRouteAccess ? (
                <div className="flex justify-center items-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">Loading routes...</p>
                  </div>
                </div>
              ) : routeList.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <MapPin className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No Routes Available</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Contact your manager to assign routes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {routeList.map((route, idx) => {
                    const storeCount = route.stores.length;
                    const routeVisitSet = visitedStoresByRoute?.get(route.id) || new Set<string>();
                    const visitedCount = routeVisitSet.size;
                    const pendingOrders = route.stores.filter((store) => pendingOrderStoreIds?.has(store.id)).length;
                    const totalOutstanding = route.stores.reduce((sum, store) => sum + Number(store.outstanding || 0), 0);
                    const sortedStores = [...route.stores].sort((left, right) => {
                      if (left.store_order != null && right.store_order != null) return left.store_order - right.store_order;
                      if (left.store_order != null) return -1;
                      if (right.store_order != null) return 1;
                      return left.name.localeCompare(right.name);
                    });
                    const isExpanded = expandedRouteId === route.id;

                    const accentColors = [
                      "bg-blue-500",
                      "bg-emerald-500",
                      "bg-violet-500",
                      "bg-amber-500",
                    ];
                    const accentColor = accentColors[idx % accentColors.length];

                    return (
                      <div
                        key={route.id}
                        className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setExpandedRouteId(isExpanded ? null : route.id)}
                        >
                          <div className="flex items-stretch">
                            <div className={`w-1 self-stretch ${accentColor} shrink-0`} />
                            <div className="flex-1 flex items-start gap-3 p-4">
                              <div className={`h-10 w-10 rounded-lg ${accentColor} bg-opacity-10 dark:bg-opacity-20 flex items-center justify-center shrink-0`}>
                                <MapPin className="h-5 w-5 text-white" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-white text-sm leading-snug truncate">
                                  {route.name}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    <Store className="h-3 w-3 inline mr-0.5 align-middle" />
                                    {storeCount} {storeCount === 1 ? "store" : "stores"}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    <span className="font-medium text-slate-800 dark:text-white">₹{totalOutstanding.toLocaleString("en-IN")}</span> outstanding
                                  </span>
                                  {pendingOrders > 0 && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                      <ShoppingBag className="h-3 w-3 inline mr-0.5 align-middle" />
                                      {pendingOrders} active
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-2.5">
                                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                                    {visitedCount}/{storeCount} visited
                                  </span>
                                  {route.store_types?.name && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                      {route.store_types.name}
                                    </span>
                                  )}
                                  {activeSession?.route_id === route.id && (
                                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      Active
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 mt-1">
                                {pendingOrders > 0 && (
                                  <span className="h-5 min-w-[20px] px-1 rounded-md bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                                    {pendingOrders}
                                  </span>
                                )}
                                <ChevronDown className={cn("h-4 w-4 text-slate-400/60 dark:text-slate-500/60 dark:text-slate-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-100 dark:border-slate-700-slate-100 dark:border-slate-700 px-4 py-4 bg-slate-50/50 dark:bg-slate-800/30">
                            {sortedStores.length === 0 ? (
                              <div className="rounded-xl border border-dashed p-4 text-center">
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No stores assigned</p>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {sortedStores.map((store) => {
                                  const visited = (visitedStoresByRoute?.get(route.id) || new Set<string>()).has(store.id);
                                  const canNavigate = (store.lat != null && store.lng != null) || !!store.address;

                                  return (
                                    <div
                                      key={store.id}
                                      className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 overflow-hidden"
                                    >
                                      <div className="flex items-stretch">
                                        <div className={cn("w-1 shrink-0", visited ? "bg-emerald-400" : "bg-muted/60")} />
                                        <div className="flex-1 p-3">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded shrink-0">
                                                  {store.display_id}
                                                </span>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                                                  {store.name}
                                                </p>
                                              </div>

                                              {store.customers?.name && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{store.customers.name}</p>
                                              )}

                                              {store.address && (
                                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{store.address}</p>
                                              )}

                                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                <span className={cn(
                                                  "text-xs font-medium px-2 py-0.5 rounded-full",
                                                  visited
                                                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                                                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                                )}>
                                                  {visited ? "Visited" : "Pending"}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                                  O/s ₹{Number(store.outstanding || 0).toLocaleString("en-IN")}
                                                </span>
                                                {pendingOrderStoreIds?.has(store.id) && (
                                                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                                                    Order pending
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="space-y-2 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center gap-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => handleMarkVisitedClick(store)}
                                                disabled={visitLoading === store.id}
                                              >
                                                {visitLoading === store.id ? (
                                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin text-emerald-500" />
                                                ) : (
                                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                                )}
                                                Visit
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => onGoRecord?.(toStoreOption(store), "sale")}
                                              >
                                                <ShoppingCart className="h-3.5 w-3.5 mr-1 text-blue-500" />
                                                Sale
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => onGoRecord?.(toStoreOption(store), "payment")}
                                              >
                                                <Wallet className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                                Txn
                                              </Button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => openDirections({ ...store, name: store.name })}
                                                disabled={!canNavigate}
                                              >
                                                <Navigation2 className="h-3.5 w-3.5 mr-1 text-purple-500" />
                                                Navigate
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => handleCall(store.phone || "")}
                                                disabled={!store.phone}
                                              >
                                                <Phone className="h-3.5 w-3.5 mr-1 text-slate-500 dark:text-slate-400" />
                                                Call
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-10 flex-1 rounded-xl text-xs font-semibold border border-slate-100 dark:border-slate-700"
                                                onClick={() => onOpenStore?.(toStoreOption(store))}
                                              >
                                                <Eye className="h-3.5 w-3.5 mr-1 text-slate-500 dark:text-slate-400" />
                                                Open
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ALL ORDERS VIEW ── */}
        {view === "orders" && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                All Orders ({filteredOrders.length})
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? "Hide" : "Filter"}
                </button>
                <button
                  type="button"
                  className="text-xs bg-blue-600 text-white font-semibold flex items-center gap-1 px-2 py-1 rounded-lg"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3 w-3" />
                  Create
                </button>
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1"
                  onClick={async () => {
                    setFetchingPos(true);
                    const pos = await getCurrentPosition();
                    if (pos) setAgentPos({ lat: pos.lat, lng: pos.lng });
                    setFetchingPos(false);
                  }}
                >
                  {fetchingPos ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                  GPS
                </button>
              </div>
            </div>

            {/* Status filter chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
              {(["all", "pending", "confirmed", "delivered", "cancelled"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    filterStatus === s
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {showFilters && (
              <div className="flex gap-2 mb-3">
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

            <div className="mb-3">
              <OrderStockSummary orders={allOrders} />
            </div>

            {loadingOrders || isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">Loading orders...</p>
                </div>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <ShoppingBag className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No Orders Found</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Orders for your stores will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const orderTotal = calculateOrderTotal(order);
                  const itemCount = order.order_items?.length || 0;

                  return (
                    <div
                      key={order.id}
                      id={`order-card-${order.id}`}
                      className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden"
                    >
                      <div className={`h-1 ${
                        order.status === "pending" ? "bg-amber-400" :
                        order.status === "delivered" ? "bg-emerald-400" :
                        order.status === "cancelled" ? "bg-red-400" : "bg-slate-300"
                      }`} />
                      <div
                        onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                        className="p-3 active:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono font-semibold text-slate-800 dark:text-white">{order.display_id}</p>
                            <button
                              type="button"
                              className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 truncate max-w-full text-left hover:underline disabled:no-underline disabled:text-slate-500 dark:text-slate-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenStore && order.stores) {
                                  onOpenStore({
                                    id: order.stores.id,
                                    name: order.stores.name,
                                    display_id: order.stores.display_id,
                                    outstanding: 0,
                                    store_type_id: order.stores.store_type_id,
                                    customer_id: null,
                                    lat: order.stores.lat,
                                    lng: order.stores.lng,
                                    address: order.stores.address,
                                    phone: order.stores.phone,
                                    route_id: order.stores.route_id,
                                    is_active: true,
                                    customers: order.customers || null,
                                    store_types: order.stores.store_types,
                                    routes: order.stores.routes,
                                  } as StoreOption);
                                }
                              }}
                              disabled={!onOpenStore || !order.stores}
                            >
                              {order.stores?.name || "Unknown Store"}
                            </button>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 border ${getStatusColor(order.status)}`}>
                            {getStatusIcon(order.status)}
                            {order.status}
                          </span>
                        </div>

                        {order.order_type === "detailed" && order.order_items && order.order_items.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {order.order_items.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="text-slate-500 dark:text-slate-400 truncate flex-1">
                                  {item.products?.name} × {item.quantity}
                                </span>
                                <span className="font-medium tabular-nums text-slate-800 dark:text-white ml-2">
                                  ₹{calculateItemTotal(item).toLocaleString("en-IN")}
                                </span>
                              </div>
                            ))}
                            {order.order_items.length > 2 && (
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                +{order.order_items.length - 2} more items
                              </p>
                            )}
                          </div>
                        )}

                        {order.order_type === "simple" && order.requirement_note && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">
                            Note: {order.requirement_note}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {itemCount > 0 ? `${itemCount} items` : order.order_type}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {format(new Date(order.created_at), "dd MMM, hh:mm a")}
                            </span>
                          </div>
                          <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-white">
                            ₹{orderTotal.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>

                      {(order.creator_profile || order.updater_profile || order.fulfiller_profile || (order.status === "cancelled" && order.canceller_profile)) && (
                        <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-1.5">
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                            {order.creator_profile && <span>Created by {order.creator_profile.full_name}</span>}
                            {order.updater_profile && order.updater_profile.full_name !== order.creator_profile?.full_name && (
                              <>
                                <span className="text-slate-400/60 dark:text-slate-500/60">•</span>
                                <span>Edited by {order.updater_profile.full_name}</span>
                              </>
                            )}
                            {order.fulfiller_profile && (
                              <>
                                <span className="text-slate-400/60 dark:text-slate-500/60">•</span>
                                <span>Fulfilled by {order.fulfiller_profile.full_name}</span>
                              </>
                            )}
                            {order.status === "cancelled" && order.canceller_profile && (
                              <>
                                <span className="text-slate-400/60 dark:text-slate-500/60">•</span>
                                <span className="text-red-500">Cancelled by {order.canceller_profile.full_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex border-t border-slate-100 dark:border-slate-700">
                        {order.status === "pending" && canFulfillOrders && (
                          <button
                            onClick={() => { setFulfillOrder(order); setFulfillCash(""); setFulfillUpi(""); }}
                            className="flex-1 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-r border"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Fulfill
                          </button>
                        )}
                        <button
                          onClick={() => { setViewProformaId(order.id); }}
                          className="flex-1 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-r border"
                        >
                          <Package className="h-4 w-4 text-indigo-400" />
                          Proforma
                        </button>
                        {(order.status === "pending" || order.status === "confirmed") && canModifyOrders && (
                          <button
                            onClick={() => {
                              setEditingOrderId(order.id);
                              setCreateStoreId(order.store_id);
                              setCreateSelectedStoreName(order.stores?.name || "");
                              setCreateSelectedStoreTypeId(order.stores?.store_type_id || null);
                              setCreateOrderType(order.order_type);
                              setCreateRequirementNote(order.requirement_note || "");
                              setCreateOrderItems(
                                (order.order_items || []).length > 0
                                  ? order.order_items.map((item) => ({
                                      product_id: item.product_id,
                                      quantity: item.quantity,
                                    }))
                                  : [{ product_id: "", quantity: 1 }]
                              );
                              setShowCreate(true);
                            }}
                            className="flex-1 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border-r border"
                          >
                            <Edit className="h-4 w-4 text-amber-400" />
                            Edit
                          </button>
                        )}
                        {(order.status === "pending" || order.status === "confirmed") && canCancelOrders && (
                          <button
                            onClick={() => { setCancelOrderId(order.id); setCancelReason(""); }}
                            className="flex-1 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <X className="h-4 w-4 text-red-500" />
                            Cancel
                          </button>
                        )}
                        {order.status !== "pending" && order.status !== "confirmed" && (
                          <button
                            onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                            className="flex-1 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-muted/50 transition-colors"
                          >
                            <Eye className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            Details
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Order Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Order Details</DialogTitle>
            </DialogHeader>

            {selectedOrder && (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted p-3 space-y-2 border">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Order ID</span>
                    <span className="font-mono text-sm font-semibold text-slate-800 dark:text-white">{selectedOrder.display_id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Store</span>
                    <span className="text-sm font-medium text-right max-w-[150px] truncate text-slate-800 dark:text-white">{selectedOrder.stores?.name || "—"}</span>
                  </div>
                  {selectedOrder.customers?.name && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Customer</span>
                      <span className="text-sm font-medium text-slate-800 dark:text-white">{selectedOrder.customers.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Type</span>
                    <span className="text-sm capitalize text-slate-800 dark:text-white">{selectedOrder.order_type}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Status</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${getStatusColor(selectedOrder.status)}`}>
                      {getStatusIcon(selectedOrder.status)}
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Date</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{format(new Date(selectedOrder.created_at), "dd MMM yy, hh:mm a")}</span>
                  </div>
                </div>

                {selectedOrder.order_type === "detailed" && selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-muted px-3 py-2 border-b border">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Items ({selectedOrder.order_items.length})</p>
                    </div>
                    <div className="divide-y divide-border">
                      {selectedOrder.order_items.map((item, idx) => {
                        const unitPrice = item.products?.base_price || 0;
                        const totalPrice = calculateItemTotal(item);
                        return (
                          <div key={idx} className="px-3 py-2.5">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-sm font-medium text-slate-800 dark:text-white">{item.products?.name || "Product"}</span>
                              <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-white">₹{totalPrice.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
                              <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                              <span>Qty: {item.quantity} × ₹{unitPrice.toLocaleString("en-IN")}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-muted">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total</span>
                        <span className="text-base font-bold text-slate-800 dark:text-white tabular-nums">₹{calculateOrderTotal(selectedOrder).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                ) : selectedOrder.requirement_note ? (
                  <div className="rounded-xl border p-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Requirement</p>
                    <p className="text-sm text-slate-800 dark:text-white">{selectedOrder.requirement_note}</p>
                  </div>
                ) : null}

                {(selectedOrder.creator_profile || selectedOrder.updater_profile || selectedOrder.fulfiller_profile || (selectedOrder.status === "cancelled" && selectedOrder.cancelled_by)) && (
                  <div className="rounded-xl border p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Audit Trail</p>
                    {selectedOrder.creator_profile && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Created by</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{selectedOrder.creator_profile.full_name}</span>
                      </div>
                    )}
                    {selectedOrder.updater_profile && selectedOrder.updater_profile.full_name !== selectedOrder.creator_profile?.full_name && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Edited by</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{selectedOrder.updater_profile.full_name}</span>
                      </div>
                    )}
                    {selectedOrder.fulfiller_profile && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Fulfilled by</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{selectedOrder.fulfiller_profile.full_name}</span>
                      </div>
                    )}
                    {selectedOrder.status === "cancelled" && selectedOrder.canceller_profile && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Cancelled by</span>
                        <span className="font-medium text-red-600 dark:text-red-400">{selectedOrder.canceller_profile.full_name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel Order Dialog */}
        <Dialog open={!!cancelOrderId} onOpenChange={(v) => { if (!v) { setCancelOrderId(null); setCancelReason(""); } }}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Cancel Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to cancel this order?
              </p>
              <div>
                <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  Reason
                </Label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cancelReason === "Other" && (
                <Textarea
                  placeholder="Type the cancellation reason..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setCancelOrderId(null); setCancelReason(""); }}
                >
                  Keep Order
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={cancelling || !cancelReason}
                  onClick={handleCancelOrder}
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Order"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Order Sheet */}
        <Sheet open={showCreate} onOpenChange={(open) => { if (!open) resetCreateForm(); setShowCreate(open); }}>
          <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
            <div className="px-6">
              <SheetHeader className="mb-5 text-left">
                <SheetTitle className="text-lg font-bold">Create Order</SheetTitle>
              </SheetHeader>

              <div className="space-y-4">
                {/* Store search + QR */}
                {!createStoreId ? (
                  <div>
                    <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Store</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Search stores by name or ID..."
                          value={createStoreSearch}
                          onChange={(e) => setCreateStoreSearch(e.target.value)}
                          className="rounded-xl h-11 border"
                        />
                        {createStoreSearch && (
                          <div className="absolute z-10 mt-1 w-full max-h-36 overflow-y-auto border rounded-xl bg-popover divide-y shadow-lg">
                            {(createAllStores || [])
                              .filter((s: any) =>
                                s.name.toLowerCase().includes(createStoreSearch.toLowerCase()) ||
                                (s.display_id && s.display_id.toLowerCase().includes(createStoreSearch.toLowerCase()))
                              )
                              .slice(0, 20)
                              .map((s: any) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    setCreateStoreId(s.id);
                                    setCreateSelectedStoreName(s.name);
                                    setCreateSelectedStoreTypeId(s.store_type_id);
                                    setCreateStoreSearch("");
                                  }}
                                  className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                                >
                                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{s.display_id}</span>
                                  <span className="ml-2">{s.name}</span>
                                </button>
                              ))}
                            {((createAllStores || []).filter((s: any) =>
                              s.name.toLowerCase().includes(createStoreSearch.toLowerCase()) ||
                              (s.display_id && s.display_id.toLowerCase().includes(createStoreSearch.toLowerCase()))
                            ).length === 0) && (
                              <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">No stores found</div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-11 rounded-xl flex-shrink-0"
                        onClick={() => setShowQrScanner(true)}
                      >
                        <QrCode className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Store</Label>
                    <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{createSelectedStoreName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCreateStoreId(""); setCreateSelectedStoreName(""); setCreateSelectedStoreTypeId(null); }}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-white font-medium"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}

                {/* Order Type */}
                <div>
                  <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Order Type</Label>
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
                    <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Requirement</Label>
                    <Textarea
                      value={createRequirementNote}
                      onChange={(event) => setCreateRequirementNote(event.target.value)}
                      placeholder="What does the store need?"
                      rows={3}
                      className="rounded-xl resize-none border"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Products</Label>
                    {!createStoreId ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Select a store first</p>
                    ) : !createStoreProducts || createStoreProducts.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No products available for this store</p>
                    ) : (
                      <>
                        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                          {(createStoreProducts || []).map((p: any) => {
                            const inCart = createOrderItems.find((i) => i.product_id === p.id);
                            return (
                              <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl border bg-card">
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <Package className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {fmtINR(p.effective_price)}
                                    {inCart ? ` × ${inCart.quantity} = ${fmtINR(inCart.quantity * (inCart.unit_price || p.effective_price))}` : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {inCart ? (
                                    <>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                        onClick={() => createUpdateQty(p.id, inCart.quantity - 1)}>
                                        <Minus className="h-3.5 w-3.5" />
                                      </Button>
                                      <span className="text-sm font-bold w-6 text-center">{inCart.quantity}</span>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                        onClick={() => createUpdateQty(p.id, inCart.quantity + 1)}>
                                        <Plus className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                      onClick={() => createAddItem(p)}>
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
                      </>
                    )}
                  </div>
                )}

                <button
                  className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    !createStoreId || createSaving
                      ? "bg-blue-400 text-white cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                  }`}
                  onClick={handleCreateOrder}
                  disabled={!createStoreId || createSaving}
                >
                  {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4" />Create Order</>}
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* QR Scanner for store selection */}
        <Dialog open={showQrScanner} onOpenChange={setShowQrScanner}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Scan Store QR</DialogTitle>
            </DialogHeader>
            <QrStoreSelector onStoreSelected={handleStoreFromQr} />
          </DialogContent>
        </Dialog>

        {/* Proforma Dialog */}
        <Dialog open={!!viewProformaId && !!viewProforma} onOpenChange={(o) => { if (!o) setViewProformaId(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>Proforma Invoice</DialogTitle></DialogHeader>
            {viewProforma && <ProformaView proforma={viewProforma} />}
          </DialogContent>
        </Dialog>

        {/* Fulfill Payment Dialog */}
        <Dialog open={!!fulfillOrder} onOpenChange={(o) => { if (!o) { setFulfillOrder(null); setFulfillCash(""); setFulfillUpi(""); } }}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Fulfill Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-bold">{fulfillOrder?.display_id}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{fulfillOrder?.stores?.name}</p>
              </div>
              {fulfillOrder?.order_items && fulfillOrder.order_items.length > 0 && (
                <div className="space-y-1.5">
                  {fulfillOrder.order_items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 truncate flex-1">{item.products?.name} × {item.quantity}</span>
                      <span className="font-medium tabular-nums">₹{((item.products?.base_price || 0) * item.quantity).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-500 dark:text-slate-400">Cash (₹)</Label>
                  <Input
                    type="number"
                    value={fulfillCash}
                    onChange={(e) => setFulfillCash(e.target.value)}
                    placeholder="0"
                    className="text-sm h-10"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 dark:text-slate-400">UPI (₹)</Label>
                  <Input
                    type="number"
                    value={fulfillUpi}
                    onChange={(e) => setFulfillUpi(e.target.value)}
                    placeholder="0"
                    className="text-sm h-10"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setFulfillOrder(null); setFulfillCash(""); setFulfillUpi(""); }}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={isFulfilling || (!fulfillCash && !fulfillUpi)} onClick={handleFulfill}>
                  {isFulfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
            setView("orders");
            setTimeout(() => {
              const found = allOrders?.find((o: any) => o.id === order.id);
              if (found) {
                setEditingOrderId(found.id);
                setCreateStoreId(found.store_id);
                setCreateSelectedStoreName(found.stores?.name || "");
                setCreateSelectedStoreTypeId(found.stores?.store_type_id || null);
                setCreateOrderType(found.order_type);
                setCreateRequirementNote(found.requirement_note || "");
                setCreateOrderItems(
                  (found.order_items || []).length > 0
                    ? found.order_items.map((item: any) => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                      }))
                    : [{ product_id: "", quantity: 1 }]
                );
                setShowCreate(true);
              }
            }, 100);
          }}
        />

        <VisitReasonDialog
          open={!!visitReasonDialog}
          onOpenChange={(v) => { if (!v) setVisitReasonDialog(null); }}
          storeName={visitReasonDialog?.store.name || ""}
          onConfirm={async (reason) => {
            const store = visitReasonDialog?.store;
            if (!store) return;
            setVisitReasonDialog(null);
            await handleMarkVisited(store, false, reason);
          }}
          loading={visitLoading === visitReasonDialog?.store.id}
        />
      </div>
    </div>
  );
}
