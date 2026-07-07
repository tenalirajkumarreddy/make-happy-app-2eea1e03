import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

/**
 * Daily Replenishment Worker
 * 
 * Core algorithm for each active store target:
 * 1. Find most recent non-cancelled sale
 * 2. Calculate cumulative sales this month
 * 3. remaining_target = target_amount - total_sales
 * 4. remaining_days = days left in month
 * 5. daily_burn = max(remaining_target/remaining_days, target_amount/60) [50% safety floor]
 * 6. days_until_runout = ceil(last_sale_amount / daily_burn)
 * 7. runout_date = last_sale_date + days_until_runout
 * 8. follow_up_date = runout_date - lead_time
 * 9. Determine if follow-up is needed based on today's date
 */

interface StoreTarget {
  id: string;
  store_id: string;
  target_amount: number;
  month: number;
  year: number;
}

interface SaleRecord {
  id: string;
  store_id: string;
  total_amount: number;
  created_at: string;
}

interface BusinessSettings {
  follow_up_lead_time_days: number;
  follow_up_grace_period_days: number;
  burn_rate_safety_floor_percent: number;
  follow_up_working_days: string;
}

interface FollowUpResult {
  reason: 'low_stock' | 'run_out' | 'must_order' | 'target_at_risk' | 'overdue_payment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'done' | 'snoozed' | 'auto_resolved' | 'cancelled_by_sale' | 'expired';
  scheduled_date: string;
  depletion_date: string;
}

function getSettings(settingsMap: Map<string, string>): BusinessSettings {
  return {
    follow_up_lead_time_days: parseInt(settingsMap.get('follow_up_lead_time_days') ?? '2', 10),
    follow_up_grace_period_days: parseInt(settingsMap.get('follow_up_grace_period_days') ?? '2', 10),
    burn_rate_safety_floor_percent: parseInt(settingsMap.get('burn_rate_safety_floor_percent') ?? '50', 10),
    follow_up_working_days: settingsMap.get('follow_up_working_days') ?? 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
  };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function calculateDepletion(
  targetAmount: number,
  lastSale: SaleRecord,
  totalSalesThisMonth: number,
  settings: BusinessSettings,
  today: Date
): FollowUpResult | null {
  const remainingTarget = Math.max(0, targetAmount - totalSalesThisMonth);
  
  // If no remaining target, no depletion needed
  if (remainingTarget <= 0) {
    return null;
  }

  const now = new Date(today);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const currentDay = now.getDate();
  const remainingDays = daysInMonth - currentDay + 1;

  // Base burn = target / 30 (monthly average)
  const baseBurn = targetAmount / 30;
  
  // Dynamic burn = remaining / remaining_days
  const dynamicBurn = remainingDays > 0 ? remainingTarget / remainingDays : baseBurn;
  
  // Safety floor = base_burn * (floor_percent / 100)
  const floorMultiplier = settings.burn_rate_safety_floor_percent / 100;
  const safetyFloor = baseBurn * floorMultiplier;
  
  // Actual daily burn = max(dynamic, safety_floor)
  const dailyBurn = Math.max(dynamicBurn, safetyFloor);
  
  // Days until this specific sale runs out
  const saleAmount = lastSale.total_amount;
  const daysUntilRunout = Math.ceil(saleAmount / dailyBurn);
  
  // Calculate dates
  const lastSaleDate = new Date(lastSale.created_at);
  const runoutDate = new Date(lastSaleDate);
  runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
  
  const followUpDate = new Date(runoutDate);
  followUpDate.setDate(followUpDate.getDate() - settings.follow_up_lead_time_days);
  
  // Determine status based on dates
  let reason: FollowUpResult['reason'] = 'low_stock';
  let priority: FollowUpResult['priority'] = 'medium';
  let status: FollowUpResult['status'] = 'pending';
  let scheduledDate = followUpDate;
  
  const todayStr = formatDate(today);
  const runoutDateStr = formatDate(runoutDate);
  const followUpDateStr = formatDate(followUpDate);
  
  const gracePeriodEnd = new Date(runoutDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.follow_up_grace_period_days);
  
  // Check if we're past the runout date
  if (todayStr > runoutDateStr) {
    if (todayStr > formatDate(gracePeriodEnd)) {
      reason = 'must_order';
      priority = 'critical';
      status = 'pending';
      scheduledDate = today; // Immediate
    } else {
      reason = 'run_out';
      priority = 'high';
      status = 'pending';
      scheduledDate = today; // Immediate
    }
  } else if (todayStr >= followUpDateStr) {
    reason = 'low_stock';
    priority = 'medium';
    status = 'pending';
    scheduledDate = new Date(today); // Today
  } else {
    // Follow-up not due yet
    return null;
  }

  return {
    reason,
    priority,
    status,
    scheduled_date: formatDate(scheduledDate),
    depletion_date: runoutDateStr,
  };
}

async function processStore(
  adminClient: any,
  target: StoreTarget,
  settings: BusinessSettings,
  today: Date
): Promise<{ store_id: string; action: string; details?: string }> {
  try {
    // Find the most recent non-cancelled sale for this store
    const { data: lastSale, error: saleError } = await adminClient
      .from('sales')
      .select('id, store_id, total_amount, created_at')
      .eq('store_id', target.store_id)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (saleError || !lastSale) {
      return { store_id: target.store_id, action: 'skipped', details: 'No active sales found' };
    }

    // Calculate total sales this month for this store
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const { data: monthSales, error: monthError } = await adminClient
      .from('sales')
      .select('total_amount')
      .eq('store_id', target.store_id)
      .not('status', 'eq', 'cancelled')
      .gte('created_at', startOfMonth.toISOString())
      .lt('created_at', new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString());

    if (monthError) {
      return { store_id: target.store_id, action: 'error', details: monthError.message };
    }

    const totalSalesThisMonth = monthSales?.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0) ?? 0;

    // Calculate depletion
    const followUpStatus = calculateDepletion(
      target.target_amount,
      lastSale as SaleRecord,
      totalSalesThisMonth,
      settings,
      today
    );

    if (!followUpStatus) {
      return { store_id: target.store_id, action: 'no_action_needed' };
    }

    // Check if there's already an active follow-up for this store
    const { data: existingFollowUp } = await adminClient
      .from('follow_up_schedule')
      .select('id')
      .eq('store_id', target.store_id)
      .in('status', ['pending', 'snoozed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingFollowUp) {
      // Update existing follow-up
      const { error: updateError } = await adminClient
        .from('follow_up_schedule')
        .update({
          reason: followUpStatus.reason,
          priority: followUpStatus.priority,
          status: followUpStatus.status,
          scheduled_date: followUpStatus.scheduled_date,
          depletion_date: followUpStatus.depletion_date,
          last_sale_date: formatDate(new Date(lastSale.created_at)),
          last_sale_amount: lastSale.total_amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingFollowUp.id);

      if (updateError) {
        return { store_id: target.store_id, action: 'error', details: updateError.message };
      }

      return { store_id: target.store_id, action: 'updated' };
    } else {
      // Create new follow-up
      const { error: insertError } = await adminClient
        .from('follow_up_schedule')
        .insert({
          store_id: target.store_id,
          // TODO: Link to assigned marketer when available
          reason: followUpStatus.reason,
          priority: followUpStatus.priority,
          status: followUpStatus.status,
          scheduled_date: followUpStatus.scheduled_date,
          depletion_date: followUpStatus.depletion_date,
          last_sale_date: formatDate(new Date(lastSale.created_at)),
          last_sale_amount: lastSale.total_amount,
        });

      if (insertError) {
        return { store_id: target.store_id, action: 'error', details: insertError.message };
      }

      return { store_id: target.store_id, action: 'created' };
    }
  } catch (err: any) {
    return { store_id: target.store_id, action: 'error', details: err.message };
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check for cron mode (no JWT needed for CRON)
    const cronSecret = req.headers.get("X-Cron-Secret");
    let expectedCronSecret = Deno.env.get("DAILY_WORKER_CRON_SECRET");
    if (!expectedCronSecret) {
      const { data: cronSetting } = await adminClient
        .from('business_settings')
        .select('setting_value')
        .eq('setting_key', 'daily_worker_cron_secret')
        .single();
      expectedCronSecret = cronSetting?.setting_value;
    }
    const isCronMode = cronSecret && cronSecret === expectedCronSecret;
    
    if (!isCronMode) {
      // Non-CRON mode: require JWT auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing auth" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Verify caller identity from JWT
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await anonClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Check if caller is admin/manager
      const { data: roleData } = await adminClient.from("profiles").select("role").eq("id", caller.id).single();
      const allowedRoles = ['admin', 'super_admin', 'manager'];
      if (!allowedRoles.includes(roleData?.role)) {
        return new Response(JSON.stringify({ error: "Only admins/managers can run the replenishment worker" }), { 
          status: 403, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    // Load business settings
    const { data: settingsRows, error: settingsError } = await adminClient
      .from('business_settings')
      .select('setting_key, setting_value');

    if (settingsError) {
      throw settingsError;
    }

    const settingsMap = new Map<string, string>();
    settingsRows?.forEach((row: any) => {
      settingsMap.set(row.setting_key, row.setting_value);
    });
    const settings = getSettings(settingsMap);

    // Get current date info
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Month-end reset: If today is the last day of the month, archive old follow-ups
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    if (today.getDate() >= daysInMonth) {
      // Mark all pending/snozooed follow-ups as expired
      await adminClient
        .from('follow_up_schedule')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('status', ['pending', 'snoozed']);
    }

    // Fetch active targets for this month
    const { data: targets, error: targetsError } = await adminClient
      .from('store_targets')
      .select('id, store_id, target_amount, month, year')
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .eq('status', 'active');

    if (targetsError) {
      throw targetsError;
    }

    // Process each store
    const results = [];
    for (const target of (targets ?? [])) {
      const result = await processStore(adminClient, target as StoreTarget, settings, today);
      results.push(result);
    }

    // Summary statistics
    const summary = {
      total_processed: results.length,
      created: results.filter((r: any) => r.action === 'created').length,
      updated: results.filter((r: any) => r.action === 'updated').length,
      skipped: results.filter((r: any) => r.action === 'skipped').length,
      no_action: results.filter((r: any) => r.action === 'no_action_needed').length,
      errors: results.filter((r: any) => r.action === 'error').length,
      date: formatDate(today),
    };

    return new Response(JSON.stringify({ success: true, summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("daily-replenishment-worker error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
