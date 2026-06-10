import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveOrderInfo {
  id: string;
  display_id: string;
  store_id: string;
  status: string;
}

export async function getActiveOrderForStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<ActiveOrderInfo | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, display_id, store_id, status")
    .eq("store_id", storeId)
    .in("status", ["pending", "confirmed"])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
