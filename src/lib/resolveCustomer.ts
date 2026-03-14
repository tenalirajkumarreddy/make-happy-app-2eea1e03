import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves the current user's customer record by user_id only.
 */
export async function resolveCustomer(
  userId: string,
  select = "*"
) {
  const { data } = await supabase
    .from("customers")
    .select(select)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}
