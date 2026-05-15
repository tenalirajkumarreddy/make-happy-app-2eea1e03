import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { sendNotificationToMany, getApproverUserIds } from "@/lib/notifications";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  User,
  Warehouse,
  Check,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockTransferModal } from "@/components/inventory/StockTransferModal";

// ── Types ────────────────────────────────────────────────────────────

type TransferRow = {
  id: string;
  created_at: string;
  status: string;
  product_id: string;
  quantity: number;
  description: string | null;
  rejection_reason: string | null;
  from_warehouse_id: string | null;
  from_user_id: string | null;
  to_warehouse_id: string | null;
  to_user_id: string | null;
  from_warehouse: { name: string } | null;
  to_warehouse: { name: string } | null;
  from_staff: { full_name: string } | null;
  to_staff: { full_name: string } | null;
  product: { name: string } | null;
  processor?: { full_name: string } | null;
  approved_by: string | null;
};

// ── Component ────────────────────────────────────────────────────────────

export default function StockTransfers() {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  // ── Lookup Data ────────────────────────────────────────────────────────
  const { data: productsMap = {} } = useQuery({
    queryKey: ["lookup-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name");
      return (data || []).reduce((acc: any, p) => {
        acc[p.id] = p.name;
        return acc;
      }, {});
    },
  });

  const { data: warehousesMap = {} } = useQuery({
    queryKey: ["lookup-warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name");
      return (data || []).reduce((acc: any, w) => {
        acc[w.id] = w.name;
        return acc;
      }, {});
    },
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["lookup-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return (data || []).reduce((acc: any, p) => {
        acc[p.user_id] = p.full_name;
        return acc;
      }, {});
    },
  });
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isAdmin = isSuperAdmin || isManager;
  const isOperator = role === "operator";
  const isAgent = role === "agent" || role === "marketer";
  const isInventoryViewer = isSuperAdmin || isManager || isAgent || isOperator;

  // Derive allowed transfer types — mirrors the same logic as Inventory.tsx
  const allowedTransferTypes = useMemo(() => {
    if (isSuperAdmin || isManager) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff", "warehouse_to_warehouse"];
    if (isOperator) return ["warehouse_to_staff", "staff_to_staff"];
    if (isAgent) return ["staff_to_warehouse", "staff_to_staff"];
    return [] as string[];
  }, [isSuperAdmin, isManager, isOperator, isAgent]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("StockTransfers: role:", role, "warehouse:", currentWarehouse?.id, "user:", user?.id);
  }, [role, currentWarehouse, user]);

  // Highlight row when coming from notification
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`transfer-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-yellow-100", "dark:bg-yellow-900/30");
      setTimeout(() => {
        el.classList.remove("bg-yellow-100", "dark:bg-yellow-900/30");
      }, 3000);
    }
  }, [highlightId]);

  // ── Transfers history ──────────────────────────────────────────────────
  const {
    data: transfers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stock-transfers", currentWarehouse?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("id, created_at, product_id, quantity, description, status, from_warehouse_id, from_user_id, to_warehouse_id, to_user_id, requested_by, approved_by, approved_at, rejection_reason")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("Transfers error:", error);
        throw error;
      }
      return (data ?? []) as TransferRow[];
    },
  });

  // ── Approve Mutation ─────────────────────────────────────────────
  const { mutate: approveTransfer, isPending: isApproving } = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc("approve_stock_transfer", {
        p_transfer_id: transferId,
        p_approved_by: user?.id ?? null,
        p_rejection_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer approved and processed");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to approve transfer");
    },
  });

  // ── Reject Mutation ─────────────────────────────────────────────
  const { mutate: rejectTransfer, isPending: isRejecting } = useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: string; reason?: string }) => {
      // Pre-flight check
      const current = transfers.find(t => t.id === transferId);
      if (current && !["pending", "awaiting_acceptance"].includes(current.status)) {
        throw new Error(`Transfer is already ${current.status}`);
      }

      const { error } = await supabase.rpc("approve_stock_transfer", {
        p_transfer_id: transferId,
        p_approved_by: user?.id ?? null,
        p_rejection_reason: reason ?? "Rejected",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer rejected");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedTransferId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to reject transfer");
    },
  });

  // ── Accept Mutation ──────────────────────────────────────────────
  const { mutate: acceptTransfer, isPending: isAccepting } = useMutation({
    mutationFn: async (transferId: string) => {
      // Pre-flight check
      const current = transfers.find(t => t.id === transferId);
      if (current && current.status !== "awaiting_acceptance") {
        throw new Error(`Transfer is already ${current.status}`);
      }

      const { error } = await supabase.rpc("accept_stock_transfer", {
        p_transfer_id: transferId,
        p_accepted_by: user?.id ?? null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer approved successfully");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to accept transfer");
    },
  });

  // ── Cancel Mutation ──────────────────────────────────────────────
  const { mutate: cancelTransfer, isPending: isCancelling } = useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase.rpc("cancel_stock_transfer", {
        p_transfer_id: transferId,
        p_cancelled_by: user?.id,
      });
      
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || "Failed to cancel transfer");
      return data;
    },
    onSuccess: () => {
      toast.success("Transfer request cancelled");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      // Also invalidate the specific query with its full key
      qc.invalidateQueries({ 
        queryKey: ["stock-transfers", currentWarehouse?.id, role],
        exact: false 
      });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to cancel transfer");
    },
  });

  // ── Filtered transfers ──────────────────────────────────────────────
  const filtered = transfers.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    
    const productName = productsMap[t.product_id]?.toLowerCase() || "";
    const fromName = (t.from_warehouse_id ? warehousesMap[t.from_warehouse_id] : profilesMap[t.from_user_id || ""])?.toLowerCase() || "";
    const toName = (t.to_warehouse_id ? warehousesMap[t.to_warehouse_id] : profilesMap[t.to_user_id || ""])?.toLowerCase() || "";
    const processorName = (t.approved_by ? profilesMap[t.approved_by] : "")?.toLowerCase() || "";

    return (
      t.status?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      productName.includes(q) ||
      fromName.includes(q) ||
      toName.includes(q) ||
      processorName.includes(q)
    );
  });

  // ── Helpers ─────────────────────────────────────────────────────────
  const formatParty = (t: TransferRow, side: "from" | "to") => {
    if (side === "from") {
      if (t.from_warehouse_id) {
        return { label: warehousesMap[t.from_warehouse_id] || `WH:${t.from_warehouse_id.slice(0, 8)}`, type: "warehouse" };
      }
      if (t.from_user_id) {
        return { label: profilesMap[t.from_user_id] || `User:${t.from_user_id.slice(0, 8)}`, type: "staff" };
      }
    } else {
      if (t.to_warehouse_id) {
        return { label: warehousesMap[t.to_warehouse_id] || `WH:${t.to_warehouse_id.slice(0, 8)}`, type: "warehouse" };
      }
      if (t.to_user_id) {
        return { label: profilesMap[t.to_user_id] || `User:${t.to_user_id.slice(0, 8)}`, type: "staff" };
      }
    }
    return { label: "—", type: "unknown" };
  };

  const formatProcessor = (t: TransferRow) => {
    if (t.approved_by) return profilesMap[t.approved_by] || `User:${t.approved_by.slice(0, 8)}`;
    return "—";
  };

  const PartyBadge = ({ label, type }: { label: string; type: string }) => (
    <span className="inline-flex items-center gap-1 text-sm">
      {type === "warehouse" ? (
        <Building2 className="h-3.5 w-3.5 text-blue-500" />
      ) : (
        <User className="h-3.5 w-3.5 text-emerald-500" />
      )}
      {label}
    </span>
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          Error loading transfers: {(error as Error).message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground">
            {transfers.length} transfers loaded
            {currentWarehouse && (
              <span className="ml-1 font-medium text-foreground">
                · {currentWarehouse.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfer Stock
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transfers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ArrowRightLeft className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No transfers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Processed By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const from = formatParty(t, "from");
                    const to = formatParty(t, "to");

                    const isRecipient = t.to_user_id === user?.id;
                    const isWarehouseRecipient = t.to_warehouse_id === currentWarehouse?.id;
                    const isWarehouseSender = t.from_warehouse_id === currentWarehouse?.id;

                    const canAccept = (role === "agent" && t.status === "awaiting_acceptance" && isRecipient) ||
                                     ((role === "operator" || isManager) && t.status === "awaiting_acceptance" && (isWarehouseRecipient || !currentWarehouse?.id));

                    const canProcess = (isManager || isSuperAdmin || role === "operator") && t.status === "pending" &&
                                      (isWarehouseRecipient || isWarehouseSender || isSuperAdmin || !currentWarehouse?.id);

                    return (
                      <TableRow key={t.id} id={`transfer-${t.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.created_at), "dd MMM yy, HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <Badge variant={t.status === "completed" ? "default" : t.status === "rejected" ? "destructive" : "outline"}>
                              {t.status === "pending" && "Pending"}
                              {t.status === "awaiting_acceptance" && "Awaiting Accept"}
                              {t.status === "approved" && "Approved"}
                              {t.status === "rejected" && "Rejected"}
                              {t.status === "completed" && "Completed"}
                            </Badge>
                            {t.rejection_reason && (
                              <span className="text-[10px] text-destructive mt-1 max-w-[100px] truncate" title={t.rejection_reason}>
                                {t.rejection_reason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{productsMap[t.product_id] || `Prod:${t.product_id.slice(0, 8)}`}</span>
                            {t.description && (
                              <span className="text-[10px] text-muted-foreground font-normal italic">
                                "{t.description}"
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{t.quantity}</Badge>
                        </TableCell>
                        <TableCell>
                          <PartyBadge label={from.label} type={from.type} />
                        </TableCell>
                        <TableCell>
                          <PartyBadge label={to.label} type={to.type} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatProcessor(t)}
                        </TableCell>
                        <TableCell>
                          {(canProcess || canAccept || t.requested_by === user?.id || t.requested_by === null) && ["pending", "awaiting_acceptance"].includes(t.status) && (
                            <div className="flex gap-1">
                              {canProcess && (
                                <>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2" 
                                    onClick={() => approveTransfer(t.id)}
                                    disabled={isApproving || isRejecting}
                                  >
                                    {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2 text-destructive" 
                                    disabled={isApproving || isRejecting}
                                    onClick={() => {
                                      setSelectedTransferId(t.id);
                                      setRejectDialogOpen(true);
                                    }}
                                  >
                                    {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  </Button>
                                </>
                              )}
                              
                              {canAccept && (
                                <>
                                  <Button 
                                    size="sm" 
                                    variant="default" 
                                    className="h-7" 
                                    onClick={() => acceptTransfer(t.id)}
                                    disabled={isAccepting || isRejecting}
                                  >
                                    {isAccepting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    Accept
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2 text-destructive" 
                                    disabled={isAccepting || isRejecting}
                                    onClick={() => {
                                      setSelectedTransferId(t.id);
                                      setRejectDialogOpen(true);
                                    }}
                                  >
                                    {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  </Button>
                                </>
                              )}

                              {/* Allow creator to cancel if still pending/awaiting */}
                              {(t.requested_by === user?.id || t.requested_by === null) && ["pending", "awaiting_acceptance"].includes(t.status) && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-7 px-2 text-muted-foreground hover:text-destructive" 
                                  onClick={() => {
                                    if (confirm("Are you sure you want to cancel this transfer request?")) {
                                      cancelTransfer(t.id);
                                    }
                                  }}
                                  disabled={isCancelling}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── New Transfer Modal ────────────────────────────────────── */}
      <StockTransferModal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        currentUserId={user?.id}
        allowedTransferTypes={allowedTransferTypes as any}
      />

      {/* ── Reject Transfer Dialog ────────────────────────────────── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Transfer</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this transfer request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Wrong quantity, incorrect product..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isRejecting || !rejectionReason.trim()}
              onClick={() => {
                if (selectedTransferId) {
                  rejectTransfer({ transferId: selectedTransferId, reason: rejectionReason });
                }
              }}
            >
              {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
