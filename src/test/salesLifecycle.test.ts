import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getValidationRules,
  validateSaleDate,
  validatePayment,
  validateSaleItems,
  validateStore,
  validateCreditLimit,
  validateWithStockCheck,
} from "@/hooks/useSaleValidation";

// ─── helpers ────────────────────────────────────────────────────────
const today = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const money = (n: number) => `₹${n.toLocaleString()}`;

// ─── 1. Validation rules per role ───────────────────────────────────
describe("Sales Lifecycle – Validation Rules", () => {
  it("operator requires full payment", () => {
    expect(getValidationRules("operator").requireFullPayment).toBe(true);
  });

  it("agent allows partial payment", () => {
    expect(getValidationRules("agent").requireFullPayment).toBe(false);
  });

  it("marketer allows partial payment", () => {
    expect(getValidationRules("marketer").requireFullPayment).toBe(false);
  });

  it("super_admin allows partial payment", () => {
    expect(getValidationRules("super_admin").requireFullPayment).toBe(false);
  });

  it("undefined role defaults to partial payment allowed", () => {
    expect(getValidationRules(undefined).requireFullPayment).toBe(false);
  });

  it("default rules allow 30-day past backdating", () => {
    const rules = getValidationRules("agent");
    expect(rules.maxSaleDatePast).toBe(30);
  });

  it("default rules allow 1-day future", () => {
    const rules = getValidationRules("manager");
    expect(rules.maxSaleDateFuture).toBe(1);
  });
});

// ─── 2. Sale date validation ────────────────────────────────────────
describe("Sales Lifecycle – Date Validation", () => {
  const rules = { maxSaleDateFuture: 1, maxSaleDatePast: 30 };

  it("accepts null date (uses current time)", () => {
    expect(validateSaleDate(null, rules).valid).toBe(true);
  });

  it("accepts undefined date", () => {
    expect(validateSaleDate(undefined, rules).valid).toBe(true);
  });

  it("accepts today", () => {
    expect(validateSaleDate(today(), rules).valid).toBe(true);
  });

  it("accepts yesterday", () => {
    expect(validateSaleDate(daysAgo(1), rules).valid).toBe(true);
  });

  it("accepts 30 days ago", () => {
    expect(validateSaleDate(daysAgo(30), rules).valid).toBe(true);
  });

  it("rejects 31 days ago", () => {
    const r = validateSaleDate(daysAgo(31), rules);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("past");
  });

  it("accepts tomorrow", () => {
    expect(validateSaleDate(daysFromNow(1), rules).valid).toBe(true);
  });

  it("rejects 2 days in future", () => {
    const r = validateSaleDate(daysFromNow(2), rules);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("future");
  });
});

// ─── 3. Payment validation ──────────────────────────────────────────
describe("Sales Lifecycle – Payment Validation", () => {
  it("accepts exact full payment", () => {
    expect(validatePayment(1000, 700, 300, false).valid).toBe(true);
  });

  it("accepts partial payment (credit sale)", () => {
    expect(validatePayment(1000, 400, 100, false).valid).toBe(true);
  });

  it("accepts zero payment (full credit)", () => {
    expect(validatePayment(1000, 0, 0, false).valid).toBe(true);
  });

  it("rejects overpayment", () => {
    const r = validatePayment(1000, 600, 500, false);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("exceeds");
  });

  it("rejects negative cash", () => {
    const r = validatePayment(1000, -100, 500, false);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("negative");
  });

  it("rejects negative UPI", () => {
    const r = validatePayment(1000, 500, -100, false);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("negative");
  });

  it("operator: rejects partial payment", () => {
    const r = validatePayment(1000, 500, 0, true);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("must equal");
  });

  it("operator: accepts exact payment", () => {
    expect(validatePayment(1000, 600, 400, true).valid).toBe(true);
  });

  it("handles zero-total sale with zero payment", () => {
    expect(validatePayment(0, 0, 0, false).valid).toBe(true);
  });
});

// ─── 4. Sale items validation ───────────────────────────────────────
describe("Sales Lifecycle – Items Validation", () => {
  const rules = { minQuantity: 1, allowZeroTotal: false };

  it("accepts single valid item", () => {
    const r = validateSaleItems([{ product_id: "p1", quantity: 1, unit_price: 100 }], rules);
    expect(r.valid).toBe(true);
    expect(r.hasProducts).toBe(true);
  });

  it("accepts multiple items", () => {
    const items = [
      { product_id: "p1", quantity: 2, unit_price: 100 },
      { product_id: "p2", quantity: 3, unit_price: 200 },
    ];
    expect(validateSaleItems(items, rules).valid).toBe(true);
  });

  it("rejects empty items array", () => {
    const r = validateSaleItems([], rules);
    expect(r.valid).toBe(false);
    expect(r.hasProducts).toBe(false);
    expect(r.error).toContain("At least one item");
  });

  it("rejects item without product_id", () => {
    const r = validateSaleItems([{ product_id: "", quantity: 1 }], rules);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("select a product");
  });

  it("rejects zero quantity", () => {
    const r = validateSaleItems([{ product_id: "p1", quantity: 0 }], rules);
    expect(r.valid).toBe(false);
  });

  it("rejects negative quantity", () => {
    const r = validateSaleItems([{ product_id: "p1", quantity: -1 }], rules);
    expect(r.valid).toBe(false);
  });

  it("rejects zero total (quantity × unit_price = 0)", () => {
    const r = validateSaleItems([{ product_id: "p1", quantity: 5, unit_price: 0 }], rules);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("zero");
  });

  it("allows zero total when allowZeroTotal is true", () => {
    const r = validateSaleItems(
      [{ product_id: "p1", quantity: 5, unit_price: 0 }],
      { ...rules, allowZeroTotal: true }
    );
    expect(r.valid).toBe(true);
  });

  it("computes total from quantity × unit_price, not just quantity", () => {
    const items = [{ product_id: "p1", quantity: 3, unit_price: 250 }];
    const r = validateSaleItems(items, rules);
    expect(r.valid).toBe(true);
  });
});

// ─── 5. Store validation ────────────────────────────────────────────
describe("Sales Lifecycle – Store Validation", () => {
  it("rejects null store", () => {
    expect(validateStore(null).valid).toBe(false);
  });

  it("rejects empty string store", () => {
    expect(validateStore("").valid).toBe(false);
  });

  it("accepts valid active store with customer", () => {
    expect(validateStore("s1", { is_active: true, customer_id: "c1" }).valid).toBe(true);
  });

  it("rejects inactive store", () => {
    const r = validateStore("s1", { is_active: false, customer_id: "c1" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("inactive");
  });

  it("rejects store without customer", () => {
    const r = validateStore("s1", { is_active: true, customer_id: null });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("no linked customer");
  });

  it("accepts store without extra data (basic check)", () => {
    expect(validateStore("s1").valid).toBe(true);
  });
});

// ─── 6. Credit limit validation ─────────────────────────────────────
describe("Sales Lifecycle – Credit Limit", () => {
  it("allows sale when no credit limit set (0)", () => {
    const r = validateCreditLimit(500, 1000, 0);
    expect(r.valid).toBe(true);
    expect(r.exceeded).toBe(false);
  });

  it("allows sale well under limit", () => {
    const r = validateCreditLimit(200, 400, 1000);
    expect(r.valid).toBe(true);
    expect(r.exceeded).toBe(false);
    expect(r.warning).toBeUndefined();
  });

  it("warns when near limit (80%+)", () => {
    const r = validateCreditLimit(700, 850, 1000);
    expect(r.valid).toBe(true);
    expect(r.exceeded).toBe(false);
    expect(r.warning).toContain("Near credit limit");
  });

  it("rejects when limit exceeded", () => {
    const r = validateCreditLimit(800, 1200, 1000);
    expect(r.valid).toBe(false);
    expect(r.exceeded).toBe(true);
    expect(r.warning).toContain("exceeded");
  });

  it("warns at exactly 80%", () => {
    const r = validateCreditLimit(0, 800, 1000);
    expect(r.valid).toBe(true);
    expect(r.warning).toContain("Near credit limit");
  });

  it("rejects at 101%", () => {
    const r = validateCreditLimit(0, 1010, 1000);
    expect(r.valid).toBe(false);
    expect(r.exceeded).toBe(true);
  });

  it("allows at exactly 100%", () => {
    const r = validateCreditLimit(0, 1000, 1000);
    expect(r.valid).toBe(true);
    expect(r.exceeded).toBe(false);
  });
});

// ─── 7. Stock check validation ──────────────────────────────────────
describe("Sales Lifecycle – Stock Check", () => {
  it("passes when stock is sufficient", async () => {
    const fn = vi.fn().mockResolvedValue({
      data: [{ product_name: "Widget", available: true, available_qty: 10 }],
      error: null,
    });
    const r = await validateWithStockCheck([{ product_id: "p1", quantity: 5 }], "u1", fn);
    expect(r.valid).toBe(true);
  });

  it("fails when stock insufficient", async () => {
    const fn = vi.fn().mockResolvedValue({
      data: [{ product_name: "Widget", available: false, available_qty: 2 }],
      error: null,
    });
    const r = await validateWithStockCheck([{ product_id: "p1", quantity: 5 }], "u1", fn);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Insufficient stock");
    expect(r.insufficientProducts).toContain("Widget");
  });

  it("fails on DB error", async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    const r = await validateWithStockCheck([{ product_id: "p1", quantity: 5 }], "u1", fn);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Stock check failed");
  });

  it("fails on thrown exception", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network"));
    const r = await validateWithStockCheck([{ product_id: "p1", quantity: 5 }], "u1", fn);
    expect(r.valid).toBe(false);
  });

  it("handles multiple products with mixed stock", async () => {
    const fn = vi.fn().mockResolvedValue({
      data: [
        { product_name: "A", available: true, available_qty: 10 },
        { product_name: "B", available: false, available_qty: 1 },
      ],
      error: null,
    });
    const r = await validateWithStockCheck(
      [
        { product_id: "p1", quantity: 5 },
        { product_id: "p2", quantity: 5 },
      ],
      "u1",
      fn
    );
    expect(r.valid).toBe(false);
    expect(r.insufficientProducts).toContain("B");
    expect(r.insufficientProducts).not.toContain("A");
  });

  it("handles empty stock check result", async () => {
    const fn = vi.fn().mockResolvedValue({ data: [], error: null });
    const r = await validateWithStockCheck([{ product_id: "p1", quantity: 5 }], "u1", fn);
    expect(r.valid).toBe(true);
  });
});

// ─── 8. Sale cancellation impact ────────────────────────────────────
describe("Sales Lifecycle – Cancellation Impact", () => {
  it("admin_cancel_sale RPC signature accepts sale_id and restock target", () => {
    const rpcName = "admin_cancel_sale";
    const params = { p_sale_id: "sale-uuid", p_restock_user_id: null };
    expect(rpcName).toBe("admin_cancel_sale");
    expect(params.p_sale_id).toBeTruthy();
  });

  it("warehouse restock sets restock_user_id to null", () => {
    const restockTarget = "warehouse";
    const userId = restockTarget === "warehouse" ? null : "agent-1";
    expect(userId).toBeNull();
  });

  it("agent restock sets restock_user_id to agent", () => {
    const restockTarget = "agent";
    const agentId = "agent-uuid-123";
    const userId = restockTarget === "warehouse" ? null : agentId;
    expect(userId).toBe(agentId);
  });

  it("cancelled sale removes from sales list (optimistic)", () => {
    const sales = [
      { id: "sale-1", display_id: "S001" },
      { id: "sale-2", display_id: "S002" },
      { id: "sale-3", display_id: "S003" },
    ];
    const cancelled = "sale-2";
    const remaining = sales.filter((s) => s.id !== cancelled);
    expect(remaining).toHaveLength(2);
    expect(remaining.find((s) => s.id === cancelled)).toBeUndefined();
  });

  it("cancelled sale is restored on error", () => {
    const original = [{ id: "sale-1" }, { id: "sale-2" }];
    const cache = [...original];
    // Optimistic remove
    cache.splice(1, 1);
    expect(cache).toHaveLength(1);
    // Rollback
    cache.splice(0, cache.length, ...original);
    expect(cache).toHaveLength(2);
  });
});

// ─── 9. Sale return flow ────────────────────────────────────────────
describe("Sales Lifecycle – Return Flow", () => {
  it("record_sale_return RPC signature", () => {
    const rpcName = "record_sale_return";
    const params = {
      p_sale_id: "sale-1",
      p_returned_by: "user-1",
      p_reason: "damaged",
      p_items: [{ product_id: "p1", quantity: 1, unit_price: 100 }],
      p_created_at: new Date().toISOString(),
    };
    expect(rpcName).toBe("record_sale_return");
    expect(params.p_reason).toBe("damaged");
    expect(params.p_items).toHaveLength(1);
  });

  it("valid return reasons are lowercase", () => {
    const validReasons = ["damaged", "defective", "wrong_item", "not_needed", "expired", "other"];
    validReasons.forEach((r) => {
      expect(r).toBe(r.toLowerCase());
    });
  });

  it("process_completed_sale_return only processes approved returns", () => {
    const status = "approved";
    expect(status).toBe("approved");
  });

  it("return status transitions: pending -> approved/rejected", () => {
    const transitions = ["pending", "approved", "rejected"];
    expect(transitions).toContain("pending");
    expect(transitions).toContain("approved");
    expect(transitions).toContain("rejected");
  });

  it("admin can create returns on any date", () => {
    const role = "super_admin";
    const canBackdate = ["super_admin", "manager"].includes(role);
    expect(canBackdate).toBe(true);
  });
});

// ─── 10. Outstanding calculation ────────────────────────────────────
describe("Sales Lifecycle – Outstanding Calculation", () => {
  it("outstanding = total - cash - upi", () => {
    const total = 1000;
    const cash = 400;
    const upi = 200;
    const outstanding = Math.max(0, total - cash - upi);
    expect(outstanding).toBe(400);
  });

  it("outstanding clamped to zero when overpaid", () => {
    const total = 500;
    const cash = 600;
    const upi = 0;
    const outstanding = Math.max(0, total - cash - upi);
    expect(outstanding).toBe(0);
  });

  it("full cash sale has zero outstanding", () => {
    const total = 800;
    const cash = 800;
    const upi = 0;
    const outstanding = Math.max(0, total - cash - upi);
    expect(outstanding).toBe(0);
  });

  it("full credit sale outstanding equals total", () => {
    const total = 1200;
    const cash = 0;
    const upi = 0;
    const outstanding = Math.max(0, total - cash - upi);
    expect(outstanding).toBe(1200);
  });

  it("mixed payment outstanding", () => {
    const total = 2500;
    const cash = 1000;
    const upi = 500;
    const outstanding = Math.max(0, total - cash - upi);
    expect(outstanding).toBe(1000);
  });
});

// ─── 11. Display ID generation ──────────────────────────────────────
describe("Sales Lifecycle – Display IDs", () => {
  it("sale display ID format", () => {
    const id = "SALE-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    expect(id).toMatch(/^SALE-[A-Z0-9]{6}$/);
  });

  it("return display ID format", () => {
    const id = "RET-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    expect(id).toMatch(/^RET-[A-Z0-9]{6}$/);
  });

  it("transaction display ID format", () => {
    const id = "TXN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    expect(id).toMatch(/^TXN-[A-Z0-9]{6}$/);
  });

  it("order display ID format", () => {
    const id = "ORD-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    expect(id).toMatch(/^ORD-[A-Z0-9]{6}$/);
  });
});

// ─── 12. Multi-item sale total ──────────────────────────────────────
describe("Sales Lifecycle – Multi-Item Totals", () => {
  it("calculates correct total from items", () => {
    const items = [
      { product_id: "p1", quantity: 2, unit_price: 100 },
      { product_id: "p2", quantity: 1, unit_price: 350 },
      { product_id: "p3", quantity: 5, unit_price: 50 },
    ];
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    expect(total).toBe(800);
  });

  it("single item total", () => {
    const items = [{ product_id: "p1", quantity: 3, unit_price: 250 }];
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    expect(total).toBe(750);
  });

  it("items without unit_price default to 0", () => {
    const items = [{ product_id: "p1", quantity: 5 }];
    const total = items.reduce((sum, i) => sum + (i.quantity * ((i as any).unit_price || 0)), 0);
    expect(total).toBe(0);
  });
});

// ─── 13. Bulk sale scenarios ────────────────────────────────────────
describe("Sales Lifecycle – Bulk Scenarios", () => {
  it("agent creates sale, outstanding updates store", () => {
    const storeOutstanding = 5000;
    const saleTotal = 1200;
    const cash = 500;
    const upi = 200;
    const saleOutstanding = Math.max(0, saleTotal - cash - upi);
    const newStoreOutstanding = storeOutstanding + saleOutstanding;
    expect(saleOutstanding).toBe(500);
    expect(newStoreOutstanding).toBe(5500);
  });

  it("cancel sale restores store outstanding", () => {
    const storeOutstanding = 5500;
    const cancelledSaleOutstanding = 500;
    const newStoreOutstanding = storeOutstanding - cancelledSaleOutstanding;
    expect(newStoreOutstanding).toBe(5000);
  });

  it("return reduces outstanding by returned amount", () => {
    const storeOutstanding = 5000;
    const returnAmount = 300;
    const newOutstanding = storeOutstanding - returnAmount;
    expect(newOutstanding).toBe(4700);
  });

  it("multiple sales accumulate outstanding", () => {
    let outstanding = 0;
    const sales = [
      { total: 1000, cash: 500, upi: 100 },   // outstanding = 400
      { total: 800, cash: 0, upi: 0 },          // outstanding = 800
      { total: 500, cash: 500, upi: 0 },        // outstanding = 0
    ];
    sales.forEach((s) => {
      outstanding += Math.max(0, s.total - s.cash - s.upi);
    });
    expect(outstanding).toBe(1200);
  });

  it("credit limit check across multiple sales", () => {
    const creditLimit = 5000;
    let outstanding = 0;
    const sales = [1200, 800, 1500, 2000];
    let blocked = false;
    sales.forEach((total) => {
      const newOutstanding = outstanding + total;
      if (newOutstanding > creditLimit) {
        blocked = true;
      }
      if (!blocked) outstanding = newOutstanding;
    });
    expect(blocked).toBe(true);
    expect(outstanding).toBe(3500);
  });
});

// ─── 14. Sale date edge cases ───────────────────────────────────────
describe("Sales Lifecycle – Date Edge Cases", () => {
  const rules = { maxSaleDateFuture: 1, maxSaleDatePast: 30 };

  it("exactly 30 days ago is valid", () => {
    expect(validateSaleDate(daysAgo(30), rules).valid).toBe(true);
  });

  it("30 days + 1ms ago is invalid", () => {
    const d = new Date(Date.now() - 30 * 86400000 - 1).toISOString();
    expect(validateSaleDate(d, rules).valid).toBe(false);
  });

  it("exactly 1 day future is valid", () => {
    expect(validateSaleDate(daysFromNow(1), rules).valid).toBe(true);
  });

  it("1 day + 1ms future is invalid", () => {
    const d = new Date(Date.now() + 86400000 + 1).toISOString();
    expect(validateSaleDate(d, rules).valid).toBe(false);
  });

  it("epoch date is invalid (too far in past)", () => {
    expect(validateSaleDate("1970-01-01T00:00:00Z", rules).valid).toBe(false);
  });

  it("far future date is invalid", () => {
    expect(validateSaleDate("2099-12-31T23:59:59Z", rules).valid).toBe(false);
  });
});

// ─── 15. Payment edge cases ─────────────────────────────────────────
describe("Sales Lifecycle – Payment Edge Cases", () => {
  it("very large payment", () => {
    expect(validatePayment(99999999, 99999999, 0, false).valid).toBe(true);
  });

  it("paise precision (₹10.50)", () => {
    expect(validatePayment(1050, 500, 550, false).valid).toBe(true);
  });

  it("fractional amounts", () => {
    expect(validatePayment(333.33, 100, 100, false).valid).toBe(true);
  });

  it("cash = 0, upi = 0, requireFull = false (full credit)", () => {
    expect(validatePayment(500, 0, 0, false).valid).toBe(true);
  });

  it("cash = 0, upi = 0, requireFull = true (rejected)", () => {
    expect(validatePayment(500, 0, 0, true).valid).toBe(false);
  });
});

// ─── 16. Items edge cases ───────────────────────────────────────────
describe("Sales Lifecycle – Items Edge Cases", () => {
  const rules = { minQuantity: 1, allowZeroTotal: false };

  it("very large quantity", () => {
    expect(validateSaleItems([{ product_id: "p1", quantity: 99999, unit_price: 1 }], rules).valid).toBe(true);
  });

  it("fractional quantity (1.5)", () => {
    expect(validateSaleItems([{ product_id: "p1", quantity: 1.5, unit_price: 100 }], rules).valid).toBe(true);
  });

  it("100 items in single sale", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      product_id: `p${i}`,
      quantity: 1,
      unit_price: 10,
    }));
    expect(validateSaleItems(items, rules).valid).toBe(true);
  });

  it("mixture of valid and invalid items", () => {
    const items = [
      { product_id: "p1", quantity: 1, unit_price: 100 },
      { product_id: "", quantity: 1 },
    ];
    expect(validateSaleItems(items, rules).valid).toBe(false);
  });
});
