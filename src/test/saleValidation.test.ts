import { describe, it, expect, vi } from "vitest";
import {
  getValidationRules,
  validateSaleDate,
  validatePayment,
  validateSaleItems,
  validateStore,
  validateCreditLimit,
  validateWithStockCheck,
} from "@/hooks/useSaleValidation";

describe("Sale Validation", () => {
  describe("getValidationRules", () => {
    it("returns POS rules for operator role", () => {
      const rules = getValidationRules("operator");
      expect(rules.requireFullPayment).toBe(true);
    });

    it("returns default rules for other roles", () => {
      const rules = getValidationRules("agent");
      expect(rules.requireFullPayment).toBe(false);
    });

    it("returns default rules when role is undefined", () => {
      const rules = getValidationRules(undefined);
      expect(rules.requireFullPayment).toBe(false);
    });
  });

  describe("validateSaleDate", () => {
    const rules = { maxSaleDateFuture: 1, maxSaleDatePast: 30 };

    it("accepts null/undefined dates", () => {
      expect(validateSaleDate(null, rules).valid).toBe(true);
      expect(validateSaleDate(undefined, rules).valid).toBe(true);
    });

    it("rejects future dates beyond limit", () => {
      const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = validateSaleDate(future, rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("future");
    });

    it("rejects past dates beyond limit", () => {
      const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const result = validateSaleDate(past, rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("past");
    });

    it("accepts valid dates", () => {
      const today = new Date().toISOString();
      expect(validateSaleDate(today, rules).valid).toBe(true);
    });
  });

  describe("validatePayment", () => {
    it("accepts valid payment", () => {
      const result = validatePayment(1000, 500, 500, false);
      expect(result.valid).toBe(true);
    });

    it("rejects overpayment", () => {
      const result = validatePayment(1000, 600, 500, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds");
    });

    it("rejects negative amounts", () => {
      const result = validatePayment(1000, -100, 500, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("negative");
    });

    it("requires full payment when specified", () => {
      const result = validatePayment(1000, 500, 400, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must equal");
    });
  });

  describe("validateSaleItems", () => {
    const rules = { minQuantity: 1, allowZeroTotal: false };

    it("accepts valid items", () => {
      const items = [{ product_id: "p1", quantity: 2 }];
      const result = validateSaleItems(items, rules);
      expect(result.valid).toBe(true);
    });

    it("rejects empty items", () => {
      const result = validateSaleItems([], rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("At least one item");
    });

    it("rejects items without product_id", () => {
      const items = [{ product_id: "", quantity: 2 }];
      const result = validateSaleItems(items, rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("select a product");
    });

    it("rejects invalid quantities", () => {
      const items = [{ product_id: "p1", quantity: 0 }];
      const result = validateSaleItems(items, rules);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateStore", () => {
    it("rejects null storeId", () => {
      const result = validateStore(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("select a store");
    });

    it("accepts valid store", () => {
      const result = validateStore("store-1");
      expect(result.valid).toBe(true);
    });

    it("rejects inactive store", () => {
      const result = validateStore("store-1", { is_active: false, customer_id: "c1" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("inactive");
    });

    it("rejects store without customer", () => {
      const result = validateStore("store-1", { is_active: true, customer_id: null });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no linked customer");
    });
  });

  describe("validateCreditLimit", () => {
    it("allows sales when no limit set", () => {
      const result = validateCreditLimit(0, 500, 0);
      expect(result.valid).toBe(true);
      expect(result.exceeded).toBe(false);
    });

    it("warns when limit exceeded", () => {
      const result = validateCreditLimit(800, 1200, 1000);
      expect(result.valid).toBe(true);
      expect(result.exceeded).toBe(true);
      expect(result.warning).toContain("exceeded");
    });

    it("warns when near limit", () => {
      const result = validateCreditLimit(750, 850, 1000);
      expect(result.valid).toBe(true);
      expect(result.exceeded).toBe(false);
      expect(result.warning).toContain("Near credit limit");
    });

    it("accepts when well under limit", () => {
      const result = validateCreditLimit(100, 200, 1000);
      expect(result.valid).toBe(true);
      expect(result.exceeded).toBe(false);
      expect(result.warning).toBeUndefined();
    });
  });

  describe("validateWithStockCheck", () => {
    it("returns valid when stock is sufficient", async () => {
      const mockCheckFn = vi.fn().mockResolvedValue({
        data: [{ product_name: "Product A", available: true, available_qty: 10 }],
        error: null,
      });

      const result = await validateWithStockCheck(
        [{ product_id: "p1", quantity: 5 }],
        "user-1",
        mockCheckFn
      );

      expect(result.valid).toBe(true);
    });

    it("returns invalid when stock is insufficient", async () => {
      const mockCheckFn = vi.fn().mockResolvedValue({
        data: [{ product_name: "Product A", available: false, available_qty: 3 }],
        error: null,
      });

      const result = await validateWithStockCheck(
        [{ product_id: "p1", quantity: 5 }],
        "user-1",
        mockCheckFn
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Insufficient stock");
      expect(result.insufficientProducts).toContain("Product A");
    });

    it("handles stock check errors", async () => {
      const mockCheckFn = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      });

      const result = await validateWithStockCheck(
        [{ product_id: "p1", quantity: 5 }],
        "user-1",
        mockCheckFn
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Stock check failed");
    });
  });
});
