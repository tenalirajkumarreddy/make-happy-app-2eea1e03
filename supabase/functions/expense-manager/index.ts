// Expense Manager Edge Function
// Handles expense creation, bill uploads, approval workflow, and holding amount tracking

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://aquaprimesales.vercel.app",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8100",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const userRole = roleData?.role || "customer";
    const isAdmin = ["super_admin", "manager"].includes(userRole);

    const body = await req.json();
    const { action } = body;

    // ========== ACTION: CREATE_EXPENSE ==========
    if (action === "create_expense") {
      const {
        amount,
        description,
        category_id,
        expense_date,
        source_store_id,
        bill_base64,  // Base64 encoded bill images (up to 3)
        is_adhoc,
      } = body;

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate display ID
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      const displayId = `EXP-${dateStr}-${randomPart}`;

      // Handle bill uploads
      let billUrls: string[] = [];
      if (bill_base64 && Array.isArray(bill_base64) && bill_base64.length > 0) {
        const userFolder = user.id;
        
        for (let i = 0; i < Math.min(bill_base64.length, 3); i++) {
          const base64Data = bill_base64[i];
          const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          
          if (!matches) continue;
          
          const mimeType = matches[1];
          const fileData = atob(matches[2]);
          const bytes = new Uint8Array(fileData.length);
          for (let j = 0; j < fileData.length; j++) {
            bytes[j] = fileData.charCodeAt(j);
          }

          const ext = mimeType.split("/")[1] || "jpg";
          const fileName = `${userFolder}/${displayId}_bill_${i + 1}.${ext}`;
          
          const { error: uploadError } = await supabase.storage
            .from("expense-bills")
            .upload(fileName, bytes, {
              contentType: mimeType,
              upsert: true,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("expense-bills")
              .getPublicUrl(fileName);
            billUrls.push(urlData.publicUrl);
          }
        }
      }

      // Determine status based on is_adhoc flag
      // Adhoc = immediately locked (reduces holding), Regular = pending approval
      const status = is_adhoc ? "adhoc_locked" : "pending";
      const holdingLocked = is_adhoc ? amount : 0;

      // Insert expense claim
      const { data: expense, error: insertError } = await supabase
        .from("expense_claims")
        .insert({
          display_id: displayId,
          user_id: user.id,
          category_id: category_id || null,
          amount: amount,
          expense_date: expense_date || new Date().toISOString().slice(0, 10),
          description: description || "",
          receipt_url: billUrls[0] || null,
          bill_urls: billUrls,
          status: status,
          source_store_id: source_store_id || null,
          is_adhoc: is_adhoc || false,
          attachment_count: billUrls.length,
          holding_amount_locked: holdingLocked,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Log holding amount change if adhoc
      if (is_adhoc) {
        await supabase.from("holding_amount_log").insert({
          user_id: user.id,
          expense_claim_id: expense.id,
          amount: amount,
          previous_holding: 0,
          new_holding: amount,
          action: "adhoc_lock",
          reference_type: "expense_claim",
          created_by: user.id,
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        expense,
        message: is_adhoc ? "Adhoc expense created - holding amount locked" : "Expense submitted for approval"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: LIST_EXPENSES ==========
    if (action === "list_expenses") {
      let query = supabase
        .from("expense_claims")
        .select(`
          *,
          category:expense_categories(name),
          reviewed_by_user:user!expense_claims_reviewed_by_fkey(full_name),
          user:user!expense_claims_user_id_fkey(full_name, phone)
        `)
        .order("created_at", { ascending: false });

      // Non-admins only see their own expenses
      if (!isAdmin) {
        query = query.eq("user_id", user.id);
      }

      // Apply filters
      if (body.status && body.status !== "all") {
        query = query.eq("status", body.status);
      }
      if (body.start_date) {
        query = query.gte("expense_date", body.start_date);
      }
      if (body.end_date) {
        query = query.lte("expense_date", body.end_date);
      }

      const { data: expenses, error } = await query.limit(100);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, expenses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: GET_EXPENSE ==========
    if (action === "get_expense") {
      const { expense_id } = body;
      if (!expense_id) {
        return new Response(JSON.stringify({ error: "Expense ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: expense, error } = await supabase
        .from("expense_claims")
        .select(`
          *,
          category:expense_categories(name),
          reviewed_by_user:user!expense_claims_reviewed_by_fkey(full_name),
          user:user!expense_claims_user_id_fkey(full_name, phone)
        `)
        .eq("id", expense_id)
        .single();

      if (error) throw error;

      // Check access
      if (!isAdmin && expense.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, expense }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: APPROVE_EXPENSE (Admin only) ==========
    if (action === "approve_expense") {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { expense_id, approved, approved_amount, reviewer_notes, rejection_reason } = body;
      
      if (!expense_id) {
        return new Response(JSON.stringify({ error: "Expense ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current expense
      const { data: currentExpense, error: fetchError } = await supabase
        .from("expense_claims")
        .select("*")
        .eq("id", expense_id)
        .single();

      if (fetchError) throw fetchError;

      const newStatus = approved ? "approved" : "rejected";
      const newHoldingLocked = approved ? 0 : 0; // Approved = 0 (still needs payment), Rejected = 0 (unlocked)

      const updateData: any = {
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: reviewer_notes || null,
      };

      if (approved) {
        updateData.approved_amount = approved_amount || currentExpense.amount;
        updateData.approved_at = new Date().toISOString();
      } else {
        updateData.rejection_reason = rejection_reason || null;
        updateData.holding_amount_locked = 0; // Unlock holding
      }

      const { data: expense, error: updateError } = await supabase
        .from("expense_claims")
        .update(updateData)
        .eq("id", expense_id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log the action
      await supabase.from("holding_amount_log").insert({
        user_id: currentExpense.user_id,
        expense_claim_id: expense_id,
        amount: currentExpense.amount,
        previous_holding: currentExpense.holding_amount_locked,
        new_holding: approved ? 0 : 0,
        action: approved ? "approved" : "rejected",
        reference_type: "expense_claim",
        created_by: user.id,
      });

      return new Response(JSON.stringify({ 
        success: true, 
        expense,
        message: approved ? "Expense approved" : "Expense rejected"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: GET_HOLDING_AMOUNT ==========
    if (action === "get_holding_amount") {
      const targetUserId = body.user_id || user.id;

      const { data: holdingData, error } = await supabase.rpc("get_user_holding_amount", {
        p_user_id: targetUserId,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        holding: holdingData[0] || { total_locked: 0, pending_claims: 0, approved_claims: 0, rejected_claims: 0, net_holding: 0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: GET_HOLDING_LOGS ==========
    if (action === "get_holding_logs") {
      const targetUserId = body.user_id || user.id;

      let query = supabase
        .from("holding_amount_log")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });

      if (isAdmin && body.all_users) {
        query = supabase
          .from("holding_amount_log")
          .select(`
            *,
            user:user!holding_amount_log_user_id_fkey(full_name, phone)
          `)
          .order("created_at", { ascending: false })
          .limit(200);
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, logs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== ACTION: UPLOAD_BILL ==========
    if (action === "upload_bill") {
      // Handle multipart form data for bill upload
      const contentType = req.headers.get("content-type") || "";
      
      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        
        if (!file) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const bytes = await file.arrayBuffer();
        const fileName = `${user.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("expense-bills")
          .upload(fileName, bytes, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("expense-bills")
          .getPublicUrl(fileName);

        return new Response(JSON.stringify({ 
          success: true, 
          url: urlData.publicUrl,
          fileName
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("expense-manager error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});