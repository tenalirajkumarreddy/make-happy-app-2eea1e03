/**
 * Bulk Operations Library
 * Phase 4: Scale & Polish - Issue #14
 * 
 * Provides utilities for performing operations on multiple items at once
 * with proper error handling, progress tracking, and rollback support
 */

export type BulkOperationType = 
  | "delete"
  | "update"
  | "export"
  | "archive"
  | "restore"
  | "assign"
  | "status_change"
  | "send_notification"
  | "print"
  | "download";

export interface BulkOperationConfig<T> {
  type: BulkOperationType;
  label: string;
  description: string;
  icon: string;
  color: "default" | "primary" | "secondary" | "destructive" | "warning";
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  confirmButtonText?: string;
  showProgress?: boolean;
  allowUndo?: boolean;
  validateSelection?: (items: T[]) => { valid: boolean; error?: string };
  preprocessItems?: (items: T[]) => Promise<T[]>;
}

export interface BulkOperationResult {
  success: boolean;
  processedCount: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ itemId: string; error: string }>;
  operationId: string;
  timestamp: string;
  canUndo: boolean;
  undoOperationId?: string;
}

export interface BulkOperationProgress {
  total: number;
  processed: number;
  current: number;
  percentage: number;
  currentItem?: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  startTime?: string;
  estimatedEndTime?: string;
}

export interface BulkActionContext<T> {
  items: T[];
  selectedIds: Set<string>;
  operationType: BulkOperationType;
  metadata?: Record<string, unknown>;
}

// Operation registry
const operationRegistry = new Map<string, BulkOperationConfig<unknown>>();

/**
 * Register a bulk operation configuration
 */
export function registerBulkOperation<T>(
  key: string,
  config: BulkOperationConfig<T>
): void {
  operationRegistry.set(key, config as BulkOperationConfig<unknown>);
}

/**
 * Get bulk operation configuration
 */
export function getBulkOperationConfig<T>(key: string): BulkOperationConfig<T> | undefined {
  return operationRegistry.get(key) as BulkOperationConfig<T> | undefined;
}

/**
 * Get all registered bulk operations
 */
export function getAllBulkOperations(): Array<{ key: string; config: BulkOperationConfig<unknown> }> {
  return Array.from(operationRegistry.entries()).map(([key, config]) => ({ key, config }));
}

/**
 * Execute bulk operation with progress tracking
 */
export async function executeBulkOperation<T>({
  items,
  selectedIds,
  operationKey,
  executeFn,
  onProgress,
  metadata,
  batchSize = 10,
}: {
  items: T[];
  selectedIds: Set<string>;
  operationKey: string;
  executeFn: (item: T, index: number, context: BulkActionContext<T>) => Promise<void>;
  onProgress?: (progress: BulkOperationProgress) => void;
  metadata?: Record<string, unknown>;
  batchSize?: number;
}): Promise<BulkOperationResult> {
  const config = getBulkOperationConfig<T>(operationKey);
  const selectedItems = items.filter((item: any) => selectedIds.has(item.id));
  const operationId = generateOperationId();
  
  const result: BulkOperationResult = {
    success: true,
    processedCount: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
    operationId,
    timestamp: new Date().toISOString(),
    canUndo: config?.allowUndo || false,
  };

  const context: BulkActionContext<T> = {
    items: selectedItems,
    selectedIds,
    operationType: config?.type || "update",
    metadata,
  };

  // Preprocess items if configured
  let processedItems = selectedItems;
  if (config?.preprocessItems) {
    onProgress?.({
      total: selectedItems.length,
      processed: 0,
      current: 0,
      percentage: 0,
      status: "processing",
      currentItem: "Preprocessing...",
    });
    processedItems = await config.preprocessItems(selectedItems);
  }

  // Execute in batches
  const total = processedItems.length;
  const startTime = Date.now();

  for (let i = 0; i < total; i += batchSize) {
    const batch = processedItems.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (item, batchIndex) => {
        const index = i + batchIndex;
        const itemId = (item as any).id || String(index);
        
        try {
          onProgress?.({
            total,
            processed: result.processedCount,
            current: index + 1,
            percentage: Math.round(((index + 1) / total) * 100),
            status: "processing",
            currentItem: (item as any).name || (item as any).display_id || `Item ${index + 1}`,
            startTime: new Date(startTime).toISOString(),
            estimatedEndTime: calculateETA(startTime, index + 1, total),
          });

          await executeFn(item, index, context);
          result.successCount++;
        } catch (error) {
          result.errorCount++;
          result.errors.push({
            itemId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
        
        result.processedCount++;
      })
    );
  }

  result.success = result.errorCount === 0;
  
  onProgress?.({
    total,
    processed: result.processedCount,
    current: total,
    percentage: 100,
    status: result.success ? "completed" : "failed",
  });

  // Store operation result for potential undo
  if (config?.allowUndo) {
    storeOperationForUndo(operationId, context);
  }

  return result;
}

/**
 * Validate bulk operation selection
 */
export function validateBulkSelection<T>(
  items: T[],
  selectedIds: Set<string>,
  operationKey: string
): { valid: boolean; error?: string; selectedCount: number } {
  const config = getBulkOperationConfig<T>(operationKey);
  const selectedItems = items.filter((item: any) => selectedIds.has(item.id));
  
  if (selectedItems.length === 0) {
    return { valid: false, error: "No items selected", selectedCount: 0 };
  }
  
  if (config?.validateSelection) {
    const validation = config.validateSelection(selectedItems);
    if (!validation.valid) {
      return { 
        valid: false, 
        error: validation.error, 
        selectedCount: selectedItems.length 
      };
    }
  }
  
  return { valid: true, selectedCount: selectedItems.length };
}

/**
 * Create bulk action handlers for common operations
 */
export function createBulkActionHandlers<T>() {
  return {
    /**
     * Delete selected items
     */
    deleteItems: async (
      items: T[],
      selectedIds: Set<string>,
      deleteFn: (id: string) => Promise<void>,
      onProgress?: (progress: BulkOperationProgress) => void
    ): Promise<BulkOperationResult> => {
      return executeBulkOperation({
        items,
        selectedIds,
        operationKey: "delete",
        executeFn: async (item) => {
          await deleteFn((item as any).id);
        },
        onProgress,
      });
    },

    /**
     * Update selected items with common values
     */
    updateItems: async (
      items: T[],
      selectedIds: Set<string>,
      updateData: Partial<T>,
      updateFn: (id: string, data: Partial<T>) => Promise<void>,
      onProgress?: (progress: BulkOperationProgress) => void
    ): Promise<BulkOperationResult> => {
      return executeBulkOperation({
        items,
        selectedIds,
        operationKey: "update",
        executeFn: async (item) => {
          await updateFn((item as any).id, updateData);
        },
        onProgress,
      });
    },

    /**
     * Export selected items to CSV
     */
    exportToCSV: (
      items: T[],
      selectedIds: Set<string>,
      columns: { key: string; header: string }[]
    ): string => {
      const selectedItems = items.filter((item: any) => selectedIds.has(item.id));
      
      const headers = columns.map(c => c.header).join(",");
      const rows = selectedItems.map(item => 
        columns.map(col => {
          const value = getNestedValue(item, col.key);
          const str = String(value ?? "").replace(/"/g, '""');
          return `"${str}"`;
        }).join(",")
      );
      
      return [headers, ...rows].join("\n");
    },

    /**
     * Archive selected items
     */
    archiveItems: async (
      items: T[],
      selectedIds: Set<string>,
      archiveFn: (id: string) => Promise<void>,
      onProgress?: (progress: BulkOperationProgress) => void
    ): Promise<BulkOperationResult> => {
      return executeBulkOperation({
        items,
        selectedIds,
        operationKey: "archive",
        executeFn: async (item) => {
          await archiveFn((item as any).id);
        },
        onProgress,
      });
    },

    /**
     * Change status of selected items
     */
    changeStatus: async (
      items: T[],
      selectedIds: Set<string>,
      newStatus: string,
      statusFn: (id: string, status: string) => Promise<void>,
      onProgress?: (progress: BulkOperationProgress) => void
    ): Promise<BulkOperationResult> => {
      return executeBulkOperation({
        items,
        selectedIds,
        operationKey: "status_change",
        executeFn: async (item) => {
          await statusFn((item as any).id, newStatus);
        },
        onProgress,
        metadata: { newStatus },
      });
    },

    /**
     * Assign items to a user/entity
     */
    assignItems: async (
      items: T[],
      selectedIds: Set<string>,
      assigneeId: string,
      assignFn: (id: string, assigneeId: string) => Promise<void>,
      onProgress?: (progress: BulkOperationProgress) => void
    ): Promise<BulkOperationResult> => {
      return executeBulkOperation({
        items,
        selectedIds,
        operationKey: "assign",
        executeFn: async (item) => {
          await assignFn((item as any).id, assigneeId);
        },
        onProgress,
        metadata: { assigneeId },
      });
    },
  };
}

// Undo storage
const undoStore = new Map<string, BulkActionContext<unknown>>();

function storeOperationForUndo<T>(operationId: string, context: BulkActionContext<T>): void {
  undoStore.set(operationId, context as BulkActionContext<unknown>);
  
  // Clean up old operations after 1 hour
  setTimeout(() => {
    undoStore.delete(operationId);
  }, 3600000);
}

/**
 * Check if an operation can be undone
 */
export function canUndo(operationId: string): boolean {
  return undoStore.has(operationId);
}

/**
 * Get undo context for an operation
 */
export function getUndoContext<T>(operationId: string): BulkActionContext<T> | undefined {
  return undoStore.get(operationId) as BulkActionContext<T> | undefined;
}

/**
 * Clear undo history
 */
export function clearUndoHistory(): void {
  undoStore.clear();
}

// Utility functions
function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateETA(startTime: number, current: number, total: number): string {
  if (current === 0) return "";
  const elapsed = Date.now() - startTime;
  const avgTimePerItem = elapsed / current;
  const remaining = (total - current) * avgTimePerItem;
  const eta = new Date(Date.now() + remaining);
  return eta.toISOString();
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((o, key) => o?.[key], obj);
}

// Register default operations
registerBulkOperation("delete", {
  type: "delete",
  label: "Delete",
  description: "Permanently delete selected items",
  icon: "Trash2",
  color: "destructive",
  requiresConfirmation: true,
  confirmationMessage: "Are you sure you want to delete the selected items? This action cannot be undone.",
  confirmButtonText: "Delete",
  allowUndo: false,
});

registerBulkOperation("update", {
  type: "update",
  label: "Update",
  description: "Update selected items",
  icon: "Edit",
  color: "primary",
  requiresConfirmation: false,
  allowUndo: true,
});

registerBulkOperation("archive", {
  type: "archive",
  label: "Archive",
  description: "Archive selected items",
  icon: "Archive",
  color: "secondary",
  requiresConfirmation: true,
  confirmationMessage: "Archive the selected items?",
  allowUndo: true,
});

registerBulkOperation("export", {
  type: "export",
  label: "Export",
  description: "Export selected items",
  icon: "Download",
  color: "default",
  requiresConfirmation: false,
  allowUndo: false,
});

registerBulkOperation("status_change", {
  type: "status_change",
  label: "Change Status",
  description: "Change status of selected items",
  icon: "RefreshCw",
  color: "warning",
  requiresConfirmation: false,
  allowUndo: true,
});

export default {
  registerBulkOperation,
  getBulkOperationConfig,
  getAllBulkOperations,
  executeBulkOperation,
  validateBulkSelection,
  createBulkActionHandlers,
  canUndo,
  getUndoContext,
  clearUndoHistory,
};
