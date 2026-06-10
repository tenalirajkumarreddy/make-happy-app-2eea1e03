import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useHandoverBadge(userId?: string | null, keySuffix = "") {
  return useQuery({
    queryKey: [`mobile-pending-incoming-handovers${keySuffix}`, userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count } = await supabase
        .from("handovers")
        .select("id", { count: "exact", head: true })
        .eq("handed_to", userId)
        .eq("status", "awaiting_confirmation");
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}
