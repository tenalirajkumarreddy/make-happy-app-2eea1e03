import React, { useMemo } from "react";
import { ProductInventoryCard } from "./ProductInventoryCard";
import { Package, AlertTriangle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface WarehouseStockViewProps {
  products?: any[];
  selectedWarehouseId?: string;
  staffHoldingsByProduct?: Record<string, { user_id: string; full_name: string; quantity: number }[]>;
  isLoading?: boolean;
  canAdjust?: boolean;
  canTransfer?: boolean;
  searchQuery?: string;
  onViewProduct?: (product: any) => void;
  onAdjustStock?: (product: any) => void;
  onTransferStock?: (product: any) => void;
  warehouseName?: string;
}

export function WarehouseStockView({
  products,
  selectedWarehouseId,
  staffHoldingsByProduct = {},
  isLoading,
  canAdjust,
  canTransfer,
  searchQuery = "",
  onViewProduct,
  onAdjustStock,
  onTransferStock,
  warehouseName,
}: WarehouseStockViewProps) {
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products?.filter((item) => {
      const product = item.product || item;
      return (
        product.name?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query)
      );
    });
  }, [products, searchQuery]);

  const stats = useMemo(() => {
    if (!products?.length) return { total: 0, lowStock: 0, outOfStock: 0, totalValue: 0 };
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;
    products.forEach((item) => {
      const product = item.product || item;
      const qty = item.quantity || 0;
      const minLevel = product.min_stock_level ?? 0;  // Use nullish coalescing
      const price = product.base_price ?? 0;  // Use nullish coalescing to handle 0 price
      if (qty <= 0) outOfStock++;
      else if (qty <= minLevel) lowStock++;
      totalValue += qty * price;
    });
    return { total: products.length, lowStock, outOfStock, totalValue };
  }, [products]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-muted/20 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 bg-muted/20 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick stats - only show low stock/out of stock alerts */}
      {(stats.outOfStock > 0 || stats.lowStock > 0) && (
        <div className="flex items-center gap-4 text-sm">
          {stats.outOfStock > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">{stats.outOfStock}</span>
              <span>out of stock</span>
            </div>
          )}
          {stats.lowStock > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-md">
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">{stats.lowStock}</span>
              <span>low stock</span>
            </div>
          )}
        </div>
      )}

      {/* Products grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts?.map((item: any) => {
          const product = item.product || item;
          return (
            <ProductInventoryCard
              key={item.id}
              item={item}
              warehouseId={selectedWarehouseId}
              staffHoldings={staffHoldingsByProduct[product.id] || []}
              onAdjust={canAdjust ? () => onAdjustStock?.(product) : undefined}
              onTransfer={canTransfer ? () => onTransferStock?.(product) : undefined}
            />
          );
        })}
        {filteredProducts?.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
            {searchQuery ? `No products matching "${searchQuery}"` : "No products found in this warehouse."}
          </div>
        )}
      </div>
    </div>
  );
}
