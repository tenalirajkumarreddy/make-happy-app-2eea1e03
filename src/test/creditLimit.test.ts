import { describe, it, expect } from "vitest";
import { resolveCreditLimit, StoreTypeCredit, CustomerCredit, StoreForCredit } from "@/lib/creditLimit";

const storeTypes: StoreTypeCredit[] = [
  { id: "st-1", credit_limit_kyc: 50000, credit_limit_no_kyc: 10000 },
  { id: "st-2", credit_limit_kyc: null, credit_limit_no_kyc: 5000 },
  { id: "st-3", credit_limit_kyc: 100000, credit_limit_no_kyc: null },
];

const customers: CustomerCredit[] = [
  { id: "cust-1", kyc_status: "approved", credit_limit_override: null },
  { id: "cust-2", kyc_status: "pending", credit_limit_override: null },
  { id: "cust-3", kyc_status: "approved", credit_limit_override: 75000 },
  { id: "cust-4", kyc_status: "not_requested", credit_limit_override: null },
];

describe("resolveCreditLimit", () => {
  it("returns KYC limit for approved customer", () => {
    const store: StoreForCredit = { store_type_id: "st-1", customer_id: "cust-1" };
    const result = resolveCreditLimit(store, storeTypes, customers);
    expect(result).not.toBeNull();
    expect(result!.limit).toBe(50000);
    expect(result!.source).toBe("KYC");
    expect(result!.isKyc).toBe(true);
  });

  it("returns Non-KYC limit for pending KYC customer", () => {
    const store: StoreForCredit = { store_type_id: "st-1", customer_id: "cust-2" };
    const result = resolveCreditLimit(store, storeTypes, customers);
    expect(result).not.toBeNull();
    expect(result!.limit).toBe(10000);
    expect(result!.source).toBe("Non-KYC");
    expect(result!.isKyc).toBe(false);
  });

  it("uses customer override when set", () => {
    const store: StoreForCredit = { store_type_id: "st-1", customer_id: "cust-3" };
    const result = resolveCreditLimit(store, storeTypes, customers);
    expect(result).not.toBeNull();
    expect(result!.limit).toBe(75000);
    expect(result!.source).toBe("customer override");
  });

  it("returns null when store type is not found", () => {
    const store: StoreForCredit = { store_type_id: "nonexistent", customer_id: "cust-1" };
    expect(resolveCreditLimit(store, storeTypes, customers)).toBeNull();
  });

  it("returns null when customer is not found", () => {
    const store: StoreForCredit = { store_type_id: "st-1", customer_id: "nonexistent" };
    expect(resolveCreditLimit(store, storeTypes, customers)).toBeNull();
  });

  it("falls back to 0 for null KYC limit", () => {
    const store: StoreForCredit = { store_type_id: "st-2", customer_id: "cust-1" };
    const result = resolveCreditLimit(store, storeTypes, customers);
    expect(result!.limit).toBe(0); // credit_limit_kyc is null → falls to 0
  });

  it("falls back to 0 for null non-KYC limit", () => {
    const store: StoreForCredit = { store_type_id: "st-3", customer_id: "cust-4" };
    const result = resolveCreditLimit(store, storeTypes, customers);
    expect(result!.limit).toBe(0); // credit_limit_no_kyc is null → falls to 0
  });

  it("handles customer override of 0 (explicit zero credit)", () => {
    const customersWithZero: CustomerCredit[] = [
      { id: "cust-5", kyc_status: "approved", credit_limit_override: 0 },
    ];
    const store: StoreForCredit = { store_type_id: "st-1", customer_id: "cust-5" };
    const result = resolveCreditLimit(store, storeTypes, customersWithZero);
    expect(result).not.toBeNull();
    expect(result!.limit).toBe(0);
    expect(result!.source).toBe("customer override");
  });
});
