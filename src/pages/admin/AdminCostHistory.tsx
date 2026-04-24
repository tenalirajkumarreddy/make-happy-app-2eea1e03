import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminCostHistory() {
  useEffect(() => {
    document.title = 'Cost History';
  }, []);

  const { data: history, isLoading } = useQuery({
    queryKey: ["wac_cost_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wac_cost_history")
        .select(`
          *,
          raw_materials(name)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">WAC Cost History</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weighted Average Cost Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="rounded-md border">
              <table className="min-w-full divide-y border-collapse">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Material</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Old Cost</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">New Cost</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {history.map((record: any) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {format(new Date(record.created_at), "MMM d, yyyy HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {record.raw_materials?.name || "Unknown Material"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {Number(record.old_cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {Number(record.new_cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {record.reason || "System Adjustment"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No WAC history records found. Cost adjustments will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
