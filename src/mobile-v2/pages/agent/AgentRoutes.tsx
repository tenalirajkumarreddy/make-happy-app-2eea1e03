import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Map, Play, Square, ChevronRight, Clock, Store, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/Card";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";

interface Props {
  onSelectRoute?: (routeId: string) => void;
}

interface RouteRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  stores: { id: string }[];
}

interface SessionRow {
  id: string;
  status: string;
  started_at: string;
  route_id: string;
  routes: { name: string } | null;
}

export function AgentRoutes({ onSelectRoute }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch assigned routes
  const { data: routes, isLoading } = useQuery({
    queryKey: ["mobile-v2-agent-routes", user?.id],
    queryFn: async () => {
      // Get routes assigned to this user
      const { data: assignments } = await supabase
        .from("route_assignments")
        .select("route_id")
        .eq("user_id", user!.id);
      
      if (!assignments?.length) return [];

      const routeIds = assignments.map(a => a.route_id);
      const { data } = await supabase
        .from("routes")
        .select("id, name, description, is_active, stores(id)")
        .in("id", routeIds)
        .eq("is_active", true)
        .order("name");
      
      return (data as RouteRow[]) || [];
    },
    enabled: !!user,
  });

  // Active session
  const { data: activeSession } = useQuery({
    queryKey: ["mobile-v2-active-session", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_sessions")
        .select("id, status, started_at, route_id, routes(name)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as SessionRow | null;
    },
    enabled: !!user,
  });

  // Start session mutation
  const startSession = useMutation({
    mutationFn: async (routeId: string) => {
      const { data, error } = await supabase
        .from("route_sessions")
        .insert({
          user_id: user!.id,
          route_id: routeId,
          status: "active",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Route session started!");
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-active-session"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-agent-routes"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start session");
    },
  });

  // End session mutation
  const endSession = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      const { error } = await supabase
        .from("route_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", activeSession.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Route session completed!");
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-active-session"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to end session");
    },
  });

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <LoadingCenter />
      </div>
    );
  }

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Active Session Card */}
        {activeSession && (
          <Card elevated className="mb-4" padding="md">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl mv2-bg-primary flex items-center justify-center">
                <Map className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{activeSession.routes?.name || "Active Route"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="h-3 w-3 mv2-text-muted" />
                  <span className="text-xs mv2-text-muted">
                    {formatDuration(activeSession.started_at)}
                  </span>
                </div>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
            <button
              className="mv2-btn mv2-btn-destructive mv2-btn-full mv2-btn-sm"
              onClick={() => endSession.mutate()}
              disabled={endSession.isPending}
            >
              <Square className="h-4 w-4" />
              End Session
            </button>
          </Card>
        )}

        {/* Routes List */}
        <Section title="My Routes">
          {!routes?.length ? (
            <Card padding="lg">
              <EmptyState
                icon={Map}
                title="No Routes Assigned"
                description="You don't have any routes assigned to you yet. Contact your manager."
              />
            </Card>
          ) : (
            <div className="mv2-list">
              {routes.map((route) => {
                const isActive = activeSession?.route_id === route.id;
                const storeCount = route.stores?.length ?? 0;

                return (
                  <ListItem
                    key={route.id}
                    title={route.name}
                    subtitle={route.description || `${storeCount} stores`}
                    meta={!route.description ? undefined : `${storeCount} stores`}
                    icon={Map}
                    iconBgClass={isActive ? "!bg-green-100 !text-green-600 dark:!bg-green-900/30 dark:!text-green-400" : undefined}
                    badge={
                      isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : activeSession ? (
                        <Badge variant="secondary">—</Badge>
                      ) : (
                        <button
                          className="mv2-btn mv2-btn-primary mv2-btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            startSession.mutate(route.id);
                          }}
                          disabled={startSession.isPending}
                        >
                          <Play className="h-3 w-3" />
                          Start
                        </button>
                      )
                    }
                    showArrow={false}
                    onClick={() => onSelectRoute?.(route.id)}
                  />
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
