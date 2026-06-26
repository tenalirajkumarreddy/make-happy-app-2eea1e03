import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, AlertCircle, Boxes, TrendingUp, Package, ShoppingCart, ArrowUpDown, Users, History } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtINR } from "@/lib/utils";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { StockAdjustmentSheet } from "@/mobile/components/inventory/StockAdjustmentSheet";
import { StockHistorySheet } from "@/mobile/components/inventory/StockHistorySheet";
import { StaffHoldingsSheet } from "@/mobile/components/inventory/StaffHoldingsSheet";

interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  reorder_level: number;
  warehouse_id: string;
  products?: { 
    name: string; 
    sku: string; 
    price: number;
    unit: string;
    category: string;
  };
}

export function AdminInventory({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();

  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState("stock");
  const [showAdjustmentSheet, setShowAdjustmentSheet] = useState(false);
  const [showHistorySheet, setShowHistorySheet] = useState(false);
  const [showHoldingsSheet, setShowHoldingsSheet] = useState(false);

  // Fetch stock
  const { data: stock, isLoading, refetch } = useQuery({
    queryKey: ["mobile-inventory", currentWarehouse?.id, stockFilter],
    queryFn: async () => {
      let query = supabase
        .from("product_stock")
        .select("*, products(name, sku, price, unit, category)")
        .order("created_at", { ascending: false });

      if (currentWarehouse?.id) {
        query = query.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StockItem[];
    },
});

  // Filter stock
  const filteredStock = useMemo(() => {
    let items = (stock || []).filter((item) =>
      item.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.products?.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (stockFilter === "low") {
      items = items.filter((item) => item.quantity <= item.reorder_level && item.quantity > 0);
    } else if (stockFilter === "out") {
      items = items.filter((item) => item.quantity === 0);
    } else if (stockFilter === "high") {
      items = items.filter((item) => item.quantity > item.reorder_level * 2);
    }

    return items;
  }, [stock, searchTerm, stockFilter]);

  const lowStockCount = (stock || []).filter((item) => item.quantity <= item.reorder_level && item.quantity > 0).length;
  const outOfStockCount = (stock || []).filter((item) => item.quantity === 0).length;
  const totalItems = (stock || []).length;
  const totalValue = (stock || []).reduce((sum, item) => sum + (item.quantity * (item.products?.price || 0)), 0);

  const getStockStatus = (item: StockItem) => {
    if (item.quantity === 0) return { color: "bg-destructive/20 text-destructive border-destructive/30 dark:bg-destructive/30", label: "Out of Stock", icon: AlertCircle };
    if (item.quantity <= item.reorder_level) return { color: "bg-warning/20 text-warning border-warning/30 dark:bg-warning/30", label: "Low Stock", icon: AlertCircle };
    return { color: "bg-success/20 text-success border-success/30 dark:bg-success/30", label: "In Stock", icon: Package };
  };

  return (
    <div className="pb-6">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Inventory</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">Stock management</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl"
              onClick={() => setShowHistorySheet(true)}
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl"
              onClick={() => setShowAdjustmentSheet(true)}
            >
              <Plus className="h-4 w-4" /> Adjust
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-3 mb-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <TabsTrigger value="stock" className="text-xs rounded-lg">
              <Package className="h-3.5 w-3.5 mr-1" /> Stock
            </TabsTrigger>
            <TabsTrigger value="holdings" className="text-xs rounded-lg">
              <Users className="h-3.5 w-3.5 mr-1" /> Staff
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs rounded-lg">
              <History className="h-3.5 w-3.5 mr-1" /> History
            </TabsTrigger>
          </TabsList>

          {/* Stock Tab Content */}
          <TabsContent value="stock" className="mt-3 space-y-3">
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setStockFilter("all")}
                className={`rounded-xl border shadow-sm p-2.5 text-center transition-all active:scale-95 ${stockFilter === "all" ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"}`}
              >
                <p className="text-lg font-bold text-info">{totalItems}</p>
                <p className="text-xs text-slate-500">Total Items</p>
              </button>
              <button
                onClick={() => setStockFilter("low")}
                className={`rounded-xl border shadow-sm p-2.5 text-center transition-all active:scale-95 ${stockFilter === "low" ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"}`}
              >
                <p className="text-lg font-bold text-warning">{lowStockCount}</p>
                <p className="text-xs text-slate-500">Low Stock</p>
              </button>
              <button
                onClick={() => setStockFilter("out")}
                className={`rounded-xl border shadow-sm p-2.5 text-center transition-all active:scale-95 ${stockFilter === "out" ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"}`}
              >
                <p className="text-lg font-bold text-destructive">{outOfStockCount}</p>
                <p className="text-xs text-slate-500">Out of Stock</p>
              </button>
            </div>

            {/* Total Value */}
            <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-2.5 flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Inventory Value</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">{fmtINR(totalValue)}</span>
            </div>

            {/* Search & Filter */}
            <Input placeholder="Search product name or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
                <SelectItem value="high">High Stock</SelectItem>
              </SelectContent>
            </Select>

            {/* Stock List */}
            {isLoading ? (
              <CardSkeletonList count={4} />
            ) : filteredStock.length === 0 ? (
              <div className="py-8 text-center">
                <Boxes className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No items found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stockFilter !== "all"
                    ? `No items match "${stockFilter === 'low' ? 'Low Stock' : stockFilter === 'out' ? 'Out of Stock' : 'High Stock'}" filter`
                    : "No products in inventory"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStock.map((item) => {
                  const status = getStockStatus(item);
                  const stockValue = item.quantity * (item.products?.price || 0);
                  const StatusIcon = status.icon;
                  
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
                    >
                      <div
                        onClick={() => {
                          setSelectedItem(item);
                          setShowDetailModal(true);
                        }}
                        className="p-3 active:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{item.products?.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">SKU: {item.products?.sku}</p>
                            {item.products?.category && (
                              <p className="text-xs text-muted-foreground capitalize">{item.products?.category}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className={`text-xs whitespace-nowrap ${status.color}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-1" />
                              {item.quantity}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="bg-muted/30 rounded px-2 py-1">
                            <p className="text-xs text-muted-foreground">Unit Price</p>
                            <p className="text-xs font-medium">{fmtINR(item.products?.price || 0)}</p>
                          </div>
                          <div className="bg-muted/30 rounded px-2 py-1">
                            <p className="text-xs text-muted-foreground">Stock Value</p>
                            <p className="text-xs font-medium">{fmtINR(stockValue)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Min: {item.reorder_level} {item.products?.unit}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex border-t border-border/50">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setShowDetailModal(true);
                          }}
                          className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">View</span>
                        </button>
                        <button
                          onClick={() => setShowAdjustmentSheet(true)}
                          className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors border-r border-border/50"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Purchase</span>
                        </button>
                        <button
                          onClick={() => setShowAdjustmentSheet(true)}
                          className="flex-1 py-2.5 min-w-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                        >
                          <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Adjust</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Staff Holdings Tab Content */}
          <TabsContent value="holdings" className="mt-3">
            <Button
              variant="outline"
              className="w-full mb-3"
              onClick={() => setShowHoldingsSheet(true)}
            >
              <Users className="h-4 w-4 mr-2" /> View Staff Holdings
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Tap to view product holdings across all staff members
            </p>
          </TabsContent>

          {/* History Tab Content */}
          <TabsContent value="history" className="mt-3">
            <Button
              variant="outline"
              className="w-full mb-3"
              onClick={() => setShowHistorySheet(true)}
            >
              <History className="h-4 w-4 mr-2" /> View Stock History
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Tap to view all stock movements and adjustments
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Stock Details</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="text-sm font-semibold">{selectedItem.products?.name}</p>
                  </div>
                  {(() => {
                    const status = getStockStatus(selectedItem);
                    const StatusIcon = status.icon;
                    return (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status.color}`}>
                        <StatusIcon className="h-2.5 w-2.5 inline mr-1" />
                        {status.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">SKU</span>
                  <span className="font-mono text-sm">{selectedItem.products?.sku}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Category</span>
                  <span className="text-sm capitalize">{selectedItem.products?.category || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Unit</span>
                  <span className="text-sm">{selectedItem.products?.unit || "units"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Unit Price</span>
                  <span className="text-sm font-semibold">{fmtINR(selectedItem.products?.price || 0)}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-xs text-muted-foreground">Current Stock</span>
                  <span className="text-lg font-bold">{selectedItem.quantity}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Reorder Level</span>
                  <span className="text-sm">{selectedItem.reorder_level}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Stock Value</span>
                  <span className="text-sm font-semibold text-primary">
                    {fmtINR(selectedItem.quantity * (selectedItem.products?.price || 0))}
                  </span>
                </div>
                {selectedItem.quantity > 0 && selectedItem.quantity <= selectedItem.reorder_level && (
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs text-muted-foreground">Reorder Status</span>
                    <span className="text-xs font-semibold text-orange-600">Reorder Now</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/purchases?product=${selectedItem.product_id}`);
                  }}
                >
                  <ShoppingCart className="h-3 w-3 mr-1" />
                  Purchase
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    setShowAdjustmentSheet(true);
                  }}
                >
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  Adjust
                </Button>
                <Button
                  size="sm"
                  className="text-xs col-span-2"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/inventory?highlight=${selectedItem.product_id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full Details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sheets */}
      <StockAdjustmentSheet open={showAdjustmentSheet} onOpenChange={setShowAdjustmentSheet} />
      <StockHistorySheet open={showHistorySheet} onOpenChange={setShowHistorySheet} />
      <StaffHoldingsSheet open={showHoldingsSheet} onOpenChange={setShowHoldingsSheet} />
    </div>
  );
}
