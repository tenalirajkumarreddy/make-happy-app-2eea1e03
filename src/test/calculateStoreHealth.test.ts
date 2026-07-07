import { describe, it, expect } from "vitest";
import { calculateStoreHealth, getRecencyScore, getTargetScore, getBurnScore, getOutstandingScore } from "@/utils/storeHealth";

describe("getRecencyScore", () => {
  it("returns 100 for orders within 7 days", () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(getRecencyScore(date)).toBe(100);
  });

  it("returns 90 for orders within 14 days", () => {
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(getRecencyScore(date)).toBe(90);
  });

  it("returns 0 for no order date", () => {
    expect(getRecencyScore(null)).toBe(0);
  });

  it("returns 0 for orders older than 90 days", () => {
    const date = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    expect(getRecencyScore(date)).toBe(0);
  });
});

describe("getTargetScore", () => {
  it("returns 50 when target is 0 (no target set)", () => {
    expect(getTargetScore(0, 0, 15, 30)).toBe(50);
  });

  it("returns 100 when progress exceeds target", () => {
    expect(getTargetScore(1200, 1000, 20, 30)).toBe(100);
  });

  it("calculates correct ratio for on-pace store", () => {
    const result = getTargetScore(500, 1000, 15, 30);
    expect(result).toBe(100); // Exactly on pace gets rounded up but capped at 100
  });

  it("calculates correct ratio for behind store", () => {
    const result = getTargetScore(250, 1000, 15, 30);
    expect(result).toBeLessThan(100);
  });
});

describe("getBurnScore", () => {
  it("returns 10 for must_order status", () => {
    expect(getBurnScore(null, "must_order")).toBe(10);
  });

  it("returns 40 for run_out status", () => {
    expect(getBurnScore(null, "run_out")).toBe(40);
  });

  it("returns 70 for no runout date", () => {
    expect(getBurnScore(null, null)).toBe(70);
  });

  it("returns 100 for runout more than 14 days away", () => {
    const runout = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    expect(getBurnScore(runout, null)).toBe(100);
  });
});

describe("getOutstandingScore", () => {
  it("returns 100 for no outstanding", () => {
    expect(getOutstandingScore(0, 1000)).toBe(100);
  });

  it("returns 90 for ratio <= 0.25", () => {
    expect(getOutstandingScore(250, 1000)).toBe(90);
  });

  it("returns 10 for ratio > 2.0", () => {
    expect(getOutstandingScore(5000, 1000)).toBe(10);
  });
});

describe("calculateStoreHealth", () => {
  it("calculates health for a perfect store", () => {
    const result = calculateStoreHealth({
      storeId: "1",
      storeName: "Fresh Mart",
      marketerName: "Rajesh",
      target: 10000,
      actual: 10000,
      lastOrderDate: new Date(),
      outstanding: 0,
      runoutDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      followUpStatus: null,
    });

    expect(result.healthScore).toBeGreaterThanOrEqual(80);
    expect(result.healthColor).toBe("green");
    expect(result.healthLabel).toBe("Healthy");
  });

  it("calculates health for a dormant store", () => {
    const result = calculateStoreHealth({
      storeId: "2",
      storeName: "Old Store",
      marketerName: "Priya",
      target: 5000,
      actual: 0,
      lastOrderDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      outstanding: 5000,
      runoutDate: null,
      followUpStatus: "must_order",
    });

    expect(result.healthScore).toBeLessThanOrEqual(34);
    expect(result.healthColor).toBe("red");
    expect(result.healthLabel).toBe("Critical");
    expect(result.recencyScore).toBe(0);
  });

  it("calculates health for a store behind target", () => {
    const result = calculateStoreHealth({
      storeId: "3",
      storeName: "Slow Store",
      marketerName: "—",
      target: 10000,
      actual: 3000,
      lastOrderDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      outstanding: 2000,
      runoutDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      followUpStatus: null,
    });

    expect(result.healthScore).toBeGreaterThan(0);
    expect(result.targetScore).toBeGreaterThanOrEqual(0);
    expect(result.targetScore).toBeLessThanOrEqual(100);

    // Recency should be good (5 days)
    expect(result.recencyScore).toBe(100);
  });

  it("calculates health for a store with high outstanding", () => {
    const result = calculateStoreHealth({
      storeId: "4",
      storeName: "Credit Heavy",
      marketerName: "—",
      target: 10000,
      actual: 8000,
      lastOrderDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      outstanding: 50000,
      runoutDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      followUpStatus: null,
    });

    expect(result.outstandingScore).toBeLessThan(100);
    expect(result.healthScore).toBeLessThan(80);
  });

  it("handles a new store with no history", () => {
    const result = calculateStoreHealth({
      storeId: "5",
      storeName: "New Store",
      marketerName: "—",
      target: 0,
      actual: 0,
      lastOrderDate: null,
      outstanding: 0,
      runoutDate: null,
      followUpStatus: null,
    });

    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
    expect(result.recencyScore).toBe(0);
  });
});
