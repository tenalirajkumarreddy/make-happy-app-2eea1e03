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
  if worsened.
