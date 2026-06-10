import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

export type NotificationType = "order" | "payment" | "handover" | "system" | "stock_transfer" | "stock_request" | "order_fulfilled" | "order_created" | "order_assigned";

interface NotifyParams {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
}

/** Get user IDs for broadcast roles (super_admin, manager) */
export async function getBroadcastRolesUserIds(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "manager"]);
    return (data || []).map((r) => r.user_id);
  } catch {
    return [];
  }
}

/** Send a notification to a single user (and broadcast to admins/managers) */
export async function sendNotification(params: NotifyParams) {
  try {
    const broadcastIds = await getBroadcastRolesUserIds();
    const recipientIds = Array.from(new Set([params.userId, ...broadcastIds]));

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      title: params.title,
      message: params.message,
      type: params.type,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) throw error;
  } catch (error) {
    logError("Notification insert error", error);
  }
}

/** Send the same notification to multiple users (and broadcast to admins/managers) */
export async function sendNotificationToMany(
  userIds: string[],
  params: Omit<NotifyParams, "userId">,
  options?: { excludeFromBroadcast?: string[] }
) {
  try {
    let broadcastIds = await getBroadcastRolesUserIds();
    if (options?.excludeFromBroadcast?.length) {
      broadcastIds = broadcastIds.filter((id) => !options.excludeFromBroadcast!.includes(id));
    }
    const recipientIds = Array.from(new Set([...userIds, ...broadcastIds]));
    if (recipientIds.length === 0) return;

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      title: params.title,
      message: params.message,
      type: params.type,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) throw error;
  } catch (error) {
    logError("Bulk notification error", error);
  }
}

/** Get approver user IDs (super_admin, manager, operator) for broadcasting alerts */
export async function getApproverUserIds(): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "manager", "operator"]);
  return (data || []).map((r) => r.user_id);
}

/** @deprecated Use getApproverUserIds() instead */
export async function getAdminUserIds(): Promise<string[]> {
  return getApproverUserIds();
}

/** Get user IDs by specific roles */
export async function getUsersByRole(roles: string[]): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", roles as any);
  return (data || []).map((r) => r.user_id);
}

/** Get agents who have access to a specific store (via routes) */
export async function getAgentsForStore(storeId: string): Promise<string[]> {
  // Get routes this store belongs to
  const { data: storeData } = await supabase
    .from("stores")
    .select("route_id")
    .eq("id", storeId)
    .maybeSingle();
  
  if (!storeData?.route_id) return [];
  
  // Get agents assigned to these routes
  const { data: agentRoutes } = await supabase
    .from("agent_routes")
    .select("user_id")
    .eq("route_id", storeData.route_id)
    .eq("enabled", true);
  
  return (agentRoutes || []).map((r) => r.user_id);
}
