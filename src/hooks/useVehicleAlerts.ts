import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AlertThreshold {
  metric: string;
  value: number;
}

export function useAlertThresholds() {
  return useQuery({
    queryKey: ["vehicle_alert_thresholds"],
    queryFn: async (): Promise<AlertThreshold[]> => {
      const { data, error } = await supabase
        .from("vehicle_alert_thresholds")
        .select("metric, value");

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useUpdateAlertThreshold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metric, value }: AlertThreshold) => {
      const { error } = await supabase
        .from("vehicle_alert_thresholds")
        .upsert(
          { metric, value, updated_at: new Date().toISOString() },
          { onConflict: "metric" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_alert_thresholds"] });
      toast.success("Threshold updated");
    },
    onError: (err) => {
      toast.error(`Failed to update threshold: ${err.message}`);
    },
  });
}
