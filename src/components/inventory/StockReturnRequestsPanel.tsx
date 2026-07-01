import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RotateCcw, Loader2, CheckCircle2, XCircle, Clock,
  Package, User, Warehouse, AlertTriangle, Eye, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMobileRealtimeSync } from "@/hooks/useRealtimeSync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  rejection_reason: string | null;
  approved_at: string | null;
  products: { name: string; sku: string; unit: string } | null;
  from_user: { full_name: string } | null;
  to_warehouse: { name: string } | null;
}

interface Props {
  /** Optional warehouse filter — if provided, only show returns targeting this warehouse */
  warehouseId?: string;
  /** Optional height class override */
  className?: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:   { label: "Pending",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",  icon: <Clock className="h-3 w-3" /> },
    completed: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected:  { label: "Rejected", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",          icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", cfg.cls)}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StockReturnRequestsPanel({ warehouseId, className }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [approveDialog, setApproveDialog] = useState<ReturnRequest | null>(null);
  const [rejectDialog, setRejectDialog]   = useState<ReturnRequest | null>(null);
  const [actualQty, setActualQty]         = useState("");
  const [approveNotes, setApproveNotes]   = useState("");
  const [rejectReason, setRejectReason]   = useState("");

  // Live updates for stock_transfers
  useMobileRealtimeSync(["stock_transfers"]);

  // ── Query ────────────────────────────────────────────────────────────────────

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ["stock-return-requests", filter, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("stock_transfers")
        .select(`
          id, display_id, product_id, quantity, damaged_qty,
          return_reason, damage_notes, status, requested_at,
          rejection_reason, approved_at,
          products(name, sku, unit),
          from_user:profiles!stock_transfers_from_user_id_fkey(full_name),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name)
        `)
        .eq("is_return", true)
        .order("requested_at", { ascending: false });

      if (filter === "pending") q = q.eq("status", "pending");
      if (warehouseId) q = q.eq("to_warehouse_id", warehouseId);

      const { data, error } = await q.limit(50);
      if (error) throw error;
      return (data || []) as unknown as ReturnRequest[];
    },
    enabled: !!user,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const approveReturn = useMutation({
    mutationFn: async ({ id, qty, notes }: { id: string; qty: number; notes: string }) => {
      const { data, error } = await supabase.rpc("approve_agent_return", {
        p_transfer_id: id,
        p_actual_qty:  qty || null,
        p_notes:       notes || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Failed to approve");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Return ${data.display_id} approved — ${data.received_qty} units received`);
      if (data.damaged_qty > 0) {
        toast.info(`${data.damaged_qty} damaged units logged as wastage`);
      }
      qc.invalidateQueries({ queryKey: ["stock-return-requests"] });
      qc.invalidateQueries({ queryKey: ["product-stock"] });
      setApproveDialog(null);
      setActualQty("");
      setApproveNotes("");
    },
    onError: (err: any) => toast.error(err.message ?? "Approval failed"),
  });

  const rejectReturn = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_agent_return", {
        p_transfer_id: id,
        p_reason:      reason,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Failed to reject");
      return data;
    },
    onSuccess: () => {
      toast.success("Return request rejected — stock restored to agent");
      qc.invalidateQueries({ queryKey: ["stock-return-requests"] });
      setRejectDialog(null);
      setRejectReason("");
    },
    onError: (err: any) => toast.error(err.message ?? "Rejection failed"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openApprove(r: ReturnRequest) {
    setActualQty(String(r.quantity));
    setApproveNotes("");
    setApproveDialog(r);
  }

  function openReject(r: ReturnRequest) {
    setRejectReason("");
    setRejectDialog(r);
  }

  const pending = requests.filter((r) => r.status === "pending");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
            <RotateCcw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Agent Return Requests</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pending.length > 0
                ? `${pending.length} pending approval`
                : "No pending requests"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize",
                  filter === f
                    ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {f === "all" ? "All" : "Pending"}
                {f === "pending" && pending.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <RotateCcw className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            {filter === "pending" ? "No pending return requests" : "No return requests"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Return requests from agents will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <ReturnCard
              key={r.id}
              request={r}
              onApprove={() => openApprove(r)}
              onReject={() => openReject(r)}
            />
          ))}
        </div>
      )}

      {/* ── Approve Dialog ─────────────────────────────────────────────────── */}
      {approveDialog && (
        <Dialog open onOpenChange={(o) => !o && setApproveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Approve Return: {approveDialog.display_id}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Info */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product</span>
                  <span className="font-semibold">{approveDialog.products?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Requested qty</span>
                  <span className="font-semibold">{approveDialog.quantity}</span>
                </div>
                {approveDialog.damaged_qty != null && approveDialog.damaged_qty > 0 && (
                  <div className="flex justify-between text-orange-600 dark:text-orange-400">
                    <span>Agent reported damaged</span>
                    <span className="font-semibold">{approveDialog.damaged_qty}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">From agent</span>
                  <span className="font-semibold">{approveDialog.from_user?.full_name ?? "—"}</span>
                </div>
              </div>

              {/* Actual qty received */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Actual Quantity Received
                  <span className="text-xs font-normal text-slate-500 ml-1">
                    (adjust if different from requested)
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  max={approveDialog.quantity}
                  step="1"
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                  className="h-11 text-base font-bold"
                />
                {parseFloat(actualQty) < approveDialog.quantity && !isNaN(parseFloat(actualQty)) && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>
                      Variance of {approveDialog.quantity - parseFloat(actualQty)} unit(s) — shortage will be restored to agent stock
                    </span>
                  </div>
                )}
              </div>

              {/* Damage breakdown preview */}
              {approveDialog.damaged_qty != null && approveDialog.damaged_qty > 0 && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Damage handling on approval
                  </p>
                  <p className="text-orange-600 dark:text-orange-400">
                    {approveDialog.damaged_qty} unit(s) will be logged as <strong>wastage</strong>.
                  </p>
                  {approveDialog.damage_notes && (
                    <p className="text-orange-500 dark:text-orange-400 italic">"{approveDialog.damage_notes}"</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Approval Notes
                  <span className="text-xs font-normal text-slate-500 ml-1">(optional)</span>
                </Label>
                <Textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Any notes for this approval…"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setApproveDialog(null)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={approveReturn.isPending || actualQty === "" || parseFloat(actualQty) < 0}
                onClick={() =>
                  approveReturn.mutate({
                    id:    approveDialog.id,
                    qty:   parseFloat(actualQty),
                    notes: approveNotes,
                  })
                }
              >
                {approveReturn.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Approving…</>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve Return</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Reject Dialog ──────────────────────────────────────────────────── */}
      {rejectDialog && (
        <Dialog open onOpenChange={(o) => !o && setRejectDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Reject Return: {rejectDialog.display_id}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm">
                <p className="text-slate-500 mb-0.5">Product</p>
                <p className="font-semibold">{rejectDialog.products?.name}</p>
                <p className="text-slate-500 mt-2 mb-0.5">Requested by</p>
                <p className="font-semibold">{rejectDialog.from_user?.full_name ?? "—"}</p>
              </div>

              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 p-3 text-xs text-red-600 dark:text-red-400">
                <p className="font-semibold mb-1">Rejection restores agent stock</p>
                <p>{rejectDialog.quantity} unit(s) of {rejectDialog.products?.name} will be returned to the agent's holding stock.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Rejection Reason <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this return is being rejected…"
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRejectDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={rejectReturn.isPending || !rejectReason.trim()}
                onClick={() =>
                  rejectReturn.mutate({ id: rejectDialog.id, reason: rejectReason })
                }
              >
                {rejectReturn.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Rejecting…</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5 mr-1.5" />Reject Return</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Sub-component: single return card ───────────────────────────────────────

function ReturnCard({
  request: r,
  onApprove,
  onReject,
}: {
  request: ReturnRequest;
  onApprove: () => void;
  onReject:  () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = r.status === "pending";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-xl border bg-white dark:bg-slate-800 overflow-hidden transition-all",
          isPending
            ? "border-orange-200 dark:border-orange-800/50 shadow-sm"
            : "border-slate-100 dark:border-slate-700"
        )}
      >
        {/* Card header */}
        <CollapsibleTrigger asChild>
          <button className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
            {/* Icon */}
            <div className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
              isPending
                ? "bg-orange-100 dark:bg-orange-900/40"
                : "bg-slate-100 dark:bg-slate-700"
            )}>
              <Package className={cn("h-4 w-4", isPending ? "text-orange-600 dark:text-orange-400" : "text-slate-500")} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                  {r.products?.name ?? "Product"}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <User className="h-3 w-3" />
                  {r.from_user?.full_name ?? "—"}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Package className="h-3 w-3" />
                  {r.quantity} {r.products?.unit ?? "units"}
                  {r.damaged_qty != null && r.damaged_qty > 0 && (
                    <span className="text-orange-500 font-semibold"> · {r.damaged_qty} damaged</span>
                  )}
                </span>
                <span className="text-xs text-slate-400 font-mono">{r.display_id}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(r.requested_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>

            <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 mt-1 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>

        {/* Expanded detail */}
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
            {/* Reason */}
            {r.return_reason && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{r.return_reason}</p>
              </div>
            )}

            {/* Damage notes */}
            {r.damaged_qty != null && r.damaged_qty > 0 && r.damage_notes && (
              <div>
                <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Damage Notes</p>
                <p className="text-sm text-orange-700 dark:text-orange-300">{r.damage_notes}</p>
              </div>
            )}

            {/* Warehouse */}
            {r.to_warehouse && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Warehouse className="h-3 w-3" />
                <span>Returning to: <strong className="text-slate-700 dark:text-slate-300">{r.to_warehouse.name}</strong></span>
              </div>
            )}

            {/* Rejection reason (if rejected) */}
            {r.status === "rejected" && r.rejection_reason && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2.5 text-xs text-red-600 dark:text-red-400">
                <p className="font-semibold">Rejection reason:</p>
                <p>{r.rejection_reason}</p>
              </div>
            )}

            {/* Action buttons (only for pending) */}
            {isPending && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                  onClick={onApprove}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 rounded-lg"
                  onClick={onReject}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
