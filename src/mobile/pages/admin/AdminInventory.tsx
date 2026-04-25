import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, AlertCircle, Boxes, TrendingUp, Package, ShoppingCart, ArrowUpDown } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

  // Fetch stock
  const { data: stock, isLoading } = useQuery({
    queryKey: ["mobile-inventory", currentWarehouse?.id, stockFilter],
    queryFn: async () => {
      let query = supabase
        .from("product_stock")
        .select("*, products(name, sku, price, unit, category)")
        .order("created_at", { ascending: false });

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
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
    if (item.quantity === 0) return { color: "bg-red-100 text-red-800 border-red-200", label: "Out of Stock", icon: AlertCircle };
    if (item.quantity <= item.reorder_level) return { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Low Stock", icon: AlertCircle };
    return { color: "bg-green-100 text-green-800 border-green-200", label: "In Stock", icon: Package };
  };

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  };

  return (
    <div className="pb-6 space-y-4">
      {/* Header */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Inventory</h2>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onNavigate("/inventory")}
          >
            <Plus className="h-4 w-4" />
            Adjust
          </Button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-center border border-blue-200 dark:border-blue-800/50">
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{totalItems}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-500">Total Items</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 text-center border border-yellow-200 dark:border-yellow-800/50">
            <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{lowStockCount}</p>
            <p className="text-[10px] text-yellow-600 dark:text-yellow-500">Low Stock</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center border border-red-200 dark:border-red-800/50">
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{outOfStockCount}</p>
            <p className="text-[10px] text-red-600 dark:text-red-500">Out of Stock</p>
          </div>
        </div>

        {/* Total Value */}
        <div className="bg-muted/50 rounded-lg p-2.5 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Total Inventory Value</span>
          <span className="text-sm font-bold text-primary">{formatAmount(totalValue)}</span>
        </div>

        {/* Search & Filter */}
        <Input
          placeholder="Search product name or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-sm h-9"
        />

        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out of Stock</SelectItem>
            <SelectItem value="high">High Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stock List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredStock.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Boxes className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No items found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredStock.map((item) => {
            const status = getStockStatus(item);
            const stockValue = item.quantity * (item.products?.price || 0);
            const StatusIcon = status.icon;
            
            return (
              <div
                key={item.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Card Content */}
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
                        <p className="text-[10px] text-muted-foreground capitalize">{item.products?.category}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${status.color}`}>
                        <StatusIcon className="h-2.5 w-2.5 mr-1" />
                        {item.quantity}
                      </Badge>
                    </div>
                  </div>

                  {/* Stock Details */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <p className="text-[10px] text-muted-foreground">Unit Price</p>
                      <p className="text-xs font-medium">{formatAmount(item.products?.price || 0)}</p>
                    </div>
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <p className="text-[10px] text-muted-foreground">Stock Value</p>
                      <p className="text-xs font-medium">{formatAmount(stockValue)}</p>
                    </div>
                  </div>

                  {/* Footer */}
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

                {/* Action Buttons Row */}
                <div className="flex border-t border-border/50">
                  <button
                    onClick={() => onNavigate(`/inventory?highlight=${item.product_id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    onClick={() => onNavigate(`/purchases?product=${item.product_id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors border-r border-border/50"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Purchase
                  </button>
                  <button
                    onClick={() => onNavigate(`/inventory?adjust=${item.product_id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Adjust
                  </button>
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
            <DialogTitle className="text-base">Stock Details</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              {/* Product Info */}
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
                  <span className="text-sm font-semibold">{formatAmount(selectedItem.products?.price || 0)}</span>
                </div>
              </div>

              {/* Stock Summary */}
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
                    {formatAmount(selectedItem.quantity * (selectedItem.products?.price || 0))}
                  </span>
                </div>
                {selectedItem.quantity > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs text-muted-foreground">Days to Reorder</span>
                    <span className="text-sm">
                      {selectedItem.quantity <= selectedItem.reorder_level 
                        ? "Immediate" 
                        : `~${Math.floor((selectedItem.quantity - selectedItem.reorder_level) / 10)} days`}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
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
                    onNavigate(`/inventory?adjust=${selectedItem.product_id}`);
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
    </div>
  );
}
