import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedCreditData {
  creditLimit: number;
  currentOutstanding: number;
  lastFetch: number;
  storeId: string;
}

const creditCache: Record<string, CachedCreditData> = {};

/**
 * Validates credit limit offline using cached data
 * @param storeId The store ID to validate
 * @param outstandingAmount The sale's outstanding amount
 * @param isAdmin Whether the user is an admin
 * @returns Validation result
 */
export const validateCreditLimitOffline = async (
  storeId: string,
  outstandingAmount: number,
  isAdmin: boolean
): Promise<{ valid: boolean; warning?: string; limit?: number }> => {
  // Admins can bypass the UI check - system will check on server
  if (isAdmin) {
    return { valid: true };
  }

  const cached = creditCache[storeId];
  const now = Date.now();
  
  // ✅ FIXED: Don't allow sale if credit data is expired/missing
  if (!cached || now - cached.lastFetch > CACHE_TTL_MS) {
    return {
      valid: false,
      warning: "Credit limit data unavailable. Please go online."
    };
  }

  // If credit limit is 0, it's disabled - allow sale
  if (cached.creditLimit <= 0) {
    return { valid: true };
  }

  // Check 80% utilization warning
  if ((cached.currentOutstanding + outstandingAmount) > cached.creditLimit * 0.8) {
    return {
      valid: true,
      warning: `Approaching credit limit. Available: ₹${Math.max(0, cached.creditLimit - (cached.currentOutstanding + outstandingAmount)).toLocaleString()}`,
      limit: cached.creditLimit
    };
  }

  // Check hard limit
  if ((cached.currentOutstanding + outstandingAmount) > cached.creditLimit) {
    return {
      valid: false,
      warning: `Credit limit exceeded. Limit: ₹${cached.creditLimit.toLocaleString()}`,
      limit: cached.creditLimit
    };
  }

  return { valid: true, limit: cached.creditLimit };
};

/**
 * Preloads credit data for stores
 */
export const preloadCreditDataForStores = async (
  storeIds: string[],
  customerId: string
) => {
  const now = Date.now();
  const needsUpdate = storeIds.filter(storeId => {
    const cached = creditCache[storeId];
    return !cached || now - cached.lastFetch > CACHE_TTL_MS;
  });

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  await Promise.all(needsUpdate.map(async storeId => {
    const { data: creditInfo, error } = await supabase.rpc("get_store_credit_info", {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_current_user_id: userId
    });
    
    if (!error && creditInfo) {
      creditCache[storeId] = {
        creditLimit: creditInfo.credit_limit || 0,
        currentOutstanding: creditInfo.outstanding || 0,
        lastFetch: now,
        storeId
      };
    }
  }));
};

/**
 * Fetches and caches credit data for a specific store-customer pair
 */
export const fetchAndCacheCreditData = async (
  storeId: string,
  customerId: string
) => {
  const now = Date.now();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: creditInfo, error } = await supabase.rpc("get_store_credit_info", {
    p_store_id: storeId,
    p_customer_id: customerId,
    p_current_user_id: user?.id
  });
  
  if (!error && creditInfo) {
    creditCache[storeId] = {
      creditLimit: creditInfo.credit_limit || 0,
      currentOutstanding: creditInfo.outstanding || 0,
      lastFetch: now,
      storeId
    };
    return creditCache[storeId];
  }

  return null;
};