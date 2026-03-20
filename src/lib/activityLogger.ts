import { supabase } from "@/integrations/supabase/client";

export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityName?: string,
  entityId?: string,
  metadata?: Record<string, any>
) {
  const { error } = await supabase.from("activity_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_name: entityName || null,
    entity_id: entityId || null,
    metadata: metadata || {},
  });

  if (error) {
    console.error("[activityLogger] Failed to log activity:", error.message, {
      action,
      entityType,
      entityName,
      entityId,
    });
  }
}
