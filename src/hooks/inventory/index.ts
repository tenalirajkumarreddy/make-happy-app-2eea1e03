// Inventory hooks
export { useStaffStock, useMyStaffStock } from "./useStaffStock";
export { useWarehouseStock, useProductWarehouseStock } from "./useWarehouseStock";
export { useStockTransfer } from "./useStockTransfer";
export { useStockAdjustment, useStockMovementSummary } from "./useStockAdjustment";
export { useStockHistory, useRecentStockHistory, useProductStockHistory } from "./useStockHistory";
export { useVendorBalance, useVendorsWithBalance } from "./useVendorBalance";

// Export types
export type { 
  StaffStockItem, 
  StaffInventorySummary 
} from "./useStaffStock";

export type { 
  Warehouse, 
  WarehouseStock, 
  WarehouseStats 
} from "./useWarehouseStock";

export type { 
  StockTransfer, 
  TransferData 
} from "./useStockTransfer";

export type { 
  StockAdjustment, 
  AdjustmentData 
} from "./useStockAdjustment";

export type { 
  StockMovement, 
  RawMaterialAdjustment 
} from "./useStockHistory";

export type { 
  Vendor, 
  VendorTransaction 
} from "./useVendorBalance";
