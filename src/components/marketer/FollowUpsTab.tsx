import { useState } from "react";
import { useFollowUps } from "@/hooks/useFollowUps";
import { FollowUpCard } from "./FollowUpCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter } from "lucide-react";

export function FollowUpsTab() {
  const [filter, setFilter] = useState<'today' | 'week' | 'overdue' | 'snoozed' | 'all'>('today');
  const [search, setSearch] = useState('');
  const { data: followUps, isLoading, refetch } = useFollowUps(filter);

  const filtered = (followUps ?? []).filter(fu => 
    !search || fu.store_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getFilterLabel = () => {
    switch(filter) {
      case 'today': return "Today's";
      case 'week': return "This Week's";
      case 'overdue': return "Overdue";
      case 'snoozed': return "Snoozed";
      case 'all': return "All";
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const pendingCount = (followUps ?? []).filter(f => f.status === 'pending' && f.scheduled_date === todayStr).length;
  const urgentCount = (followUps ?? []).filter(f => ['high', 'critical'].includes(f.priority)).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending Today</p>
          <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgent</p>
          <p className="text-2xl font-bold text-red-700">{urgentCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search stores..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="snoozed">Snoozed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Showing {filtered.length} {getFilterLabel().toLowerCase()} follow-ups
        </span>
        {urgentCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {urgentCount} urgent
          </Badge>
        )}
      </div>

      {/* Follow-up Cards */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading follow-ups...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">No {getFilterLabel().toLowerCase()} follow-ups found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((followUp) => (
            <FollowUpCard 
              key={followUp.id} 
              followUp={followUp} 
              onRefresh={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
