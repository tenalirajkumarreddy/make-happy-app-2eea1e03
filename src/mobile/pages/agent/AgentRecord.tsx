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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { addToQueue } from "@/lib/offlineQueue";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { StorePickerSheet, StoreOption } from "@/mobile/components/StorePickerSheet";
import { cn } from "@/lib/utils";

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

// ─── Record Sale ─────────────────────────────────────────────────────────────
function RecordSale({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user, role } = useAuth();
  const { allowed: canOverridePrice } = usePermission("price_override");
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [saleDate, setSaleDate] = useState("");

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
    queryKey: ["mobile-products-for-sale", store?.store_type_id, store?.id],
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

      return productList.map((p: any) => {
        let effectivePrice = Number(p.base_price);
        if (typePriceMap[p.id]) effectivePrice = typePriceMap[p.id];
        if (storePriceMap[p.id]) effectivePrice = storePriceMap[p.id];
        return { ...p, effectivePrice };
      });
    },
    enabled: !!store?.store_type_id && !!store?.id,
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

  // Validation before showing confirmation
  const validateAndConfirm = () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    if (totalAmount === 0) { toast.error("Sale total cannot be zero"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }
    if (role === "pos" && outstandingFromSale !== 0) {
      toast.error("POS sales require full payment. Cash + UPI must equal total amount.");
      return;
    }
    if (creditExceeded) { toast.error("Credit limit exceeded. Increase payment or reduce items."); return; }
    
    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    setShowConfirmDialog(false);

    setSaving(true);

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    if (role === "agent" && store) {
      const { data: locSetting } = await supabase.from("company_settings").select("value").eq("key", "location_validation").maybeSingle();
      if (locSetting?.value === "true") {
        const { checkProximity } = await import("@/lib/proximity");
        const result = await checkProximity(store.lat ?? null, store.lng ?? null);
        if (!result.withinRange) { toast.error(result.message); setSaving(false); return; }
        if (result.skippedNoGps) toast.warning("Store has no GPS — location check skipped");
      }
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
      await addToQueue({ id: crypto.randomUUID(), type: "sale", payload: { saleData, saleItems, storeUpdate: { outstanding: newOutstanding } }, createdAt: new Date().toISOString() });
      toast.warning("Offline — sale queued and will sync automatically");
      setSaving(false);
      resetSale();
      return;
    }

    const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
    const { error } = await (supabase as any).rpc("record_sale", {
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

    if (error) { toast.error(error.message); setSaving(false); return; }

    logActivity(user!.id, "Recorded sale", "sale", String(displayId), undefined, { total: totalAmount, store: store.id });
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
    }).catch((error) => {
      console.error("Failed to send sale notification to admins:", error);
    });

    toast.success("Sale recorded successfully");
    setSaving(false);
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
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-2xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20"
              : "border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          )}
          onClick={() => setStorePickerOpen(true)}
          aria-label={store ? `Change store, currently ${store.name}` : "Select a store"}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-blue-100 dark:bg-blue-900/40" : "bg-slate-100 dark:bg-slate-800"
          )}>
            <StoreIcon className={cn("h-5 w-5", store ? "text-blue-500" : "text-slate-400")} />
          </div>
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{store.name}</p>
              <p className="text-xs text-slate-400">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-slate-400 text-sm flex-1 font-medium">Tap to select store...</span>
          )}
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-blue-400" : "text-slate-300")} />
        </button>
      </div>

      {/* Store balance info */}
      {store && (
        <div className="px-4">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3.5 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Current Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{oldOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entry options */}
      <div className="px-4">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers as any[])?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Sale Date (optional)</Label>
            <Input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="mt-1 h-10 rounded-xl border-slate-200 dark:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Products */}
      {store && (
        <div className="px-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Products</p>
          {loadingProducts ? (
            <div className="flex justify-center items-center py-8 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="text-sm text-slate-400">Loading products...</span>
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
                        : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800"
                    )}
                  >
                    <div className="flex items-center p-3.5 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{product.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          ₹{product.effectivePrice.toLocaleString("en-IN")} each
                        </p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400 font-medium">
                            ₹{(inCart.quantity * inCart.unit_price).toLocaleString("en-IN")}
                          </span>
                          <button
                            className="h-8 w-8 rounded-xl border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            onClick={() => updateQty(product.id, -1)}
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                          </button>
                          <span className="text-sm font-bold text-slate-800 dark:text-white w-7 text-center">
                            {inCart.quantity}
                          </span>
                          <button
                            className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors"
                            onClick={() => updateQty(product.id, 1)}
                            aria-label={`Increase ${product.name} quantity`}
                          >
                            <Plus className="h-3.5 w-3.5 text-white" />
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

      {/* Cart & payment */}
      {items.length > 0 && (
        <div className="px-4 space-y-4">
          {/* Cart summary */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Order Total</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">₹{totalAmount.toLocaleString("en-IN")}</p>
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const p = availableProducts?.find((pr: any) => pr.id === item.product_id);
                return (
                  <div key={item.product_id} className="flex justify-between items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
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
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Payment Received</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                  <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Cash</Label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CreditCard className="h-3.5 w-3.5 text-violet-500" />
                  <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">UPI</Label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 h-11 rounded-xl text-base font-semibold border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Balance summary */}
          <div className={cn(
            "rounded-2xl p-4 border-2",
            outstandingFromSale > 0
              ? "border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10"
              : "border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/50 dark:bg-emerald-900/10"
          )}>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Existing balance</span>
                <span className="font-semibold">₹{oldOutstanding.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">From this sale</span>
                <span className={cn("font-semibold", outstandingFromSale > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {outstandingFromSale >= 0 ? "+" : ""}₹{outstandingFromSale.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 dark:border-slate-600 pt-2 mt-1">
                <span className="text-slate-700 dark:text-slate-200">New balance</span>
                <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                  ₹{newOutstanding.toLocaleString("en-IN")}
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

          {/* Submit */}
          <button
            className={cn(
              "w-full h-14 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
              saving
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98]"
            )}
            onClick={validateAndConfirm}
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

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-sm mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Sale</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Please review before recording:</p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Store:</span>
                    <span className="font-medium">{store?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Items:</span>
                    <span className="font-medium">{items.length} products</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-bold text-blue-600">₹{totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cash:</span>
                    <span>₹{cash.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>UPI:</span>
                    <span>₹{upi.toLocaleString("en-IN")}</span>
                  </div>
                  {outstandingFromSale > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Outstanding:</span>
                      <span>₹{outstandingFromSale.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={saving}>
              {saving ? "Recording..." : "Confirm Sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

    const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" });
    const { error } = await supabase.from("transactions").insert({
      display_id: String(displayId),
      ...txData,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("stores").update({ outstanding: newOutstanding }).eq("id", store.id);

    if (txnDate) {
      const { data: storeRow } = await supabase.from("stores").select("opening_balance").eq("id", store.id).single();
      let runBal = Number(storeRow?.opening_balance || 0);
      const [{ data: allSales }, { data: allTxns }] = await Promise.all([
        supabase.from("sales").select("id, created_at, total_amount, cash_amount, upi_amount").eq("store_id", store.id).order("created_at", { ascending: true }),
        supabase.from("transactions").select("id, created_at, total_amount").eq("store_id", store.id).order("created_at", { ascending: true }),
      ]);
      const timeline = [
        ...(allSales || []).map((s: any) => ({ type: "sale", id: s.id, date: s.created_at, delta: Number(s.total_amount) - Number(s.cash_amount) - Number(s.upi_amount) })),
        ...(allTxns || []).map((t: any) => ({ type: "txn", id: t.id, date: t.created_at, delta: -Number(t.total_amount) })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (const entry of timeline) {
        const oldBal = runBal;
        runBal += entry.delta;
        if (entry.type === "sale") {
          await supabase.from("sales").update({ old_outstanding: oldBal, new_outstanding: runBal }).eq("id", entry.id);
        } else {
          await supabase.from("transactions").update({ old_outstanding: oldBal, new_outstanding: runBal }).eq("id", entry.id);
        }
      }
      await supabase.from("stores").update({ outstanding: runBal }).eq("id", store.id);
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
    }).catch((error) => {
      console.error("Failed to send payment notification to admins:", error);
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
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Select Store</p>
        <button
          className={cn(
            "w-full border-2 rounded-2xl p-4 flex items-center gap-3 text-left transition-all",
            store
              ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10"
              : "border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          )}
          onClick={() => setStorePickerOpen(true)}
        >
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            store ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-slate-100 dark:bg-slate-800"
          )}>
            <StoreIcon className={cn("h-5 w-5", store ? "text-emerald-500" : "text-slate-400")} />
          </div>
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{store.name}</p>
              <p className="text-xs text-slate-400">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-slate-400 text-sm flex-1 font-medium">Tap to select store...</span>
          )}
          <ChevronRight className={cn("h-4 w-4 shrink-0", store ? "text-emerald-400" : "text-slate-300")} />
        </button>
      </div>

      {/* Balance info */}
      {store && (
        <div className="px-4">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3.5 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Outstanding Balance</p>
              <p className={cn("text-xl font-bold mt-0.5", oldOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{oldOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
            {store.customers?.name && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Customer</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{store.customers.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment inputs */}
      <div className="px-4">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Payment Amount</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Banknote className="h-3.5 w-3.5 text-emerald-500" />
              <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Cash</Label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <Input
                type="number"
                min="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0"
                className="pl-7 h-11 rounded-xl text-base font-semibold border-slate-200 dark:border-slate-600"
              />
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <CreditCard className="h-3.5 w-3.5 text-violet-500" />
              <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">UPI</Label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <Input
                type="number"
                min="0"
                value={upiAmount}
                onChange={(e) => setUpiAmount(e.target.value)}
                placeholder="0"
                className="pl-7 h-11 rounded-xl text-base font-semibold border-slate-200 dark:border-slate-600"
              />
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2.5">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. cheque no., reference...)"
              className="border-0 p-0 h-auto text-sm bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 space-y-2.5">
          {canRecordBehalf && (
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Record For</Label>
              <select
                value={recordedFor || "self"}
                onChange={(e) => setRecordedFor(e.target.value === "self" ? "" : e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
              >
                <option value="self">Self</option>
                {(staffUsers as any[])?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name || "Staff"}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Payment Date (optional)</Label>
            <Input
              type="date"
              value={txnDate}
              onChange={(e) => setTxnDate(e.target.value)}
              className="mt-1 h-10 rounded-xl border-slate-200 dark:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Summary + submit */}
      {store && totalPayment > 0 && (
        <div className="px-4 space-y-3">
          <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-200 dark:border-emerald-700/40 p-4 space-y-2">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Collecting</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{totalPayment.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Current balance</span>
              <span className="font-semibold">₹{oldOutstanding.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-emerald-200 dark:border-emerald-700/40 pt-2">
              <span className="text-slate-700 dark:text-slate-200">New balance</span>
              <span className={cn("text-base", newOutstanding > 0 ? "text-red-500" : "text-emerald-500")}>
                ₹{newOutstanding.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {totalPayment > oldOutstanding && oldOutstanding > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Payment exceeds outstanding balance
              </span>
            </div>
          )}

          <button
            className={cn(
              "w-full h-14 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg",
              saving
                ? "bg-emerald-400 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
            )}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
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
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-1 flex gap-1">
          {allowSale && (
            <button
              onClick={() => setActiveTab("sale")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                activeTab === "sale"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-white/10"
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
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-white/10"
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
