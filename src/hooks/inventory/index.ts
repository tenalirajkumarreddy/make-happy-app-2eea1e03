// Inventory hooks - Phase 4 Redesign
export { useStaffStock, useMyStaffStock } from "./useStaffStock";
export { useWarehouseStock } from "./useWarehouseStock";
export { 
  useMyReturns, 
  usePendingReturns, 
  useReturnDetails,
  useSubmitReturn,
  useReviewReturn,
  useCancelReturn,
  useReturnStats
} from "./useStockReturns";

// Legacy hooks (for backwards compatibility)
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
  WarehouseStockItem,
  StockAllocation
} from "./useWarehouseStock";

export type {
  ReturnRequest,
  ReturnItem
} from "./useStockReturns";
