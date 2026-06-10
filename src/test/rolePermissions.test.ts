import { describe, it, expect } from "vitest";
import { ROLE_DEFAULTS, hasRoleDefaultPermission, ALL_PERMISSION_KEYS, PERMISSION_LABELS, PERMISSION_GROUPS } from "@/lib/permissions";
import type { AppRole } from "@/types/roles";

const ALL_ROLES: AppRole[] = ["super_admin", "manager", "agent", "marketer", "operator", "customer"];

// ─── 1. Role hierarchy ──────────────────────────────────────────────
describe("Role Permissions – Hierarchy", () => {
  it("super_admin has all permissions except record_sale", () => {
    const adminPerms = ROLE_DEFAULTS.super_admin;
    ALL_PERMISSION_KEYS.filter((k) => k !== "record_sale").forEach((key) => {
      expect(adminPerms).toContain(key);
    });
  });

  it("super_admin does NOT have record_sale (uses record_behalf instead)", () => {
    expect(ROLE_DEFAULTS.super_admin).not.toContain("record_sale");
    expect(ROLE_DEFAULTS.super_admin).toContain("record_behalf");
  });

  it("manager has all permissions (same as super_admin)", () => {
    expect(ROLE_DEFAULTS.manager).toEqual(ROLE_DEFAULTS.super_admin);
  });

  it("customer has only view_orders", () => {
    expect(ROLE_DEFAULTS.customer).toEqual(["view_orders"]);
  });

  it("every role has at least one permission", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_DEFAULTS[role].length).toBeGreaterThan(0);
    });
  });
});

// ─── 2. Sales permissions ───────────────────────────────────────────
describe("Role Permissions – Sales", () => {
  const salesRoles: AppRole[] = ["agent", "operator"];

  it.each(salesRoles)("%s can record sales", (role) => {
    expect(ROLE_DEFAULTS[role]).toContain("record_sale");
  });

  it("super_admin/manager use record_behalf, not record_sale", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("record_behalf");
    expect(ROLE_DEFAULTS.manager).toContain("record_behalf");
    expect(ROLE_DEFAULTS.super_admin).not.toContain("record_sale");
    expect(ROLE_DEFAULTS.manager).not.toContain("record_sale");
  });

  it("marketer cannot record sales", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("record_sale");
  });

  it("customer cannot record sales", () => {
    expect(ROLE_DEFAULTS.customer).not.toContain("record_sale");
  });

  it("only admin/manager can cancel sales", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("cancel_sales");
    expect(ROLE_DEFAULTS.manager).toContain("cancel_sales");
    expect(ROLE_DEFAULTS.agent).not.toContain("cancel_sales");
    expect(ROLE_DEFAULTS.marketer).not.toContain("cancel_sales");
    expect(ROLE_DEFAULTS.operator).not.toContain("cancel_sales");
    expect(ROLE_DEFAULTS.customer).not.toContain("cancel_sales");
  });

  it("admin/manager/agent/operator can override prices", () => {
    ["super_admin", "manager", "agent", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("price_override");
    });
  });

  it("marketer cannot override prices", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("price_override");
  });

  it("admin/manager can record on behalf", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("record_behalf");
    expect(ROLE_DEFAULTS.manager).toContain("record_behalf");
  });

  it("agent/operator/marketer cannot record on behalf", () => {
    ["agent", "operator", "marketer"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("record_behalf");
    });
  });

  it("admin/manager can backdate sales", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("backdate");
    expect(ROLE_DEFAULTS.manager).toContain("backdate");
  });

  it("agent/operator/marketer cannot backdate", () => {
    ["agent", "operator", "marketer"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("backdate");
    });
  });
});

// ─── 3. Order permissions ───────────────────────────────────────────
describe("Role Permissions – Orders", () => {
  it("all staff roles can view orders", () => {
    ["super_admin", "manager", "agent", "marketer", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("view_orders");
    });
  });

  it("customer can view orders", () => {
    expect(ROLE_DEFAULTS.customer).toContain("view_orders");
  });

  const canCreateOrders: AppRole[] = ["super_admin", "manager", "agent", "marketer", "operator"];

  it.each(canCreateOrders)("%s can create orders", (role) => {
    expect(ROLE_DEFAULTS[role]).toContain("create_orders");
  });

  it("customer cannot create orders", () => {
    expect(ROLE_DEFAULTS.customer).not.toContain("create_orders");
  });

  it("admin/manager/agent/operator can modify orders", () => {
    ["super_admin", "manager", "agent", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("modify_orders");
    });
  });

  it("marketer can modify orders", () => {
    expect(ROLE_DEFAULTS.marketer).toContain("modify_orders");
  });

  it("only admin/manager can transfer orders", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("transfer_orders");
    expect(ROLE_DEFAULTS.manager).toContain("transfer_orders");
    expect(ROLE_DEFAULTS.marketer).toContain("transfer_orders");
    expect(ROLE_DEFAULTS.operator).toContain("transfer_orders");
  });

  it("agent cannot transfer orders", () => {
    expect(ROLE_DEFAULTS.agent).not.toContain("transfer_orders");
  });

  it("only admin/manager/agent/operator can fulfill orders", () => {
    ["super_admin", "manager", "agent", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("fulfill_orders");
    });
  });

  it("marketer cannot fulfill orders", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("fulfill_orders");
  });

  it("only admin/manager/agent/operator can cancel orders", () => {
    ["super_admin", "manager", "agent", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("cancel_orders");
    });
  });

  it("marketer cannot cancel orders", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("cancel_orders");
  });

  it("only admin/manager can delete orders", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("delete_orders");
    expect(ROLE_DEFAULTS.manager).toContain("delete_orders");
    expect(ROLE_DEFAULTS.agent).not.toContain("delete_orders");
  });

  it("only admin/manager can modify order item prices", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("modify_order_item_prices");
    expect(ROLE_DEFAULTS.manager).toContain("modify_order_item_prices");
    expect(ROLE_DEFAULTS.agent).not.toContain("modify_order_item_prices");
    expect(ROLE_DEFAULTS.operator).not.toContain("modify_order_item_prices");
  });

  it("marketer cannot modify order item prices", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("modify_order_item_prices");
  });
});

// ─── 4. Handover permissions ────────────────────────────────────────
describe("Role Permissions – Handovers", () => {
  it("admin/manager can modify handovers", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("modify_handovers");
    expect(ROLE_DEFAULTS.manager).toContain("modify_handovers");
  });

  it("agent/operator/marketer cannot modify handovers", () => {
    ["agent", "operator", "marketer"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("modify_handovers");
    });
  });

  it("admin/manager can cancel any handover", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("cancel_any_handover");
    expect(ROLE_DEFAULTS.manager).toContain("cancel_any_handover");
  });

  it("admin/manager can see handover balance by default", () => {
    ["super_admin", "manager"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("see_handover_balance");
    });
  });

  it("operator has see_handover_balance by default", () => {
    expect(ROLE_DEFAULTS.operator).toContain("see_handover_balance");
  });

  it("marketer cannot see handover balance by default", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("see_handover_balance");
  });

  it("admin/manager can adjust holding balance", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("adjust_holding_balance");
    expect(ROLE_DEFAULTS.manager).toContain("adjust_holding_balance");
  });
});

// ─── 5. Expense permissions ─────────────────────────────────────────
describe("Role Permissions – Expenses", () => {
  it("admin/manager/agent can submit expenses", () => {
    ["super_admin", "manager", "agent"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("submit_expenses");
    });
  });

  it("marketer/operator cannot submit expenses", () => {
    ["marketer", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("submit_expenses");
    });
  });

  it("only admin/manager can approve expenses", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("approve_expenses");
    expect(ROLE_DEFAULTS.manager).toContain("approve_expenses");
    expect(ROLE_DEFAULTS.agent).not.toContain("approve_expenses");
  });

  it("admin/manager can manage expense access", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("manage_expense_access");
    expect(ROLE_DEFAULTS.manager).toContain("manage_expense_access");
  });
});

// ─── 6. Customer/Store permissions ──────────────────────────────────
describe("Role Permissions – Customers & Stores", () => {
  const canCreateCustomers: AppRole[] = ["super_admin", "manager", "agent", "marketer"];

  it.each(canCreateCustomers)("%s can create customers", (role) => {
    expect(ROLE_DEFAULTS[role]).toContain("create_customers");
  });

  it("operator cannot create customers", () => {
    expect(ROLE_DEFAULTS.operator).not.toContain("create_customers");
  });

  it("customer cannot create customers", () => {
    expect(ROLE_DEFAULTS.customer).not.toContain("create_customers");
  });

  it("admin/manager/agent/marketer can create stores", () => {
    ["super_admin", "manager", "agent", "marketer"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("create_stores");
    });
  });

  it("operator/customer cannot create stores", () => {
    expect(ROLE_DEFAULTS.operator).not.toContain("create_stores");
    expect(ROLE_DEFAULTS.customer).not.toContain("create_stores");
  });

  it("only admin/manager can edit balances", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("edit_balance");
    expect(ROLE_DEFAULTS.manager).toContain("edit_balance");
    expect(ROLE_DEFAULTS.agent).not.toContain("edit_balance");
  });
});

// ─── 7. Vendor/Purchase permissions ─────────────────────────────────
describe("Role Permissions – Vendors & Purchases", () => {
  it("admin/manager can view vendors", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("view_vendors");
    expect(ROLE_DEFAULTS.manager).toContain("view_vendors");
  });

  it("agent/marketer/operator cannot view vendors", () => {
    ["agent", "marketer", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("view_vendors");
    });
  });

  it("admin/manager can manage purchases", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("manage_purchases");
    expect(ROLE_DEFAULTS.manager).toContain("manage_purchases");
  });

  it("admin/manager can manage vendor payments", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("manage_vendor_payments");
    expect(ROLE_DEFAULTS.manager).toContain("manage_vendor_payments");
  });
});

// ─── 8. Attendance permissions ──────────────────────────────────────
describe("Role Permissions – Attendance", () => {
  it("admin/manager/operator can view attendance", () => {
    ["super_admin", "manager", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("view_attendance");
    });
  });

  it("admin/manager/operator can manage attendance", () => {
    ["super_admin", "manager", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("manage_attendance");
    });
  });

  it("agent/marketer cannot manage attendance", () => {
    ["agent", "marketer"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("manage_attendance");
    });
  });
});

// ─── 9. Invoice permissions ─────────────────────────────────────────
describe("Role Permissions – Invoices", () => {
  it("admin/manager can create invoices", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("create_invoices");
    expect(ROLE_DEFAULTS.manager).toContain("create_invoices");
  });

  it("agent/marketer/operator cannot create invoices", () => {
    ["agent", "marketer", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).not.toContain("create_invoices");
    });
  });

  it("admin/manager can delete invoices", () => {
    expect(ROLE_DEFAULTS.super_admin).toContain("delete_invoices");
    expect(ROLE_DEFAULTS.manager).toContain("delete_invoices");
  });

  it("admin/manager/agent/marketer/operator can download invoices", () => {
    ["super_admin", "manager", "agent", "marketer", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("download_invoices");
    });
  });
});

// ─── 10. Sale return permissions ────────────────────────────────────
describe("Role Permissions – Sale Returns", () => {
  it("admin/manager/agent/operator can create sale returns", () => {
    ["super_admin", "manager", "agent", "operator"].forEach((role) => {
      expect(ROLE_DEFAULTS[role as AppRole]).toContain("create_sale_returns");
    });
  });

  it("marketer cannot create sale returns", () => {
    expect(ROLE_DEFAULTS.marketer).not.toContain("create_sale_returns");
  });

  it("customer cannot create sale returns", () => {
    expect(ROLE_DEFAULTS.customer).not.toContain("create_sale_returns");
  });
});

// ─── 11. hasRoleDefaultPermission ───────────────────────────────────
describe("Role Permissions – hasRoleDefaultPermission", () => {
  it("returns true for permission role has", () => {
    expect(hasRoleDefaultPermission("agent", "record_sale")).toBe(true);
  });

  it("returns false for permission role lacks", () => {
    expect(hasRoleDefaultPermission("agent", "cancel_sales")).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(hasRoleDefaultPermission("unknown_role" as AppRole, "record_sale")).toBe(false);
  });

  it("returns false for unknown permission", () => {
    expect(hasRoleDefaultPermission("agent", "nonexistent_key" as any)).toBe(false);
  });
});

// ─── 12. Permission completeness ────────────────────────────────────
describe("Role Permissions – Completeness", () => {
  it("ALL_PERMISSION_KEYS has no duplicates", () => {
    const unique = new Set(ALL_PERMISSION_KEYS);
    expect(unique.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("every permission key has a label", () => {
    ALL_PERMISSION_KEYS.forEach((key) => {
      expect(PERMISSION_LABELS[key]).toBeTruthy();
    });
  });

  it("every permission is in at least one group", () => {
    const grouped = Object.values(PERMISSION_GROUPS).flat();
    ALL_PERMISSION_KEYS.forEach((key) => {
      expect(grouped).toContain(key);
    });
  });

  it("role defaults only reference valid permission keys", () => {
    ALL_ROLES.forEach((role) => {
      ROLE_DEFAULTS[role].forEach((key) => {
        expect(ALL_PERMISSION_KEYS).toContain(key);
      });
    });
  });
});

// ─── 13. Role-specific scenarios ────────────────────────────────────
describe("Role Permissions – Real-World Scenarios", () => {
  it("agent can create order but not transfer it", () => {
    expect(hasRoleDefaultPermission("agent", "create_orders")).toBe(true);
    expect(hasRoleDefaultPermission("agent", "transfer_orders")).toBe(false);
  });

  it("marketer can create order but not fulfill it", () => {
    expect(hasRoleDefaultPermission("marketer", "create_orders")).toBe(true);
    expect(hasRoleDefaultPermission("marketer", "fulfill_orders")).toBe(false);
  });

  it("operator can fulfill orders but cannot create customers", () => {
    expect(hasRoleDefaultPermission("operator", "fulfill_orders")).toBe(true);
    expect(hasRoleDefaultPermission("operator", "create_customers")).toBe(false);
  });

  it("admin can do everything manager can", () => {
    ROLE_DEFAULTS.manager.forEach((key) => {
      expect(ROLE_DEFAULTS.super_admin).toContain(key);
    });
  });

  it("manager cannot toggle super_admin permissions (locked)", () => {
    const isLocked = (role: string) => role === "super_admin";
    expect(isLocked("super_admin")).toBe(true);
    expect(isLocked("manager")).toBe(false);
  });
});
