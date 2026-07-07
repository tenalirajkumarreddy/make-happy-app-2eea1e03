import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MarketerTarget {
  id: string;
  target_type: 'units' | 'collection';
  target_amount: number;
  current_progress: number;
  status: string;
}

export function useMarketerTarget() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['marketer-target', user?.id],
    queryFn: async () => {
      const today = new Date();
      const month = today.getMonth() + 1;
      const year = today.getFullYear();

      const { data, error } = await supabase
        .from('marketer_targets')
        .select()
        .eq('user_id', user!.id)
        .eq('month', month)
        .eq('year', year)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      return data as MarketerTarget | null;
    },
    enabled: !!user?.id,
  });
}
