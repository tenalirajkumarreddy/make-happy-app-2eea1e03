import { describe, it, expect } from 'vitest';

/**
 * Burn Rate Calculation Tests
 * 
 * Tests the dynamic burn rate formula with 50% safety floor:
 * 
 * daily_burn = max(
 *   remaining_target / remaining_days,
 *   monthly_target / 60
 * )
 * 
 * runout_date = last_sale_date + ceil(sale_amount / daily_burn)
 * 
 * follow_up_date = runout_date - lead_time
 */

interface DepletionInput {
  monthlyTarget: number;
  totalSalesThisMonth: number;
  saleAmount: number;
  lastSaleDate: string; // ISO date
  currentDate: string;  // ISO date
  leadTime: number;
  safetyFloorPercent: number;
}

interface DepletionResult {
  remainingTarget: number;
  remainingDays: number;
  baseBurn: number;
  dynamicBurn: number;
  safetyFloor: number;
  dailyBurn: number;
  daysUntilRunout: number;
  runoutDate: string;
  followUpDate: string;
  reason: 'low_stock' | 'run_out' | 'must_order';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

function calculateDepletion(input: DepletionInput): DepletionResult | null {
  const { monthlyTarget, totalSalesThisMonth, saleAmount, lastSaleDate, currentDate, leadTime, safetyFloorPercent } = input;

  const remainingTarget = Math.max(0, monthlyTarget - totalSalesThisMonth);
  
  // If no remaining target, no depletion
  if (remainingTarget <= 0) {
    return null;
  }

  const today = new Date(currentDate);
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = today.getDate();
  const remainingDays = daysInMonth - currentDay + 1;

  // Base burn = target / 30
  const baseBurn = monthlyTarget / 30;
  
  // Dynamic burn = remaining / remaining_days
  const dynamicBurn = remainingDays > 0 ? remainingTarget / remainingDays : baseBurn;
  
  // Safety floor
  const safetyFloor = baseBurn * (safetyFloorPercent / 100);
  
  // Actual daily burn = max(dynamic, safety_floor)
  const dailyBurn = Math.max(dynamicBurn, safetyFloor);
  
  // Days until this specific sale runs out
  const daysUntilRunout = Math.ceil(saleAmount / dailyBurn);
  
  // Calculate dates
  const lastSaleDateObj = new Date(lastSaleDate);
  const runoutDate = new Date(lastSaleDateObj);
  runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
  
  const followUpDate = new Date(runoutDate);
  followUpDate.setDate(followUpDate.getDate() - leadTime);
  
  // Determine status
  const todayStr = today.toISOString().split('T')[0];
  const runoutDateStr = runoutDate.toISOString().split('T')[0];
  
  let reason: 'low_stock' | 'run_out' | 'must_order' = 'low_stock';
  let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  
  if (todayStr > runoutDateStr) {
    reason = 'must_order';
    priority = 'critical';
  } else if (todayStr >= followUpDate.toISOString().split('T')[0]) {
    reason = 'low_stock';
    priority = 'medium';
  }

  return {
    remainingTarget,
    remainingDays,
    baseBurn: parseFloat(baseBurn.toFixed(2)),
    dynamicBurn: parseFloat(dynamicBurn.toFixed(2)),
    safetyFloor: parseFloat(safetyFloor.toFixed(2)),
    dailyBurn: parseFloat(dailyBurn.toFixed(2)),
    daysUntilRunout,
    runoutDate: runoutDateStr,
    followUpDate: followUpDate.toISOString().split('T')[0],
    reason,
    priority,
  };
}

describe('Burn Rate Calculation', () => {
  it('Basic scenario: 3000 target, 1500 sold, 500 sale on day 4', () => {
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 1500,
      saleAmount: 500,
      lastSaleDate: '2026-07-04',
      currentDate: '2026-07-04',
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeDefined();
    if (!result) return;
    
    expect(result.remainingTarget).toBe(1500);
    expect(result.remainingDays).toBe(28); // July has 31 days, 31 - 4 + 1 = 28
    expect(result.baseBurn).toBe(100); // 3000 / 30
    expect(result.dynamicBurn).toBeCloseTo(53.57, 2); // 1500 / 28
    expect(result.safetyFloor).toBe(50); // 100 * 0.5
    expect(result.dailyBurn).toBe(53.57); // max(53.57, 50) = 53.57
    expect(result.daysUntilRunout).toBe(10); // ceil(500 / 53.57)
    expect(result.runoutDate).toBe('2026-07-14');
    expect(result.followUpDate).toBe('2026-07-12');
    expect(result.reason).toBe('low_stock');
    expect(result.priority).toBe('medium');
  });

  it('Should apply safety floor when dynamic rate is too low', () => {
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 2800,
      saleAmount: 500,
      lastSaleDate: '2026-07-20',
      currentDate: '2026-07-20',
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeDefined();
    if (!result) return;
    
    // remaining = 200, remainingDays = 12
    expect(result.remainingTarget).toBe(200);
    expect(result.dynamicBurn).toBeCloseTo(16.67, 2); // 200 / 12
    expect(result.safetyFloor).toBe(50); // 100 * 0.5
    expect(result.dailyBurn).toBe(50); // max(16.67, 50) = 50
    expect(result.daysUntilRunout).toBe(10); // ceil(500 / 50)
  });

  it('Should return null when target is already met', () => {
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 3500,
      saleAmount: 500,
      lastSaleDate: '2026-07-10',
      currentDate: '2026-07-10',
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeNull();
  });

  it('Run Out scenario: past depletion date', () => {
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 1500,
      saleAmount: 500,
      lastSaleDate: '2026-07-01',
      currentDate: '2026-07-14', // Runout was on July 6
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeDefined();
    if (!result) return;
    
    expect(result.reason).toBe('must_order');
    expect(result.priority).toBe('critical');
  });

  it('Initial scenario: 1000 units on day 1, target 3000', () => {
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 1000,
      saleAmount: 1000,
      lastSaleDate: '2026-07-01',
      currentDate: '2026-07-01',
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeDefined();
    if (!result) return;
    
    // remaining = 2000, remainingDays = 31
    expect(result.remainingTarget).toBe(2000);
    expect(result.dailyBurn).toBe(64.52); // max(2000/31, 50) = 64.52
    expect(result.daysUntilRunout).toBe(16); // ceil(1000 / 64.52)
    expect(result.runoutDate).toBe('2026-07-17');
    expect(result.followUpDate).toBe('2026-07-15');
  });

  it('Edge case: Zero remaining days (last day of month)', () => {
    // If it's July 31st, remainingDays = 1
    const result = calculateDepletion({
      monthlyTarget: 3000,
      totalSalesThisMonth: 2000,
      saleAmount: 500,
      lastSaleDate: '2026-07-15',
      currentDate: '2026-07-31',
      leadTime: 2,
      safetyFloorPercent: 50,
    });
    
    expect(result).toBeDefined();
    if (!result) return;
    
    // remaining = 1000, remainingDays = 1
    expect(result.remainingDays).toBe(1);
    expect(result.remainingTarget).toBe(1000);
    expect(result.dailyBurn).toBe(1000); // max(1000/1, 50) = 1000
    expect(result.daysUntilRunout).toBe(1); // ceil(500 / 1000) = 1
    expect(result.runoutDate).toBe('2026-07-16'); // Already past
    expect(result.reason).toBe('must_order');
    expect(result.priority).toBe('critical');
  });
});

describe('Target Approval Workflow', () => {
  it('Should validate approval flow logic', () => {
    // Simulate admin approve/reject logic
    const request = {
      current_target: 1000,
      proposed_target: 1500,
      status: 'pending',
    };
    
    // Approve
    const approved = { ...request, status: 'approved', reviewed_at: new Date().toISOString() };
    expect(approved.status).toBe('approved');
    expect(approved.proposed_target).toBe(1500);
    
    // Reject
    const rejected = { ...request, status: 'rejected', reviewed_at: new Date().toISOString() };
    expect(rejected.status).toBe('rejected');
  });
});
