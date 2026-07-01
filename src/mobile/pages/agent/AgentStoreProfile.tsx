import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation2,
  Package,
  Phone,
  Store,
  Wallet,
  ShoppingCart,
  Receipt,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { timeAgo, formatDate } from "@/lib/utils";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { useMarkVisit } from "@/mobile/hooks/useMarkVisit";
import { useLiveStoreBalance } from "@/hooks/useLiveStoreBalance";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";

interface Props {
  store: StoreOption;
  onBack: () => void;
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
}

interface StoreProfileRow {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  outstanding: number;
  opening_balance: number;
  created_at: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  route_id: string | null;
  store_type_id: string | null;
  last_activity_at: string | null;
  customers: { name: string; phone: string | null } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

export function AgentStoreProfile({ store, onBack, onGoRecord }: Props) {
  const { user } = useAuth();
  const { markVisit, isVisiting } = useMarkVisit();
  const liveOutstanding = useLiveStoreBalance(store.id);

  const { data: storeRow, isLoading } = useQuery({
    queryKey: ["mobile-store-profile", store.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, opening_balance, created_at, address, phone, lat, lng, route_id, store_type_id, last_activity_at, customers(name, phone), store_types(name), routes(name)")
        .eq("id", store.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StoreProfileRow | null) || null;
    },
    enabled: !!store.id,
// Always fetch fresh data for live store profile
  });

  const currentStore: StoreOption = useMemo(() => ({
    ...store,
    ...(storeRow || {}),
    customers: storeRow?.customers || store.customers || null,
    store_types: storeRow?.store_types || store.store_types || null,
    routes: storeRow?.routes || store.routes || null,
  }), [store, storeRow]);

  const storeTypeId = storeRow?.store_type_id || null;

  const { data: storeProducts } = useQuery({
    queryKey: ["mobile-store-products", store.id, storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) {
        const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
        return data || [];
      }
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);
      if (accessData && accessData.length > 0) {
        return accessData.map((a: any) => a.products).filter(Boolean);
      }
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!storeRow,
});

  const { data: typeP } = useQuery({
    queryKey: ["mobile-store-type-pricing", storeTypeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", storeTypeId!);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!storeTypeId,
});

  const { data: storeP } = useQuery({
    queryKey: ["mobile-store-pricing", store.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", store.id);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!store.id,
});

  const getPrice = (productId: string, basePrice: number) => {
    if (storeP && productId in storeP) return { price: storeP[productId], label: "store" as const };
    if (typeP && productId in typeP) return { price: typeP[productId], label: "type" as const };
    return { price: basePrice, label: "base" as const };
  };

  // ── Ledger queries ──────────────────────────────────────────────────────

  const { data: ledgerSales = [] } = useQuery({
    queryKey: ["store-ledger-sales", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, created_at, display_id, total_amount, cash_amount, upi_amount, old_outstanding, new_outstanding, status, notes, recorded_by, is_fully_returned, deleted_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!store.id,
  });

  const { data: ledgerTxns = [] } = useQuery({
    queryKey: ["store-ledger-txns", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, created_at, display_id, total_amount, cash_amount, upi_amount, old_outstanding, new_outstanding, notes, recorded_by, is_fully_returned, deleted_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!store.id,
  });

  const { data: ledgerReturns = [] } = useQuery({
    queryKey: ["store-ledger-returns", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_returns")
        .select("id, created_at, display_id, return_amount, reason, original_transaction_id")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!store.id,
  });

  const { data: ledgerAdj = [] } = useQuery({
    queryKey: ["store-ledger-adj", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("balance_adjustments")
        .select("id, created_at, old_outstanding, new_outstanding, adjustment_amount, reason, adjusted_by")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!store.id,
  });

  const storeOpeningBalance = storeRow?.opening_balance ?? 0;
  const storeCreatedAt = storeRow?.created_at ?? new Date().toISOString();

  type LedgerEntry = {
    id: string;
    type: "sale" | "payment" | "correction" | "return";
    date: string;
    display_id: string;
    description: string;
    total_amount: number;
    cash_amount: number;
    upi_amount: number;
    outstanding: number;
    delta: number;
    notes: string | null;
    recorded_by: string;
    raw: any;
  };

  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];

    const returnByTxnId = new Map<string, any>();
    for (const r of ledgerReturns) {
      returnByTxnId.set(r.original_transaction_id, r);
    }

    const activeSales = ledgerSales.filter((s: any) => !s.deleted_at);
    const activeTxns = ledgerTxns.filter((t: any) => !t.deleted_at);

    for (const s of activeSales) {
      const isCancelled = s.status === "cancelled";
      entries.push({
        id: s.id,
        type: "sale",
        date: s.created_at,
        display_id: s.display_id,
        description: `Sale #${s.display_id}`,
        total_amount: Number(s.total_amount),
        cash_amount: Number(s.cash_amount || 0),
        upi_amount: Number(s.upi_amount || 0),
        outstanding: 0,
        notes: s.notes,
        recorded_by: s.recorded_by,
        raw: s,
        delta: isCancelled || s.is_fully_returned ? 0 : (Number(s.total_amount) - Number(s.cash_amount || 0) - Number(s.upi_amount || 0)),
      });
    }

    for (const t of activeTxns) {
      const ret = returnByTxnId.get(t.id);
      const isReturned = t.is_fully_returned;
      entries.push({
        id: t.id,
        type: "payment",
        date: t.created_at,
        display_id: t.display_id,
        description: `Payment #${t.display_id}`,
        total_amount: Number(t.total_amount),
        cash_amount: Number(t.cash_amount || 0),
        upi_amount: Number(t.upi_amount || 0),
        outstanding: isReturned ? Number(t.old_outstanding) : Number(t.new_outstanding),
        notes: isReturned && ret ? (ret.reason?.replace(/_/g, " ") || t.notes) : t.notes,
        recorded_by: t.recorded_by,
        raw: { ...t, returnInfo: ret || null },
        delta: isReturned ? 0 : -Number(t.total_amount),
      });
    }

    for (const adj of ledgerAdj) {
      entries.push({
        id: adj.id,
        type: "correction",
        date: adj.created_at,
        display_id: "",
        description: `Balance Adjustment: ₹${Number(adj.old_outstanding).toLocaleString("en-IN")} → ₹${Number(adj.new_outstanding).toLocaleString("en-IN")}`,
        total_amount: Number(adj.adjustment_amount),
        cash_amount: 0,
        upi_amount: 0,
        outstanding: 0,
        notes: adj.reason,
        recorded_by: adj.adjusted_by,
        raw: adj,
        delta: Number(adj.new_outstanding),
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = storeOpeningBalance;
    for (const entry of entries) {
      if (entry.type === "correction") {
        runningBalance = entry.delta;
      } else {
        runningBalance += entry.delta;
      }
      entry.outstanding = runningBalance;
    }

    entries.unshift({
      id: "__opening__",
      type: "correction" as const,
      date: storeCreatedAt,
      display_id: "",
      description: "Opening Balance",
      total_amount: storeOpeningBalance,
      cash_amount: 0,
      upi_amount: 0,
      outstanding: storeOpeningBalance,
      notes: null,
      recorded_by: "",
      raw: null,
      delta: 0,
    });

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  }, [ledgerSales, ledgerTxns, ledgerReturns, ledgerAdj, storeOpeningBalance, storeCreatedAt]);

  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);

  const handleNavigate = () => {
    if (currentStore.lat != null && currentStore.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`, "_system");
      return;
    }

    if (currentStore.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStore.address)}`, "_system");
    }
  };

  const handleCall = () => {
    const phone = currentStore.phone || (currentStore.customers as any)?.phone || null;
    if (!phone) return;
    window.open(`tel:${phone}`, "_system");
  };

  const handleMarkVisited = async () => {
    if (!user) return;
    await markVisit({
      storeId: currentStore.id,
      storeName: currentStore.name,
      userId: user.id,
    });
  };

  const phone = currentStore.phone || (currentStore.customers as any)?.phone || null;
  const canNavigate = (currentStore.lat != null && currentStore.lng != null) || !!currentStore.address;
  const qc = useQueryClient();

  const onRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mobile-store-profile", store.id] }),
      qc.invalidateQueries({ queryKey: ["mobile-store-products", store.id] }),
      qc.invalidateQueries({ queryKey: ["mobile-store-type-pricing"] }),
      qc.invalidateQueries({ queryKey: ["mobile-store-pricing", store.id] }),
      qc.invalidateQueries({ queryKey: ["store-ledger-sales", store.id] }),
      qc.invalidateQueries({ queryKey: ["store-ledger-txns", store.id] }),
      qc.invalidateQueries({ queryKey: ["store-ledger-returns", store.id] }),
      qc.invalidateQueries({ queryKey: ["store-ledger-adj", store.id] }),
    ]);
  }, [qc, store.id]);

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh,
  });

  return (
    <div {...pullHandlers} className="pb-6">
      <PullRefreshIndicator isRefreshing={isRefreshing} isPulling={isPulling} pullDistance={pullDistance} threshold={threshold} />
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <button
          type="button"
          className="h-11 px-3 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mt-3">Store Profile</p>
        <h2 className="text-white text-xl font-bold mt-0.5">{currentStore.name}</h2>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="h-44 w-full bg-slate-100 dark:bg-slate-700">
            {currentStore.photo_url ? (
              <img src={currentStore.photo_url} alt={currentStore.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Store className="h-10 w-10 text-slate-400" />
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-white">{currentStore.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{currentStore.display_id}</p>
              </div>
              <p className={`text-base font-bold ${liveOutstanding > 0 ? "text-red-500" : liveOutstanding < 0 ? "text-emerald-500" : "text-slate-500"}`}>
                {liveOutstanding < 0 ? '-' : ''}₹{Math.abs(liveOutstanding).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="flex gap-2 mt-2 flex-wrap">
              {currentStore.store_types?.name && (
                <Badge variant="outline" className="text-xs font-semibold">{currentStore.store_types.name}</Badge>
              )}
              {currentStore.routes?.name && (
                <Badge variant="outline" className="text-xs font-semibold">{currentStore.routes.name}</Badge>
              )}
              {currentStore.last_activity_at && <Badge variant="secondary" className="text-2xs font-medium">{timeAgo(currentStore.last_activity_at)}</Badge>}
            </div>

            {currentStore.address && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{currentStore.address}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-11 rounded-xl text-xs" onClick={handleNavigate} disabled={!canNavigate}>
                <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
                Navigate
              </Button>
              <Button variant="outline" size="sm" className="h-11 rounded-xl text-xs" onClick={handleCall} disabled={!phone}>
                <Phone className="h-3.5 w-3.5 mr-1.5" />
                Call
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Quick Actions</p>
          {isLoading ? (
            <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onGoRecord(currentStore, "sale")}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              >
                <ShoppingCart className="h-5 w-5 text-white" />
                <span className="text-xs font-bold text-white text-center">Record Sale</span>
              </button>
              <button
                onClick={() => onGoRecord(currentStore, "payment")}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
              >
                <Wallet className="h-5 w-5 text-emerald-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center">Record Transaction</span>
              </button>
              <button
                onClick={handleMarkVisited}
                disabled={isVisiting}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
              >
                {isVisiting ? <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">Mark Visited</span>
              </button>
            </div>
          )}
        </div>

        {/* Ledger Section - Prominent, always visible */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-violet-900/20 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 text-indigo-500" />
              Ledger
              <span className="ml-auto text-indigo-600 dark:text-indigo-400 font-bold">{ledgerEntries.length > 0 ? `${ledgerEntries.length} entries` : ""}</span>
            </p>
          </div>
          {ledgerEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <Receipt className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No Ledger Entries</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center">Transactions and payments will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {ledgerEntries.map((entry) => {
                const isOpening = entry.id === "__opening__";
                const isSale = entry.type === "sale";
                const isPayment = entry.type === "payment";
                const isInactive = isSale && (entry.raw?.is_fully_returned || entry.raw?.status === "cancelled");
                const isPaymentInactive = isPayment && (entry.raw?.is_fully_returned || entry.raw?.status === "cancelled");
                const isDimmed = isInactive || isPaymentInactive;

                let badgeLabel = isOpening ? "OPENING" : isSale ? "SALE" : isPayment ? "PAYMENT" : "ADJUSTMENT";
                if (isInactive) badgeLabel = "CANCELLED";
                else if (isPaymentInactive) badgeLabel = "RETURNED";

                let badgeColor = isOpening ? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300" :
                  isDimmed ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                  isSale ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                  isPayment ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                  "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400";

                const isCredit = isPayment || (isOpening && entry.total_amount < 0);
                const isDebit = isSale || (isOpening && entry.total_amount > 0) || (!isOpening && entry.type === "correction");

                return (
                  <div
                    key={entry.id}
                    onClick={() => !isOpening && setSelectedLedgerEntry(entry)}
                    className={`px-4 py-3 ${isOpening ? "" : "active:bg-slate-50 dark:active:bg-slate-800/50 cursor-pointer"} ${isDimmed ? "opacity-50" : ""} transition-colors`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badgeLabel}</span>
                          <span className="text-2xs text-slate-400 dark:text-slate-500">{formatDate(entry.date)}</span>
                        </div>
                        <p className={`text-sm font-semibold mt-1.5 ${isDimmed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-white"}`}>
                          {entry.display_id ? `#${entry.display_id}` : isOpening ? "Opening Balance" : entry.description}
                        </p>
                        {entry.notes && (
                          <p className="text-2xs text-slate-400 mt-0.5 italic truncate">{entry.notes}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isDimmed ? "line-through text-slate-400 dark:text-slate-500" : isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {isCredit ? "+" : "−"}₹{Math.abs(entry.total_amount).toLocaleString("en-IN")}
                        </p>
                        <p className={`text-xs font-semibold mt-0.5 ${entry.outstanding > 0 ? "text-red-500" : entry.outstanding < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                          Bal: {entry.outstanding < 0 ? "−" : ""}₹{Math.abs(entry.outstanding).toLocaleString("en-IN")}
                        </p>
                        {isSale && !isInactive && (entry.cash_amount + entry.upi_amount) > 0 && (
                          <p className="text-2xs text-emerald-500 font-medium mt-0.5">
                            Paid: ₹{(entry.cash_amount + entry.upi_amount).toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Products Section - Redesigned */}
        {storeProducts && storeProducts.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-amber-500" />
                Products & Pricing
                <span className="ml-auto text-amber-600 dark:text-amber-400 font-bold">{storeProducts.length}</span>
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {storeProducts.map((p: any) => {
                const { price, label } = getPrice(p.id, Number(p.base_price));
                const priceDiff = label !== "base" ? Math.round((price - Number(p.base_price)) / Number(p.base_price) * 100) : null;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-2xs font-mono text-slate-400">{p.sku}</span>
                        {label !== "base" && (
                          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${
                            label === "store" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                          }`}>
                            {label === "store" ? "Store" : "Type"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">₹{price.toLocaleString("en-IN")}</p>
                      {priceDiff !== null && (
                        <span className={`text-2xs font-semibold ${priceDiff > 0 ? "text-red-500" : "text-emerald-500"}`}>
                          {priceDiff > 0 ? "+" : ""}{priceDiff}%
                        </span>
                      )}
                      {label === "base" && (
                        <span className="text-2xs font-medium text-slate-400 capitalize">Base</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Entry Detail Sheet */}
        {selectedLedgerEntry && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setSelectedLedgerEntry(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {selectedLedgerEntry.type === "sale" ? "Sale Details" : selectedLedgerEntry.type === "payment" ? "Payment Details" : "Entry Details"}
                </p>
                <button onClick={() => setSelectedLedgerEntry(null)} className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{selectedLedgerEntry.display_id}</span>
                  <span className="text-xs text-muted-foreground">{new Date(selectedLedgerEntry.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">₹{selectedLedgerEntry.total_amount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash</span>
                    <span>₹{selectedLedgerEntry.cash_amount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UPI</span>
                    <span>₹{selectedLedgerEntry.upi_amount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t pt-1.5 mt-1.5">
                    <span>Balance After</span>
                    <span className={selectedLedgerEntry.outstanding > 0 ? "text-destructive" : selectedLedgerEntry.outstanding < 0 ? "text-success" : ""}>
                      ₹{Math.abs(selectedLedgerEntry.outstanding).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
                {selectedLedgerEntry.notes && (
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm italic">{selectedLedgerEntry.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
