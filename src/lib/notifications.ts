import { supabase } from "@/integrations/supabase/client";

export type NotificationType = "order" | "payment" | "handover" | "system";

interface NotifyParams {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
}

/** Send a notification to a single user */
export async function sendNotification(params: NotifyParams) {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
  });
  if (error) console.error("Notification insert error:", error.message);
}

/** Send the same notification to multiple users */
export async function sendNotificationToMany(
  userIds: string[],
  params: Omit<NotifyParams, "userId">
) {
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title: params.title,
    message: params.message,
    type: params.type,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("Bulk notification error:", error.message);
}

/** Get admin/manager user IDs for broadcasting alerts */
export async function getAdminUserIds(): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "manager"]);
  return (data || []).map((r) => r.user_id);
}
