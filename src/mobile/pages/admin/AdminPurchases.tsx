import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, ShoppingCart, CheckCircle, Clock, FileText, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fmtINR } from "@/lib/utils";
import { toast } from "sonner";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";

interface PurchaseItem {
  id: string;
  raw_material_id: string | null;
  product_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  batch_number: string | null;
  expiry_date: string | null;
  products?: { name: string; sku: string };
  raw_materials?: { name: string; unit: string };
}

interface Purchase {
  id: string;
  display_id: string;
  vendor_id: string;
  warehouse_id: string;
  total_amount: number;
  bill_amount: number | null;
  bill_number: string | null;
  bill_url: string | null;
  status: "pending" | "completed";
  created_by: string;
  created_at: string;
  vendors?: { name: string };
  purchase_items?: PurchaseItem[];
}

export function AdminPurchases({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const isManagerOrAdmin = role === "super_admin" || role === "manager";
  const isOperator = role === "operator";

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: purchases, isLoading, refetch } = useQuery({
    queryKey: ["mobile-purchases", currentWarehouse?.id, statusFilter, user?.id, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("purchases")
        .select(`
          *, 
          vendors(name),
          purchase_items(id, raw_material_id, product_id, quantity, unit_cost, total_cost, batch_number, expiry_date, products(name, sku), raw_materials(name, unit))
        `)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Operator sees only their own purchases
      if (isOperator && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Purchase[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const hasMore = (purchases || []).length === PAGE_SIZE;

  const filteredPurchases = useMemo(() => {
    return (purchases || []).filter((p) =>
      p.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vendors?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [purchases, searchTerm]);

  const { isPulling, pullDistance } = usePullToRefresh(() => refetch());

  const approveMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.rpc("approve_purchase", {
        p_purchase_id: purchaseId,
        p_user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase approved");
      qc.invalidateQueries({ queryKey: ["mobile-purchases"] });
      setShowDetailModal(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to approve");
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-warning/20 text-warning border-warning/30 dark:bg-warning/30";
      case "completed":
        return "bg-success/20 text-success border-success/30 dark:bg-success/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-3 w-3" />;
      case "completed":
        return <CheckCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getItemName = (item: PurchaseItem) => {
    if (item.raw_materials?.name) return item.raw_materials.name;
    if (item.products?.name) return item.products.name;
    return "Unknown Item";
  };

  return (
    <div className="pb-6">
      <PullRefreshIndicator isPulling={isPulling} pullDistance={pullDistance} />

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Purchases</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">
              {isOperator ? "Your purchase requests" : "Manage purchases"}
            </p>
          </div>
          {(isManagerOrAdmin || isOperator) && (
            <Button size="sm" className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl" onClick={() => onNavigate("/purchases")}>
              <Plus className="h-4 w-4" /> {isOperator ? "Submit" : "New"}
            </Button>
          )}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 -mt-3 space-y-2 mb-4">
        <Input placeholder="Search purchases..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <CardSkeletonList count={4} />
      ) : filteredPurchases.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No purchases found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredPurchases.map((purchase) => {
            const itemCount = purchase.purchase_items?.length || 0;
            return (
              <div key={purchase.id} className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                <div
                  onClick={() => { setSelectedPurchase(purchase); setShowDetailModal(true); }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-primary">{purchase.display_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{purchase.vendors?.name || "Unknown Vendor"}</p>
                      {purchase.bill_number && (
                        <p className="text-xs text-muted-foreground mt-0.5">Bill: {purchase.bill_number}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 border ${getStatusColor(purchase.status)}`}>
                      {getStatusIcon(purchase.status)}
                      {purchase.status}
                    </span>
                  </div>

                  {/* Items preview */}
                  {purchase.purchase_items && purchase.purchase_items.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {purchase.purchase_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">
                            {getItemName(item)} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">{fmtINR(item.total_cost)}</span>
                        </div>
                      ))}
                      {purchase.purchase_items.length > 2 && (
                        <p className="text-xs text-muted-foreground">+{purchase.purchase_items.length - 2} more</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      {itemCount > 0 ? `${itemCount} items` : "No items"} · {format(new Date(purchase.created_at), "dd MMM, hh:mm a")}
                    </span>
                    <p className="text-sm font-bold tabular-nums text-primary">{fmtINR(purchase.total_amount)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-border/50">
                  <button
                    onClick={() => { setSelectedPurchase(purchase); setShowDetailModal(true); }}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  {isManagerOrAdmin && purchase.status === "pending" && (
                    <button
                      onClick={() => approveMutation.mutate(purchase.id)}
                      disabled={approveMutation.isPending}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
                    >
                      {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Pagination */}
          <div className="flex items-center justify-between py-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Purchase Details</DialogTitle>
          </DialogHeader>

          {selectedPurchase && (
            <div className="space-y-4">
              {/* Info */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">ID</span>
                  <span className="font-mono text-sm font-semibold">{selectedPurchase.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Vendor</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedPurchase.vendors?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${getStatusColor(selectedPurchase.status)}`}>
                    {getStatusIcon(selectedPurchase.status)}
                    {selectedPurchase.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedPurchase.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
                {selectedPurchase.bill_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Bill #</span>
                    <span className="text-sm font-medium">{selectedPurchase.bill_number}</span>
                  </div>
                )}
                {selectedPurchase.bill_amount != null && selectedPurchase.bill_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Bill Amount</span>
                    <span className="text-sm font-bold">{fmtINR(selectedPurchase.bill_amount)}</span>
                  </div>
                )}
              </div>

              {/* Bill URL */}
              {selectedPurchase.bill_url && (
                <a
                  href={selectedPurchase.bill_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm text-primary hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  <span>View Bill</span>
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </a>
              )}

              {/* Items */}
              {selectedPurchase.purchase_items && selectedPurchase.purchase_items.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Items ({selectedPurchase.purchase_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedPurchase.purchase_items.map((item, idx) => (
                      <div key={idx} className="px-3 py-2.5">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-medium">{getItemName(item)}</span>
                          <span className="text-sm font-semibold tabular-nums">{fmtINR(item.total_cost)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Qty: {item.quantity} × {fmtINR(item.unit_cost)}
                          {item.raw_materials?.unit ? ` (${item.raw_materials.unit})` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2.5 border-t bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted-foreground">Total</span>
                      <span className="text-base font-bold text-primary tabular-nums">{fmtINR(selectedPurchase.total_amount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Approve Button (manager/admin only, pending only) */}
              {isManagerOrAdmin && selectedPurchase.status === "pending" && (
                <Button
                  className="w-full"
                  onClick={() => approveMutation.mutate(selectedPurchase.id)}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Approve Purchase
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
