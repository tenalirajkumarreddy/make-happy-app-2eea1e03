
import { addDays, format } from "date-fns";

export interface SalesPoint {
  date: string;
  amount: number;
}

export interface ForecastPoint {
  date: string;
  actual: number | null;
  forecast: number;
  fullDate: Date;
}

/**
 * Calculates linear regression forecast based on historical sales data.
 * @param salesTrend Array of historical sales data points { date: string, amount: number }
 * @param forecastDays Number of days to project into the future
 * @returns Combined array of historical trend line + future forecast points
 */
export function calculateSalesForecast(salesTrend: SalesPoint[], rangeDays: string[], forecastDays: number = 14): ForecastPoint[] {
  if (!salesTrend || salesTrend.length < 5) return [];
  
  const n = salesTrend.length;
  // X values are just 0, 1, 2, 3... representing time steps
  const x = Array.from({ length: n }, (_, i) => i);
  const y = salesTrend.map(s => s.amount);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  // Calculate slope (m) and intercept (b) for y = mx + b
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // 1. Generate trend line for historical data
  const history = salesTrend.map((s, i) => ({
      date: s.date,
      actual: s.amount,
      forecast: Math.round(slope * i + intercept), // Trend line point
      fullDate: new Date(rangeDays[i]),
  }));

  // 2. Project future data
  const lastDateStr = rangeDays[rangeDays.length - 1];
  const nextDays = Array.from({ length: forecastDays }, (_, i) => {
      const nextDate = addDays(new Date(lastDateStr), i + 1);
      const nextX = n + i;
      const predicted = Math.max(0, slope * nextX + intercept); // Prevent negative sales forecast
      return {
          date: format(nextDate, "MM-dd"),
          actual: null,
          forecast: Math.round(predicted),
          fullDate: nextDate,
      };
  });

  return [...history, ...nextDays];
}

