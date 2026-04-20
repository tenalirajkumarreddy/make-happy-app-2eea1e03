import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { addToQueue, generateBusinessKey } from "@/lib/offlineQueue";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Trash2, Download, IndianRupee, CreditCard, Banknote, Clock, UserCircle, Store as StoreIcon, Package, X, CalendarIcon, Receipt, FileText, RotateCcw, ShoppingCart, ChevronRight, Eye, ClipboardList } from "lucide-react";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { SaleReceipt } from "@/components/shared/SaleReceipt";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
import { SaleReturnDialog } from "@/components/sales/SaleReturnDialog";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";

function exportCSV(data: any[], columns: { header: string; key: string }[], filename: string) {
  const header = columns.map((c) => c.header).join(",");
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = c.key.includes(".") ? c.key.split(".").reduce((o: any, k) => o?.[k], row) : row[c.key];
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${data.length} rows`);
}

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

const POS_STORE_ID = "00000000-0000-0000-0000-000000000001";
const PAGE_SIZE = 100;

// Type for order fulfillment
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

const Sales = () => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const navigate = useNavigate();
  const isPosUser = role === "pos";
  const { allowed: canOverridePrice } = usePermission("price_override");
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [returnSale, setReturnSale] = useState<any | null>(null);
  const [fulfillOrder, setFulfillOrder] = useState<FulfillOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  // POS users are locked to the POS store
  const isAdmin = role === "super_admin" || role === "manager";
  const [searchParams, setSearchParams] = useSearchParams();
  const [storeId, setStoreId] = useState(isPosUser ? POS_STORE_ID : (searchParams.get("store") ?? ""));

  // When navigated with ?store=<id>, auto-open the add dialog
  useEffect(() => {
    const storeParam = searchParams.get("store");
    if (storeParam && !isPosUser) {
      setStoreId(storeParam);
      setShowAdd(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isPosUser, setSearchParams]);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [saleDate, setSaleDate] = useState("");

  // List filters
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterStore, setFilterStore] = useState("all");
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [items, setItems] = useState<SaleItem[]>([{ product_id: "", quantity: 1, unit_price: 0 }]);
  const [loadedPages, setLoadedPages] = useState(1);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterPayment]);

  const { data: sales, isLoading, isFetching } = useQuery({
    queryKey: ["sales", currentWarehouse?.id, isAdmin ? "all" : user?.id, filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterPayment, loadedPages],
    queryFn: async () => {
      let query = (supabase as any)
        .from("sales")
        .select("*, stores(name, display_id, store_type_id, route_id), customers(name, display_id)")
        .order("created_at", { ascending: false });
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      // Non-admin roles (agents, pos, marketer) only see their own records
      if (!isAdmin) query = query.eq("recorded_by", user!.id);
      // Server-side filters
      if (filterFrom) query = query.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");
      if (filterStore !== "all") query = query.eq("store_id", filterStore);
      if (filterUser !== "all") query = query.eq("recorded_by", filterUser);
      if (filterPayment === "cash") query = query.gt("cash_amount", 0);
      if (filterPayment === "upi") query = query.gt("upi_amount", 0);
      if (filterPayment === "outstanding") query = query.gt("outstanding_amount", 0);
      // Cursor pagination: fetch all pages up to current
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const hasMoreSales = (sales?.length || 0) >= loadedPages * PAGE_SIZE;

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

  // Filtering is now done server-side; local array mirrors the fetched page(s)
  const filteredSales = sales || [];

  const activeFilterCount = [filterStore !== "all", filterStoreType !== "all", filterRoute !== "all", filterUser !== "all", filterPayment !== "all", filterFrom !== thirtyDaysAgo, filterTo !== today].filter(Boolean).length;

  const clearSalesFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterStore("all");
    setFilterStoreType("all");
    setFilterRoute("all");
    setFilterUser("all");
    setFilterPayment("all");
  };

  const { data: stores } = useQuery({
    queryKey: ["stores-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any).from("stores").select("id, name, outstanding, display_id, store_type_id, customer_id, lat, lng, is_active").order("is_active", { ascending: false }).order("name");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
  });

  // Fetch store types for credit limits
  // Fetch store types for filters and credit limits
  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-credit"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name, credit_limit_kyc, credit_limit_no_kyc");
      return data || [];
    },
  });

  // Fetch routes for filters
  const { data: routes } = useQuery({
    queryKey: ["routes-for-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").order("name");
      return data || [];
    },
  });

  // Fetch customer KYC status for credit limit determination
  const { data: customers } = useQuery({
    queryKey: ["customers-kyc-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any).from("customers").select("id, kyc_status, credit_limit_override");
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data } = await query;
      return data || [];
    },
  });

  const selectedStore = stores?.find((s) => s.id === storeId);
  const selectedStoreTypeId = selectedStore?.store_type_id;

  const { data: availableProducts } = useQuery({
    queryKey: ["products-for-sale", selectedStoreTypeId, storeId],
    queryFn: async () => {
      if (!selectedStoreTypeId) return [];
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", selectedStoreTypeId);

      let productList: any[];
      if (accessData && accessData.length > 0) {
        productList = accessData.map((a: any) => a.products).filter(Boolean);
      } else {
        let productsQuery = (supabase as any).from("products").select("id, name, base_price, sku").eq("is_active", true);
        if (currentWarehouse?.id) productsQuery = productsQuery.eq("warehouse_id", currentWarehouse.id);
        const { data } = await productsQuery;
        productList = data || [];
      }

      const { data: typePricing } = await supabase
        .from("store_type_pricing")
        .select("product_id, price")
        .eq("store_type_id", selectedStoreTypeId);
      const typePriceMap: Record<string, number> = {};
      typePricing?.forEach((p) => { typePriceMap[p.product_id] = Number(p.price); });

      const { data: storePricing } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", storeId);
      const storePriceMap: Record<string, number> = {};
      storePricing?.forEach((p) => { storePriceMap[p.product_id] = Number(p.price); });

      return productList.map((p) => {
        let effectivePrice = Number(p.base_price);
        let priceSource = "base";
        if (typePriceMap[p.id]) { effectivePrice = typePriceMap[p.id]; priceSource = "type"; }
        if (storePriceMap[p.id]) { effectivePrice = storePriceMap[p.id]; priceSource = "store"; }
        return { ...p, effectivePrice, priceSource };
      });
    },
    enabled: !!storeId && !!selectedStoreTypeId,
  });

  // Fetch pending orders for the selected store (shown in record sale dialog)
  const { data: pendingOrders, isLoading: loadingPendingOrders } = useQuery({
    queryKey: ["pending-orders-for-store", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(`
          id, display_id, order_type, requirement_note, created_at,
          order_items(id, product_id, quantity, unit_price, products(id, name, sku))
        `)
        .eq("store_id", storeId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!storeId && showAdd,
  });

  // Fetch sale items for the selected sale detail
  const { data: saleItems, isLoading: loadingSaleItems } = useQuery({
    queryKey: ["sale-items", selectedSaleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*, products(name, sku)")
        .eq("sale_id", selectedSaleId!);
      return data || [];
    },
    enabled: !!selectedSaleId,
  });

  const selectedSale = sales?.find((s) => s.id === selectedSaleId);

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(selectedStore?.outstanding || 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  // Credit limit calculation
  const creditLimitInfo = selectedStore && storeTypes && customers
    ? resolveCreditLimit(selectedStore, storeTypes, customers)
    : null;

  const creditExceeded = creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit;
  const creditWarning = creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit * 0.8 && !creditExceeded;

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof SaleItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "product_id") {
      const p = availableProducts?.find((pr: any) => pr.id === value);
      if (p) updated[idx].unit_price = p.effectivePrice;
    }
    setItems(updated);
  };

  // Fetch staff users for "record on behalf" selector
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-for-behalf"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r) => r.user_id) || [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const resetForm = () => {
    setStoreId(isPosUser ? POS_STORE_ID : ""); setCashAmount(""); setUpiAmount(""); setRecordedFor(""); setSaleDate("");
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const handleStoreChange = (newStoreId: string) => {
    setStoreId(newStoreId);
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  // Open fulfillment dialog for a pending order
  const handleFulfillOrder = async (orderId: string) => {
    setLoadingOrderId(orderId);
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
      setShowAdd(false); // Close the record sale dialog
      setFulfillOrder(orderData as unknown as FulfillOrder);
    } catch (error) {
      console.error("Error loading order:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || items.some((i) => !i.product_id)) {
      toast.error("Please fill all required fields");
      return;
    }
    if (items.some((i) => i.quantity <= 0)) {
      toast.error("All item quantities must be greater than zero");
      return;
    }
    if (totalAmount === 0) {
      toast.error("Sale total cannot be zero");
      return;
    }
    // POS users: payment must equal total (no outstanding allowed)
    if (isPosUser && (cash + upi) !== totalAmount) {
      toast.error("POS sales require full payment. Cash + UPI must equal Total.");
      return;
    }

    // Validate sale date if provided
    if (saleDate) {
      const saleDateObj = new Date(saleDate);
      const now = new Date();
      const maxPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day in the future

      if (saleDateObj > maxFuture) {
        toast.error("Sale date cannot be more than 1 day in the future");
        return;
      }
      if (saleDateObj < maxPast) {
        toast.error("Sale date cannot be more than 30 days in the past");
        return;
      }
    }

    setSaving(true);

    // Proximity check for agents
    if (role === "agent" && selectedStore) {
      const { checkProximity } = await import("@/lib/proximity");
      const result = await checkProximity(
        selectedStore.lat ?? null,
        selectedStore.lng ?? null,
        { noGpsHandling: "require_manager_override", userRole: role }
      );
      if (!result.withinRange) {
        if (result.requiresManagerOverride) {
          toast.error(result.message + " Please ask a manager to update the store's GPS coordinates.");
        } else {
          toast.error(result.message);
        }
        setSaving(false);
        return;
      }
      if (result.skippedNoGps) {
        toast.warning("Store has no GPS coordinates — location check skipped");
      }
    }

  const customerId = selectedStore?.customer_id;
  if (!customerId) {
    toast.error("Store has no linked customer");
    setSaving(false);
    return;
  }

  // NEW: Check stock availability before sale
  const hasProducts = items.some(i => i.product_id && i.quantity > 0);
  if (hasProducts) {
    const saleItemsForStockCheck = items.filter((i) => i.product_id).map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
    }));
    
    const { data: stockCheck, error: stockError } = await (supabase as any)
      .rpc("check_stock_availability", {
        p_user_id: user!.id,
        p_items: saleItemsForStockCheck,
      });
    
    if (stockError) {
      console.error("Stock check failed:", stockError);
      // BLOCKING: Stock check failure should prevent sale
      toast.error(`Stock check failed: ${stockError.message || "Unable to verify stock availability"}. Please try again.`);
      setSaving(false);
      return;
    }

    const stockRows = Array.isArray(stockCheck) ? stockCheck : [];
    const insufficient = stockRows.filter((s: any) => !s.available);
    if (insufficient.length > 0) {
      const productNames = insufficient.map((i: any) => i.product_name).join(", ");
      toast.error(
        `Insufficient stock for: ${productNames}. Available: ${insufficient.map((i: any) => `${i.product_name} (${i.available_qty})`).join(", ")}`
      );
      setSaving(false);
      return;
    }
  }

// Queue sale for offline sync if no network connection
    if (!navigator.onLine) {
      const effectiveRecordedByOffline = recordedFor || user!.id;
      const loggedByOffline = recordedFor ? user!.id : null;
      const saleItems = items.filter((i) => i.product_id).map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.quantity * i.unit_price,
      }));

      // OFFLINE CREDIT LIMIT VALIDATION
      const { validateCreditLimitOffline } = await import("@/lib/offlineCreditValidation");
      const creditCheck = await validateCreditLimitOffline(
        storeId,
        outstandingFromSale,
        isAdmin
      );

      if (!creditCheck.valid) {
        toast.error(creditCheck.warning || "Credit limit exceeded");
        setSaving(false);
        return;
      }

      if (creditCheck.warning) {
        toast.warning(creditCheck.warning);
      }

      // Generate business key for deduplication
      const businessKey = generateBusinessKey('sale', {
        storeId,
        customerId,
        amount: totalAmount,
        products: saleItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        timestamp: saleDate || new Date().toISOString(),
      });

      await addToQueue({
        id: crypto.randomUUID(),
        type: "sale",
        payload: {
          saleData: {
            store_id: storeId,
            customer_id: customerId,
            recorded_by: effectiveRecordedByOffline,
            logged_by: loggedByOffline,
            total_amount: totalAmount,
            cash_amount: cash,
            upi_amount: upi,
            outstanding_amount: outstandingFromSale,
            old_outstanding: oldOutstanding,
            new_outstanding: newOutstanding,
            ...(saleDate ? { created_at: new Date(saleDate).toISOString() } : {}),
          },
          saleItems: saleItems,
          storeUpdate: { outstanding: newOutstanding },
        },
        createdAt: new Date().toISOString(),
        businessKey,
        context: {
          creditLimit: creditCheck.limit,
          creditLimitSource: creditCheck.limitSource,
          currentOutstanding: creditCheck.currentOutstanding,
          cached: creditCheck.cached,
        },
      });
      toast.warning("You're offline — sale queued and will sync automatically when back online");
      setSaving(false);
      setShowAdd(false);
      resetForm();
      return;
    }

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    const saleItems = items.filter((i) => i.product_id).map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price,
    }));

    // Count pending orders before insert for the success toast
    const { data: pendingOrders } = await supabase
      .from("orders").select("id").eq("store_id", storeId).eq("status", "pending");
    const pendingCount = pendingOrders?.length || 0;

    // Single atomic RPC — insert sale + items, enforce credit limit, deliver orders, fix balance
    const { data: result, error } = await supabase.rpc("record_sale", {
      p_display_id: displayId,
      p_store_id: storeId,
      p_customer_id: customerId,
      p_recorded_by: effectiveRecordedBy,
      p_logged_by: loggedBy,
      p_total_amount: totalAmount,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_outstanding_amount: outstandingFromSale,
      p_sale_items: saleItems,
      p_created_at: saleDate ? new Date(saleDate).toISOString() : null,
    });

  if (error) {
    if (error.message.includes("credit_limit_exceeded")) {
      toast.error("Credit limit exceeded. Increase payment or reduce items.");
    } else if (error.message.includes("insufficient_stock")) {
      toast.error("Insufficient stock for one or more products. Please check inventory.");
    } else {
      toast.error(error.message);
    }
    setSaving(false);
    return;
  }

    const saleRow = (result as any)?.[0];
    logActivity(user!.id, "Recorded sale", "sale", displayId, saleRow?.sale_id, { total: totalAmount, store: storeId });

    if (pendingCount > 0) {
      toast.success(`Sale recorded. ${pendingCount} pending order(s) auto-marked as delivered.`);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } else {
      toast.success("Sale recorded successfully");
    }

    // Notify admins/managers (fire-and-forget with error handling)
    const storeName = stores?.find((s) => s.id === storeId)?.name || "store";
    getAdminUserIds()
      .then((ids) => {
        const others = ids.filter((id) => id !== user!.id);
        if (others.length > 0) {
          sendNotificationToMany(others, {
            title: "New Sale Recorded",
            message: `Sale ${displayId} of ₹${totalAmount.toLocaleString()} at ${storeName}`,
            type: "payment",
            entityType: "sale",
            entityId: saleRow?.sale_id,
          });
        }
      })
      .catch((err) => {
        // Don't block on notification failures
        console.warn("Failed to notify admins:", err);
      });

    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["sales"] });
  };

  const getRecorderName = (userId: string) => {
    const p = profileMap.get(userId);
    return p?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    const p = profileMap.get(userId);
    return p?.avatar_url || null;
  };

  const columns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs", hideOnMobile: true },
    { header: "Store", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span>{row.stores?.name || "—"}</span>
      </div>
    ), className: "font-medium" },
    { header: "Total", accessor: (row: any) => <span className="font-semibold">₹{Number(row.total_amount).toLocaleString()}</span> },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Outstanding", accessor: (row: any) => (
      <span className={Number(row.outstanding_amount) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
        ₹{Number(row.outstanding_amount).toLocaleString()}
      </span>
    ), className: "text-sm hidden md:table-cell" },
    { header: "Recorded By", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{getRecorderName(row.recorded_by)}</span>
      </div>
    ), className: "hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => (
      <span className="text-xs text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
    ), className: "hidden sm:table-cell" },
    { header: "Actions", accessor: (row: any) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); setReceiptSaleId(row.id); }}
          title="View Receipt"
        >
          <Receipt className="h-3.5 w-3.5" />
        </Button>
        {isAdmin && !row.has_invoice && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); navigate("/invoices/new", { state: { saleIds: [row.id] } }); }}
            title="Generate Invoice"
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
        {row.has_invoice && (
          <Badge variant="outline" className="text-[10px] px-1.5">Invoiced</Badge>
        )}
      </div>
    ), className: "hidden sm:table-cell" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  const getPriceLabel = (product: any) => {
    if (product.priceSource === "store") return "(store price)";
    if (product.priceSource === "type") return "(type price)";
    return "(base price)";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales"
        subtitle="View and record sales transactions"
        primaryAction={{ label: "Record Sale", onClick: () => setShowAdd(true) }}
        actions={[
          {
            label: "Returns",
            icon: RotateCcw,
            priority: 0,
            onClick: () => navigate("/sale-returns"),
          },
          {
            label: "Export CSV",
            icon: Download,
            priority: 1,
            onClick: () => {
              exportCSV(
                filteredSales.map((s: any) => ({ ...s, store_name: s.stores?.name || "", customer_name: s.customers?.name || "", recorder: getRecorderName(s.recorded_by) })),
                [
                  { header: "Sale ID", key: "display_id" },
                  { header: "Store", key: "store_name" },
                  { header: "Customer", key: "customer_name" },
                  { header: "Total", key: "total_amount" },
                  { header: "Cash", key: "cash_amount" },
                  { header: "UPI", key: "upi_amount" },
                  { header: "Outstanding", key: "outstanding_amount" },
                  { header: "Recorded By", key: "recorder" },
                  { header: "Date", key: "created_at" },
                ],
                "sales-export.csv"
              );
            },
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 text-xs gap-1.5 justify-start font-normal flex-1 min-w-[100px] sm:flex-none">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {filterFrom ? format(new Date(filterFrom + "T00:00:00"), "dd MMM yy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterFrom ? new Date(filterFrom + "T00:00:00") : undefined} onSelect={(d) => setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 text-xs gap-1.5 justify-start font-normal flex-1 min-w-[100px] sm:flex-none">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM yy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
      <Select value={filterStore} onValueChange={setFilterStore}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All stores" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stores</SelectItem>
          {stores?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterStoreType} onValueChange={setFilterStoreType}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All store types" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All store types</SelectItem>
          {storeTypes?.map((st: any) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterRoute} onValueChange={setFilterRoute}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All routes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All routes</SelectItem>
          {routes?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {profiles?.map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="Payment method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
            <SelectItem value="outstanding">Has outstanding</SelectItem>
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSalesFilters}>
            <X className="h-3 w-3 mr-1" /> Clear ({activeFilterCount})
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filteredSales.length}{hasMoreSales ? "+" : ""} result{filteredSales.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable
        columns={columns}
        data={filteredSales}
        searchKey="display_id"
        searchPlaceholder="Search by sale ID..."
        emptyMessage="No sales recorded yet."
        onRowClick={(row: any) => setSelectedSaleId(row.id)}
        renderMobileCard={(row: any) => (
          <div className="rounded-lg border bg-card p-3 cursor-pointer active:bg-muted/30" onClick={() => setSelectedSaleId(row.id)}>
            {/* Header row: ID + Date */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-xs text-primary font-medium">{row.display_id}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
            </div>
            {/* Store name */}
            <div className="flex items-center gap-1.5 mb-2">
              <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate">{row.stores?.name || "—"}</span>
            </div>
            {/* Amounts row - inline compact */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</span>
              <span className="text-muted-foreground">Cash: ₹{Number(row.cash_amount).toLocaleString()}</span>
              <span className="text-muted-foreground">UPI: ₹{Number(row.upi_amount).toLocaleString()}</span>
            </div>
            {/* Footer: Recorder + Outstanding */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
                  <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{getRecorderName(row.recorded_by)}</span>
              </div>
              {Number(row.outstanding_amount) > 0 && (
                <span className="text-xs font-semibold text-destructive">Due: ₹{Number(row.outstanding_amount).toLocaleString()}</span>
              )}
            </div>
          </div>
        )}
      />

      {hasMoreSales && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSaleId} onOpenChange={(v) => { if (!v) setSelectedSaleId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sale Details</DialogTitle></DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{selectedSale.display_id}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(selectedSale.created_at), "dd MMM yy, hh:mm a")}</span>
              </div>
              <div className="flex items-center gap-2">
                <StoreIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{(selectedSale as any).stores?.name || "—"}</span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Total</span><span className="font-bold">₹{Number(selectedSale.total_amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span>₹{Number(selectedSale.cash_amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>UPI</span><span>₹{Number(selectedSale.upi_amount).toLocaleString()}</span></div>
                <div className="flex justify-between font-medium"><span>Outstanding</span><span className={Number(selectedSale.outstanding_amount) > 0 ? "text-destructive" : ""}>₹{Number(selectedSale.outstanding_amount).toLocaleString()}</span></div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Items</p>
                {loadingSaleItems ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : saleItems && saleItems.length > 0 ? (
                  <div className="space-y-1.5">
                    {saleItems.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                        <div>
                          <p className="font-medium">{item.products?.name || "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{item.products?.sku} · Qty: {Number(item.quantity)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">₹{Number(item.total_price).toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">@ ₹{Number(item.unit_price).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No items recorded</p>
                )}
              </div>

              {/* Recorder */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={getRecorderAvatar(selectedSale.recorded_by) || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getRecorderName(selectedSale.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
               <span className="text-xs text-muted-foreground">Recorded by {getRecorderName(selectedSale.recorded_by)}</span>
              </div>
          {(selectedSale as any).logged_by && (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={getRecorderAvatar((selectedSale as any).logged_by) || undefined} />
                <AvatarFallback className="text-[9px] bg-accent/20 text-accent-foreground">{getRecorderName((selectedSale as any).logged_by).charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">Logged by {getRecorderName((selectedSale as any).logged_by)}</span>
            </div>
          )}
          
          {/* Return Button - NEW */}
          {selectedSale && isAdmin && (
            <div className="pt-4 border-t">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setReturnSale(selectedSale);
                  setSelectedSaleId(null);
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Process Return
              </Button>
            </div>
          )}
        </div>
      )}
    </DialogContent>
  </Dialog>
  
  {/* Sale Return Dialog - NEW */}
  <SaleReturnDialog
    open={!!returnSale}
    onOpenChange={(v) => { if (!v) setReturnSale(null); }}
    sale={returnSale}
    onSuccess={() => qc.invalidateQueries({ queryKey: ['sales'] })}
  />

      {/* Record Sale Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            {canRecordBehalf && (
              <div>
                <Label>Record on behalf of</Label>
                <Select value={recordedFor || "self"} onValueChange={(v) => setRecordedFor(v === "self" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Myself (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>
                    {staffUsers?.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAdmin && (
              <div>
                <Label>Sale Date <span className="text-muted-foreground text-xs font-normal">(leave blank to use current time)</span></Label>
                <Input
                  type="datetime-local"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label>Store</Label>
              {isPosUser ? (
                <div className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  POS Counter (auto-selected)
                </div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Select value={storeId} onValueChange={handleStoreChange}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                    <SelectContent>{stores?.map((s) => (
                      <SelectItem key={s.id} value={s.id} disabled={!s.is_active}>
                        {s.name} ({s.display_id}){!s.is_active ? " — Inactive" : ""}
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                  <QrStoreSelector onStoreSelected={handleStoreChange} />
                </div>
              )}
              {selectedStore && (
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <p>Current outstanding: ₹{oldOutstanding.toLocaleString()}</p>
                  {creditLimitInfo && creditLimitInfo.limit > 0 && (
                    <p>Credit limit ({creditLimitInfo.source}): ₹{creditLimitInfo.limit.toLocaleString()} — <span className={oldOutstanding > creditLimitInfo.limit * 0.8 ? "text-destructive font-medium" : "text-muted-foreground"}>{Math.round((oldOutstanding / creditLimitInfo.limit) * 100)}% used</span></p>
                  )}
                </div>
              )}
            </div>

            {/* Pending Orders Section - Show before products to encourage fulfillment */}
            {storeId && pendingOrders && pendingOrders.length > 0 && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pending Orders ({pendingOrders.length})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This store has pending orders. Click to fulfill an order instead of creating a new sale.
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {pendingOrders.map((order: any) => (
                    <Card 
                      key={order.id} 
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => handleFulfillOrder(order.id)}
                    >
                      <CardContent className="p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-xs font-medium text-primary">{order.display_id}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">
                              {order.order_type}
                            </Badge>
                          </div>
                          {order.order_type === "detailed" && order.order_items?.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {order.order_items.slice(0, 2).map((i: any) => i.products?.name || "Item").join(", ")}
                              {order.order_items.length > 2 && ` +${order.order_items.length - 2} more`}
                            </p>
                          ) : order.requirement_note ? (
                            <p className="text-[11px] text-muted-foreground truncate">{order.requirement_note}</p>
                          ) : null}
                          <p className="text-[10px] text-muted-foreground/70">
                            {format(new Date(order.created_at), "dd MMM, hh:mm a")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {loadingOrderId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <>
                              <span className="text-xs text-primary font-medium">Fulfill</span>
                              <ChevronRight className="h-4 w-4 text-primary" />
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="pt-1 border-t border-primary/20">
                  <p className="text-[11px] text-center text-muted-foreground">— or create a new sale below —</p>
                </div>
              </div>
            )}

            {storeId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Products</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {(!availableProducts || availableProducts.length === 0) && (
                  <p className="text-xs text-muted-foreground py-2">No products available for this store type. Configure the product access matrix first.</p>
                )}
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                          <SelectContent>
                            {availableProducts?.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-16" placeholder="Qty" />
                        <Input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className={`w-24 ${!canOverridePrice ? "bg-muted cursor-not-allowed" : ""}`} placeholder="Price" readOnly={!canOverridePrice} title={!canOverridePrice ? "Price override not allowed" : undefined} />
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                      {item.product_id && availableProducts && (
                        <p className="text-[11px] text-muted-foreground pl-1">
                          {(() => {
                            const p = availableProducts.find((pr: any) => pr.id === item.product_id);
                            return p ? `₹${p.effectivePrice.toLocaleString()} ${getPriceLabel(p)}` : "";
                          })()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total</span><span className="font-semibold">₹{totalAmount.toLocaleString()}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cash (₹)</Label><Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
              <div><Label>UPI (₹)</Label><Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Payment</span><span>₹{(cash + upi).toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold"><span>New Outstanding</span><span className={newOutstanding > oldOutstanding ? "text-destructive" : "text-success"}>₹{newOutstanding.toLocaleString()}</span></div>
              {creditLimitInfo && creditLimitInfo.limit > 0 && (
                <div className="flex justify-between text-xs"><span>Credit Limit ({creditLimitInfo.source})</span><span>₹{creditLimitInfo.limit.toLocaleString()}</span></div>
              )}
              {isPosUser && (cash + upi) !== totalAmount && totalAmount > 0 && (
                <p className="text-xs text-destructive mt-1">⚠ POS sales require full payment (Cash + UPI = Total)</p>
              )}
            </div>

            {creditExceeded && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                🚫 <strong>Credit limit exceeded!</strong> New outstanding (₹{newOutstanding.toLocaleString()}) exceeds the {creditLimitInfo?.source} credit limit of ₹{creditLimitInfo?.limit.toLocaleString()}. Increase payment or reduce items.
              </div>
            )}
            {creditWarning && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ Outstanding approaching credit limit ({Math.round((newOutstanding / creditLimitInfo!.limit) * 100)}% used).
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving || (!!creditExceeded && !isAdmin)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Sale
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <SaleReceipt
        saleId={receiptSaleId || ""}
        open={!!receiptSaleId}
        onClose={() => setReceiptSaleId(null)}
      />

      {/* Order Fulfillment Dialog */}
      <OrderFulfillmentDialog
        order={fulfillOrder}
        open={!!fulfillOrder}
        onOpenChange={(open) => { if (!open) setFulfillOrder(null); }}
        onFulfilled={() => {
          qc.invalidateQueries({ queryKey: ["orders"] });
          qc.invalidateQueries({ queryKey: ["sales"] });
          qc.invalidateQueries({ queryKey: ["pending-orders-for-store"] });
        }}
      />
    </div>
  );
};

export default Sales;
