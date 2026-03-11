import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Activity = () => {
  const { user } = useAuth();

  const { data: activities, isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const columns = [
    { header: "Time", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "font-mono text-xs" },
    { header: "User", accessor: (row: any) => row.user_id?.slice(0, 8) || "System", className: "font-mono text-xs" },
    { header: "Action", accessor: "action" as const },
    { header: "Entity", accessor: (row: any) => row.entity_name || row.entity_id || "—", className: "text-muted-foreground" },
    { header: "Type", accessor: (row: any) => <Badge variant="outline">{row.entity_type}</Badge> },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Activity Log" subtitle="Track all system actions and changes" />
      {(!activities || activities.length === 0) ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          No activity logs yet. Actions like recording sales, creating orders, and managing users will appear here.
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={activities}
          searchKey="action"
          searchPlaceholder="Search actions..."
          renderMobileCard={(row: any) => (
            <div className="rounded-xl border bg-card p-4 space-y-2 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground leading-snug">{row.action}</p>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{row.entity_type}</Badge>
              </div>
              {(row.entity_name || row.entity_id) && (
                <p className="text-xs text-muted-foreground">{row.entity_name || row.entity_id}</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                <span className="font-mono">{row.user_id?.slice(0, 8) || "System"}</span>
                <span>{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
};

export default Activity;
