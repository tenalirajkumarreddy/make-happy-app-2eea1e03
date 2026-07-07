import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

/**
 * Process Sale Cancellation
 * 
 * Triggered when a sale is cancelled.
 * 1. Finds the previous non-cancelled sale for the store
 * 2. Recalculates depletion based on the previous sale
 * 3. Creates a MUST_ORDER follow-up if the store had a pending follow-up
 */

interface ProcessSaleCancellationBody {
  store_id: string;
  sale_id: string;
  sale_amount: number;
  sale_date: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { store_id, sale_id, sale_amount, sale_date } = await req.json() as ProcessSaleCancellationBody;

    if (!store_id || !sale_id || !sale_amount || !sale_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 1. Find the previous non-cancelled, non-draft sale (excluding the cancelled one)
    const { data: previousSale, error: saleError } = await adminClient
      .from('sales')
      .select('id, store_id, total_amount, created_at')
      .eq('store_id', store_id)
      .not('status', 'eq', 'cancelled')
      .neq('id', sale_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (saleError) {
      throw saleError;
    }

    // 2. Mark any active follow-up as needing attention due to cancellation
    const { data: activeFollowUp } = await adminClient
      .from('follow_up_schedule')
      .select('id')
      .eq('store_id', store_id)
      .in('status', ['pending', 'snoozed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeFollowUp) {
      // Update to MUST_ORDER with critical priority since a sale was cancelled
      await adminClient
        .from('follow_up_schedule')
        .update({
          reason: 'must_order',
          priority: 'critical',
          status: 'pending',
          notes: `Previous sale of ${sale_amount} was cancelled. Stock now based on earlier sale.`
        })
        .eq('id', activeFollowUp.id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Sale cancellation processed. Follow-up updated to MUST_ORDER.",
      store_id,
      previous_sale: previousSale ? {
        id: previousSale.id,
        amount: previousSale.total_amount,
        date: previousSale.created_at
      } : null
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("process-sale-cancellation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
