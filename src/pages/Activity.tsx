import { PageHeader } from "@/components/shared/PageHeader";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { Badge } from "@/components/ui/badge";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

const Activity = () => {
  const { user } = useAuth();
  const PAGE_SIZE = 50;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["activity-logs"],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length;
    },
  });

  const activities = useMemo(() => data?.pages.flatMap((page) => page) || [], [data]);

  const columns = [
    { 
      header: "Time", 
      accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), 
      className: "font-mono text-xs w-32" 
    },
    { 
      header: "User", 
      accessor: (row: any) => row.user_id?.slice(0, 8) || "System", 
      className: "font-mono text-xs w-24" 
    },
    { 
      header: "Action", 
      accessor: "action" as const,
      className: "font-medium"
    },
    { 
      header: "Entity", 
      accessor: (row: any) => row.entity_name || row.entity_id || "—", 
      className: "text-muted-foreground hidden md:block" 
    },
    { 
      header: "Type", 
      accessor: (row: any) => <Badge variant="outline">{row.entity_type}</Badge>,
      className: "w-24"
    },
  ];

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop === e.currentTarget.clientHeight;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-6rem)] flex flex-col">
      <PageHeader title="Activity Log" subtitle="Track all system actions and changes" />
      <div className="flex-1 min-h-0">
        <VirtualDataTable
          columns={columns}
          data={activities}
          searchKey="action"
          searchPlaceholder="Search actions..."
          height="100%"
          renderMobileCard={(row: any) => (
            <div className="p-4 border-b space-y-2">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">{row.action}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                 <span className="text-muted-foreground">{row.entity_name || row.entity_id}</span>
                 <Badge variant="secondary" className="text-[10px]">{row.entity_type}</Badge>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                User: {row.user_id?.slice(0, 8) || "System"}
              </div>
            </div>
          )}
        />
        {isFetchingNextPage && <div className="p-2 text-center text-xs text-muted-foreground">Loading more...</div>}
      </div>
    </div>
  );
};

export default Activity;
