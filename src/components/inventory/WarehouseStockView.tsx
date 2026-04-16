import React, { useState } from "react";
import { useWarehouseStock } from "@/hooks/inventory/useWarehouseStock";
import { ProductInventoryCard } from "./ProductInventoryCard";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { StockTransferModal } from "./StockTransferModal";
import { StockHistoryView } from "./StockHistoryView";
import { ManagerReturnDashboard } from "./ManagerReturnDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, RefreshCw, Undo2 } from "lucide-react";
import { InventorySummaryCards } from "./InventorySummaryCards";

export function WarehouseStockView({ warehouseId }: { warehouseId: string }) {
  const { data: items, isLoading } = useWarehouseStock(warehouseId);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stock...</div>;
  }

  const handleAdjust = (productId: string) => {
    setSelectedProductId(productId);
    setAdjustmentModalOpen(true);
  };

  const handleTransfer = (productId: string) => {
    setSelectedProductId(productId);
    setTransferModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="stock_flow" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Stock Flow
          </TabsTrigger>
          <TabsTrigger value="returns" className="gap-2">
            <Undo2 className="h-4 w-4" />
            Return Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <InventorySummaryCards warehouseId={warehouseId} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items?.map((item) => (
              <ProductInventoryCard
                key={item.id}
                item={item}
                warehouseId={warehouseId}
                onAdjust={() => handleAdjust(item.product?.id || '')}
                onTransfer={() => handleTransfer(item.product?.id || '')}
              />
            ))}
            {(!items || items.length === 0) && (
              <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
                No products found in this warehouse.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock_flow">
          <p className="text-sm text-muted-foreground mb-4">
            Warehouse-level movements only. Staff sales are tracked separately.
          </p>
          <StockHistoryView warehouseId={warehouseId} />
        </TabsContent>

        <TabsContent value="returns">
          <ManagerReturnDashboard warehouseId={warehouseId} />
        </TabsContent>
      </Tabs>

      <StockAdjustmentModal
        isOpen={adjustmentModalOpen}
        onClose={() => setAdjustmentModalOpen(false)}
        warehouseId={warehouseId}
        defaultProductId={selectedProductId}
      />
      <StockTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        warehouseId={warehouseId}
        defaultProductId={selectedProductId}
      />
    </div>
  );
}
