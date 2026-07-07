export interface StoreHealthData {
  storeId: string;
  storeName: string;
  marketerName: string;
  target: number;
  actual: number;
  lastOrderDate: Date | null;
  outstanding: number;
  runoutDate: Date | null;
  followUpStatus: string | null;
}

export interface StoreHealthScores {
  recencyScore: number;
  targetScore: number;
  burnScore: number;
  outstandingScore: number;
  healthScore: number;
  healthColor: "green" | "lightGreen" | "yellow" | "orange" | "red";
  healthLabel: string;
}

export interface StoreHealth extends StoreHealthData, StoreHealthScores {}

/**
 * Calculate days between two dates
 */
function differenceInDays(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Recency Score (0-100)
 * Weight: 30%
 * Evaluates how recently the store placed an order
 */
export function getRecencyScore(lastOrderDate: Date | null): number {
  if (!lastOrderDate) return 0;
  const daysSince = differenceInDays(new Date(), lastOrderDate);
  if (daysSince <= 7) return 100;
  if (daysSince <= 14) return 90;
  if (daysSince <= 30) return 80;
  if (daysSince <= 45) return 65;
  if (daysSince <= 60) return 50;
  if (daysSince <= 90) return 20;
  return 0;
}

/**
 * Target Progress Score (0-100)
 * Weight: 30%
 * Evaluates whether the store is on pace for its monthly target
 */
export function getTargetScore(actual: number, target: number, dayOfMonth: number, daysInMonth: number): number {
  if (target === 0) return 50; // No target set, neutral
  const expectedAtThisPoint = (target / daysInMonth) * dayOfMonth;
  const ratio = expectedAtThisPoint > 0 ? (actual / expectedAtThisPoint) : 1;
  return Math.min(Math.round(ratio * 100), 100);
}

/**
 * Burn Rate Score (0-100)
 * Weight: 20%
 * Evaluates replenishment health using runout date and follow-up status
 */
export function getBurnScore(runoutDate: Date | null, followUpStatus: string | null): number {
  if (followUpStatus === "must_order") return 10;
  if (followUpStatus === "run_out") return 40;
  if (!runoutDate) return 70;
  const now = new Date();
  const daysUntilRunout = Math.ceil((runoutDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilRunout < 2) return 30;
  if (daysUntilRunout < 7) return 60;
  if (daysUntilRunout < 14) return 80;
  return 100;
}

/**
 * Outstanding Score (0-100)
 * Weight: 20%
 * Evaluates financial health based on outstanding balance
 */
export function getOutstandingScore(outstanding: number, avgMonthlySales: number): number {
  if (outstanding <= 0) return 100; // No outstanding or credit
  if (avgMonthlySales <= 0) return 50; // Cannot calculate ratio
  const ratio = outstanding / avgMonthlySales;
  if (ratio <= 0.25) return 90;
  if (ratio <= 0.50) return 80;
  if (ratio <= 1.00) return 60;
  if (ratio <= 2.00) return 40;
  return 10;
}

/**
 * Maps a health score to a color label
 */
export function getHealthColor(score: number): { color: "green" | "lightGreen" | "yellow" | "orange" | "red"; label: string } {
  if (score >= 80) return { color: "green", label: "Healthy" };
  if (score >= 65) return { color: "lightGreen", label: "On Track" };
  if (score >= 50) return { color: "yellow", label: "Needs Attention" };
  if (score >= 35) return { color: "orange", label: "At Risk" };
  return { color: "red", label: "Critical" };
}

/**
 * Calculate the overall store health score
 */
export function calculateStoreHealth(data: StoreHealthData): StoreHealth {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const recencyScore = getRecencyScore(data.lastOrderDate);
  const targetScore = getTargetScore(data.actual, data.target, dayOfMonth, daysInMonth);
  const burnScore = getBurnScore(data.runoutDate, data.followUpStatus);
  const outstandingScore = getOutstandingScore(data.outstanding, data.actual > 0 ? data.actual : 10000); // Use actual or fallback

  const healthScore = Math.round(
    recencyScore * 0.30 +
    targetScore * 0.30 +
    burnScore * 0.20 +
    outstandingScore * 0.20
  );

  const { color, label } = getHealthColor(healthScore);

  return {
    ...data,
    recencyScore,
    targetScore,
    burnScore,
    outstandingScore,
    healthScore,
    healthColor: color,
    healthLabel: label,
  };
}
