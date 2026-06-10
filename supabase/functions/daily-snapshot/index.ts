import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";
import { requireCronOrSuperAdmin } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authError = await requireCronOrSuperAdmin(req, supabase);
    if (authError) return authError;

    let p_date = new Date().toISOString().split("T")[0];
    try {
      const body = await req.json();
      if (body.date) p_date = body.date;
    } catch { /* use today's date */ }

    const results: Record<string, any> = { date: p_date, tables: {}, errors: [] };

    // --- 1. Receivables Aging Snapshot ---
    try {
      const { data: agingData } = await supabase.rpc("compute_receivables_aging", { p_date });

      if (agingData && agingData.length > 0) {
        const records = agingData.map((r: any) => ({
          snapshot_date: p_date,
          store_id: r.store_id,
          customer_id: r.customer_id,
          warehouse_id: r.warehouse_id || null,
          bucket_current: Number(r.bucket_current) || 0,
          bucket_31_60: Number(r.bucket_31_60) || 0,
          bucket_61_90: Number(r.bucket_61_90) || 0,
          bucket_90_plus: Number(r.bucket_90_plus) || 0,
          closing_outstanding: Number(r.closing_outstanding) || 0,
        }));

        const { error: upsertErr } = await supabase
          .from("daily_receivables_snapshots")
          .upsert(records, { onConflict: "snapshot_date,store_id" });

        if (upsertErr) throw upsertErr;
        results.tables.receivables = { count: records.length };
      } else {
        results.tables.receivables = { count: 0, note: "No aging data for this date" };
      }
    } catch (e: any) {
      results.errors.push({ table: "daily_receivables_snapshots", error: e.message });
      results.tables.receivables = { count: 0, error: e.message };
    }

    // --- 2. Store Performance Snapshot ---
    try {
      const { data: storeData } = await supabase.rpc("compute_daily_store_snapshot", { p_date });

      if (storeData && storeData.length > 0) {
        const records = storeData.map((r: any) => ({
          snapshot_date: p_date,
          store_id: r.store_id,
          route_id: r.route_id || null,
          warehouse_id: r.warehouse_id || null,
          route_order: r.route_order || null,
          sales_count: Number(r.sales_count) || 0,
          sales_amount: Number(r.sales_amount) || 0,
          collections_amount: Number(r.collections_amount) || 0,
          credit_given: Number(r.credit_given) || 0,
          new_outstanding: Number(r.new_outstanding) || 0,
          closing_outstanding: Number(r.closing_outstanding) || 0,
          visited: r.visited || false,
          visited_at: r.visited_at || null,
        }));

        const { error: upsertErr } = await supabase
          .from("daily_store_snapshots")
          .upsert(records, { onConflict: "snapshot_date,store_id" });

        if (upsertErr) throw upsertErr;
        results.tables.stores = { count: records.length };
      } else {
        results.tables.stores = { count: 0, note: "No store data for this date" };
      }
    } catch (e: any) {
      results.errors.push({ table: "daily_store_snapshots", error: e.message });
      results.tables.stores = { count: 0, error: e.message };
    }

    // --- 3. User Performance Snapshot ---
    try {
      const { data: userData } = await supabase.rpc("compute_daily_user_snapshot", { p_date });

      if (userData && userData.length > 0) {
        const records = userData
          .filter((r: any) => r.user_id)
          .map((r: any) => ({
            snapshot_date: p_date,
            user_id: r.user_id,
            warehouse_id: r.warehouse_id || null,
            sales_count: Number(r.sales_count) || 0,
            sales_amount: Number(r.sales_amount) || 0,
            collections_count: Number(r.collections_count) || 0,
            collections_amount: Number(r.collections_amount) || 0,
            cash_collected: Number(r.cash_collected) || 0,
            upi_collected: Number(r.upi_collected) || 0,
            visits_count: Number(r.visits_count) || 0,
            routes_covered: Number(r.routes_covered) || 0,
            expenses_approved: Number(r.expenses_approved) || 0,
          }));

        if (records.length > 0) {
          const { error: upsertErr } = await supabase
            .from("daily_user_snapshots")
            .upsert(records, { onConflict: "snapshot_date,user_id" });

          if (upsertErr) throw upsertErr;
          results.tables.users = { count: records.length };
        } else {
          results.tables.users = { count: 0, note: "No user data for this date" };
        }
      } else {
        results.tables.users = { count: 0, note: "No user data for this date" };
      }
    } catch (e: any) {
      results.errors.push({ table: "daily_user_snapshots", error: e.message });
      results.tables.users = { count: 0, error: e.message };
    }

    // --- Also populate handover_snapshots (keep existing logic) ---
    try {
      const { data: handoverData } = await supabase.rpc("get_daily_handover_aggregates", { p_snapshot_date: p_date });
      if (handoverData && handoverData.length > 0) {
        const records = handoverData.map((agg: any) => ({
          user_id: agg.user_id,
          snapshot_date: p_date,
          balance_amount: Number(agg.balance) || 0, // ISSUE-12 FIX: Preserve negative balances
        }));
        const { error: upsertErr } = await supabase.from("handover_snapshots").upsert(records, { onConflict: "user_id,snapshot_date" });
        if (upsertErr) throw upsertErr;
        results.tables.handover = { count: records.length };
      } else {
        results.tables.handover = { count: 0 };
      }
    } catch (e: any) {
      results.errors.push({ table: "handover_snapshots", error: e.message });
      results.tables.handover = { count: 0, error: e.message };
    }

    const totalRecords = Object.values(results.tables).reduce((s, t: any) => s + (t.count || 0), 0);
    const hasErrors = results.errors.length > 0;

    return new Response(JSON.stringify({ success: !hasErrors, date: p_date, totalRecords, ...results }), {
      status: hasErrors ? 207 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("daily-snapshot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});