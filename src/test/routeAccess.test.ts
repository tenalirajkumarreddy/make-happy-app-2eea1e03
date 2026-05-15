import { describe, expect, it } from "vitest";
import { computeRouteAccess, isScopedRole } from "@/hooks/useRouteAccess";

describe("route access helpers", () => {
  it("treats scoped roles correctly", () => {
    expect(isScopedRole("agent")).toBe(true);
    expect(isScopedRole("marketer")).toBe(true);
    expect(isScopedRole("operator")).toBe(true);
    expect(isScopedRole("manager")).toBe(false);
    expect(isScopedRole("super_admin")).toBe(false);
    expect(isScopedRole("customer")).toBe(false);
  });

  it("denies all routes for scoped users without matrix rows", () => {
    const access = computeRouteAccess([], "agent");
    expect(access.hasMatrixRestrictions).toBe(true);
    expect(access.canAccessRoute("route-1")).toBe(false);
    expect(access.canAccessRoute(null)).toBe(false);
  });

  it("restricts routes when enabled matrix rows exist", () => {
    const access = computeRouteAccess(
      [
        { route_id: "route-1", enabled: true },
        { route_id: "route-2", enabled: false },
      ],
      "agent"
    );

    expect(access.hasMatrixRestrictions).toBe(true);
    expect(access.canAccessRoute("route-1")).toBe(true);
    expect(access.canAccessRoute("route-2")).toBe(false);
    expect(access.canAccessRoute("route-3")).toBe(false);
    expect(access.canAccessRoute(null)).toBe(false);
  });

  it("does not restrict non-scoped roles", () => {
    const access = computeRouteAccess(
      [{ route_id: "route-1", enabled: true }],
      "super_admin"
    );

    expect(access.hasMatrixRestrictions).toBe(false);
    expect(access.canAccessRoute("route-999")).toBe(true);
    expect(access.canAccessRoute(null)).toBe(true);
  });
});
