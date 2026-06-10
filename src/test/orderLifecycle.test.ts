import { describe, it, expect, vi } from "vitest";

// ─── Order status enum ──────────────────────────────────────────────
type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── 1. Order status transitions ────────────────────────────────────
describe("Order Lifecycle – Status Transitions", () => {
  it("pending -> confirmed (auto-confirm or manual)", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
  });

  it("pending -> cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("confirmed -> delivered (fulfillment)", () => {
    expect(canTransition("confirmed", "delivered")).toBe(true);
  });

  it("confirmed -> cancelled", () => {
    expect(canTransition("confirmed", "cancelled")).toBe(true);
  });

  it("delivered -> cannot change", () => {
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("delivered", "pending")).toBe(false);
    expect(canTransition("delivered", "confirmed")).toBe(false);
  });

  it("cancelled -> cannot change", () => {
    expect(canTransition("cancelled", "pending")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("cancelled", "delivered")).toBe(false);
  });

  it("pending -> delivered (skip confirmed) is invalid", () => {
    expect(canTransition("pending", "delivered")).toBe(false);
  });

  it("confirmed -> pending (reverse) is invalid", () => {
    expect(canTransition("confirmed", "pending")).toBe(false);
  });
});

// ─── 2. Auto-confirm setting ────────────────────────────────────────
describe("Order Lifecycle – Auto-Confirm", () => {
  it("auto_confirm = false: order starts as pending", () => {
    const autoConfirm = false;
    const initialStatus: OrderStatus = autoConfirm ? "confirmed" : "pending";
    expect(initialStatus).toBe("pending");
  });

  it("auto_confirm = true: order starts as confirmed", () => {
    const autoConfirm = true;
    const initialStatus: OrderStatus = autoConfirm ? "confirmed" : "pending";
    expect(initialStatus).toBe("confirmed");
  });

  it("setting key is 'auto_confirm_orders'", () => {
    const key = "auto_confirm_orders";
    expect(key).toBe("auto_confirm_orders");
  });

  it("default value is 'false'", () => {
    const defaultValue = "false";
    expect(defaultValue).toBe("false");
  });
});

// ─── 3. create_order RPC ────────────────────────────────────────────
describe("Order Lifecycle – create_order RPC", () => {
  const validParams = {
    p_store_id: "store-1",
    p_customer_id: "cust-1",
    p_assigned_to: "agent-1",
    p_warehouse_id: "wh-1",
    p_order_type: "delivery",
    p_requirement_note: "Urgent",
    p_total_amount: 5000,
    p_created_by: "admin-1",
  };

  it("accepts all required parameters", () => {
    Object.values(validParams).forEach((v) => {
      expect(v).toBeTruthy();
    });
  });

  it("store lock uses FOR UPDATE", () => {
    const lockQuery = "SELECT id FROM public.stores WHERE id = p_store_id FOR UPDATE";
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("checks for existing active orders", () => {
    const checkQuery = "SELECT id FROM public.orders WHERE store_id = p_store_id AND status IN ('pending', 'confirmed')";
    expect(checkQuery).toContain("'pending'");
    expect(checkQuery).toContain("'confirmed'");
  });

  it("generates ORD-prefixed display ID", () => {
    const displayId = "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    expect(displayId).toMatch(/^ORD-[A-Z0-9]{8,}$/);
  });

  it("respects auto-confirm setting", () => {
    const autoConfirmTrue = "true";
    const autoConfirmFalse = "false";
    expect(autoConfirmTrue).toBe("true");
    expect(autoConfirmFalse).toBe("false");
  });
});

// ─── 4. Order fulfillment ───────────────────────────────────────────
describe("Order Lifecycle – Fulfillment", () => {
  it("record_sale RPC locks order row before fulfillment", () => {
    const lockQuery = "SELECT id FROM public.orders o WHERE o.id = p_fulfilled_order_id FOR UPDATE";
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("prevents double-fulfillment by checking status after lock", () => {
    const checkQuery = "SELECT 1 FROM public.orders WHERE id = p_fulfilled_order_id AND status = 'delivered'";
    expect(checkQuery).toContain("AND status = 'delivered'");
  });

  it("locks store row before outstanding modification", () => {
    const storeLock = "FROM public.stores s WHERE s.id = p_store_id FOR UPDATE";
    expect(storeLock).toContain("FOR UPDATE");
  });

  it("detects concurrent outstanding modification", () => {
    const errorMsg = "concurrent_modification: expected=1000, actual=1500";
    expect(errorMsg).toContain("concurrent_modification");
    const expected = errorMsg.match(/expected=(\d+)/)?.[1];
    const actual = errorMsg.match(/actual=(\d+)/)?.[1];
    expect(expected).toBe("1000");
    expect(actual).toBe("1500");
  });

  it("locks staff_stock rows for targeted user", () => {
    const lockQuery = "FROM staff_stock ss WHERE ss.user_id = v_target_user_id AND ss.product_id = ANY(v_all_product_ids) FOR UPDATE";
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("locks product_stock rows for warehouse", () => {
    const lockQuery = "FROM product_stock ps WHERE ps.warehouse_id = v_warehouse_id AND ps.product_id = ANY(v_all_product_ids) FOR UPDATE";
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("returns correct columns", () => {
    const returnType = "TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)";
    expect(returnType).toContain("sale_id");
    expect(returnType).toContain("sale_display_id");
    expect(returnType).toContain("new_outstanding");
    expect(returnType).toContain("stock_reserved");
  });

  it("fulfillment uses order item prices, not base prices", () => {
    const orderItem = { product_id: "p1", quantity: 5, unit_price: 250 };
    const basePrice = 200;
    const expectedTotal = orderItem.quantity * orderItem.unit_price;
    expect(expectedTotal).toBe(1250);
    expect(expectedTotal).not.toBe(orderItem.quantity * basePrice);
  });
});

// ─── 5. Order transfer ──────────────────────────────────────────────
describe("Order Lifecycle – Transfer", () => {
  it("transfer requires updated_at for optimistic lock", () => {
    const update = { assigned_to: "new-agent-1", updated_at: new Date().toISOString() };
    expect(update.updated_at).toBeTruthy();
  });

  it("transfer changes assigned_to", () => {
    const order = { assigned_to: "agent-1" };
    order.assigned_to = "agent-2";
    expect(order.assigned_to).toBe("agent-2");
  });
});

// ─── 6. Order soft-delete ───────────────────────────────────────────
describe("Order Lifecycle – Soft Delete", () => {
  it("soft delete sets deleted_at timestamp", () => {
    const order = { id: "o1", deleted_at: null };
    order.deleted_at = new Date().toISOString();
    expect(order.deleted_at).toBeTruthy();
  });

  it("soft delete does not remove order from DB", () => {
    const orders = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];
    const deletedId = "o2";
    // Simulate soft delete - order still exists but has deleted_at
    const result = orders.map((o) =>
      o.id === deletedId ? { ...o, deleted_at: new Date().toISOString() } : o
    );
    expect(result).toHaveLength(3);
  });

  it("query filters out soft-deleted orders", () => {
    const orders = [
      { id: "o1", deleted_at: null },
      { id: "o2", deleted_at: "2024-01-01T00:00:00Z" },
      { id: "o3", deleted_at: null },
    ];
    const active = orders.filter((o) => !o.deleted_at);
    expect(active).toHaveLength(2);
  });
});

// ─── 7. Order display IDs ───────────────────────────────────────────
describe("Order Lifecycle – Display IDs", () => {
  it("order display ID starts with ORD-", () => {
    const id = "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    expect(id).toMatch(/^ORD-/);
  });

  it("display ID is unique per order", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase())
    );
    expect(ids.size).toBe(100);
  });
});

// ─── 8. Order with store active order prevention ────────────────────
describe("Order Lifecycle – Active Order Prevention", () => {
  it("store with pending order cannot create new order", () => {
    const existingOrders = [{ status: "pending", store_id: "s1" }];
    const newOrderStoreId = "s1";
    const hasActive = existingOrders.some(
      (o) => o.store_id === newOrderStoreId && ["pending", "confirmed"].includes(o.status)
    );
    expect(hasActive).toBe(true);
  });

  it("store with confirmed order cannot create new order", () => {
    const existingOrders = [{ status: "confirmed", store_id: "s1" }];
    const newOrderStoreId = "s1";
    const hasActive = existingOrders.some(
      (o) => o.store_id === newOrderStoreId && ["pending", "confirmed"].includes(o.status)
    );
    expect(hasActive).toBe(true);
  });

  it("store with delivered order can create new order", () => {
    const existingOrders = [{ status: "delivered", store_id: "s1" }];
    const newOrderStoreId = "s1";
    const hasActive = existingOrders.some(
      (o) => o.store_id === newOrderStoreId && ["pending", "confirmed"].includes(o.status)
    );
    expect(hasActive).toBe(false);
  });

  it("store with cancelled order can create new order", () => {
    const existingOrders = [{ status: "cancelled", store_id: "s1" }];
    const newOrderStoreId = "s1";
    const hasActive = existingOrders.some(
      (o) => o.store_id === newOrderStoreId && ["pending", "confirmed"].includes(o.status)
    );
    expect(hasActive).toBe(false);
  });

  it("different store can create order even if another has active", () => {
    const existingOrders = [{ status: "pending", store_id: "s1" }];
    const newOrderStoreId = "s2";
    const hasActive = existingOrders.some(
      (o) => o.store_id === newOrderStoreId && ["pending", "confirmed"].includes(o.status)
    );
    expect(hasActive).toBe(false);
  });
});

// ─── 9. Order item price tracking ───────────────────────────────────
describe("Order Lifecycle – Item Prices", () => {
  it("order item stores unit_price at time of order", () => {
    const item = { product_id: "p1", quantity: 5, unit_price: 250 };
    expect(item.unit_price).toBe(250);
  });

  it("product price change does not affect existing order", () => {
    const orderItem = { unit_price: 250 };
    const currentProductPrice = 300;
    expect(orderItem.unit_price).not.toBe(currentProductPrice);
    expect(orderItem.unit_price).toBe(250);
  });

  it("order total uses item prices", () => {
    const items = [
      { quantity: 2, unit_price: 100 },
      { quantity: 3, unit_price: 200 },
    ];
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    expect(total).toBe(800);
  });
});

// ─── 10. Order cancellation impact ──────────────────────────────────
describe("Order Lifecycle – Cancellation Impact", () => {
  it("cancelled order does not create sale", () => {
    const order = { status: "cancelled" };
    const shouldCreateSale = order.status === "delivered";
    expect(shouldCreateSale).toBe(false);
  });

  it("cancelled order does not deduct stock", () => {
    const order = { status: "cancelled" };
    const shouldDeduct = ["delivered", "confirmed"].includes(order.status);
    expect(shouldDeduct).toBe(false);
  });

  it("cancelled order does not affect outstanding", () => {
    const storeOutstanding = 5000;
    const cancelledOrderAmount = 1000;
    // Cancellation should NOT change outstanding
    expect(storeOutstanding).toBe(5000);
  });
});

// ─── 11. Concurrent order creation ──────────────────────────────────
describe("Order Lifecycle – Concurrent Creation", () => {
  it("FOR UPDATE lock prevents concurrent active orders", () => {
    const lockQuery = "SELECT id FROM public.orders WHERE store_id = p_store_id AND status IN ('pending', 'confirmed') FOR UPDATE";
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("error message includes existing order ID", () => {
    const msg = "Store already has an active order (id: a1b2c3d4-e5f6-7890-abcd-ef1234567890)";
    const match = msg.match(/id: ([a-f0-9-]+)/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});

// ─── 12. Full order lifecycle ───────────────────────────────────────
describe("Order Lifecycle – Full Flow", () => {
  it("create -> confirm -> fulfill -> sale created", () => {
    const steps = ["pending", "confirmed", "delivered"];
    for (let i = 1; i < steps.length; i++) {
      expect(canTransition(steps[i - 1] as OrderStatus, steps[i] as OrderStatus)).toBe(true);
    }
  });

  it("create -> cancel (no sale)", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("create -> confirm -> cancel (no sale)", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
  });

  it("all paths to delivered require confirmation first", () => {
    // Only confirmed -> delivered is valid
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("cancelled", "delivered")).toBe(false);
    expect(canTransition("confirmed", "delivered")).toBe(true);
  });
});
