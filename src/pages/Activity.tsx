import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

const Activity = () => {
  const { user } = useAuth();

  // Fetch activity logs
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

  // Fetch all user profiles to map user_id to name
  const { data: profiles } = useQuery({
    queryKey: ["profiles-for-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      if (error) throw error;
      return data;
    },
  });

  // Create username lookup map - keyed by user_id, not id
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles?.forEach((p) => {
      if (p.user_id && p.full_name) map.set(p.user_id, p.full_name);
    });
    return map;
  }, [profiles]);

  const getUserName = (userId: string | null) => {
    if (!userId) return "System";
    return userNameMap.get(userId) || userId.slice(0, 8);
  };

  const columns = [
    { header: "Time", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "font-mono text-xs" },
    { header: "User", accessor: (row: any) => getUserName(row.user_id), className: "text-sm" },
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
            <div className="rounded-lg border bg-card p-3">
              {/* Action + Type */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-medium text-foreground leading-snug">{row.action}</p>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{row.entity_type}</Badge>
              </div>
              {/* Entity name */}
              {(row.entity_name || row.entity_id) && (
                <p className="text-xs text-muted-foreground mb-2">{row.entity_name || row.entity_id}</p>
              )}
              {/* Footer: User + Time */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <span className="font-medium">{getUserName(row.user_id)}</span>
                <span className="text-[10px]">{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
};

export default Activity;
