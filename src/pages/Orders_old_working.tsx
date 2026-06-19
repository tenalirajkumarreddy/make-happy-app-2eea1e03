import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { addToQueue, generateBusinessKey } from "@/lib/offlineQueue";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { CANCEL_REASONS } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { usePermission } from "@/hooks/usePermission";
import { Loader2, Plus, Minus, Trash2, XCircle, Package, Download, X, CalendarIcon, ArrowRightLeft, FileText, Edit, Eye, ShoppingCart, RotateCcw, Store as StoreIcon, UserCircle, MapPin, Phone, Mail, Shield } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
import { TransferOrderDialog } from "@/components/orders/TransferOrderDialog";
import { InvoiceDialog } from "@/components/orders/InvoiceDialog";
import { OrderViewDialog } from "@/components/orders/OrderViewDialog";
import { OrderStockSummary } from "@/components/orders/OrderStockSummary";
import { OrderAccessMatrix } from "@/components/orders/OrderAccessMatrix";
import { ProformaView } from "@/components/orders/ProformaView";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
Tooltip,
TooltipContent,
TooltipProvider,
TooltipTrigger,
} from "@/components/ui/tooltip";
import {
HoverCard,
HoverCardContent,
HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";
import {
Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price?: number;
}

interface FulfillOrder {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  status: string;
  requirement_note: string | null;
  assigned_to?: string | null;
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
    route_id?: string | null;
  };
}

interface InsertOrder {
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  source: "manual" | string;
  created_by: string;
  requirement_note: string | null;
  warehouse_id: string | null;
  assigned_to?: string | null;
}

interface UpdateOrder {
  requirement_note: string | null;
  updated_at: string;
  assigned_to?: string | null;
}

interface OrderRecord {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  source: string;
  status: string;
  requirement_note: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  stores?: StoreData;
  customers?: CustomerData;
  cancellation_reason?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  fulfilled_by_sale_id?: string;
  creator_profile?: { full_name: string } | null;
  updater_profile?: { full_name: string } | null;
  fulfiller_profile?: { full_name: string } | null;
}

interface OrderItemData {
  product_id: string;
  quantity: number;
  unit_price: number | null;
}

interface CustomerData {
  id: string;
  name: string;
  display_id: string;
  kyc_status?: string;
  phone?: string | null;
  email?: string | null;
  credit_limit_override?: number | null;
  outstanding_balance?: number;
}

interface StoreData {
  id: string;
  name: string;
  display_id: string;
  store_type_id: string | null;
  customer_id: string | null;
  route_id: string | null;
  route?: {
    id: string;
    name: string;
  } | null;
  routes?: {
    id: string;
    name: string;
  } | null;
  store_types?: {
    name: string;
  } | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  outstanding?: number;
  image_url?: string;
}

const Orders = () => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  
  // Permission hooks
  const { allowed: canViewOrders } = usePermission("view_orders");
  const { allowed: canViewAssignedOrders } = usePermission("view_assigned_orders");
  const { allowed: canCreateOrders } = usePermission("create_orders");
  const { allowed: canModifyOrders } = usePermission("modify_orders");
  const { allowed: canModifyPrices } = usePermission("modify_order_item_prices");
  const { allowed: canTransferOrders } = usePermission("transfer_orders");
  const { allowed: canFulfillOrders } = usePermission("fulfill_orders");
  const { allowed: canCancelOrders } = usePermission("cancel_orders");
  const { allowed: canViewInvoices } = usePermission("view_invoices");
  const { allowed: canCreateSaleReturns } = usePermission("create_sale_returns");
  
  // Check if user can see orders at all
  const hasOrderAccess = canViewOrders || canViewAssignedOrders;
  
  // State
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showOrderAccess, setShowOrderAccess] = useState(false);
  const [viewProformaId, setViewProformaId] = useState<string | null>(null);

  const { data: viewProforma } = useQuery({
    queryKey: ["view-proforma", viewProformaId],
    queryFn: async () => {
      if (!viewProformaId) return null;
      const order = (orders as any[])?.find((o: any) => o.id === viewProformaId);
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
      } as any;
    },
    enabled: !!viewProformaId,
  });
  const [invoiceMode, setInvoiceMode] = useState<"create" | "edit" | "view">("create");
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [fulfillOrder, setFulfillOrder] = useState<FulfillOrder | null>(null);
  const [editOrder, setEditOrder] = useState<FulfillOrder | null>(null);
  const [transferOrder, setTransferOrder] = useState<FulfillOrder | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState<string | null>(null);

  // List filters
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStore, setFilterStore] = useState("all");
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all");
  const PAGE_SIZE = 100;
  const [loadedPages, setLoadedPages] = useState(1);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
  }, [statusFilter, filterFrom, filterTo, filterCustomer, filterStore, filterStoreType, filterRoute, filterAssignedTo]);

  // Form state for create
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [orderType, setOrderType] = useState("simple");
  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ product_id: "", quantity: 1 }]);
  const [assignedTo, setAssignedTo] = useState("");

  // Fetch user's order access level
  const { data: orderAccess } = useQuery({
    queryKey: ["my-order-access", user?.id],
    queryFn: async () => {
      if (!user?.id) return "all";
      const { data } = await supabase.from("user_order_access").select("access_level").eq("user_id", user.id).maybeSingle();
      return (data as any)?.access_level || "all";
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: orders, isLoading, isFetching } = useQuery({
    queryKey: ["orders", currentWarehouse?.id, statusFilter, filterFrom, filterTo, filterCustomer, filterStore, filterStoreType, filterRoute, filterAssignedTo, loadedPages, user?.id, role, orderAccess],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, stores(id, name, display_id, route_id, store_type_id, address, outstanding), customers(id, name, display_id, phone, email), assigned_to, fulfilled_by_sale_id, creator_profile:profiles!orders_created_by_profiles_fkey_temp(full_name), updater_profile:profiles!orders_updated_by_fkey(full_name), fulfiller_profile:profiles!orders_fulfilled_by_profiles_fkey(full_name)")
        .order("created_at", { ascending: false });

      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);

      // Order access control
      if (orderAccess !== "all") {
        const { data: userAccess } = await supabase
          .from("user_order_access")
          .select("route_ids")
          .eq("user_id", user!.id)
          .maybeSingle();
        const routeIds = ((userAccess as any)?.route_ids || []) as string[];
        const orParts = [`assigned_to.eq.${user!.id}`, `created_by.eq.${user!.id}`];
        if (routeIds.length > 0) {
          orParts.push(`stores.route_id.in.(${routeIds.join(",")})`);
        }
        query = query.or(orParts.join(","));
      }

      // Server-side filters
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (filterFrom) query = query.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");
      if (filterCustomer !== "all") query = query.eq("customer_id", filterCustomer);
      if (filterStore !== "all") query = query.eq("store_id", filterStore);
      if (filterAssignedTo !== "all") {
        if (filterAssignedTo === "__unassigned__") {
          query = query.is("assigned_to", null);
        } else {
          query = query.eq("assigned_to", filterAssignedTo);
        }
      }

      // Store type and route filters (join with stores)
      if (filterStoreType !== "all") {
        query = query.eq("stores.store_type_id", filterStoreType);
      }
      if (filterRoute !== "all") {
        query = query.eq("stores.route_id", filterRoute);
      }

      // Cursor pagination
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: hasOrderAccess && !!user?.id,
  });
  
  // Fetch store types for filter
  const { data: storeTypes = [] } = useQuery({
    queryKey: ["store-types-for-orders", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_types")
        .select("id, name")
        .eq("is_active", true);
      return data || [];
    },
  });
  
  // Fetch routes for filter
  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-orders", currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch stores for filter
  const { data: storesForFilter = [] } = useQuery({
    queryKey: ["stores-for-filter-orders", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase.from("stores").select("id, name, display_id").eq("is_active", true).order("name");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
    enabled: hasOrderAccess,
  });

  const { canAccessStore, hasMatrixRestrictions, hasStoreTypeRestrictions } = useRouteAccess(user?.id, role);

  const hasMoreOrders = (orders?.length || 0) >= loadedPages * PAGE_SIZE;

  // Fetch customers based on permissions - from customers table (not profiles)
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-orders", currentWarehouse?.id, role, user?.id],
    queryFn: async () => {
      let query = supabase.from("customers").select("id, name").eq("is_active", true);
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);

      // For marketers, only show customers linked to stores they manage via routes
      // Routes have agent_id, marketers assign stores to routes
      if (role === "marketer" && user?.id) {
        // Get routes assigned to this marketer via user-role mapping
        const { data: storeData } = await supabase
          .from("stores")
          .select("customer_id");
        // Filter to only stores this marketer can access
        const customerIds = [...new Set((storeData || []).map(s => s.customer_id).filter(Boolean))];
        if (customerIds.length > 0) {
          query = query.in("id", customerIds);
        }
      }

      const { data } = await query;
      return (data || []).map(c => ({ id: c.id, name: c.name }));
    },
    enabled: canCreateOrders || canModifyOrders,
  });

  // Fetch stores based on permissions
  const { data: stores } = useQuery({
    queryKey: ["stores-for-order", currentWarehouse?.id, role, user?.id],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, display_id, store_type_id, customer_id, route_id").eq("is_active", true);
      if (currentWarehouse?.id) q = q.eq("warehouse_id", currentWarehouse.id);

      // Agents only see stores on their routes
      if (role === "agent" && user?.id && !canViewOrders) {
        const { data: routeData } = await supabase
          .from("agent_routes")
          .select("route_id")
          .eq("user_id", user.id)
          .eq("enabled", true);
        const routeIds = (routeData || []).map(r => r.route_id);
        if (routeIds.length > 0) {
          q = q.in("route_id", routeIds);
        }
      }

      const { data } = await q;
      return data || [];
    },
    enabled: (!!customerId && canCreateOrders) || canModifyOrders,
  });

  // Fetch agents for order assignment - join profiles with user_roles
  const { data: agents = [] } = useQuery({
    queryKey: ["agents-for-assignment"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_directory")
        .select("user_id, full_name")
        .eq("role", "agent")
        .eq("is_active", true);
  return (data || []).map((r: { user_id: string | null; full_name: string }) => ({
    id: r.user_id ?? "",
    full_name: r.full_name || "Agent"
  }));
    },
    enabled: canTransferOrders || canCreateOrders,
  });

  const { data: products } = useQuery({
    queryKey: ["products", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase.from("products").select("id, name, sku, base_price, image_url").eq("is_active", true);
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
    enabled: canCreateOrders || canModifyOrders,
  });

  // Load store pricing data for order creation
  const { data: storePricing } = useQuery({
    queryKey: ["store-pricing", storeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", storeId);
      return new Map((data || []).map(sp => [sp.product_id, sp.price]));
    },
    enabled: !!storeId,
  });

  const { data: storeTypePricing } = useQuery({
    queryKey: ["store-type-pricing", storeId],
    queryFn: async () => {
      const store = stores?.find(s => s.id === storeId);
      if (!store?.store_type_id) return new Map<string, number>();
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", store.store_type_id);
      return new Map((data || []).map(tp => [tp.product_id, tp.price]));
    },
    enabled: !!storeId && !!stores,
  });

  // Get price for product using hierarchy: store > store_type > base
  const getProductPrice = (productId: string): number => {
    const product = products?.find(p => p.id === productId);
    if (!product) return 0;
    if (storePricing?.has(productId)) return storePricing.get(productId)!;
    if (storeTypePricing?.has(productId)) return storeTypePricing.get(productId)!;
    return product.base_price;
  };

  const addItem = () => setOrderItems([...orderItems, { product_id: "", quantity: 1 }]);
  const addOrderItem = (productId: string) => {
    const exists = orderItems.find((i) => i.product_id === productId);
    if (exists) {
      setOrderItems(orderItems.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setOrderItems([...orderItems, { product_id: productId, quantity: 1 }]);
    }
  };
  const updateItemQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      setOrderItems(orderItems.filter((i) => i.product_id !== productId));
    } else {
      setOrderItems(orderItems.map((i) => i.product_id === productId ? { ...i, quantity: newQty } : i));
    }
  };
  const removeItem = (idx: number) => setOrderItems(orderItems.filter((_, i) => i !== idx));

  const resetForm = () => {
    setCustomerId(""); setStoreId(""); setStoreSearch("");
    setOrderType("simple"); setRequirementNote("");
    setOrderItems([{ product_id: "", quantity: 1 }]); setAssignedTo("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) { toast.error("Please select a store"); return; }
    if (orderType === "simple" && !requirementNote.trim()) { toast.error("Please describe the requirement"); return; }
    if (orderType === "detailed" && !orderItems.some((i) => i.product_id)) { toast.error("Please add at least one product"); return; }

    // Duplicate check: store can have only one active (pending) order
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("id, display_id")
      .eq("store_id", storeId)
      .eq("status", "pending")
      .limit(1);
    if (existingOrders && existingOrders.length > 0) {
      toast.warning(`Store already has a pending order (${existingOrders[0].display_id}). Edit it instead.`);
      setShowAdd(false);
      resetForm();
      setTimeout(() => handleOpenEdit(existingOrders[0].id), 300);
      return;
    }

    // Offline: queue order and return
    if (!navigator.onLine) {
      const bizKey = generateBusinessKey('order', {
        storeId: storeId,
        orderType: orderType,
        timestamp: new Date().toISOString(),
      });
      await addToQueue({
        id: crypto.randomUUID(),
        type: "order",
        payload: {
          store_id: storeId,
          customer_id: customerId,
      order_type: orderType as "simple" | "detailed",
          requirement_note: requirementNote,
          order_items: orderItems.filter((i) => i.product_id),
          assigned_to: assignedTo,
        },
        createdAt: new Date().toISOString(),
        businessKey: bizKey,
      });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setShowAdd(false);
      toast.warning("Offline — order queued and will sync automatically");
      setSaving(false);
      return;
    }

    setSaving(true);

    // Check credit limit before creating order (for detailed orders)
    if (orderType === "detailed") {
      const validItems = orderItems.filter((i) => i.product_id);
      const estimatedOrderValue = validItems.reduce((sum, item) => {
        return sum + (item.quantity * getProductPrice(item.product_id));
      }, 0);

      if (estimatedOrderValue > 0) {
        const { data: creditCheck, error: creditError } = await supabase
          .rpc("check_store_credit_limit", {
            p_store_id: storeId,
            p_order_amount: estimatedOrderValue
          });

        if (creditError) {
          console.error("Credit check failed:", creditError);
        } else if (creditCheck && !creditCheck[0]?.can_create) {
          const check = creditCheck[0] as any;
          toast.error(
            `Credit limit warning: Current outstanding ₹${Number(check.current_outstanding).toLocaleString()} + ` +
            `Order ₹${estimatedOrderValue.toLocaleString()} = ` +
            `₹${(Number(check.current_outstanding) + estimatedOrderValue).toLocaleString()} ` +
            `exceeds limit ₹${Number(check.credit_limit).toLocaleString()}. Contact admin for approval.`
          );
          setSaving(false);
          return;
        } else if ((creditCheck as any)?.[0]?.utilization_percent > 80) {
          const check = creditCheck[0] as any;
          toast.warning(
            `Credit utilization is ${check.utilization_percent}%. ` +
            `Available credit: ₹${Number(check.available_credit).toLocaleString()}`
          );
        }
      }
    }

    const { data: displayId } = await supabase.rpc("generate_random_display_id", { p_prefix: "ORD", p_table_name: "orders" }) as any;

    const insertData: InsertOrder = {
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId || null,
      order_type: orderType as "simple" | "detailed",
      source: "manual",
      created_by: user!.id,
      requirement_note: requirementNote || null,
      warehouse_id: currentWarehouse?.id || null,
    };

    if (assignedTo) {
      insertData.assigned_to = assignedTo;
    }

    const { data: order, error } = await supabase.from("orders").insert(insertData as any).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    if (orderType === "detailed") {
      const validItems = orderItems.filter((i) => i.product_id);
      if (validItems.length > 0) {
        await supabase.from("order_items").insert(
          validItems.map((i) => ({
            order_id: order.id,
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: canModifyPrices ? (i.unit_price || getProductPrice(i.product_id)) : getProductPrice(i.product_id)
          }))
        );
      }
    }

    // Auto-create proforma invoice
    const { count: pfCount } = await supabase.from("proforma_invoices").select("id", { count: "exact", head: true });
    const pfDisplayId = `PF-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String((pfCount || 0) + 1).padStart(4, "0")}`;
    const pfNote = requirementNote || "";
    const productsList = (products as any[]) || [];
    const proformaItems = orderType === "detailed" ? (orderItems.filter((i) => i.product_id).map((i) => {
      const found = productsList.find((p: any) => p.id === i.product_id);
      return {
        product_name: (found && found.name) || "Product",
        quantity: i.quantity,
        unit_price: canModifyPrices ? (i.unit_price || getProductPrice(i.product_id)) : getProductPrice(i.product_id),
      };
    })) : [{ product_name: pfNote.slice(0, 50) || "Simple order", quantity: 1, unit_price: 0 }];
    (async () => {
      const { error: pfError } = await supabase.from("proforma_invoices").insert({
        display_id: pfDisplayId,
        order_id: order.id,
        store_id: storeId,
        customer_id: customerId,
        total_amount: proformaItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0),
        items: proformaItems,
        created_by: user?.id,
      });
      if (pfError) console.error("Proforma creation failed:", pfError);
    })();

  logActivity(user!.id, "Created order", "order", displayId, order.id);
  toast.success("Order created");

  // Notify admins/managers
  const storeName = stores?.find((s) => s.id === storeId)?.name || "store";
  getAdminUserIds()
    .then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "New Order Created",
          message: `Order ${displayId} (${orderType}) placed for ${storeName}`,
          type: "order",
          entityType: "order",
          entityId: order.id,
        });
      }
    })
    .catch((error) => {
      console.error("Failed to notify admins about new order:", error);
    });

  // Notify assigned agent if order is assigned
  if (assignedTo && assignedTo !== user!.id) {
    sendNotificationToMany([assignedTo], {
      title: "Order Assigned to You",
      message: `Order ${displayId} (${orderType}) for ${storeName} has been assigned to you`,
      type: "order",
      entityType: "order",
      entityId: order.id,
    }).catch((error) => {
      console.error("Failed to notify assigned agent:", error);
    });
  }

    setSaving(false);
    setShowAdd(false);
    resetForm();
    // Invalidate all orders queries to refresh the list
    qc.invalidateQueries({ queryKey: ["orders"], exact: false });
  };

  // Handle order edit
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrder) return;
    
  setSaving(true);

  const updateData: UpdateOrder = {
    requirement_note: requirementNote || null,
    updated_by: user!.id,
    updated_at: new Date().toISOString(),
  };

  if (assignedTo !== undefined) {
    updateData.assigned_to = assignedTo || null;
  }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", editOrder.id);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Update order items if detailed
if (orderType === "detailed" && canModifyPrices) {
    // Soft delete existing items and recreate
    await supabase.from("order_items").update({ deleted_at: new Date().toISOString() }).eq("order_id", editOrder.id);
      
      const validItems = orderItems.filter((i) => i.product_id);
      if (validItems.length > 0) {
        await supabase.from("order_items").insert(
          validItems.map((i) => ({
            order_id: editOrder.id,
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price || getProductPrice(i.product_id)
          }))
        );
      }
    }

    logActivity(user!.id, "Modified order", "order", editOrder.display_id, editOrder.id);
    toast.success("Order updated");
    
    setSaving(false);
    setShowEdit(false);
    setEditOrder(null);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

// Open edit dialog with order details
  const handleOpenEdit = async (orderId: string) => {
    if (!canModifyOrders) {
      toast.error("You don't have permission to edit orders");
      return;
    }

    setLoadingOrderDetails(orderId);
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(id, name, store_type_id, customer_id, route_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      // Prevent editing delivered orders
      if (orderData.status === 'delivered') {
        toast.error("Delivered orders cannot be edited. Use Sale Return if needed.");
        return;
      }

      setEditOrder(orderData as unknown as FulfillOrder);
      setOrderType(orderData.order_type);
      setRequirementNote(orderData.requirement_note || "");
      setAssignedTo(orderData.assigned_to || "");

      if (orderData.order_items && orderData.order_items.length > 0) {
        setOrderItems(orderData.order_items.map((item: OrderItemData) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price ?? undefined
        })));
      } else {
        setOrderItems([{ product_id: "", quantity: 1 }]);
      }

      setShowEdit(true);
    } catch (error) {
      console.error("Error loading order details:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderDetails(null);
    }
  };

  // Open view dialog for delivered orders (read-only)
  const handleOpenView = async (orderId: string) => {
    setLoadingOrderDetails(orderId);
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(id, name, store_type_id, customer_id, route_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      setEditOrder(orderData as unknown as FulfillOrder);
      setOrderType(orderData.order_type);
      setRequirementNote(orderData.requirement_note || "");
      setAssignedTo(orderData.assigned_to || "");

      if (orderData.order_items && orderData.order_items.length > 0) {
        setOrderItems(orderData.order_items.map((item: OrderItemData) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price ?? undefined
        })));
      } else {
        setOrderItems([{ product_id: "", quantity: 1 }]);
      }

      setShowView(true);
    } catch (error) {
      console.error("Error loading order details:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderDetails(null);
    }
  };

  // Open fulfillment dialog
  const handleOpenFulfillment = async (orderId: string) => {
    if (!canFulfillOrders) {
      toast.error("You don't have permission to fulfill orders");
      return;
    }
    
    setLoadingOrderDetails(orderId);
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(id, name, store_type_id, customer_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;
      setFulfillOrder(orderData as unknown as FulfillOrder);
    } catch (error) {
      console.error("Error loading order details:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderDetails(null);
    }
  };

  // Open transfer dialog
  const handleOpenTransfer = async (orderId: string) => {
    if (!canTransferOrders) {
      toast.error("You don't have permission to transfer orders");
      return;
    }
    
    const order = orders?.find((o) => o.id === orderId);
    if (!order) return;
    
    setTransferOrder(order as unknown as FulfillOrder);
    setShowTransfer(true);
  };

  // Handle transfer completion
  const handleTransferComplete = async (orderId: string, newAssigneeId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ assigned_to: newAssigneeId, updated_by: user!.id, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) {
      toast.error(error.message);
      return;
    }

    const order = orders?.find((o) => o.id === orderId);
    
    // Notify the assigned agent
    sendNotificationToMany([newAssigneeId], {
      title: "Order Assigned",
      message: `Order ${order?.display_id} has been assigned to you`,
      type: "order",
      entityType: "order",
      entityId: orderId,
    });

    logActivity(user!.id, "Transferred order", "order", order?.display_id, orderId, { assigned_to: newAssigneeId });
    toast.success("Order transferred");
    setShowTransfer(false);
    setTransferOrder(null);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  // Handle invoice button click
const handleInvoiceAction = async (orderId: string, _status: string) => {
  if (!canViewInvoices) {
    toast.error("You don't have permission to view invoices");
    return;
  }

  setLoadingOrderDetails(orderId);
  try {
    // Load order with items
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        stores(id, name, store_type_id, customer_id),
        customers(id, name),
        order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
      `)
      .eq("id", orderId)
      .single();

    if (orderError) throw orderError;

    // Check if invoice exists for this order
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select(`
        *,
        invoice_items(*, products(id, name))
      `)
      .eq("order_ref", orderId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    setEditOrder(orderData as unknown as FulfillOrder);
    
    if (existingInvoice) {
      // View existing invoice
      setSelectedInvoice(existingInvoice);
      setInvoiceMode("view");
    } else {
      // Create new invoice
      setSelectedInvoice(null);
      setInvoiceMode("create");
    }
    
    setShowInvoice(true);
  } catch (error) {
    console.error("Error loading order for invoice:", error);
    toast.error("Failed to load order details");
  } finally {
    setLoadingOrderDetails(null);
  }
};

const exportCSV = () => {
    const rows = (filteredOrders || []).map((o: OrderRecord) => ({
      "Order ID": o.display_id,
      "Store": o.stores?.name || "",
      "Customer": o.customers?.name || "",
      "Type": o.order_type,
      "Source": o.source,
      "Status": o.status,
      "Note": o.requirement_note || "",
      "Created": new Date(o.created_at).toLocaleString("en-IN"),
    }));

    if (rows.length === 0) {
      toast.info("No orders to export");
      return;
    }

    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${statusFilter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCancel = async () => {
    if (!cancelOrderId || !cancelReason.trim()) { toast.error("Please provide a reason"); return; }
    setCancelling(true);
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: cancelReason,
        cancelled_by: user!.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", cancelOrderId)
      .in("status", ["pending", "confirmed"]);
    setCancelling(false);
    if (error) { toast.error(error.message); return; }

    const order = orders?.find((o) => o.id === cancelOrderId);
    logActivity(user!.id, "Cancelled order", "order", order?.display_id || "", cancelOrderId, { reason: cancelReason });

    // Notify customer if linked
    if (order?.customers && order.customer_id) {
      const { data: custData } = await supabase.from("customers").select("user_id").eq("id", order.customer_id).single();
      if (custData?.user_id) {
        sendNotificationToMany([custData.user_id], {
          title: "Order Cancelled",
          message: `Order ${order?.display_id} was cancelled. Reason: ${cancelReason}`,
          type: "order",
          entityType: "order",
          entityId: cancelOrderId,
        });
      }
    }

    // Soft-delete associated proforma
    await supabase.from("proforma_invoices").update({ status: "cancelled", deleted_at: new Date().toISOString() }).eq("order_id", cancelOrderId);

    toast.success("Order cancelled");
    setCancelOrderId(null);
    setCancelReason("");
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  // Filtering with matrix restrictions
  const filteredOrders = useMemo(() => {
    let data: any[] = orders || [];
    if (hasMatrixRestrictions || hasStoreTypeRestrictions) {
      data = data.filter((o: OrderRecord) =>
        o.stores && canAccessStore(o.stores.route_id, o.stores.store_type_id)
      );
    }
    return data;
  }, [orders, hasMatrixRestrictions, hasStoreTypeRestrictions, canAccessStore]);

  const activeOrderFilterCount = [
    filterCustomer !== "all",
    filterStore !== "all",
    filterStoreType !== "all",
    filterRoute !== "all",
    filterAssignedTo !== "all",
    filterFrom !== thirtyDaysAgo,
    filterTo !== today
  ].filter(Boolean).length;

  const clearOrderFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterCustomer("all");
    setFilterStore("all");
    setFilterStoreType("all");
    setFilterRoute("all");
    setFilterAssignedTo("all");
  };

// Build action buttons based on permissions - icon-only with tooltips
const buildActions = (row: OrderRecord) => {
  // Cancelled orders - show reason only
  if (row.status === "cancelled") {
    return (
      <span className="text-xs text-muted-foreground truncate max-w-[120px] block" title={row.cancellation_reason}>
        {row.cancellation_reason || "—"}
      </span>
    );
  }

  // Pending orders
  if (row.status === "pending") {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {canFulfillOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                  onClick={() => handleOpenFulfillment(row.id)}
                  disabled={loadingOrderDetails === row.id}
                >
                  {loadingOrderDetails === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fulfill Order</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canModifyOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => handleOpenEdit(row.id)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit Order</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canTransferOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-primary hover:bg-primary/10"
                  onClick={() => handleOpenTransfer(row.id)}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Transfer Order</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canViewInvoices && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                  onClick={() => handleInvoiceAction(row.id, row.status)}
                  disabled={loadingOrderDetails === row.id}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Proforma Invoice</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canCancelOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => setCancelOrderId(row.id)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cancel Order</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Confirmed orders
  if (row.status === "confirmed") {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {canFulfillOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                  onClick={() => handleOpenFulfillment(row.id)}
                  disabled={loadingOrderDetails === row.id}
                >
                  {loadingOrderDetails === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fulfill Order</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canModifyOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => handleOpenEdit(row.id)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit Order</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canViewInvoices && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                  onClick={() => handleInvoiceAction(row.id, row.status)}
                  disabled={loadingOrderDetails === row.id}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Proforma Invoice</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {canCancelOrders && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => setCancelOrderId(row.id)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cancel Order</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Delivered orders - CANNOT edit/cancel, only view
  if (row.status === "delivered") {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => handleOpenView(row.id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View Order Details</p>
            </TooltipContent>
          </Tooltip>

          {/* View Sale - links to the auto-created sale */}
          {row.fulfilled_by_sale_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                  onClick={() => window.location.href = `/sales/${row.fulfilled_by_sale_id}`}
                >
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View Sale Record</p>
              </TooltipContent>
            </Tooltip>
          )}

          {canViewInvoices && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                  onClick={() => handleInvoiceAction(row.id, row.status)}
                  disabled={loadingOrderDetails === row.id}
                >
                  {loadingOrderDetails === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tax Invoice</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Sale Return button for delivered orders */}
          {canCreateSaleReturns && row.fulfilled_by_sale_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                  onClick={() => window.location.href = `/sale-returns?sale_id=${row.fulfilled_by_sale_id}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create Sale Return</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return null;
};

  // Store Hover Card component
  const StoreHoverCard = ({ store, children }: { store?: StoreData | null; children: React.ReactNode }) => {
    if (!store) return <span>{children}</span>;
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Link to={`/stores/${store.id}`} className="hover:underline cursor-pointer">
            {children}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-72 p-0" align="start">
          <div className="p-3 space-y-3">
            {/* Store Photo and Name */}
            <div className="flex items-start gap-3">
              {store.image_url ? (
                <img 
                  src={store.image_url} 
                  alt={store.name}
                  className="h-14 w-14 rounded-lg object-cover border"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center border">
                  <StoreIcon className="h-6 w-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{store.name}</p>
                <p className="text-xs text-muted-foreground">{store.display_id}</p>
                {store.routes?.name && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">{store.routes.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Store Details */}
            <div className="space-y-1.5 text-xs">
              {store.store_types?.name && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground min-w-[60px]">Type:</span>
                  <span className="font-medium">{store.store_types.name}</span>
                </div>
              )}
              {store.address && (
                <div className="flex items-start gap-1.5">
                  <span className="text-muted-foreground min-w-[60px]">Address:</span>
                  <span className="text-muted-foreground line-clamp-2">{store.address}</span>
                </div>
              )}
            </div>

            {/* Balance */}
            {store.outstanding !== undefined && (
              <div className="flex items-center justify-between py-2 border-t text-sm">
                <span className="text-muted-foreground">Balance:</span>
                <span className={`font-bold ${Number(store.outstanding || 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  ₹{Number(store.outstanding || 0).toLocaleString()}
                </span>
              </div>
            )}

            <Button size="sm" variant="outline" className="w-full text-xs" asChild>
              <Link to={`/stores/${store.id}`}>View Store Profile</Link>
            </Button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Customer Hover Card component
  const CustomerHoverCard = ({ customer, children }: { customer?: CustomerData | null; children: React.ReactNode }) => {
    if (!customer) return <span>{children}</span>;
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Link to={`/customers/${customer.id}`} className="hover:underline cursor-pointer">
            {children}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-64 p-0" align="start">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <UserCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{customer.name}</p>
                <p className="text-xs text-muted-foreground">{customer.display_id}</p>
              </div>
            </div>
            {(customer.phone || customer.email) && (
              <div className="space-y-1 py-1 border-t text-xs">
                {customer.phone && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
              </div>
            )}
            <Button size="sm" variant="outline" className="w-full text-xs" asChild>
              <Link to={`/customers/${customer.id}`}>View Customer Profile</Link>
            </Button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

const columns = [
  { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
  { header: "Store", accessor: (row: OrderRecord) => (
    <div className="flex items-center gap-2">
      <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <StoreHoverCard store={row.stores}>
        <span>{row.stores?.name || "—"}</span>
      </StoreHoverCard>
    </div>
  ), className: "font-medium" },
  { header: "Type", accessor: (row: OrderRecord) => <Badge variant="secondary">{row.order_type}</Badge>, className: "hidden sm:table-cell" },
  { header: "Source", accessor: (row: OrderRecord) => <Badge variant="outline">{row.source}</Badge>, className: "hidden md:table-cell" },
  { header: "Customer", accessor: (row: OrderRecord) => (
    <div className="flex items-center gap-2">
      <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <CustomerHoverCard customer={row.customers}>
        <span>{row.customers?.name || "—"}</span>
      </CustomerHoverCard>
    </div>
  ), className: "text-muted-foreground text-sm hidden lg:table-cell" },
  { header: "Status", accessor: (row: OrderRecord) => <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} /> },
  { header: "Date", accessor: (row: OrderRecord) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
  { header: "Actions", accessor: (row: OrderRecord) => buildActions(row) },
];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  if (!hasOrderAccess) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Orders" subtitle="Manage customer orders and fulfillment" />
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Access Denied</p>
          <p className="text-sm">You don't have permission to view orders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Orders" 
        subtitle="Manage customer orders and fulfillment" 
        primaryAction={canCreateOrders ? { label: "Create Order", onClick: () => setShowAdd(true) } : undefined}
        actions={[
          { label: "Export CSV", icon: Download, onClick: exportCSV, variant: "outline" as const },
          ...(role === "super_admin" ? [{ label: "Order Access", icon: Shield, onClick: () => setShowOrderAccess(true), variant: "outline" as const }] : []),
        ]} 
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-11">
          <TabsTrigger value="all" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">All</TabsTrigger>
          <TabsTrigger value="pending" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Pending</TabsTrigger>
          <TabsTrigger value="delivered" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

<div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card shadow-sm">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 text-xs gap-1.5 justify-start font-medium flex-1 min-w-[110px] sm:flex-none bg-accent/5 focus:bg-accent/10 transition-colors">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            {filterFrom ? format(new Date(filterFrom + "T00:00:00"), "dd MMM yy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={filterFrom ? new Date(filterFrom + "T00:00:00") : undefined} onSelect={(d) => setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 text-xs gap-1.5 justify-start font-medium flex-1 min-w-[110px] sm:flex-none bg-accent/5 focus:bg-accent/10 transition-colors">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM yy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
        </PopoverContent>
      </Popover>
      <Select value={filterStore} onValueChange={setFilterStore}>
        <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
          <SelectValue placeholder="All stores" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stores</SelectItem>
          {storesForFilter?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterStoreType} onValueChange={setFilterStoreType}>
        <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
          <SelectValue placeholder="All store types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All store types</SelectItem>
          {storeTypes?.map((st) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterRoute} onValueChange={setFilterRoute}>
        <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
          <SelectValue placeholder="All routes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All routes</SelectItem>
          {routes?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterCustomer} onValueChange={setFilterCustomer}>
        <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
          <SelectValue placeholder="All customers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All customers</SelectItem>
          {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
        <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
          <SelectValue placeholder="All assignees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          <SelectItem value="__unassigned__">Unassigned</SelectItem>
          {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {activeOrderFilterCount > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearOrderFilters}>
          <X className="h-3 w-3 mr-1" /> Clear ({activeOrderFilterCount})
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{filteredOrders.length}{hasMoreOrders ? "+" : ""} result{filteredOrders.length !== 1 ? "s" : ""}</span>
    </div>

    <OrderStockSummary orders={orders || []} />

<DataTable
      columns={columns}
      data={filteredOrders}
      searchKey="display_id"
      searchPlaceholder="Search by order ID..."
      emptyMessage={statusFilter === "all" ? "No orders created yet." : `No ${statusFilter} orders.`}
      renderMobileCard={(row: OrderRecord) => (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="font-mono text-xs text-primary font-medium">{row.display_id}</span>
                <Badge variant="secondary" className="text-xs h-5 px-1.5">{row.order_type}</Badge>
                <Badge variant="outline" className="text-xs h-5 px-1.5">{row.source}</Badge>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <StoreHoverCard store={row.stores}>
                  <span className="font-semibold text-sm text-foreground truncate cursor-pointer hover:underline">{row.stores?.name || "—"}</span>
                </StoreHoverCard>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <CustomerHoverCard customer={row.customers}>
                  <span className="text-xs text-muted-foreground truncate cursor-pointer hover:underline">{row.customers?.name || "—"}</span>
                </CustomerHoverCard>
              </div>
            </div>
            <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} />
          </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 gap-2 flex-wrap">
              <p className="text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
              {row.status === "pending" && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canFulfillOrders && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-green-600 border-green-600/40" onClick={(e) => { e.stopPropagation(); handleOpenFulfillment(row.id); }} disabled={loadingOrderDetails === row.id}>
                      {loadingOrderDetails === row.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Package className="h-3 w-3 mr-1" />}Fulfill
                    </Button>
                  )}
                  {canModifyOrders && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-600/40" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row.id); }}>
                      <Edit className="h-3 w-3 mr-1" />Edit
                    </Button>
                  )}
                  {canTransferOrders && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-primary border-primary/40" onClick={(e) => { e.stopPropagation(); handleOpenTransfer(row.id); }}>
                      <ArrowRightLeft className="h-3 w-3 mr-1" />Transfer
                    </Button>
                  )}
                  {canCancelOrders && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/40" onClick={(e) => { e.stopPropagation(); setCancelOrderId(row.id); }}>
                      <XCircle className="h-3 w-3 mr-1" />Cancel
                    </Button>
                  )}
                </div>
              )}
              {row.status === "delivered" && (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-600/40" onClick={(e) => { e.stopPropagation(); handleOpenView(row.id); }}>
                    <Eye className="h-3 w-3 mr-1" />View
                  </Button>
                  {row.fulfilled_by_sale_id && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-green-600 border-green-600/40" onClick={(e) => { e.stopPropagation(); window.location.href = `/sales/${row.fulfilled_by_sale_id}`; }}>
                      <ShoppingCart className="h-3 w-3 mr-1" />Sale
                    </Button>
                  )}
                  {canViewInvoices && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-purple-600 border-purple-600/40" onClick={(e) => { e.stopPropagation(); handleInvoiceAction(row.id, row.status); }}>
                      <FileText className="h-3 w-3 mr-1" />Invoice
                    </Button>
                  )}
                  {/* NO CANCEL for delivered - use Sale Return */}
                </div>
              )}
              {row.status === "cancelled" && row.cancellation_reason && (
                <span className="text-xs text-muted-foreground italic truncate max-w-[180px]">{row.cancellation_reason}</span>
              )}
            </div>
            {(row.creator_profile || row.updater_profile || row.fulfiller_profile) && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap mt-2 pt-2 border-t border-border/50">
                {row.creator_profile && <span>Created by {row.creator_profile.full_name}</span>}
                {row.updater_profile && row.updater_profile.full_name !== row.creator_profile?.full_name && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>Edited by {row.updater_profile.full_name}</span>
                  </>
                )}
                {row.fulfiller_profile && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>Fulfilled by {row.fulfiller_profile.full_name}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      />

      {hasMoreOrders && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {/* Create Order Dialog */}
      {canCreateOrders && (
        <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader><DialogTitle>Create Order</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Store search */}
            <div>
              <Label>Store</Label>
              <Input
                placeholder="Search stores by name or ID..."
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                className="mt-1"
              />
              {storeSearch && (
                <div className="mt-1 h-36 overflow-y-auto border rounded-lg divide-y">
                  {(stores || [])
                    .filter((s: any) => s.name.toLowerCase().includes(storeSearch.toLowerCase()) || s.display_id.toLowerCase().includes(storeSearch.toLowerCase()))
                    .map((s: any) => (
                      <button key={s.id} type="button"
                        onClick={() => { setStoreId(s.id); setCustomerId(s.customer_id || ""); setStoreSearch(""); }}
                        className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-accent ${storeId === s.id ? "bg-primary/10 font-semibold text-primary" : "text-foreground"}`}
                      >
                        <span className="font-mono text-xs">{s.display_id}</span>
                        <span className="ml-2">{s.name}</span>
                      </button>
                    ))}
                </div>
              )}
              {storeId && (
                <div className="mt-1.5 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{(stores as any[])?.find((s: any) => s.id === storeId)?.name || "Store selected"}</span>
                  <button type="button" onClick={() => { setStoreId(""); setCustomerId(""); }} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                </div>
              )}
            </div>

            {storeId && (
              <>
                {/* Order Type + Assign row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <div className="flex mt-1 rounded-xl border overflow-hidden">
                      <button type="button" onClick={() => setOrderType("simple")}
                        className={`flex-1 py-2 text-xs font-semibold transition-colors ${orderType === "simple" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Note</button>
                      <button type="button" onClick={() => setOrderType("detailed")}
                        className={`flex-1 py-2 text-xs font-semibold transition-colors ${orderType === "detailed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Products</button>
                    </div>
                  </div>
                  <div>
                    <Label>Assign To</Label>
                    <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                      className="mt-1 w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {agents?.map((a: any) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Simple: note */}
                {orderType === "simple" && (
                  <div>
                    <Label>Note</Label>
                    <textarea value={requirementNote} onChange={(e) => setRequirementNote(e.target.value)}
                      className="mt-1 w-full h-20 rounded-xl border border-border bg-background px-3 py-2 text-xs resize-none"
                      placeholder="e.g., Need water bottles urgently" />
                  </div>
                )}

                {/* Detailed: products with +/- */}
                {orderType === "detailed" && (
                  <div className="h-48 overflow-y-auto space-y-1.5 border rounded-xl p-2">
                    {((products as any[]) || []).map((p: any) => {
                      const inCart = orderItems.find((i) => i.product_id === p.id);
                      return (
                        <div key={p.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">₹{Number(p.base_price).toLocaleString("en-IN")}</p>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => updateItemQuantity(p.id, inCart.quantity - 1)}
                                className="h-8 w-8 rounded-lg border-2 border-border flex items-center justify-center hover:bg-muted active:scale-90 transition-all">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-sm font-bold text-foreground w-6 text-center">{inCart.quantity}</span>
                              <button type="button" onClick={() => updateItemQuantity(p.id, inCart.quantity + 1)}
                                className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 active:scale-90 transition-all">
                                <Plus className="h-3.5 w-3.5 text-primary-foreground" />
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => addOrderItem(p.id)}
                              className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 active:scale-90 transition-all">
                              <Plus className="h-3.5 w-3.5 text-primary-foreground" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Order
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Order Dialog */}
      {canModifyOrders && (
        <Dialog open={showEdit} onOpenChange={(v) => { setShowEdit(v); if (!v) { setEditOrder(null); resetForm(); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Order {editOrder?.display_id}</DialogTitle></DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <Label>Requirement Note</Label>
            <Textarea value={requirementNote} onChange={(e) => setRequirementNote(e.target.value)} className="mt-1" />
          </div>
          
          {((role as string) === "admin" || role === "manager" || role === "marketer") && (
            <div>
              <Label>Assign To Agent</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {orderType === "detailed" && canModifyPrices && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Products & Prices</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                  </div>
                  <div className="space-y-2">
                    {orderItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select value={item.product_id} onValueChange={(v) => { const u = [...orderItems]; u[idx].product_id = v; setOrderItems(u); }}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                          <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => { const u = [...orderItems]; u[idx].quantity = Number(e.target.value); setOrderItems(u); }} className="w-20" placeholder="Qty" />
                        <Input 
                          type="number" 
                          min={0} 
                          step="0.01"
                          value={item.unit_price || getProductPrice(item.product_id)} 
                          onChange={(e) => { const u = [...orderItems]; u[idx].unit_price = Number(e.target.value); setOrderItems(u); }} 
                          className="w-24" 
                          placeholder="Price" 
                        />
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
                Update Order
              </Button>
      </form>
      </DialogContent>
    </Dialog>
  )}

      {/* View Order Dialog - Modern UI */}
      <OrderViewDialog
        orderId={showView ? editOrder?.id || null : null}
        open={showView}
        onOpenChange={(open) => {
          setShowView(open);
          if (!open) {
            setEditOrder(null);
          }
        }}
        onViewSale={(saleId) => window.location.href = `/sales/${saleId}`}
        onCreateInvoice={(orderId) => handleInvoiceAction(orderId, "delivered")}
      />

      {/* Order Fulfillment Dialog */}
      <OrderFulfillmentDialog
        order={fulfillOrder}
        open={!!fulfillOrder}
        onOpenChange={(open) => { if (!open) setFulfillOrder(null); }}
        onFulfilled={() => qc.invalidateQueries({ queryKey: ["orders"] })}
      />

      {/* Transfer Order Dialog */}
      <TransferOrderDialog
        order={transferOrder}
        agents={agents}
        open={showTransfer}
        onOpenChange={setShowTransfer}
        onTransfer={handleTransferComplete}
      />

      {/* Cancel Order Dialog */}
      <Dialog open={!!cancelOrderId} onOpenChange={(v) => { if (!v) { setCancelOrderId(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel order <span className="font-mono font-medium text-foreground">{orders?.find((o) => o.id === cancelOrderId)?.display_id}</span>?
            </p>
            <div>
              <Label>Reason for cancellation</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
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
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>Back</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling || !cancelReason}>
                {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Access Dialog */}
      <Dialog open={showOrderAccess} onOpenChange={setShowOrderAccess}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Access Control</DialogTitle>
          </DialogHeader>
          <OrderAccessMatrix />
        </DialogContent>
      </Dialog>

      {/* Proforma View Dialog */}
      <Dialog open={!!viewProformaId && !!viewProforma} onOpenChange={(o) => { if (!o) setViewProformaId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proforma Invoice</DialogTitle>
          </DialogHeader>
          {viewProforma && <ProformaView proforma={viewProforma} />}
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <InvoiceDialog
        order={editOrder}
        invoice={selectedInvoice}
        mode={invoiceMode}
        open={showInvoice}
        onOpenChange={setShowInvoice}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
      />
    </div>
  );
};

export default Orders;
