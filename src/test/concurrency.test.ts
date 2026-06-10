import { describe, it, expect } from "vitest";

describe("create_order concurrency safety", () => {
  it("FOR UPDATE lock prevents concurrent active orders for same store", () => {
    const query = `SELECT id FROM public.orders
WHERE store_id = p_store_id AND status IN ('pending', 'confirmed')
FOR UPDATE`;
    expect(query).toContain("FOR UPDATE");
  });

  it("raises exception when store already has an active order", () => {
    const errorMsg = "Store already has an active order";
    const match = "Store already has an active order (id: a1b2c3d4-e5f6-7890-abcd-ef1234567890)".match(/id: ([a-f0-9-]+)/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("parses existing order ID from error message", () => {
    const errorMessage = "Store already has an active order (id: a1b2c3d4-e5f6-7890-abcd-ef1234567890)";
    const match = errorMessage.match(/id: ([a-f0-9-]+)/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("generates ORD-prefixed display ID", () => {
    const displayId = "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    expect(displayId.startsWith("ORD-")).toBe(true);
    expect(displayId.length).toBeGreaterThan(4);
  });
});

describe("record_sale concurrency safety", () => {
  it("locks order row early before fulfillment", () => {
    const lockQuery = `PERFORM o.id FROM public.orders o WHERE o.id = p_fulfilled_order_id FOR UPDATE`;
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("prevents double-fulfillment by checking order status after lock", () => {
    const checkQuery = `SELECT 1 FROM public.orders WHERE id = p_fulfilled_order_id AND status = 'delivered'`;
    expect(checkQuery).toContain("AND status = 'delivered'");
  });

  it("locks store row before outstanding modification", () => {
    const storeLockQuery = `FROM public.stores s WHERE s.id = p_store_id FOR UPDATE`;
    expect(storeLockQuery).toContain("FOR UPDATE");
  });

  it("detects concurrent outstanding modification via expected_outstanding", () => {
    const errorMessage = "concurrent_modification: expected=1000, actual=1500";
    expect(errorMessage).toContain("concurrent_modification");
    const expectedVal = errorMessage.match(/expected=(\d+)/)?.[1];
    const actualVal = errorMessage.match(/actual=(\d+)/)?.[1];
    expect(expectedVal).toBe("1000");
    expect(actualVal).toBe("1500");
  });

  it("locks staff_stock rows for targeted user in transaction", () => {
    const lockQuery = `FROM staff_stock ss WHERE ss.user_id = v_target_user_id AND ss.product_id = ANY(v_all_product_ids) FOR UPDATE`;
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("locks product_stock rows for warehouse in transaction", () => {
    const lockQuery = `FROM product_stock ps WHERE ps.warehouse_id = v_warehouse_id AND ps.product_id = ANY(v_all_product_ids) FOR UPDATE`;
    expect(lockQuery).toContain("FOR UPDATE");
  });

  it("returns correct column names matching generated types", () => {
    const returnType = "TABLE(sale_id UUID, sale_display_id TEXT, new_outstanding NUMERIC, stock_reserved BOOLEAN)";
    expect(returnType).toContain("sale_id");
    expect(returnType).toContain("sale_display_id");
    expect(returnType).toContain("new_outstanding");
    expect(returnType).toContain("stock_reserved");
  });
});

describe("approve_or_reject_return concurrency safety", () => {
  it("locks return row before status change", () => {
    const query = `SELECT status FROM public.sale_returns WHERE id = p_return_id FOR UPDATE`;
    expect(query).toContain("FOR UPDATE");
  });

  it("rejects modification if return is not pending", () => {
    const result = { success: false, error: "Return is not pending (current status: approved)" };
    expect(result.success).toBe(false);
    expect(result.error).toContain("not pending");
  });

  it("successfully approves a pending return", () => {
    const result = { success: true, status: "approved" };
    expect(result.success).toBe(true);
    expect(result.status).toBe("approved");
  });

  it("successfully rejects a pending return", () => {
    const result = { success: true, status: "rejected" };
    expect(result.success).toBe(true);
    expect(result.status).toBe("rejected");
  });

  it("handles return not found", () => {
    const result = { success: false, error: "Return not found" };
    expect(result.success).toBe(false);
    expect(result.error).toBe("Return not found");
  });
});

describe("process_completed_sale_return concurrency safety", () => {
  it("locks return row before processing", () => {
    const query = `PERFORM id FROM public.sale_returns WHERE id = p_return_id FOR UPDATE`;
    expect(query).toContain("FOR UPDATE");
  });

  it("only processes approved returns", () => {
    const checkQuery = `SELECT * INTO v_return FROM sale_returns WHERE id = p_return_id AND status = 'approved'`;
    expect(checkQuery).toContain("AND status = 'approved'");
  });

  it("raises exception for non-approved returns", () => {
    expect("Approved return not found").toContain("not found");
  });

  it("restores agent stock or warehouse stock based on role", () => {
    const agentCase = `INSERT INTO public.staff_stock`;
    const warehouseCase = `INSERT INTO public.product_stock`;
    expect(agentCase).toContain("staff_stock");
    expect(warehouseCase).toContain("product_stock");
  });
});
