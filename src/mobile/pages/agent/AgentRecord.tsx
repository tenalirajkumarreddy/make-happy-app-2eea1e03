import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Minus, Plus, ChevronRight, Store as StoreIcon,
  IndianRupee, Banknote, CreditCard, AlertTriangle, ShoppingCart,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { addToQueue } from "@/lib/offlineQueue";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { validateCreditLimitOffline } from "@/lib/offlineCreditValidation";
import { StorePickerSheet, StoreOption } from "@/mobile/components/StorePickerSheet";
import { cn } from "@/lib/utils";
import { SaleReceipt } from "@/components/shared/SaleReceipt";

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

// ─── Record Sale ─────────────────────────────────────────────────────────────
function RecordSale({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user, role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const { allowed: canOverridePrice } = usePermission("price_override");
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
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

  // Operator: auto-select first store from their warehouse (the POS store)
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
      const staffIds = roles?.map((r) => r.user_id) || [];
      if (staffIds.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const { data: availableProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ["mobile-products-for-sale", store?.store_type_id, store?.id, user?.id, recordedFor],
    queryFn: async () => {
      const storeTypeId = store!.store_type_id!;
      const storeId = store!.id;
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);

      let productList: any[];
      if (accessData && accessData.length > 0) {
        productList = accessData.map((a: any) => a.products).filter(Boolean);
      } else {
        const { data } = await supabase.from("products").select("id, name, base_price, sku").eq("is_active", true);
        productList = data || [];
      }

      const { data: typePricing } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", storeTypeId);
      const typePriceMap: Record<string, number> = {};
      typePricing?.forEach((p: any) => { typePriceMap[p.product_id] = Number(p.price); });

      const { data: storePricing } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", storeId);
      const storePriceMap: Record<string, number> = {};
      storePricing?.forEach((p: any) => { storePriceMap[p.product_id] = Number(p.price); });

      // NEW: Fetch stock availability for all products
      const productIds = productList.map(p => p.id);
      const { data: stockInfo } = await supabase.rpc("check_stock_availability", {
        p_user_id: user!.id,
        p_recorded_for: recordedFor || null,
        p_items: productIds.map(id => ({ product_id: id, quantity: 0 })) // Check for 0 to just get available counts
      });

      const stockMap: Record<string, any> = {};
      (stockInfo as any[])?.forEach(s => {
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
          pending_out: stockMap[p.id]?.out_pending_outgoing || 0
        };
      });
    },
    enabled: !!store?.store_type_id && !!store?.id && !!user?.id,
  });

  const addItem = (productId: string) => {
    const exists = items.find((i) => i.product_id === productId);
    if (exists) {
      setItems(items.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      const p = availableProducts?.find((pr: any) => pr.id === productId);
      if (p) setItems([...items, { product_id: productId, quantity: 1, unit_price: p.effectivePrice }]);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    setItems(items.map((i) => {
      if (i.product_id !== productId) return i;
      const newQty = Math.max(0, i.quantity + delta);
      if (newQty === 0) return null as any;
      return { ...i, quantity: newQty };
    }).filter(Boolean));
  };

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(store?.outstanding ?? 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const { data: storeTypes } = useQuery({
    queryKey: ["mobile-store-types-credit"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, credit_limit_kyc, credit_limit_no_kyc");
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["mobile-customers-kyc-sale"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, kyc_status, credit_limit_override");
      return data || [];
    },
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ["mobile-products-search", showProductSearch],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, base_price")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: showProductSearch,
  });

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["mobile-pending-orders-for-store", store?.id],
    queryFn: async () => {
      if (!store?.id) return [];
      const { data: orders } = await supabase
        .from("orders")
        .select("id, display_id, created_at, order_items(id, product_id, quantity, unit_price, products(id, name))")
        .eq("store_id", store.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return orders || [];
    },
    enabled: !!store?.id,
  });

  const creditLimitInfo = store && storeTypes && customers
    ? resolveCreditLimit(store, storeTypes as any[], customers as any[])
    : null;

  const creditExceeded = !!(creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit);
  const creditWarning = !!(creditLimitInfo && creditLimitInfo.limit > 0 && newOutstanding > creditLimitInfo.limit * 0.8 && !creditExceeded);

  const updateUnitPrice = (productId: string, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setItems(items.map((item) => item.product_id === productId ? { ...item, unit_price: parsed } : item));
  };

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    if (totalAmount === 0) { toast.error("Sale total cannot be zero"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }
    if (role === "operator" && outstandingFromSale !== 0) {
      toast.error("Operator sales require full payment. Cash + UPI must equal total amount.");
      return;
    }
    if (creditExceeded && !isAdmin) { toast.error("Credit limit exceeded. Increase payment or reduce items."); return; }

    setSaving(true);

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    // Check stock availability before sale
    const { data: stockCheck, error: stockError } = await supabase.rpc("check_stock_availability", {
      p_user_id: user!.id,
      p_recorded_for: recordedFor || null,
      p_items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
    });

    if (stockError) {
      toast.error("Stock check failed. Please try again.");
      setSaving(false);
      return;
    }

    const stockRows = Array.isArray(stockCheck) ? stockCheck : [];
    const insufficient = stockRows.filter((s: any) => !s.out_available);
    if (insufficient.length > 0) {
      const details = insufficient.map((i: any) => `${i.out_product_name} (Avail: ${i.out_available_qty})`).join(", ");
      toast.error(`Insufficient stock: ${details}`);
      setSaving(false);
      return;
    }

    const saleData = {
      store_id: store.id,
      customer_id: store.customer_id,
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
      const offlineCredit = await validateCreditLimitOffline(store.id, outstandingFromSale, isAdmin);
      if (!offlineCredit.valid && !isAdmin) {
        toast.error(offlineCredit.warning || "Credit limit exceeded. Cannot queue sale offline.");
        setSaving(false);
        return;
      }
      if (offlineCredit.exceeded && !isAdmin) {
        toast.error("Credit limit exceeded. Cannot queue sale offline.");
        setSaving(false);
        return;
      }
      await addToQueue({
        id: crypto.randomUUID(), type: "sale",
        payload: { saleData, saleItems, storeUpdate: { outstanding: newOutstanding } },
        createdAt: new Date().toISOString(),
      });
      toast.warning("Offline — sale queued and will sync automatically");
      setSaving(false);
      resetSale();
      return;
    }

    const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
    const { data: saleResult, error } = await (supabase as any).rpc("record_sale", {
      p_display_id: displayId,
      p_store_id: store.id,
      p_customer_id: store.customer_id,
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
        toast.error("Insufficient stock. Please check inventory.");
      } else {
        toast.error(error.message);
      }
      setSaving(false);
      return;
    }

    const saleRow = (saleResult as any)?.[0];
    logActivity(user!.id, "Recorded sale", "sale", String(displayId), saleRow?.sale_id, { total: totalAmount, store: store.id });
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "New Sale Recorded",
          message: `₹${totalAmount.toLocaleString()} sale at ${store.name} (${String(displayId)})`,
          type: "system",
          entityType: "sale",
          entityId: String(displayId),
        });
      }
    });

    toast.success("Sale recorded successfully");
    setSaving(false);
    if (saleRow?.sale_id) setLastSaleId(saleRow.sale_id);
    resetSale();
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
  };

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
      {/* Store selector */}
      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20"
              : "border-dashed border-border border hover:border-blue-200 dark:hover:border-blue-700 hover:bg-muted/50"
          )}
          onClick={() => setStorePickerOpen(true)}
          aria-label={store ? `Change store, currently ${store.name}` : "Select a store"}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-blue-100 dark:bg-blue-900/40" : "bg-muted"
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
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-blue-400" : "text-muted-foreground/40")} />
        </button>
      </div>

      {/* Store balance info */}
      {store && (
        <div className="px-4">
          <div className="rounded-xl bg-card border border-border border p-3.5 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Current Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{oldOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending orders */}
      {store && pendingOrders.length > 0 && (
        <div className="px-4">
          <button
            onClick={() => setShowOrders(true)}
            className="w-full rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3.5 flex items-center gap-3 text-left transition-all active:scale-[0.98]"
          >
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{pendingOrders.length} Pending Order{pendingOrders.length > 1 ? "s" : ""}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Tap to view and fulfill</p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
          </button>
        </div>
      )}

      {/* Pending orders modal */}
      {showOrders && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowOrders(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground dark:text-white">Pending Orders</h3>
              <button onClick={() => setShowOrders(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            {pendingOrders.map((order: any) => (
              <div key={order.id} className="rounded-xl border border-border border p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground">{order.display_id}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {order.order_items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.products?.name || "Product"} × {item.quantity}</span>
                      <span>{item.quantity > 0 ? `₹${(item.quantity * (Number(item.unit_price) || 0)).toLocaleString("en-IN")}` : ""}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const orderItems = order.order_items?.map((item: any) => ({
                      product_id: item.product_id,
                      quantity: item.quantity,
                      unit_price: Number(item.unit_price) || 0,
                    })) || [];
                    setItems(orderItems);
                    setShowOrders(false);
                    toast.success(`Order ${order.display_id} items added to cart`);
                  }}
                  className="w-full rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors active:scale-[0.98]"
                >
                  Fulfill This Order
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry options */}
      <div className="px-4">
        <div className="rounded-xl bg-card border border-border border p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-border border bg-card px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers as any[])?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Sale Date (optional)</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="mt-1 h-10 rounded-xl border-border border"
              />
            </div>
          )}
        </div>
      </div>

      {/* Products */}
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
                      "rounded-xl border-2 transition-all overflow-hidden",
                      inCart
                        ? "border-blue-200 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10"
                        : "border-border border bg-card"
                    )}
                  >
                    <div className="flex items-center p-3.5 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground dark:text-white truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            ₹{product.effectivePrice.toLocaleString("en-IN")}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            Stock: {product.stock}
                          </span>
                          {product.pending_out > 0 && (
                            <span className="text-[10px] text-amber-500 font-medium">
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
                            className="h-10 w-10 rounded-xl border-2 border-border border flex items-center justify-center hover:bg-muted/80 transition-colors active:scale-90"
                            onClick={() => updateQty(product.id, -1)}
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            <Minus className="h-4.5 w-4.5 text-muted-foreground" />
                          </button>
                          <span className="text-sm font-bold text-foreground dark:text-white w-7 text-center">
                            {inCart.quantity}
                          </span>
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

      {/* Non-associated product search */}
      <div className="px-4 mt-2">
        <button
          onClick={() => setShowProductSearch(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border border py-3 text-sm text-muted-foreground dark:text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-colors active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Other Product
        </button>
      </div>

      {/* Product search dialog */}
      {showProductSearch && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowProductSearch(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground dark:text-white">Search Products</h3>
              <button onClick={() => setShowProductSearch(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            {allProducts
              .filter((p: any) => !items.find((i) => i.product_id === p.id))
              .map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => { addItem(p.id); setShowProductSearch(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground">₹{Number(p.base_price).toLocaleString("en-IN")}</span>
                </button>
              ))}
            {allProducts.filter((p: any) => !items.find((i) => i.product_id === p.id)).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">All products already added</p>
            )}
          </div>
        </div>
      )}

      {/* Cart & payment */}
      {items.length > 0 && (
        <div className="px-4 space-y-4">
          {/* Cart summary */}
          <div className="rounded-xl bg-card border border-border border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest">Order Total</p>
              <p className="text-2xl font-bold text-foreground dark:text-white">₹{totalAmount.toLocaleString("en-IN")}</p>
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const p = availableProducts?.find((pr: any) => pr.id === item.product_id);
                return (
                  <div key={item.product_id} className="flex justify-between items-center gap-2 text-xs text-muted-foreground dark:text-muted-foreground">
                    <span className="flex-1">{p?.name ?? "Product"} × {item.quantity}</span>
                    {canOverridePrice ? (
                      <Input
                        type="number"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => updateUnitPrice(item.product_id, e.target.value)}
                        className="h-7 w-24 text-xs rounded-lg"
                      />
                    ) : (
                      <span className="font-semibold text-foreground">
                        ₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment inputs */}
          <div>
            <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2.5">Payment Received</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-card border border-border border p-3">
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
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-border border"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-card border border-border border p-3">
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
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-border border"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Balance summary */}
          <div className={cn(
            "rounded-xl p-4 border-2",
            outstandingFromSale > 0
              ? "border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10"
              : "border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/50 dark:bg-emerald-900/10"
          )}>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
                <span>Existing balance</span>
                <span className="font-semibold">₹{oldOutstanding.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">From this sale</span>
                <span className={cn("font-semibold", outstandingFromSale > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {outstandingFromSale >= 0 ? "+" : ""}₹{outstandingFromSale.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border border pt-2 mt-1">
                <span className="text-foreground">New balance</span>
                <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                  ₹{newOutstanding.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {creditExceeded && (
            <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-700 dark:text-red-400">
                Credit limit exceeded ({creditLimitInfo?.source}). Reduce items or collect more payment.
              </span>
            </div>
          )}

          {creditWarning && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Approaching credit limit ({creditLimitInfo?.source}).
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            className={cn(
              "w-full h-14 rounded-xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
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

// ─── Record Payment ───────────────────────────────────────────────────────────
function RecordPayment({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user } = useAuth();
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [txnDate, setTxnDate] = useState("");

  useEffect(() => {
    if (preselectStore) {
      setStore(preselectStore);
      setCashAmount("");
      setUpiAmount("");
      setNotes("");
      setRecordedFor("");
      setTxnDate("");
    }
  }, [preselectStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-for-behalf-payment", user?.id],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r) => r.user_id) || [];
      if (staffIds.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const totalPayment = cash + upi;
  const oldOutstanding = Number(store?.outstanding ?? 0);
  const newOutstanding = Math.max(0, oldOutstanding - totalPayment);

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (totalPayment <= 0) { toast.error("Enter payment amount"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }

    setSaving(true);

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    const txData = {
      store_id: store.id,
      customer_id: store.customer_id,
      recorded_by: effectiveRecordedBy,
      logged_by: loggedBy,
      cash_amount: cash,
      upi_amount: upi,
      total_amount: totalPayment,
      old_outstanding: oldOutstanding,
      new_outstanding: newOutstanding,
      notes: notes || null,
      ...(txnDate ? { created_at: new Date(txnDate).toISOString() } : {}),
    };

    if (!navigator.onLine) {
      await addToQueue({
        id: crypto.randomUUID(),
        type: "transaction",
        payload: { txData, storeUpdate: { outstanding: newOutstanding } },
        createdAt: new Date().toISOString(),
      });
      toast.warning("Offline — payment queued and will sync automatically");
      setSaving(false);
      resetPayment();
      return;
    }

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" }) as any;

    const { error } = await supabase.rpc("record_transaction", {
      p_display_id: String(displayId),
      p_store_id: store.id,
      p_customer_id: store.customer_id,
      p_recorded_by: effectiveRecordedBy,
      p_logged_by: loggedBy ?? undefined,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_notes: notes ?? undefined,
      p_created_at: txnDate ? new Date(txnDate).toISOString() : undefined,
    }) as any;

    if (error) { toast.error(error.message); setSaving(false); return; }

    if (txnDate) {
      await supabase.rpc("recalc_running_balances", { p_store_id: store.id });
    }

    logActivity(user!.id, "Recorded transaction", "transaction", String(displayId), undefined, { total: totalPayment, store: store.id });
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "Payment Collected",
          message: `₹${totalPayment.toLocaleString()} collected from ${store.name} (${String(displayId)})`,
          type: "payment",
          entityType: "transaction",
          entityId: String(displayId),
        });
      }
    });

    toast.success("Payment recorded");
    setSaving(false);
    resetPayment();
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
  };

  const resetPayment = () => {
    setStore(null);
    setCashAmount("");
    setUpiAmount("");
    setNotes("");
    setRecordedFor("");
    setTxnDate("");
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Store selector */}
      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10"
              : "border-dashed border-border border hover:border-emerald-200 dark:hover:border-emerald-700 hover:bg-muted/50"
          )}
          onClick={() => setStorePickerOpen(true)}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"
          )}>
            <StoreIcon className={cn("h-5 w-5", store ? "text-emerald-500" : "text-muted-foreground")} />
          </div>
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground dark:text-white truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm flex-1 font-medium">Tap to select store...</span>
          )}
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-emerald-400" : "text-muted-foreground/40")} />
        </button>
      </div>

      {/* Balance info */}
      {store && (
        <div className="px-4">
          <div className="rounded-xl bg-card border border-border border p-3.5 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Outstanding Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{oldOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment inputs */}
      <div className="px-4">
        <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2.5">Payment Amount</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-card border border-border border p-3">
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
                className="pl-7 h-11 rounded-xl text-base font-semibold border-border border"
              />
            </div>
          </div>
          <div className="rounded-xl bg-card border border-border border p-3">
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
                className="pl-7 h-11 rounded-xl text-base font-semibold border-border border"
              />
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="rounded-xl bg-card border border-border border px-3 py-2.5">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. cheque no., reference...)"
              className="border-0 p-0 h-auto text-sm bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-2 rounded-xl bg-card border border-border border p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-border border bg-card px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers as any[])?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground dark:text-muted-foreground font-semibold">Payment Date (optional)</Label>
            <Input
              type="date"
              value={txnDate}
              onChange={(e) => setTxnDate(e.target.value)}
              className="mt-1 h-10 rounded-xl border-border border"
            />
          </div>
        </div>
      </div>

      {/* Summary + submit */}
      {store && totalPayment > 0 && (
        <div className="px-4 space-y-3">
          <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-200 dark:border-emerald-700/40 p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
              <span>Collecting</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{totalPayment.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground dark:text-muted-foreground">
              <span>Current balance</span>
              <span className="font-semibold">₹{oldOutstanding.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-emerald-200 dark:border-emerald-700/40 pt-2">
              <span className="text-foreground">New balance</span>
              <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{newOutstanding.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {totalPayment > oldOutstanding && oldOutstanding > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Payment exceeds outstanding balance
              </span>
            </div>
          )}

          <button
            className={cn(
              "w-full h-14 rounded-xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
              saving
                ? "bg-emerald-400 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
            )}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 className="h-5 w-5 animate-spin" /><span>Recording...</span></>
            ) : (
              <>
                <IndianRupee className="h-5 w-5" />
                Collect ₹{totalPayment.toLocaleString("en-IN")}
              </>
            )}
          </button>
        </div>
      )}

      <StorePickerSheet
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        onSelect={setStore}
      />
    </div>
  );
}

// ─── Combined Record Page ─────────────────────────────────────────────────────
interface AgentRecordProps {
  preselectStore?: StoreOption | null;
  preselectTab?: "sale" | "payment";
  allowSale?: boolean;
  allowPayment?: boolean;
}

export function AgentRecord({
  preselectStore,
  preselectTab,
  allowSale = true,
  allowPayment = true,
}: AgentRecordProps) {
  const initialTab = !allowSale ? "payment" : (preselectTab ?? "sale");
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (!allowPayment) {
      setActiveTab("sale");
      return;
    }
    if (!allowSale) {
      setActiveTab("payment");
      return;
    }
    if (preselectStore && preselectTab) setActiveTab(preselectTab);
  }, [preselectStore?.id, preselectTab, allowSale, allowPayment]);

  return (
    <div className="pb-4">
      {/* Tab selector header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mb-3">Action</p>
        <div className="bg-card/15 backdrop-blur-sm rounded-xl p-1 flex gap-1">
          {allowSale && (
            <button
              onClick={() => setActiveTab("sale")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                activeTab === "sale"
                  ? "bg-card text-blue-700 shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-card/10"
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              Record Sale
            </button>
          )}
          {allowPayment && (
            <button
              onClick={() => setActiveTab("payment")}
              className={cn(
                `${allowSale ? "flex-1" : "w-full"} flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all`,
                activeTab === "payment"
                  ? "bg-card text-emerald-700 shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-card/10"
              )}
            >
              <Banknote className="h-4 w-4" />
              Collect Payment
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {allowSale && activeTab === "sale" && <RecordSale preselectStore={preselectStore} />}
        {allowPayment && activeTab === "payment" && <RecordPayment preselectStore={preselectStore} />}
      </div>
    </div>
  );
}
