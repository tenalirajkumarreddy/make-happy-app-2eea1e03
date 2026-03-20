
import { describe, it, expect } from "vitest";
import { calculateSalesForecast, SalesPoint } from "@/lib/forecastEngine";

describe("calculateSalesForecast", () => {
  it("should return empty array for insufficient data", () => {
    const data: SalesPoint[] = [
      { date: "01-01", amount: 100 },
      { date: "01-02", amount: 200 },
    ];
    const range = ["2026-01-01", "2026-01-02"];
    const result = calculateSalesForecast(data, range);
    expect(result).toHaveLength(0);
  });

  it("should calculate correct linear forecast for perfect line", () => {
    // y = 100x + 100
    // Day 0: 100
    // Day 1: 200
    // Day 2: 300
    // Day 3: 400
    // Day 4: 500
    const data: SalesPoint[] = [
      { date: "01-01", amount: 100 },
      { date: "01-02", amount: 200 },
      { date: "01-03", amount: 300 },
      { date: "01-04", amount: 400 },
      { date: "01-05", amount: 500 },
    ];
    const range = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    
    // Forecast 2 days
    const result = calculateSalesForecast(data, range, 2);
    
    // Result should contain 5 history points + 2 forecast points = 7
    expect(result).toHaveLength(7);

    // Check forecast values
    // Next X = 5 -> y = 100(5) + 100 = 600
    // Next X = 6 -> y = 100(6) + 100 = 700
    
    // The forecast points are at the end
    const forecastPoint1 = result[5];
    const forecastPoint2 = result[6];

    expect(forecastPoint1.forecast).toBe(600);
    expect(forecastPoint2.forecast).toBe(700);
    
    // Verify structure
    expect(forecastPoint1.actual).toBeNull();
    expect(result[0].actual).toBe(100);
  });

  it("should handle flat sales trend", () => {
    const data: SalesPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: `01-${i + 1}`,
      amount: 500
    }));
    const range = data.map(d => `2026-${d.date}`);
    
    const result = calculateSalesForecast(data, range, 5);
    
    // Forecasting a flat line of 500 should result in 500
    const nextMsg = result[result.length - 1];
    expect(nextMsg.forecast).toBe(500);
  });
});

