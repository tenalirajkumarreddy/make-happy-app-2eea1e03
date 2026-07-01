import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, RotateCcw, Loader2, CheckCircle2, XCircle,
  Clock, ChevronRight, AlertTriangle, ArrowLeft, Warehouse,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

// These MUST match the DB check constraint on stock_transfers.return_reason
const RETURN_REASONS = [
  { value: "unsold",   label: "Unsold Stock",    desc: "Items not sold on route" },
  { value: "excess",   label: "Excess / Surplus", desc: "More stock than needed" },
  { value: "damaged",  label: "Damaged",          desc: "Physically damaged items" },
  { value: "expiry",   label: "Near Expiry",      desc: "Approaching expiry date" },
  { value: "other",    label: "Other",            desc: "Any other reason" },
] as const;

type ReturnReasonValue = typeof RETURN_REASONS[number]["value"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  amount_value: number;
  warehouse_id: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
  } | null;
}

interface ReturnRequest {
  id: string;
  display_id: string;
  product_id: string;
  quantity: number;
  damaged_qty: number | null;
  return_reason: string | null;
  damage_notes: string | null;
  status: string;
  requested_at: string;
  products: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = "list" | "form" | "status";

// ─── Status badge config ──────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    icon: <Clock className="h-3 w-3" />,
  },
  completed: {
    label: "Approved",
    color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    icon: <XCircle className="h-3 w-3" />,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentReturnSheet({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [view, setView] = useState<View>("list");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [damagedQty, setDamagedQty] = useState("");
  // reasonCode = the enum value sent to DB; notes = free-text description
  const [reasonCode, setReasonCode] = useState<ReturnReasonValue | "">("");
  const [notes, setNotes] = useState("");
  const [damageNotes, setDamageNotes] = useState("");

  // Reset when sheet opens
  useEffect(() => {
    if (open) { setView("list"); resetForm(); }
  }, [open]);

  function resetForm() {
    setSelectedItem(null);
    setReturnQty("");
    setDamagedQty("");
    setReasonCode("");
    setNotes("");
    setDamageNotes("");
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: stockItems = [], isLoading: stockLoading } = useQuery({
    queryKey: ["mobile-agent-stock-holdings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`id, product_id, quantity, amount_value, warehouse_id,
                 product:products(id, name, sku, unit, base_price)`)
        .eq("user_id", user!.id)
        .gt("quantity", 0);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
      })) as StockItem[];
    },
    enabled: !!user && open,
  });

  const { data: hasPendingReturn } = useQuery({
    queryKey: ["agent-pending-return-check", user?.id, selectedItem?.product_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("stock_transfers")
        .select("id", { count: "exact", head: true })
        .eq("requested_by", user!.id)
        .eq("product_id", selectedItem!.product_id)
        .eq("is_return", true)
        .eq("status", "pending");
      return (count ?? 0) > 0;
    },
    enabled: !!user && !!selectedItem,
  });

  const { data: myReturns = [], isLoading: returnsLoading } = useQuery({
    queryKey: ["agent-my-return-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`id, display_id, product_id, quantity, damaged_qty,
                 return_reason, damage_notes, status, requested_at,
                 products(name)`)
        .eq("requested_by", user!.id)
        .eq("is_return", true)
        .order("requested_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as ReturnRequest[];
    },
    enabled: !!user && open,
  });

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const submitReturn = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(returnQty);
      const dmgQty = parseFloat(damagedQty || "0");
      if (!selectedItem || isNaN(qty) || qty <= 0) throw new Error("Invalid quantity");
      if (dmgQty > qty) throw new Error("Damaged quantity cannot exceed return quantity");
      if (!reasonCode) throw new Error("Please select a return reason");

      // Build the description: combine reason label + optional free-text notes
      const reasonLabel = RETURN_REASONS.find(r => r.value === reasonCode)?.label ?? reasonCode;
      const fullDescription = notes.trim()
        ? `${reasonLabel}: ${notes.trim()}`
        : reasonLabel;

      const combinedNotes = [
        damageNotes.trim() ? `Damage: ${damageNotes.trim()}` : null,
        notes.trim() ? `Notes: ${notes.trim()}` : null
      ].filter(Boolean).join(" | ") || null;

      const { data, error } = await supabase.rpc("request_agent_return", {
        p_product_id:   selectedItem.product_id,
        p_quantity:     qty,
        p_damaged_qty:  dmgQty,
        p_reason:       reasonCode,          // enum value → satisfies DB constraint
        p_damage_notes: combinedNotes,
        p_warehouse_id: null,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to submit return");
      return { ...data, fullDescription };
    },
    onSuccess: (data) => {
      toast.success(`Return request ${data.display_id} submitted`);
      qc.invalidateQueries({ queryKey: ["mobile-agent-stock-holdings"] });
      qc.invalidateQueries({ queryKey: ["agent-my-return-requests"] });
      qc.invalidateQueries({ queryKey: ["agent-pending-return-check"] });
      resetForm();
      setView("status");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit return request");
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────────

  const parsedQty = parseFloat(returnQty);
  const parsedDmg = parseFloat(damagedQty || "0");
  const maxQty = selectedItem?.quantity ?? 0;
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0 && parsedQty <= maxQty;
  const isValidDmg = isNaN(parsedDmg) || parsedDmg <= parsedQty;
  const canSubmit = isValidQty && isValidDmg && !!reasonCode && !hasPendingReturn;
  const pendingCount = myReturns.filter((r) => r.status === "pending").length;

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderList() {
    if (stockLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      );
    }

    if (stockItems.length === 0) {
      return (
        <div className="text-center py-16 px-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Package className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No stock in hand</p>
          <p className="text-xs text-slate-500 mt-1">You have no items to return</p>
        </div>
      );
    }

    return (
      <div className="space-y-2 px-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-1 pb-2">
          Select a product to return to warehouse
        </p>
        {stockItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setSelectedItem(item); setView("form"); }}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-200 hover:bg-orange-50/40 dark:hover:bg-orange-900/10 transition-all text-left active:scale-[0.98]"
          >
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                {item.product?.name ?? "Unknown"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {item.product?.sku ?? ""}
                {item.product?.unit ? ` · ${item.product.unit}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{item.quantity}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">in hand</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderForm() {
    if (!selectedItem) return null;
    const { product } = selectedItem;

    return (
      <div className="px-4 space-y-4">
        {/* Product header */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50">
          <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{product?.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedItem.quantity} units available · ₹{Number(selectedItem.amount_value || 0).toLocaleString("en-IN")} value
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Warehouse className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">Warehouse</span>
          </div>
        </div>

        {/* Pending warning */}
        {hasPendingReturn && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              A pending return already exists for this product. Wait for it to be processed.
            </p>
          </div>
        )}

        {/* Return Quantity */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Return Quantity <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              min="1"
              max={maxQty}
              step="1"
              value={returnQty}
              onChange={(e) => setReturnQty(e.target.value)}
              placeholder={`Max ${maxQty}`}
              className={cn(
                "h-12 text-base font-bold pr-14",
                returnQty && !isValidQty && "border-red-400 focus-visible:ring-red-400"
              )}
            />
            <button
              type="button"
              onClick={() => setReturnQty(String(maxQty))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              All
            </button>
          </div>
          {returnQty && !isValidQty && (
            <p className="text-xs text-red-500">
              {parsedQty <= 0 ? "Quantity must be greater than 0" : `Cannot exceed ${maxQty}`}
            </p>
          )}
        </div>

        {/* Damaged Quantity */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Damaged Quantity
            <span className="text-xs font-normal text-slate-500 ml-1">(optional)</span>
          </Label>
          <Input
            type="number"
            min="0"
            max={parsedQty || maxQty}
            step="1"
            value={damagedQty}
            onChange={(e) => setDamagedQty(e.target.value)}
            placeholder="0 — leave blank if none"
            className={cn(
              "h-12 text-base",
              damagedQty && !isValidDmg && "border-red-400 focus-visible:ring-red-400"
            )}
          />
          {damagedQty && !isValidDmg && (
            <p className="text-xs text-red-500">Damaged quantity cannot exceed return quantity</p>
          )}
          {parsedDmg > 0 && isValidDmg && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              <span>{parsedDmg} unit{parsedDmg > 1 ? "s" : ""} will be logged as wastage on approval</span>
            </div>
          )}
        </div>

        {/* Damage notes — only if damaged > 0 */}
        {parsedDmg > 0 && (
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Damage Description
              <span className="text-xs font-normal text-slate-500 ml-1">(describe the damage)</span>
            </Label>
            <Textarea
              value={damageNotes}
              onChange={(e) => setDamageNotes(e.target.value)}
              placeholder="e.g. Broken seal, water damage, expired…"
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        )}

        {/* Return Reason — enum picker */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Return Reason <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {RETURN_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReasonCode(r.value)}
                className={cn(
                  "flex flex-col items-start p-3 rounded-xl border text-left transition-all active:scale-[0.97]",
                  reasonCode === r.value
                    ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
                )}
              >
                <span className={cn(
                  "text-xs font-bold",
                  reasonCode === r.value
                    ? "text-orange-700 dark:text-orange-300"
                    : "text-slate-700 dark:text-slate-200"
                )}>
                  {r.label}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {r.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Optional free-text notes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Additional Notes
            <span className="text-xs font-normal text-slate-500 ml-1">(optional)</span>
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details for the warehouse team…"
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {/* Summary */}
        {isValidQty && reasonCode && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 p-3.5 space-y-1.5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Return</span>
              <span className="font-semibold text-slate-800 dark:text-white">{parsedQty} × {product?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Reason</span>
              <span className="font-semibold text-slate-800 dark:text-white">
                {RETURN_REASONS.find(r => r.value === reasonCode)?.label}
              </span>
            </div>
            {parsedDmg > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-orange-600 dark:text-orange-400">Damaged</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{parsedDmg} units → wastage</span>
              </div>
            )}
            {parsedQty - parsedDmg > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 dark:text-emerald-400">Good stock</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{parsedQty - parsedDmg} units → warehouse</span>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full h-12 text-base font-semibold rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
          disabled={!canSubmit || submitReturn.isPending || !!hasPendingReturn}
          onClick={() => submitReturn.mutate()}
        >
          {submitReturn.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</>
          ) : (
            <><RotateCcw className="h-4 w-4 mr-2" />Submit Return Request</>
          )}
        </Button>
      </div>
    );
  }

  function renderStatus() {
    if (returnsLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      );
    }

    if (myReturns.length === 0) {
      return (
        <div className="text-center py-16 px-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <RotateCcw className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No return requests</p>
          <p className="text-xs text-slate-500 mt-1">Your return history will appear here</p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5 px-4">
        {myReturns.map((r) => {
          const cfg = statusConfig[r.status] ?? statusConfig.pending;
          const reasonLabel = RETURN_REASONS.find(x => x.value === r.return_reason)?.label ?? r.return_reason;
          return (
            <div
              key={r.id}
              className="p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                    {r.products?.name ?? "Product"}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{r.display_id}</p>
                </div>
                <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0", cfg.color)}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span>Qty: <strong className="text-slate-700 dark:text-slate-300">{r.quantity}</strong></span>
                {r.damaged_qty != null && r.damaged_qty > 0 && (
                  <span className="text-orange-500">Damaged: <strong>{r.damaged_qty}</strong></span>
                )}
                {reasonLabel && (
                  <span>Reason: <strong className="text-slate-700 dark:text-slate-300">{reasonLabel}</strong></span>
                )}
              </div>
              {r.status === "rejected" && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <XCircle className="h-3 w-3" />
                  <span>Check with your manager for details</span>
                </div>
              )}
              <p className="text-xs text-slate-400">
                {new Date(r.requested_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90vh] rounded-t-3xl !p-0 flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-0 shrink-0">
          <SheetTitle className="flex items-center gap-2.5 text-base">
            {(view === "form" || view === "status") && (
              <button
                onClick={() => {
                  if (view === "form") { resetForm(); setView("list"); }
                  else setView("list");
                }}
                className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors mr-0.5 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
              <RotateCcw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="truncate">
              {view === "list"
                ? "Return Stock to Warehouse"
                : view === "form"
                ? selectedItem?.product?.name ?? "Return Stock"
                : "My Return Requests"}
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Tab bar (list + status views only) */}
        {view !== "form" && (
          <div className="flex gap-1 mx-4 mt-3 mb-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                view === "list"
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              New Request
            </button>
            <button
              onClick={() => setView("status")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                view === "status"
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              My Requests
              {pendingCount > 0 && (
                <span className="h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-6 mt-2">
          {view === "list" && renderList()}
          {view === "form" && renderForm()}
          {view === "status" && renderStatus()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
