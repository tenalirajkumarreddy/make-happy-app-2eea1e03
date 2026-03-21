import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

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
    logError("[activityLogger] Failed to log activity", error, {
      action,
      entityType,
      entityName,
      entityId,
    });
  }
}
