import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrError } from "../_shared/cors.ts";

interface QualityIssue {
  table: string;
  issue_type: string;
  record_id: string;
  display_id?: string;
  details: string;
  severity: "critical" | "warning" | "info";
}

async function runQualityChecks(supabase: any): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];

  // 1. Check for negative outstanding balances
  const { data: negativeOutstanding } = await supabase
    .from("stores")
    .select("id, display_id, name, outstanding, customer_id")
    .lt("outstanding", 0);

  negativeOutstanding?.forEach((store: any) => {
    issues.push({
      table: "stores",
      issue_type: "negative_outstanding",
      record_id: store.id,
      display_id: store.display_id,
      details: `Store "${store.name}" has negative outstanding: ₹${store.outstanding}`,
      severity: "critical",
    });
  });

  // 2. Check for orphaned sale_items (no parent sale)
  const { data: orphanedSaleItems } = await supabase.rpc("find_orphaned_sale_items");
  
  orphanedSaleItems?.forEach((item: any) => {
    issues.push({
      table: "sale_items",
      issue_type: "orphaned_record",
      record_id: item.id,
      details: `Sale item references non-existent sale: ${item.sale_id}`,
      severity: "critical",
    });
  });

  // 3. Check for orphaned order_items (no parent order)
  const { data: orphanedOrderItems } = await supabase.rpc("find_orphaned_order_items");
  
  orphanedOrderItems?.forEach((item: any) => {
    issues.push({
      table: "order_items",
      issue_type: "orphaned_record",
      record_id: item.id,
      details: `Order item references non-existent order: ${item.order_id}`,
      severity: "critical",
    });
  });

  // 4. Check for stores with customer_id mismatch
  const { data: storeCustomerMismatch } = await supabase.rpc("find_store_customer_mismatches");
  
  storeCustomerMismatch?.forEach((record: any) => {
    issues.push({
      table: "stores",
      issue_type: "customer_mismatch",
      record_id: record.store_id,
      display_id: record.store_display_id,
      details: `Store customer_id (${record.store_customer_id}) doesn't match linked customer (${record.actual_customer_id})`,
      severity: "warning",
    });
  });

  // 5. Check for duplicate phone numbers
  const { data: duplicatePhones } = await supabase
    .from("customers")
    .select("phone, count(*) as cnt")
    .not("phone", "is", null)
    .gt("phone", "")
    .group("phone")
    .gt("count", 1);

  duplicatePhones?.forEach((dup: any) => {
    issues.push({
      table: "customers",
      issue_type: "duplicate_phone",
      record_id: "-",
      details: `Phone number "${dup.phone}" appears ${dup.cnt} times`,
      severity: "warning",
    });
  });

  // 6. Check for stores without customers
  const { data: orphanStores } = await supabase
    .from("stores")
    .select("id, display_id, name")
    .is("customer_id", null);

  orphanStores?.forEach((store: any) => {
    issues.push({
      table: "stores",
      issue_type: "missing_customer",
      record_id: store.id,
      display_id: store.display_id,
      details: `Store "${store.name}" has no linked customer`,
      severity: "warning",
    });
  });

  // 7. Check for sales with incorrect outstanding calculations
  const { data: miscalculatedSales } = await supabase.rpc("find_miscalculated_sales");
  
  miscalculatedSales?.forEach((sale: any) => {
    issues.push({
      table: "sales",
      issue_type: "miscalculated_outstanding",
      record_id: sale.id,
      display_id: sale.display_id,
      details: `Sale outstanding (${sale.outstanding_amount}) doesn't match expected (${sale.expected_outstanding})`,
      severity: "critical",
    });
  });

  // 8. Check for unfulfilled orders older than 7 days
  const { data: oldPendingOrders } = await supabase
    .from("orders")
    .select("id, display_id, created_at, stores(name)")
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  oldPendingOrders?.forEach((order: any) => {
    issues.push({
      table: "orders",
      issue_type: "stale_pending_order",
      record_id: order.id,
      display_id: order.display_id,
      details: `Order from ${order.stores?.name || "unknown store"} has been pending since ${new Date(order.created_at).toLocaleDateString()}`,
      severity: "info",
    });
  });

  // 9. Check for handover amount mismatches
  const { data: handoverMismatches } = await supabase.rpc("find_handover_mismatches");
  
  handoverMismatches?.forEach((mismatch: any) => {
    issues.push({
      table: "handovers",
      issue_type: "amount_mismatch",
      record_id: mismatch.id,
      details: `Handover total (${mismatch.cash_amount + mismatch.upi_amount}) doesn't match recorded sales (${mismatch.expected_amount})`,
      severity: "warning",
    });
  });

  return issues;
}

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflightOrError(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase env secrets are not configured");
    }

    // Require authenticated super_admin or manager
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!["super_admin", "manager"].includes(roleData?.role)) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run all quality checks
    const issues = await runQualityChecks(supabaseAdmin);

    // Log issues to activity_logs for admin review
    if (issues.length > 0) {
      const criticalCount = issues.filter(i => i.severity === "critical").length;
      const warningCount = issues.filter(i => i.severity === "warning").length;
      
      // Insert summary log
      await supabaseAdmin.from("activity_logs").insert({
        user_id: null,
        action: "data_quality_check",
        entity_type: "system",
        entity_id: "quality_check",
        details: {
          total_issues: issues.length,
          critical: criticalCount,
          warning: warningCount,
          info: issues.length - criticalCount - warningCount,
        },
      });

      // Store detailed issues in a dedicated table (if it exists)
      try {
        const { error: insertError } = await supabaseAdmin
          .from("data_quality_issues")
          .insert(issues.map(i => ({
            ...i,
            checked_at: new Date().toISOString(),
            resolved: false,
          })));
        
        if (insertError) {
          console.log("Note: data_quality_issues table may not exist, logging to console only");
        }
      } catch {
        // Table doesn't exist, skip
      }
    }

    // Send notifications for critical issues
    const criticalIssues = issues.filter(i => i.severity === "critical");
    if (criticalIssues.length > 0) {
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "manager"]);
      
      const adminIds = admins?.map(a => a.user_id) || [];
      
      if (adminIds.length > 0) {
        await supabaseAdmin.from("notifications").insert(
          adminIds.map(user_id => ({
            user_id,
            title: "Data Quality Alert",
            message: `${criticalIssues.length} critical data issues detected. Please review.`,
            type: "system",
            entity_type: "data_quality",
            entity_id: "critical_issues",
          }))
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        issues_found: issues.length,
        critical: issues.filter(i => i.severity === "critical").length,
        warning: issues.filter(i => i.severity === "warning").length,
        info: issues.filter(i => i.severity === "info").length,
        issues: issues.slice(0, 100), // Limit response size
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("data-quality-check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});