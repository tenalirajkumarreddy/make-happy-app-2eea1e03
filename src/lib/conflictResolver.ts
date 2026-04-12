/**
 * Offline Conflict Resolution
 * Phase 4: Scale & Polish - Issue #15
 * 
 * Detects conflicts between queued operations and current server state
 * Provides resolution strategies for user selection
 */

import { supabase } from "@/integrations/supabase/client";
import { PendingAction } from "./offlineQueue";

// Types for conflict detection
export interface OperationContext {
  storeOutstandingAtQueueTime?: number;
  productPriceAtQueueTime?: number;
  customerCreditLimitAtQueueTime?: number;
  timestampAtQueueTime: string;
  storeId?: string;
  customerId?: string;
  productIds?: string[];
}

export enum ConflictType {
  NONE = "none",
  CREDIT_EXCEEDED = "credit_exceeded",
  PRICE_CHANGED = "price_changed",
  STORE_INACTIVE = "store_inactive",
  PRODUCT_UNAVAILABLE = "product_unavailable",
  INSUFFICIENT_STOCK = "insufficient_stock",
  SALE_LIMIT_REACHED = "sale_limit_reached",
  DATA_STALE = "data_stale",
}

export interface Conflict {
  id: string;
  type: ConflictType;
  operation: PendingAction;
  currentState: {
    storeOutstanding?: number;
    productPrice?: number;
    customerCreditLimit?: number;
    storeIsActive?: boolean;
    productStock?: number;
    [key: string]: unknown;
  };
  queuedState: OperationContext;
  reason: string;
  severity: "warning" | "error" | "critical";
}

export enum ResolutionStrategy {
  APPLY_ANYWAY = "apply_anyway",
  MODIFY_AND_APPLY = "modify_and_apply",
  DISCARD = "discard",
  DEFER = "defer",
}

export interface ResolutionOption {
  strategy: ResolutionStrategy;
  label: string;
  description: string;
  icon: string;
  color: "default" | "warning" | "destructive" | "success";
}

export interface ConflictResolution {
  conflictId: string;
  strategy: ResolutionStrategy;
  modifications?: {
    amount?: number;
    products?: Array<{ productId: string; quantity: number }>;
    notes?: string;
  };
  timestamp: string;
  resolvedBy?: string;
}

// Resolution options for each conflict type
const RESOLUTION_OPTIONS: Record<ConflictType, ResolutionOption[]> = {
  [ConflictType.NONE]: [],
  [ConflictType.CREDIT_EXCEEDED]: [
    {
      strategy: ResolutionStrategy.MODIFY_AND_APPLY,
      label: "Modify Amount",
      description: "Reduce the sale amount to fit within credit limit",
      icon: "Edit3",
      color: "warning",
    },
    {
      strategy: ResolutionStrategy.APPLY_ANYWAY,
      label: "Apply Anyway",
      description: "Override credit limit (requires manager approval)",
      icon: "AlertTriangle",
      color: "destructive",
    },
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Cancel this operation",
      icon: "X",
      color: "default",
    },
  ],
  [ConflictType.PRICE_CHANGED]: [
    {
      strategy: ResolutionStrategy.MODIFY_AND_APPLY,
      label: "Use New Price",
      description: "Update the sale with current product prices",
      icon: "RefreshCw",
      color: "warning",
    },
    {
      strategy: ResolutionStrategy.APPLY_ANYWAY,
      label: "Keep Original",
      description: "Use the price at time of sale",
      icon: "Clock",
      color: "default",
    },
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Cancel this operation",
      icon: "X",
      color: "default",
    },
  ],
  [ConflictType.STORE_INACTIVE]: [
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Store is inactive, cannot complete operation",
      icon: "X",
      color: "destructive",
    },
    {
      strategy: ResolutionStrategy.DEFER,
      label: "Defer",
      description: "Keep in queue until store is reactivated",
      icon: "Pause",
      color: "warning",
    },
  ],
  [ConflictType.PRODUCT_UNAVAILABLE]: [
    {
      strategy: ResolutionStrategy.MODIFY_AND_APPLY,
      label: "Remove Unavailable",
      description: "Remove unavailable products from the sale",
      icon: "PackageX",
      color: "warning",
    },
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Cancel this operation",
      icon: "X",
      color: "default",
    },
  ],
  [ConflictType.INSUFFICIENT_STOCK]: [
    {
      strategy: ResolutionStrategy.MODIFY_AND_APPLY,
      label: "Adjust Quantities",
      description: "Reduce quantities to available stock levels",
      icon: "Package",
      color: "warning",
    },
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Cancel this operation",
      icon: "X",
      color: "default",
    },
  ],
  [ConflictType.SALE_LIMIT_REACHED]: [
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Daily sale limit has been reached",
      icon: "X",
      color: "default",
    },
    {
      strategy: ResolutionStrategy.DEFER,
      label: "Defer to Tomorrow",
      description: "Queue for processing next business day",
      icon: "Calendar",
      color: "warning",
    },
  ],
  [ConflictType.DATA_STALE]: [
    {
      strategy: ResolutionStrategy.MODIFY_AND_APPLY,
      label: "Update Values",
      description: "Refresh with current data from server",
      icon: "RefreshCw",
      color: "warning",
    },
    {
      strategy: ResolutionStrategy.APPLY_ANYWAY,
      label: "Use Original",
      description: "Proceed with original values",
      icon: "Clock",
      color: "default",
    },
  ],
};

/**
 * Capture context when queuing an operation
 */
export async function captureOperationContext(
  action: PendingAction
): Promise<OperationContext> {
  const context: OperationContext = {
    timestampAtQueueTime: new Date().toISOString(),
  };

  try {
    // Extract IDs from payload based on action type
    const payload = action.payload as Record<string, unknown>;

    if (action.type === "sale" || action.type === "transaction") {
      const storeId = payload.store_id as string;
      if (storeId) {
        context.storeId = storeId;
        
        // Get current store outstanding
        const { data: store } = await supabase
          .from("stores")
          .select("outstanding_balance, is_active, credit_limit")
          .eq("id", storeId)
          .single();
        
        if (store) {
          context.storeOutstandingAtQueueTime = store.outstanding_balance || 0;
          context.customerCreditLimitAtQueueTime = store.credit_limit || 0;
        }
      }

      // Get product prices if applicable
      const products = payload.products || payload.items;
      if (Array.isArray(products) && products.length > 0) {
        const productIds = products.map((p: { product_id: string }) => p.product_id);
        context.productIds = productIds;

        const { data: productData } = await supabase
          .from("products")
          .select("id, price")
          .in("id", productIds);

        if (productData && productData.length > 0) {
          // Store first product price as reference (can be extended to store all)
          context.productPriceAtQueueTime = productData[0]?.price || 0;
        }
      }
    }

    return context;
  } catch (error) {
    console.error("Error capturing operation context:", error);
    return context;
  }
}

/**
 * Detect conflicts between queued operation and current server state
 */
export async function detectConflicts(
  action: PendingAction
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];
  const context = (action as unknown as { context?: OperationContext }).context;

  if (!context) {
    return conflicts; // No context captured, can't detect conflicts
  }

  try {
    const payload = action.payload as Record<string, unknown>;
    const saleAmount = payload.total_amount || payload.amount || 0;

    // Check store status
    if (context.storeId) {
      const { data: currentStore } = await supabase
        .from("stores")
        .select("outstanding_balance, is_active, credit_limit, name")
        .eq("id", context.storeId)
        .single();

      if (currentStore) {
        // Conflict: Store is inactive
        if (currentStore.is_active === false) {
          conflicts.push({
            id: `inactive-${action.id}`,
            type: ConflictType.STORE_INACTIVE,
            operation: action,
            currentState: {
              storeIsActive: false,
            },
            queuedState: context,
            reason: `Store "${currentStore.name}" is now inactive`,
            severity: "critical",
          });
        }

        // Conflict: Credit limit exceeded
        const newOutstanding = (currentStore.outstanding_balance || 0) + Number(saleAmount);
        if (currentStore.credit_limit && newOutstanding > currentStore.credit_limit) {
          const exceededBy = newOutstanding - currentStore.credit_limit;
          conflicts.push({
            id: `credit-${action.id}`,
            type: ConflictType.CREDIT_EXCEEDED,
            operation: action,
            currentState: {
              storeOutstanding: currentStore.outstanding_balance,
              customerCreditLimit: currentStore.credit_limit,
            },
            queuedState: context,
            reason: `Credit limit exceeded by ₹${exceededBy.toFixed(2)}. Current outstanding: ₹${currentStore.outstanding_balance}, Credit limit: ₹${currentStore.credit_limit}`,
            severity: "error",
          });
        }

        // Conflict: Data stale (significant change in outstanding)
        const outstandingDiff = Math.abs(
          (currentStore.outstanding_balance || 0) - (context.storeOutstandingAtQueueTime || 0)
        );
        if (outstandingDiff > 1000) {
          conflicts.push({
            id: `stale-${action.id}`,
            type: ConflictType.DATA_STALE,
            operation: action,
            currentState: {
              storeOutstanding: currentStore.outstanding_balance,
            },
            queuedState: context,
            reason: `Outstanding balance has changed significantly (by ₹${outstandingDiff.toFixed(2)}) since this operation was queued`,
            severity: "warning",
          });
        }
      }
    }

    // Check product availability
    if (context.productIds && context.productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, price, is_active, stock_quantity")
        .in("id", context.productIds);

      if (products) {
        // Check for unavailable products
        const unavailableProducts = products.filter((p) => p.is_active === false);
        if (unavailableProducts.length > 0) {
          conflicts.push({
            id: `product-unavailable-${action.id}`,
            type: ConflictType.PRODUCT_UNAVAILABLE,
            operation: action,
            currentState: {
              unavailableProducts: unavailableProducts.map((p) => p.name),
            },
            queuedState: context,
            reason: `${unavailableProducts.length} product(s) are no longer available`,
            severity: "error",
          });
        }

        // Check for price changes
        const priceChangedProducts = products.filter((p) => {
          const queuedPrice = context.productPriceAtQueueTime;
          return queuedPrice && Math.abs(p.price - queuedPrice) > 0.01;
        });
        if (priceChangedProducts.length > 0) {
          conflicts.push({
            id: `price-changed-${action.id}`,
            type: ConflictType.PRICE_CHANGED,
            operation: action,
            currentState: {
              productPrice: products[0]?.price,
            },
            queuedState: context,
            reason: `Product price has changed from ₹${context.productPriceAtQueueTime} to ₹${products[0]?.price}`,
            severity: "warning",
          });
        }
      }
    }

    return conflicts;
  } catch (error) {
    console.error("Error detecting conflicts:", error);
    return conflicts;
  }
}

/**
 * Get available resolution options for a conflict
 */
export function getConflictResolutionOptions(conflict: Conflict): ResolutionOption[] {
  return RESOLUTION_OPTIONS[conflict.type] || [
    {
      strategy: ResolutionStrategy.APPLY_ANYWAY,
      label: "Apply Anyway",
      description: "Proceed with the original operation",
      icon: "Check",
      color: "default",
    },
    {
      strategy: ResolutionStrategy.DISCARD,
      label: "Discard",
      description: "Cancel this operation",
      icon: "X",
      color: "default",
    },
  ];
}

/**
 * Apply resolution to a conflict
 */
export async function resolveConflict(
  conflict: Conflict,
  resolution: ConflictResolution
): Promise<{ success: boolean; modifiedAction?: PendingAction; error?: string }> {
  try {
    switch (resolution.strategy) {
      case ResolutionStrategy.APPLY_ANYWAY:
        // Just proceed with original action
        return { success: true };

      case ResolutionStrategy.DISCARD:
        // Mark for discard (caller should remove from queue)
        return { success: true };

      case ResolutionStrategy.DEFER:
        // Keep in queue, will retry later
        return { success: true };

      case ResolutionStrategy.MODIFY_AND_APPLY:
        // Modify action based on conflict type
        const modifiedAction = await modifyActionForConflict(conflict, resolution);
        return { success: true, modifiedAction };

      default:
        return { success: false, error: "Unknown resolution strategy" };
    }
  } catch (error) {
    console.error("Error resolving conflict:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Modify action based on conflict type and resolution
 */
async function modifyActionForConflict(
  conflict: Conflict,
  resolution: ConflictResolution
): Promise<PendingAction> {
  const modifiedAction = { ...conflict.operation };
  const payload = { ...(modifiedAction.payload as Record<string, unknown>) };

  switch (conflict.type) {
    case ConflictType.CREDIT_EXCEEDED:
      if (resolution.modifications?.amount !== undefined) {
        payload.total_amount = resolution.modifications.amount;
        payload.amount = resolution.modifications.amount;
      }
      break;

    case ConflictType.PRICE_CHANGED:
      // Keep original price but add note
      payload.notes = `${payload.notes || ""} [Price changed from ₹${conflict.queuedState.productPriceAtQueueTime} to ₹${conflict.currentState.productPrice}]`.trim();
      break;

    case ConflictType.PRODUCT_UNAVAILABLE:
      if (resolution.modifications?.products) {
        payload.products = resolution.modifications.products;
      }
      break;
  }

  if (resolution.modifications?.notes) {
    payload.notes = resolution.modifications.notes;
  }

  modifiedAction.payload = payload;
  return modifiedAction;
}

/**
 * Log conflict resolution for audit
 */
export async function logConflictResolution(
  conflict: Conflict,
  resolution: ConflictResolution
): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    
    await supabase.from("activity_logs").insert({
      action: "conflict_resolved",
      entity_type: "offline_operation",
      entity_id: conflict.operation.id,
      details: {
        conflict_type: conflict.type,
        conflict_reason: conflict.reason,
        resolution_strategy: resolution.strategy,
        modifications: resolution.modifications,
        timestamp: resolution.timestamp,
      },
    });
  } catch (error) {
    console.error("Error logging conflict resolution:", error);
  }
}

/**
 * Get summary of all conflicts in queue
 */
export async function getConflictsSummary(
  actions: PendingAction[]
): Promise<{
  totalConflicts: number;
  byType: Record<ConflictType, number>;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
}> {
  const summary = {
    totalConflicts: 0,
    byType: {} as Record<ConflictType, number>,
    criticalCount: 0,
    errorCount: 0,
    warningCount: 0,
  };

  for (const action of actions) {
    const conflicts = await detectConflicts(action);
    summary.totalConflicts += conflicts.length;

    for (const conflict of conflicts) {
      summary.byType[conflict.type] = (summary.byType[conflict.type] || 0) + 1;
      
      if (conflict.severity === "critical") {
        summary.criticalCount++;
      } else if (conflict.severity === "error") {
        summary.errorCount++;
      } else if (conflict.severity === "warning") {
        summary.warningCount++;
      }
    }
  }

  return summary;
}

// Export types (enums ConflictType and ResolutionStrategy already exported above)
export type { Conflict, ConflictResolution, ResolutionOption, OperationContext };
