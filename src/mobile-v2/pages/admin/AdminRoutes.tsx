import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Route, 
  Search,
  MapPin,
  User,
  Clock,
  CheckCircle,
  Play,
  Store
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminRoutes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: routes, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-routes", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("routes")
        .select(`
          id,
          name,
          description,
          is_active,
          created_at,
          route_stores:route_stores(
            id,
            store:profiles!store_id(business_name)
          )
        `)
        .order("name", { ascending: true });

      if (statusFilter === "active") {
        query = query.eq("is_active", true);
      } else if (statusFilter === "inactive") {
        query = query.eq("is_active", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Get active route sessions
  const { data: activeSessions } = useQuery({
    queryKey: ["mobile-v2-admin-route-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_sessions")
        .select(`
          id,
          route_id,
          started_at,
          agent:profiles!agent_id(full_name)
        `)
        .is("ended_at", null);

      if (error) throw error;
      return data || [];
    },
  });

  const filteredRoutes = routes?.filter(route => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      route.name?.toLowerCase().includes(search) ||
      route.description?.toLowerCase().includes(search)
    );
  });

  // Stats
  const activeRoutes = routes?.filter(r => r.is_active).length || 0;
  const inactiveRoutes = routes?.filter(r => !r.is_active).length || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
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
        <h1 className="text-xl font-bold text-foreground">Routes</h1>
        <p className="text-sm text-muted-foreground">Manage delivery routes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-primary">
            {routes?.length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {activeRoutes}
          </p>
          <p className="text-xs text-muted-foreground">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-blue-600">
            {activeSessions?.length || 0}
          </p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search routes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="mv2-input">
            <Route className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Routes</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Sessions Alert */}
      {activeSessions && activeSessions.length > 0 && (
        <Section title="Active Sessions" className="mb-6">
          <div className="space-y-2">
            {activeSessions.map((session) => {
              const route = routes?.find(r => r.id === session.route_id);
              return (
                <Card key={session.id} variant="outline" className="p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                      <Play className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-green-800 dark:text-green-200">
                        {route?.name || "Route"}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {session.agent?.full_name} • Started {formatDate(session.started_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {/* Routes List */}
      <Section title="All Routes">
        {filteredRoutes && filteredRoutes.length > 0 ? (
          <div className="space-y-3">
            {filteredRoutes.map((route) => {
              const storeCount = route.route_stores?.length || 0;
              const hasActiveSession = activeSessions?.some(s => s.route_id === route.id);

              return (
                <Card key={route.id} variant="outline" className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        route.is_active ? "bg-primary/10" : "bg-muted"
                      }`}>
                        <Route className={`w-5 h-5 ${
                          route.is_active ? "text-primary" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {route.name}
                        </p>
                        {route.description && (
                          <p className="text-sm text-muted-foreground">
                            {route.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={route.is_active ? "success" : "secondary"}>
                        {route.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {hasActiveSession && (
                        <Badge variant="info" className="text-xs">
                          <Play className="w-3 h-3 mr-1" />
                          In Progress
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Store className="w-4 h-4" />
                      <span>{storeCount} stores</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(route.created_at)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Route}
            title="No routes found"
            description="Create your first route"
          />
        )}
      </Section>
    </div>
  );
}
