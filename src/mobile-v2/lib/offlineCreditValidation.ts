/**
 * Mobile Offline Credit Limit Validation
 * Validates credit limits before queuing sales when offline
 */

import { supabase } from "@/integrations/supabase/client";

interface CachedCreditData {
  storeId: string;
  customerId: string;
  outstanding: number;
  storeTypeId: string;
  kycStatus: string;
  creditLimitOverride: number | null;
  creditLimitKyc: number;
  creditLimitNoKyc: number;
  cachedAt: string;
}

const CACHE_KEY = "mobile_credit_data";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedCreditData(storeId: string): Promise<CachedCreditData | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: Record<string, CachedCreditData> = JSON.parse(cached);
    const storeData = data[storeId];
    
    if (!storeData) return null;
    
    // Check cache expiry
    const cachedAt = new Date(storeData.cachedAt).getTime();
    const now = Date.now();
    if (now - cachedAt > CACHE_TTL_MS) {
      delete data[storeId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return null;
    }
    
    return storeData;
  } catch (error) {
    console.error("Error reading cached credit data:", error);
    return null;
  }
}

export function cacheCreditData(data: CachedCreditData): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const allData: Record<string, CachedCreditData> = cached ? JSON.parse(cached) : {};
    
    allData[data.storeId] = {
      ...data,
      cachedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(allData));
  } catch (error) {
    console.error("Error caching credit data:", error);
  }
}

export async function fetchAndCacheCreditData(storeId: string): Promise<CachedCreditData | null> {
  try {
    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .select(`
        id,
        outstanding,
        store_type_id,
        customer_id,
        customers (
          kyc_status,
          credit_limit_override
        ),
        store_types (
          credit_limit_kyc,
          credit_limit_no_kyc
        )
      `)
      .eq("id", storeId)
      .single();
    
    if (storeError || !storeData) {
      console.error("Failed to fetch store credit data:", storeError);
      return null;
    }
    
    const customers = (storeData as any).customers;
    const storeTypes = (storeData as any).store_types;
    
    const creditData: CachedCreditData = {
      storeId: storeData.id,
      customerId: storeData.customer_id,
      outstanding: Number(storeData.outstanding) || 0,
      storeTypeId: storeData.store_type_id,
      kycStatus: customers?.kyc_status || "not_requested",
      creditLimitOverride: customers?.credit_limit_override,
      creditLimitKyc: Number(storeTypes?.credit_limit_kyc) || 0,
      creditLimitNoKyc: Number(storeTypes?.credit_limit_no_kyc) || 0,
      cachedAt: new Date().toISOString(),
    };
    
    cacheCreditData(creditData);
    return creditData;
  } catch (error) {
    console.error("Error fetching credit data:", error);
    return null;
  }
}

export function resolveCreditLimitFromCache(data: CachedCreditData): { limit: number; source: string } {
  if (data.creditLimitOverride !== null && data.creditLimitOverride !== undefined) {
    return { limit: Number(data.creditLimitOverride), source: "customer override" };
  }
  
  const isKyc = data.kycStatus === "verified" || data.kycStatus === "approved";
  const limit = isKyc ? data.creditLimitKyc : data.creditLimitNoKyc;
  
  return { limit: Number(limit) || 0, source: isKyc ? "KYC" : "Non-KYC" };
}

export async function validateCreditLimitOffline(
  storeId: string,
  saleOutstanding: number,
  isAdmin: boolean
): Promise<{
  valid: boolean;
  currentOutstanding: number;
  newOutstanding: number;
  limit: number;
  limitSource: string;
  exceeded: boolean;
  warning?: string;
  cached: boolean;
}> {
  let creditData = await getCachedCreditData(storeId);
  let wasCached = true;
  
  if (!creditData) {
    creditData = await fetchAndCacheCreditData(storeId);
    wasCached = false;
    
    if (!creditData) {
      return {
        valid: true,
        currentOutstanding: 0,
        newOutstanding: saleOutstanding,
        limit: 0,
        limitSource: "unknown",
        exceeded: false,
        warning: "Credit limit data unavailable. Sale will be validated when online.",
        cached: false,
      };
    }
  }
  
  const { limit, source } = resolveCreditLimitFromCache(creditData);
  const currentOutstanding = creditData.outstanding;
  const newOutstanding = currentOutstanding + saleOutstanding;
  
  // Admins bypass credit limits
  if (isAdmin) {
    return {
      valid: true,
      currentOutstanding,
      newOutstanding,
      limit,
      limitSource: source,
      exceeded: false,
      cached: wasCached,
    };
  }
  
  const exceeded = limit > 0 && newOutstanding > limit;
  const usagePercent = limit > 0 ? (newOutstanding / limit) * 100 : 0;
  const nearLimit = usagePercent >= 80 && !exceeded;
  
  if (exceeded) {
    return {
      valid: false,
      currentOutstanding,
      newOutstanding,
      limit,
      limitSource: source,
      exceeded: true,
      warning: `Credit limit exceeded! Limit: ₹${limit.toLocaleString()}, After sale: ₹${newOutstanding.toLocaleString()}`,
      cached: wasCached,
    };
  }
  
  if (nearLimit) {
    return {
      valid: true,
      currentOutstanding,
      newOutstanding,
      limit,
      limitSource: source,
      exceeded: false,
      warning: `Near credit limit: ${Math.round(usagePercent)}% of limit used`,
      cached: wasCached,
    };
  }
  
  return {
    valid: true,
    currentOutstanding,
    newOutstanding,
    limit,
    limitSource: source,
    exceeded: false,
    cached: wasCached,
  };
}

export function clearCreditCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

export async function preloadCreditDataForStores(storeIds: string[]): Promise<void> {
  for (const storeId of storeIds) {
    await fetchAndCacheCreditData(storeId);
  }
}

export default {
  validateCreditLimitOffline,
  getCachedCreditData,
  fetchAndCacheCreditData,
  clearCreditCache,
  preloadCreditDataForStores,
};
