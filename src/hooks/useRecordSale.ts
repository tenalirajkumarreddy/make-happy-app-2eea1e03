import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { usePermission } from "@/hooks/usePermission";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSearchParams } from "react-router-dom";
import { validateSaleData } from "@/lib/validation/schemas";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { addToQueue, generateBusinessKey } from "@/lib/offlineQueue";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { toast } from "sonner";

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  product_name?: string;
  product_image?: string | null;
  effectivePrice?: number;
}

export function useRecordSale() {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "manager";
  const isPosUser = role === "operator";
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const { data: companySettings } = useCompanySettings();
  const isCreditCheckEnabled = companySettings?.credit_limit_check !== "false";
  const [searchParams, setSearchParams] = useSearchParams();

  const [showAdd, setShowAdd] = useState(false);
  const [storeId, setStoreId] = useState(searchParams.get("store") ?? "");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [items, setItems] = useState<SaleItem[]>([{ product_id: "", quantity: 1, unit_price: 0 }]);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState("");
  const [fulfillOrder, setFulfillOrder] = useState<any>(null);
  const [fulfilledOrderId, setFulfilledOrderId] = useState<string | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const storeParam = searchParams.get("store");
    const orderParam = searchParams.get("order");
    if (orderParam) {
      handleFulfillOrder(orderParam);
      setSearchParams({}, { replace: true });
    } else if (storeParam && !isPosUser) {
      setStoreId(storeParam); setShowAdd(true); setSearchParams({}, { replace: true });
    }
  }, [searchParams, isPosUser, setSearchParams]);

  const { data: stores } = useQuery({
    queryKey: ["stores-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, outstanding, display_id, store_type_id, customer_id, lat, lng, is_active").order("is_active", { ascending: false }).order("name");
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  useEffect(() => {
    if (isPosUser && stores && stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [isPosUser, stores, storeId]);

  const selectedStore = stores?.find((s: any) => s.id === storeId);
  const selectedStoreTypeId = selectedStore?.store_type_id;

  const { data: allProducts } = useQuery({
    queryKey: ["all-products-for-sale", currentWarehouse?.id, user?.id, recordedFor],
    queryFn: async () => {
      let q = supabase.from("products").select("id, name, base_price, sku, image_url").eq("is_active", true);
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await q;
      if (!data) return [];
      const { data: stockInfo } = await supabase.rpc("check_stock_availability", { p_user_id: user!.id, p_recorded_for: recordedFor || null, p_items: data.map((p: any) => ({ product_id: p.id, quantity: 0 })) } as any) as any;
      const stockMap: Record<string, any> = {};
      (stockInfo as any[])?.forEach((s: any) => { stockMap[s.out_product_id] = s; });
      return data.map((p: any) => ({ ...p, stock: stockMap[p.id]?.out_available_qty || 0, pending_out: stockMap[p.id]?.out_pending_outgoing || 0 }));
    },
    enabled: !!user?.id,
  });

  const { data: storeProducts } = useQuery({
    queryKey: ["store-products-for-sale", selectedStoreTypeId, storeId, user?.id, recordedFor],
    queryFn: async () => {
      if (!selectedStoreTypeId || !storeId) return [];
      const { data: accessData } = await supabase.from("store_type_products").select("product_id, products(id, name, sku, base_price, image_url)").eq("store_type_id", selectedStoreTypeId);
      const productList: any[] = (accessData || []).map((a: any) => a.products).filter(Boolean);
      if (productList.length === 0) return [];
      const { data: typePricing } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", selectedStoreTypeId);
      const tpMap: Record<string, number> = {};
      typePricing?.forEach((p: any) => { tpMap[p.product_id] = Number(p.price); });
      const { data: storePricing } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", storeId);
      const spMap: Record<string, number> = {};
      storePricing?.forEach((p: any) => { spMap[p.product_id] = Number(p.price); });
      const { data: stockInfo } = await supabase.rpc("check_stock_availability", { p_user_id: user!.id, p_recorded_for: recordedFor || null, p_items: productList.map((p: any) => ({ product_id: p.id, quantity: 0 })) } as any) as any;
      const stockMap: Record<string, any> = {};
      (stockInfo as any[])?.forEach((s: any) => { stockMap[s.out_product_id] = s; });
      return productList.map((p: any) => {
        let ep = Number(p.base_price);
        if (tpMap[p.id]) ep = tpMap[p.id];
        if (spMap[p.id]) ep = spMap[p.id];
        return { ...p, effectivePrice: ep, stock: stockMap[p.id]?.out_available_qty || 0, pending_out: stockMap[p.id]?.out_pending_outgoing || 0 };
      });
    },
    enabled: !!storeId && !!selectedStoreTypeId && !!user?.id,
  });

  useEffect(() => {
    if (storeProducts && storeProducts.length > 0 && items.length === 1 && !items[0].product_id) {
      setItems(storeProducts.map((p: any) => ({ product_id: p.id, quantity: 0, unit_price: p.effectivePrice, product_name: p.name, product_image: p.image_url })));
    }
  }, [storeProducts]);

  const { data: pendingOrders } = useQuery({
    queryKey: ["pending-orders-for-store", storeId],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, display_id, order_type, requirement_note, created_at, order_items(id, product_id, quantity, unit_price, products(id, name, sku))").eq("store_id", storeId).eq("status", "pending").order("created_at", { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!storeId && showAdd,
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-credit"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name, credit_limit_kyc, credit_limit_no_kyc");
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-kyc-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase.from("customers").select("id, kyc_status, credit_limit_override");
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: staffUsers } = useQuery({
    queryKey: ["staff-for-behalf"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r: any) => r.user_id) || [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p: any) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(selectedStore?.outstanding || 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const creditLimitInfo = selectedStore && storeTypes && customers && isCreditCheckEnabled
    ? resolveCreditLimit(selectedStore, storeTypes, customers) : null;
  const creditExceeded = creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit;
  const creditWarning = creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit * 0.8 && !creditExceeded;

  const recordSaleMutation = useMutation({
    mutationFn: async (payload: {
      displayId: string; storeId: string; customerId: string;
      effectiveRecordedBy: string; loggedBy: string | null;
      totalAmount: number; cash: number; upi: number;
      outstandingFromSale: number; saleItems: any[]; saleDate: string | null;
    }) => {
      const { data, error } = await supabase.rpc("record_sale", {
        p_display_id: payload.displayId,
        p_store_id: payload.storeId,
        p_customer_id: payload.customerId,
        p_recorded_by: payload.effectiveRecordedBy,
        p_logged_by: payload.loggedBy,
        p_total_amount: payload.totalAmount,
        p_cash_amount: payload.cash,
        p_upi_amount: payload.upi,
        p_outstanding_amount: Math.max(payload.outstandingFromSale, 0),
        p_expected_outstanding: oldOutstanding,
        p_sale_items: payload.saleItems,
        p_created_at: payload.saleDate ? new Date(payload.saleDate).toISOString() : null,
        p_fulfilled_order_id: fulfilledOrderId,
      } as any) as any;
      if (error) throw error;
      return { data: (data as any)?.[0], displayId: payload.displayId };
    },
    onSuccess: (result) => {
      logActivity(user!.id, "Recorded sale", "sale", result.displayId, result.data?.sale_id, { total: totalAmount, store: storeId });
      const pendingCount = pendingOrders?.length || 0;
      toast.success(pendingCount > 0 ? `Sale recorded. ${pendingCount} pending order(s) auto-marked as delivered.` : "Sale recorded successfully");
      const storeName = stores?.find((s: any) => s.id === storeId)?.name || "store";
      getAdminUserIds().then((ids) => {
        const others = ids.filter((id: string) => id !== user!.id);
        if (others.length > 0) sendNotificationToMany(others, { title: "New Sale Recorded", message: `Sale ${result.displayId} of ₹${totalAmount.toLocaleString()} at ${storeName}`, type: "payment", entityType: "sale", entityId: result.data?.sale_id }).catch(() => {});
      });
      setShowAdd(false);
      setFulfilledOrderId(null);
      resetForm();
    },
    onError: (error: any) => {
      if (error.message?.includes("credit_limit_exceeded")) toast.error("Credit limit exceeded.");
      else if (error.message?.includes("insufficient_stock")) toast.error("Insufficient stock.");
      else toast.error(error.message || "Failed to record sale");
    },
    onSettled: (data, variables, context) => {
      const saleData = data?.data
        ? { ...data.data, sale_id: data.data?.sale_id, display_id: data.displayId, store_id: storeId, total_amount: totalAmount, outstanding_amount: outstandingFromSale, created_at: new Date().toISOString() }
        : undefined;
      afterSaleSaved(qc, { storeId, saleData });
    },
  });

  const resetForm = () => {
    setStoreId(isPosUser && stores && stores.length > 0 ? stores[0].id : "");
    setCashAmount(""); setUpiAmount(""); setRecordedFor(""); setSaleDate("");
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const handleStoreChange = (newStoreId: string) => { setStoreId(newStoreId); setItems([{ product_id: "", quantity: 1, unit_price: 0 }]); };

  const addItem = () => { setSelectedProductToAdd(""); setShowAddProductDialog(true); };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof SaleItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "product_id") {
      const p = allProducts?.find((pr: any) => pr.id === value);
      if (p) { updated[idx].unit_price = (p as any).effectivePrice || p.base_price; updated[idx].product_name = p.name; updated[idx].product_image = p.image_url; }
    }
    setItems(updated);
  };

  const addProductToSale = () => {
    if (!selectedProductToAdd) return;
    const product = allProducts?.find((p: any) => p.id === selectedProductToAdd);
    if (product) {
      const existingIdx = items.findIndex(i => i.product_id === product.id);
      if (existingIdx >= 0) { updateItem(existingIdx, "quantity", items[existingIdx].quantity + 1); }
      else { setItems([...items, { product_id: product.id, quantity: 1, unit_price: product.base_price || 0, product_name: product.name, product_image: product.image_url }]); }
      setShowAddProductDialog(false); setSelectedProductToAdd("");
    }
  };

  const handleFulfillOrder = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { data: orderData, error } = await supabase.from("orders").select("*, stores(id, name, store_type_id, customer_id, outstanding), order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))").eq("id", orderId).single();
      if (error) throw error;
      // Pre-fill the sale form with order data
      setStoreId(orderData.store_id);
      setFulfilledOrderId(orderId);
      setShowAdd(true);
      // Pre-fill items from order
      if (orderData.order_items && orderData.order_items.length > 0) {
        const prefilledItems = orderData.order_items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price || item.products?.base_price || 0,
          product_name: item.products?.name || "",
          product_image: item.products?.image_url || null,
        }));
        setItems(prefilledItems);
      }
    } catch (error: any) {
      console.error("Error loading order:", error);
      toast.error("Failed to load order details");
    } finally { setLoadingOrderId(null); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSaleData({ store_id: storeId, items: items.filter(i => i.product_id), cash_amount: cash, upi_amount: upi, total_amount: totalAmount, isPosUser, sale_date: saleDate || null });
    if (!validation.valid) { toast.error(validation.errors[0] || "Validation failed"); return; }
    if (isPosUser && outstandingFromSale !== 0) { toast.error("POS users must record full payment. Outstanding balance not allowed."); return; }

    const customerId = selectedStore?.customer_id;
    if (!customerId) { toast.error("Store has no linked customer"); return; }

    const hasProducts = items.some(i => i.product_id && i.quantity > 0);
    if (hasProducts) {
      const saleItemsForSC = items.filter(i => i.product_id && i.quantity > 0).map(i => ({ product_id: i.product_id, quantity: i.quantity }));
      const { data: stockCheck, error: stockError } = await supabase.rpc("check_stock_availability", { p_user_id: user!.id, p_recorded_for: recordedFor || null, p_items: saleItemsForSC } as any) as any;
      if (stockError) { toast.error(`Stock check failed: ${stockError.message || "Unable to verify stock availability"}.`); return; }
      const insufficient = (Array.isArray(stockCheck) ? stockCheck : []).filter((s: any) => !s.out_available);
      if (insufficient.length > 0) { toast.error(`Insufficient stock for: ${insufficient.map((i: any) => i.out_product_name).join(", ")}`); return; }
    }

    const saleItems = items.filter(i => i.product_id && i.quantity > 0).map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, total_price: i.quantity * i.unit_price }));

    if (!navigator.onLine) {
      const effectiveRecordedBy = recordedFor || user!.id;
      const loggedBy = recordedFor ? user!.id : null;
      const { validateCreditLimitOffline } = await import("@/lib/offlineCreditValidation");
      const creditCheck = await validateCreditLimitOffline(storeId, outstandingFromSale, isAdmin);
      if (!creditCheck.valid) { toast.error(creditCheck.warning || "Credit limit exceeded"); return; }
      if (creditCheck.warning) toast.warning(creditCheck.warning);
      const businessKey = generateBusinessKey("sale", { storeId, customerId, amount: totalAmount, products: saleItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })), timestamp: saleDate || new Date().toISOString() });
      await addToQueue({ id: crypto.randomUUID(), type: "sale", payload: { saleData: { store_id: storeId, customer_id: customerId, recorded_by: effectiveRecordedBy, logged_by: loggedBy, total_amount: totalAmount, cash_amount: cash, upi_amount: upi, outstanding_amount: outstandingFromSale, old_outstanding: oldOutstanding, new_outstanding: newOutstanding, ...(saleDate ? { created_at: new Date(saleDate).toISOString() } : {}) }, saleItems: saleItems, storeUpdate: { outstanding: newOutstanding } }, createdAt: new Date().toISOString(), businessKey, context: { storeOutstandingAtQueueTime: oldOutstanding, customerCreditLimitAtQueueTime: creditCheck.limit, timestampAtQueueTime: new Date().toISOString(), storeId, customerId } } as any);
      toast.warning("You're offline — sale queued and will sync automatically when back online");
      setShowAdd(false); resetForm(); return;
    }

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" }) as any;
    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    recordSaleMutation.mutate({
      displayId, storeId, customerId, effectiveRecordedBy, loggedBy,
      totalAmount, cash, upi, outstandingFromSale, saleItems, saleDate,
    });
  };

  return {
    showAdd, setShowAdd, saving: recordSaleMutation.isPending, storeId, setStoreId, cashAmount, setCashAmount, upiAmount, setUpiAmount,
    recordedFor, setRecordedFor, saleDate, setSaleDate, items, setItems,
    stores: stores || [], allProducts, storeProducts, pendingOrders: pendingOrders || [],
    selectedStore, totalAmount, cash, upi, outstandingFromSale, oldOutstanding, newOutstanding,
    creditLimitInfo, creditExceeded, creditWarning,
    showAddProductDialog, setShowAddProductDialog, selectedProductToAdd, setSelectedProductToAdd,
    addItem, removeItem, updateItem, addProductToSale, resetForm, handleStoreChange, handleAdd,
    handleFulfillOrder, loadingOrderId, fulfillOrder, setFulfillOrder, fulfilledOrderId, setFulfilledOrderId, staffUsers, isAdmin, isPosUser, canRecordBehalf,
  };
}
