export interface StoreTypeCredit {
  id: string;
  credit_limit_kyc: number | null;
  credit_limit_no_kyc: number | null;
}

export interface CustomerCredit {
  id: string;
  kyc_status: string;
  credit_limit_override: number | null;
}

export interface StoreForCredit {
  store_type_id: string;
  customer_id: string;
}

export interface CreditLimitInfo {
  limit: number;
  source: string;
  isKyc: boolean;
}

/**
 * Resolves the effective credit limit for a store.
 * Priority: customer-level override > store-type KYC/non-KYC default.
 * Returns null if store type or customer is not found.
 */
export function resolveCreditLimit(
  store: StoreForCredit,
  storeTypes: StoreTypeCredit[],
  customers: CustomerCredit[]
): CreditLimitInfo | null {
  const storeType = storeTypes.find((st) => st.id === store.store_type_id);
  if (!storeType) return null;

  const customer = customers.find((c) => c.id === store.customer_id);
  if (!customer) return null;

  if (customer.credit_limit_override !== null && customer.credit_limit_override !== undefined) {
    return {
      limit: Number(customer.credit_limit_override),
      source: "customer override",
      isKyc: customer.kyc_status === "approved" || customer.kyc_status === "verified",
    };
  }

  const isKyc = customer.kyc_status === "approved" || customer.kyc_status === "verified";
  const limit = isKyc
    ? Number(storeType.credit_limit_kyc || 0)
    : Number(storeType.credit_limit_no_kyc || 0);

  return { limit, source: isKyc ? "KYC" : "Non-KYC", isKyc };
}
