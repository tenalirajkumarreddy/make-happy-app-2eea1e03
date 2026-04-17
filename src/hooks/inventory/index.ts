// Inventory hooks
export { useStaffStock, useStaffStockByWarehouse } from "./useStaffStock";
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
