import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, ShoppingCart, CheckCircle2, Ban, Truck, Package, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface PurchaseItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  batch_number: string | null;
  expiry_date: string | null;
  products?: {
    name: string;
    sku: string;
  };
}

interface Purchase {
  id: string;
  display_id: string;
  vendor_id: string;
  total_amount: number;
  status: "pending" | "confirmed" | "received" | "cancelled";
  created_at: string;
  vendors?: { name: string };
  purchase_items?: PurchaseItem[];
}

export function AdminPurchases({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch purchases with complete item details
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["mobile-purchases", currentWarehouse?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select(`
          *, 
          vendors(name),
          purchase_items(id, product_id, quantity, unit_cost, total_cost, batch_number, expiry_date, products(name, sku))
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Purchase[];
    },
  });

  // Filter by search
  const filteredPurchases = useMemo(() => {
    return (purchases || []).filter((p) =>
      p.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vendors?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [purchases, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "received":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-3 w-3" />;
      case "confirmed":
        return <CheckCircle2 className="h-3 w-3" />;
      case "received":
        return <Package className="h-3 w-3" />;
      case "cancelled":
        return <Ban className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  };

  return (
    <div className="pb-6 space-y-4">
      {/* Header */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Purchases</h2>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onNavigate("/purchases")}
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {/* Search & Filter */}
        <Input
          placeholder="Search PO or vendor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-sm h-9"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purchases</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Purchases List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
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
              <div
                key={purchase.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Card Content */}
                <div
                  onClick={() => {
                    setSelectedPurchase(purchase);
                    setShowDetailModal(true);
                  }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-primary">{purchase.display_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {purchase.vendors?.name || "Unknown Vendor"}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 border ${getStatusColor(purchase.status)}`}>
                      {getStatusIcon(purchase.status)}
                      {purchase.status}
                    </span>
                  </div>

                  {/* Purchase Items Preview */}
                  {purchase.purchase_items && purchase.purchase_items.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {purchase.purchase_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">
                            {item.products?.name} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">
                            {formatAmount(item.total_cost)}
                          </span>
                        </div>
                      ))}
                      {purchase.purchase_items.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{purchase.purchase_items.length - 2} more items
                        </p>
                      )}
                    </div>
                  )}

                  {/* Total and Date */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {itemCount > 0 ? `${itemCount} items` : 'No items'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(purchase.created_at), "dd MMM, hh:mm a")}
                      </span>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-primary">{formatAmount(purchase.total_amount)}</p>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex border-t border-border/50">
                  <button
                    onClick={() => onNavigate(`/purchases?highlight=${purchase.id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  {purchase.status === "pending" && (
                    <button
                      onClick={() => onNavigate(`/purchases?confirm=${purchase.id}`)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors border-r border-border/50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirm
                    </button>
                  )}
                  {purchase.status === "confirmed" && (
                    <button
                      onClick={() => onNavigate(`/purchases?receive=${purchase.id}`)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 hover:bg-green-50 active:bg-green-100 transition-colors border-r border-border/50"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Receive
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
              {/* Purchase Info */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">PO ID</span>
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
              </div>

              {/* Purchase Items */}
              {selectedPurchase.purchase_items && selectedPurchase.purchase_items.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Purchase Items ({selectedPurchase.purchase_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedPurchase.purchase_items.map((item, idx) => (
                      <div key={idx} className="px-3 py-2.5">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-medium">{item.products?.name}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatAmount(item.total_cost)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                          <span>Qty: {item.quantity} × {formatAmount(item.unit_cost)}</span>
                        </div>
                        {(item.batch_number || item.expiry_date) && (
                          <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                            {item.batch_number && <span>Batch: {item.batch_number}</span>}
                            {item.expiry_date && <span>Exp: {format(new Date(item.expiry_date), "dd/MM/yy")}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2.5 border-t bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted-foreground">Total Amount</span>
                      <span className="text-base font-bold text-primary tabular-nums">{formatAmount(selectedPurchase.total_amount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/purchases?highlight=${selectedPurchase.id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full
                </Button>
                {selectedPurchase.status === "pending" && (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setShowDetailModal(false);
                      onNavigate(`/purchases?confirm=${selectedPurchase.id}`);
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Confirm
                  </Button>
                )}
                {selectedPurchase.status === "confirmed" && (
                  <Button
                    size="sm"
                    className="text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setShowDetailModal(false);
                      onNavigate(`/purchases?receive=${selectedPurchase.id}`);
                    }}
                  >
                    <Truck className="h-3 w-3 mr-1" />
                    Receive
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
