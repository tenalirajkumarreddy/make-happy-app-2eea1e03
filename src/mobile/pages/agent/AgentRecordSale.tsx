import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Minus, Plus, ChevronRight, Store as StoreIcon,
  IndianRupee, Banknote, CreditCard, AlertTriangle, ShoppingCart,
  Receipt,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { generateBusinessKey } from "@/lib/offlineQueue";
import { enqueueWithContext } from "@/lib/conflictResolver";
import { useStorePendingOrders } from "@/mobile/hooks/useStorePendingOrders";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { validateCreditLimitOffline } from "@/lib/offlineCreditValidation";
import { checkProximity } from "@/lib/proximity";
import {extractErrorCode, ErrorMessages} from "@/lib/errorCodes";
import { StorePickerSheet, StoreOption } from "@/mobile/components/StorePickerSheet";
import { cn } from "@/lib/utils";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { SaleReceipt } from "@/components/shared/SaleReceipt";
import { useCompanySettings } from "@/hooks/useCompanySettings";

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export function RecordSale({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user, role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const { allowed: canOverridePrice } = usePermission("price_override");
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const { allowed: canBackdate } = usePermission("backdate" as any);
  const { allowed: canRecordSale } = usePermission("record_sale");
  const qc = useQueryClient();
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  useEffect(() => {
    if (preselectStore) {
      setStore(preselectStore);
      setItems([]);
      setCashAmount("");
      setUpiAmount("");
      setRecordedFor("");
      setSaleDate("");
    }
  }, [preselectStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (role === "operator" && !store && user?.id) {
      supabase
        .from("user_roles")
        .select("warehouse_id")
        .eq("user_id", user.id)
        .not("warehouse_id", "is", null)
        .limit(1)
        .single()
        .then(({ data: roleData }) => {
          if (!roleData?.warehouse_id) return;
          supabase
            .from("stores")
            .select("id, name, display_id, photo_url, outstanding, store_type_id, customer_id, lat, lng, address, phone, route_id, is_active")
            .eq("warehouse_id", roleData.warehouse_id)
            .limit(1)
            .then(({ data: posStores }) => {
              if (posStores && posStores.length > 0) {
                setStore(posStores[0] as any);
              }
            });
        });
    }
  }, [role, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-for-behalf-sale", user?.id],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = (roles ?? []).map((r: any) => r.user_id);
      if (staffIds.length === 0) return [];
      const { data: profs } = await (supabase.from("profiles").select("user_id, full_name") as any).in("user_id", staffIds);
      return ((profs ?? []).filter((p: any) => p.user_id !== user?.id) as any[]);
    },
    enabled: canRecordBehalf,
    staleTime: 5 * 60 * 1000,
  });

  const { data: availableProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ["mobile-products-for-sale", store?.store_type_id, store?.id, user?.id, recordedFor],
    queryFn: async () => {
      if (!store?.store_type_id || !store?.id || !user?.id) return [];
      const storeTypeId = store.store_type_id;
      const storeId = store.id;
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);

      type ProductRecord = { id: string; name: string; sku: string | null; base_price: number | null };
      let productList: ProductRecord[] = [];
      if (accessData && accessData.length > 0) {
        productList = accessData
    .map((a: any) => (a.products as ProductRecord | null))
    .filter((p: any): p is ProductRecord => p !== null);
      } else {
        const { data } = await supabase.from("products").select("id, name, base_price, sku").eq("is_active", true);
        productList = (data || []) as ProductRecord[];
      }

      const { data: typePricing } = await (supabase.from("store_type_pricing").select("product_id, price") as any).eq("store_type_id", storeTypeId);
      const typePriceMap: Record<string, number> = {};
      (typePricing ?? []).forEach((p: any) => { typePriceMap[p.product_id] = Number(p.price); });

      const { data: storePricing } = await (supabase.from("store_pricing").select("product_id, price") as any).eq("store_id", storeId);
      const storePriceMap: Record<string, number> = {};
      (storePricing ?? []).forEach((p: any) => { storePriceMap[p.product_id] = Number(p.price); });

      const productIds = productList.map(p => p.id);
      const { data: stockInfo } = await (supabase.rpc("check_stock_availability", {
        p_user_id: user.id,
        p_recorded_for: recordedFor || null,
        p_items: productIds.map(id => ({ product_id: id, quantity: 0 }))
      } as any));

      const stockInfoArr = (stockInfo || []) as unknown as Array<{ out_product_id: string; out_available_qty: number; out_physical_qty: number; out_pending_outgoing: number }>;
      const stockMap: Record<string, typeof stockInfoArr[0]> = {};
      stockInfoArr.forEach((s: any) => {
        stockMap[s.out_product_id] = s;
      });

      return productList.map((p: any) => {
        let effectivePrice = Number(p.base_price);
        if (typePriceMap[p.id]) effectivePrice = typePriceMap[p.id];
        if (storePriceMap[p.id]) effectivePrice = storePriceMap[p.id];
        return {
          ...p,
          effectivePrice,
          stock: stockMap[p.id]?.out_available_qty || 0,
          physical_stock: stockMap[p.id]?.out_physical_qty || 0,
          pending_out: stockMap[p.id]?.out_pending_outgoing || 0,
        };
      });
    },
    enabled: !!store?.store_type_id && !!store?.id && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["mobile-store-types-credit", store?.store_type_id],
    queryFn: async () => {
      if (!store?.store_type_id) return [];
      const { data } = await supabase.from("store_types").select("*");
      return data || [];
    },
    enabled: !!store?.store_type_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: customers } = useQuery({
    queryKey: ["mobile-customers-kyc-sale", store?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").limit(100);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allProducts } = useQuery({
    queryKey: ["mobile-products-search"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: showProductSearch,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pendingOrders } = useStorePendingOrders(store?.id);

  const addItem = (productId: string) => {
    const existing = availableProducts?.find((p) => p.id === productId);
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === productId);
      if (found) return prev.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: productId, quantity: 1, unit_price: existing?.effectivePrice ?? 0 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setItems((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const newQty = Math.max(0, i.quantity + delta);
      return { ...i, quantity: newQty };
    }));
  };

  const setQtyDirect = (productId: string, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === "") { setItems(items.filter((i) => i.product_id !== productId)); return; }
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setItems(items.map((i) => i.product_id === productId ? { ...i, quantity: parsed || 0 } : i));
  };

  const updateUnitPrice = (productId: string, value: string) => {
    setItems((prev) => prev.map((i) => i.product_id === productId ? { ...i, unit_price: Number(value) || 0 } : i));
  };

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = Number(cashAmount) || 0;
  const upi = Number(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(store?.outstanding || 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const { data: settings } = useCompanySettings();
  const isCreditCheckEnabled = settings?.credit_limit_check !== "false";

  const creditLimitInfo = resolveCreditLimit(store as any, storeTypes as any, customers as any);
  const creditExceeded = isCreditCheckEnabled && creditLimitInfo ? newOutstanding > creditLimitInfo.limit : false;
  const creditWarning = isCreditCheckEnabled && creditLimitInfo && !creditExceeded ? newOutstanding > creditLimitInfo.limit * 0.8 : false;

  const saleMutation = useMutation<{ queued: boolean; displayId?: string; saleRow?: Record<string, unknown> }, Error>({
    mutationFn: async () => {
      if (!canRecordSale) throw new Error("You don't have permission to record sales");
      const effectiveRecordedBy = recordedFor || user!.id;
      const loggedBy = recordedFor ? user!.id : null;

      const { data: stockCheck, error: stockError } = await supabase.rpc("check_stock_availability", {
        p_user_id: user!.id,
        p_recorded_for: recordedFor || null,
        p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      if (stockError) {
        throw new Error("Stock check failed. Please try again.");
      }

      const stockRows = Array.isArray(stockCheck) ? stockCheck : [];
      type StockRow = { out_available: boolean; out_product_name: string; out_available_qty: number };
      const insufficient = stockRows.filter((s) => !(s as StockRow).out_available);
      if (insufficient.length > 0) {
        const details = insufficient.map((i) => `${(i as StockRow).out_product_name} (Avail: ${(i as StockRow).out_available_qty})`).join(", ");
        throw new Error(`Insufficient stock: ${details}`);
      }

      const saleData = {
        store_id: store!.id,
        customer_id: store!.customer_id,
        recorded_by: effectiveRecordedBy,
        logged_by: loggedBy,
        total_amount: totalAmount,
        cash_amount: cash,
        upi_amount: upi,
        outstanding_amount: outstandingFromSale,
        old_outstanding: oldOutstanding,
        new_outstanding: newOutstanding,
        ...(saleDate ? { created_at: new Date(saleDate).toISOString() } : {}),
      };
      const saleItems = items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price }));

      if (!navigator.onLine) {
        if (isCreditCheckEnabled) {
          const offlineCredit = await validateCreditLimitOffline(store!.id, outstandingFromSale, isAdmin);
          if (!offlineCredit.valid && !isAdmin) {
            throw new Error(offlineCredit.warning || "Credit limit exceeded. Cannot queue sale offline.");
          }
          if (offlineCredit.exceeded && !isAdmin) {
            throw new Error("Credit limit exceeded. Cannot queue sale offline.");
          }
        }
        const businessKey = generateBusinessKey("sale", {
          storeId: store!.id,
          customerId: store!.customer_id,
          amount: totalAmount,
          products: saleItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          timestamp: new Date().toISOString(),
        });
        await enqueueWithContext({
          id: crypto.randomUUID(),
          type: "sale",
          payload: { saleData, saleItems, storeUpdate: { outstanding: newOutstanding } },
          createdAt: new Date().toISOString(),
          businessKey,
        });
        return { queued: true };
      }

      const { data: generatedDisplayId, error: displayErr } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
      if (displayErr) throw displayErr;

      const displayId = String(generatedDisplayId ?? "");
      const { data: saleResult, error } = await supabase.rpc("record_sale", {
        p_display_id: displayId,
        p_store_id: store!.id,
        p_customer_id: store!.customer_id,
        p_recorded_by: effectiveRecordedBy,
        p_logged_by: loggedBy,
        p_total_amount: totalAmount,
        p_cash_amount: cash,
        p_upi_amount: upi,
        p_outstanding_amount: Math.max(outstandingFromSale, 0),
        p_sale_items: saleItems,
        p_created_at: saleDate ? new Date(saleDate).toISOString() : null,
        p_expected_outstanding: store?.outstanding ?? null,
      });
      if (error) throw error;

      return { queued: false, displayId, saleRow: (saleResult as Array<Record<string, unknown>> | null)?.[0] };
    },
    onSuccess: ({ queued, displayId, saleRow }) => {
      if (queued) {
        toast.warning("Offline — sale queued and will sync automatically");
        resetSale();
        return;
      }

      logActivity(user!.id, "Recorded sale", "sale", String(displayId), String(saleRow?.sale_id ?? ""), { total: totalAmount, store: store!.id });
      getAdminUserIds().then((ids) => {
        const others = ids.filter((id) => id !== user!.id);
        if (others.length > 0) {
          sendNotificationToMany(others, {
            title: "New Sale Recorded",
            message: `₹${totalAmount.toLocaleString()} sale at ${store!.name} (${String(displayId)})`,
            type: "system",
            entityType: "sale",
            entityId: String(displayId),
          });
        }
      });

      const recordedStoreId = store?.id;
      toast.success("Sale recorded successfully");
      if (saleRow?.sale_id) setLastSaleId(String(saleRow.sale_id));
      resetSale();
      afterSaleSaved(qc, { isMobile: true, storeId: recordedStoreId });
    },
    onError: (error) => {
      const code = extractErrorCode(error);
      if (code && ErrorMessages[code]) {
        toast.error(ErrorMessages[code]);
        return;
      }
      toast.error(error.message || "Failed to record sale. Please try again.");
    },
  });

  const handleSubmit = () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    if (totalAmount === 0) { toast.error("Sale total cannot be zero"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }
    if (outstandingFromSale < 0) { toast.error("Payment exceeds sale total. Reduce payment amount."); return; }
    if (role === "operator" && outstandingFromSale !== 0) {
      toast.error("Operator sales require full payment. Cash + UPI must equal total amount.");
      return;
    }
    if (creditExceeded && !isAdmin) { toast.error("Credit limit exceeded. Increase payment or reduce items."); return; }
    if (!user?.id) { toast.error("Authentication required"); return; }

    saleMutation.mutate();
  };

  const saving = saleMutation.isPending;

  const resetSale = () => {
    setStore(null);
    setItems([]);
    setCashAmount("");
    setUpiAmount("");
    setRecordedFor("");
    setSaleDate("");
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-2xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20"
              : "border-dashed border-border dark:border-border hover:border-blue-200 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          )}
          onClick={() => setStorePickerOpen(true)}
          aria-label={store ? `Change store, currently ${store.name}` : "Select a store"}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-blue-100 dark:bg-blue-900/40" : "bg-slate-100 dark:bg-slate-800"
          )}>
            <StoreIcon className={cn("h-5 w-5", store ? "text-blue-500" : "text-muted-foreground")} />
          </div>
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground dark:text-white truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm flex-1 font-medium">Tap to select store...</span>
          )}
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-blue-400" : "text-slate-300")} />
        </button>
      </div>

      {store && (
        <div className="px-4">
          <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3.5 flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Current Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : oldOutstanding < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                {oldOutstanding > 0 ? `-₹${oldOutstanding.toLocaleString("en-IN")}` : oldOutstanding < 0 ? `+₹${Math.abs(oldOutstanding).toLocaleString("en-IN")}` : "₹0"}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {store && (pendingOrders ?? []).length > 0 && (
        <div className="px-4">
          <button
            onClick={() => setShowOrders(true)}
            className="w-full rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3.5 flex items-center gap-3 text-left transition-all active:scale-[0.98]"
          >
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{(pendingOrders ?? []).length} Pending Order{(pendingOrders ?? []).length > 1 ? "s" : ""}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Tap to view and fulfill</p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
          </button>
        </div>
      )}

      {showOrders && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowOrders(false)}>
          <div className="bg-card dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground dark:text-white">Pending Orders</h3>
              <button onClick={() => setShowOrders(false)} className="text-muted-foreground hover:text-slate-600">✕</button>
            </div>
            {(pendingOrders ?? []).map((order: any) => {
              const ord = order as { id: string; display_id: string | null; created_at: string; order_items: Array<{ id: string; product_id: string; quantity: number; unit_price: number; products: { name: string } | null }> | null };
              return (
              <div key={ord.id} className="rounded-xl border border-border dark:border-border p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{ord.display_id}</span>
                  <span className="text-xs text-muted-foreground">{new Date(ord.created_at).toLocaleDateString()}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {ord.order_items?.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.products?.name || "Product"} × {item.quantity}</span>
                      <span>{item.quantity > 0 ? `₹${(item.quantity * (Number(item.unit_price) || 0)).toLocaleString("en-IN")}` : ""}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const orderItems = ord.order_items?.map((item) => ({
                      product_id: item.product_id,
                      quantity: item.quantity,
                      unit_price: Number(item.unit_price) || 0,
                    })) || [];
                    setItems(orderItems);
                    setShowOrders(false);
                    toast.success(`Order ${ord.display_id} items added to cart`);
                  }}
                  className="w-full rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors active:scale-[0.98]"
                >
                  Fulfill This Order
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}

      <div className="px-4">
        <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-border dark:border-border bg-card dark:bg-slate-900 px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers || [])?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          {canBackdate && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Sale Date (optional)</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="mt-1 h-10 rounded-xl border-border dark:border-border"
              />
            </div>
          )}
        </div>
      </div>

      {store && (
        <div className="px-4">
          <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2.5">Products</p>
          {loadingProducts ? (
            <div className="flex justify-center items-center py-8 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="text-sm text-muted-foreground">Loading products...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {(availableProducts || []).map((product: any) => {
                const inCart = items.find((i) => i.product_id === product.id);
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "rounded-2xl border-2 transition-all overflow-hidden",
                      inCart
                        ? "border-blue-200 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10"
                        : "border-border dark:border-border bg-card dark:bg-slate-800"
                    )}
                  >
                    <div className="flex items-center p-3.5 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground dark:text-white truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            ₹{product.effectivePrice.toLocaleString("en-IN")}
                          </p>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-muted-foreground font-medium">
                            Stock: {product.stock}
                          </span>
                          {product.pending_out > 0 && (
                            <span className="text-xs text-amber-500 font-medium">
                              ({product.pending_out} pending)
                            </span>
                          )}
                        </div>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground font-medium">
                            ₹{(inCart.quantity * inCart.unit_price).toLocaleString("en-IN")}
                          </span>
                          <button
                            className="h-10 w-10 rounded-xl border-2 border-border dark:border-border flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors active:scale-90"
                            onClick={() => updateQty(product.id, -1)}
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            <Minus className="h-4.5 w-4.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <Input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            value={inCart.quantity}
                            onChange={(e) => setQtyDirect(product.id, e.target.value)}
                            className="h-10 w-14 text-sm font-bold text-center rounded-xl border-border dark:border-border"
                          />
                          <button
                            className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all"
                            onClick={() => updateQty(product.id, 1)}
                            aria-label={`Increase ${product.name} quantity`}
                          >
                            <Plus className="h-4.5 w-4.5 text-white" />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all shadow-sm"
                          onClick={() => addItem(product.id)}
                          aria-label={`Add ${product.name} to cart`}
                        >
                          <Plus className="h-4.5 w-4.5 text-white" />
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

      <div className="px-4 mt-2">
        <button
          onClick={() => setShowProductSearch(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border dark:border-border py-3 text-sm text-muted-foreground dark:text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-colors active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Other Product
        </button>
      </div>

      {showProductSearch && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowProductSearch(false)}>
          <div className="bg-card dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground dark:text-white">Search Products</h3>
              <button onClick={() => setShowProductSearch(false)} className="text-muted-foreground hover:text-slate-600">✕</button>
            </div>
            {(allProducts || [])
              .filter((p: any) => !items.find((i) => i.product_id === p.id))
              .map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => { addItem(p.id); setShowProductSearch(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-700 dark:text-slate-300">{p.name}</span>
                  <span className="text-xs text-muted-foreground">₹{Number(p.base_price).toLocaleString("en-IN")}</span>
                </button>
              ))}
            {(allProducts || []).filter((p: any) => !items.find((i) => i.product_id === p.id)).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">All products already added</p>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="px-4 space-y-4">
          <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest">Order Total</p>
              <p className="text-2xl font-bold text-foreground dark:text-white">₹{totalAmount.toLocaleString("en-IN")}</p>
            </div>
            <div className="space-y-2">
              {items.map((item: any) => {
                const p = availableProducts?.find((pr) => pr.id === item.product_id);
                return (
                  <div key={item.product_id} className="text-xs text-muted-foreground dark:text-muted-foreground">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs truncate max-w-[55%]">{p?.name ?? "Product"}</span>
                      {canOverridePrice ? (
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            = ₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs">₹</span>
                            <Input
                              type="number"
                              min="0"
                              value={item.unit_price}
                              onChange={(e) => updateUnitPrice(item.product_id, e.target.value)}
                              className="h-6 w-16 text-xs rounded-lg px-1"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                          ₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">× {item.quantity}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2.5">Payment Received</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                  <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Cash</Label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-border dark:border-border"
                  />
                </div>
              </div>
              <div className="rounded-2xl bg-card dark:bg-slate-800 border border-border dark:border-border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CreditCard className="h-3.5 w-3.5 text-violet-500" />
                  <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">UPI</Label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-border dark:border-border"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={cn(
            "rounded-2xl p-4 border-2",
            outstandingFromSale > 0
              ? "border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10"
              : "border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/50 dark:bg-emerald-900/10"
          )}>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
                <span>Existing balance</span>
                <span className={cn("font-semibold", oldOutstanding > 0 ? "text-red-500" : oldOutstanding < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                  {oldOutstanding > 0 ? `-₹${oldOutstanding.toLocaleString("en-IN")}` : oldOutstanding < 0 ? `+₹${Math.abs(oldOutstanding).toLocaleString("en-IN")}` : "₹0"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">From this sale</span>
                <span className={cn("font-semibold", outstandingFromSale > 0 ? "text-red-500" : outstandingFromSale < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                  {outstandingFromSale > 0 ? `-₹${outstandingFromSale.toLocaleString("en-IN")}` : outstandingFromSale < 0 ? `+₹${Math.abs(outstandingFromSale).toLocaleString("en-IN")}` : "₹0"}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border dark:border-border pt-2 mt-1">
                <span className="text-slate-700 dark:text-slate-200">New balance</span>
                <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : newOutstanding < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                  {newOutstanding > 0 ? `-₹${newOutstanding.toLocaleString("en-IN")}` : newOutstanding < 0 ? `+₹${Math.abs(newOutstanding).toLocaleString("en-IN")}` : "₹0"}
                </span>
              </div>
            </div>
          </div>

          {creditExceeded && (
            <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-700 dark:text-red-400">
                Credit limit exceeded ({creditLimitInfo?.source}). Reduce items or collect more payment.
              </span>
            </div>
          )}

          {creditWarning && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Approaching credit limit ({creditLimitInfo?.source}).
              </span>
            </div>
          )}

          <button
            className={cn(
              "w-full h-14 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
              saving
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98]"
            )}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Receipt className="h-5 w-5" />
                Record Sale · ₹{totalAmount.toLocaleString("en-IN")}
              </>
            )}
          </button>
        </div>
      )}

      <SaleReceipt
        saleId={lastSaleId || ""}
        open={!!lastSaleId}
        onClose={() => setLastSaleId(null)}
      />

      <StorePickerSheet
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        onSelect={(s) => {
          setStore(s);
          setItems([]);
          setCashAmount("");
          setUpiAmount("");
        }}
      />
    </div>
  );
}
