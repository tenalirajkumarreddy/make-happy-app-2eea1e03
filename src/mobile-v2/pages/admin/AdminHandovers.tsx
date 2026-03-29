import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Wallet, 
  Search, 
  Calendar,
  User,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminHandovers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: handovers, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-handovers", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("handovers")
        .select(`
          id,
          display_id,
          total_cash,
          total_collections,
          status,
          notes,
          created_at,
          agent:profiles!agent_id(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const filteredHandovers = handovers?.filter(h => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      h.display_id?.toLowerCase().includes(search) ||
      h.agent?.full_name?.toLowerCase().includes(search)
    );
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return CheckCircle;
      case "pending": return Clock;
      case "rejected": return XCircle;
      default: return Clock;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed": return "success";
      case "pending": return "warning";
      case "rejected": return "danger";
      default: return "default";
    }
  };

  // Stats
  const totalPending = handovers?.filter(h => h.status === "pending").length || 0;
  const totalCash = handovers?.reduce((sum, h) => sum + (h.total_cash || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
        </div>
        {[1, 2, 3].map(i => (
          <Loading.Skeleton key={i} className="h-24 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Handovers</h1>
        <p className="text-sm text-muted-foreground">Cash handover records</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
          <p className="text-sm text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalCash)}
          </p>
          <p className="text-sm text-muted-foreground">Total Cash</p>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search handovers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="mv2-input">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Handovers List */}
      <Section title="All Handovers">
        {filteredHandovers && filteredHandovers.length > 0 ? (
          <div className="space-y-3">
            {filteredHandovers.map((handover) => {
              const StatusIcon = getStatusIcon(handover.status || "pending");

              return (
                <Card key={handover.id} variant="outline" className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {handover.display_id || `#${handover.id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(handover.created_at)}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(handover.status || "pending")}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {handover.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm mb-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">
                      {handover.agent?.full_name || "Agent"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Cash</p>
                      <p className="font-semibold text-foreground">
                        {formatCurrency(handover.total_cash || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Collections</p>
                      <p className="font-semibold text-foreground">
                        {formatCurrency(handover.total_collections || 0)}
                      </p>
                    </div>
                  </div>

                  {handover.notes && (
                    <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
                      {handover.notes}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Wallet}
            title="No handovers found"
            description="Handover records will appear here"
          />
        )}
      </Section>
    </div>
  );
}
