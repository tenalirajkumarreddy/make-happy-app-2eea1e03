import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useVehiclesWithIntegrations,
  useLatestTelemetry,
  useFleetSummary,
} from "@/hooks/useVehicleTracking";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import VehicleMap from "@/components/vehicles/VehicleMap";
import MetricCards from "@/components/vehicles/MetricCards";
import AddVehicleDialog from "@/components/vehicles/AddVehicleDialog";

// ── UI ──
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

// ── Icons ──
import {
  Truck,
  RefreshCw,
  Plus,
  AlertTriangle,
  Search,
  MapPin,
  Navigation,
  Fuel,
  Battery,
  Gauge,
  Activity,
  SlidersHorizontal,
  Route,
  Settings,
  FilterX,
  PowerOff,
  Zap,
  X,
} from "lucide-react";

// ── local types ──
interface FleetStatus {
  label: string;
  count: number;
  color: string;
  bg: string;
  icon: React.ElementType;
}

/* ================================================================
   AdminVehicles – Fleet Command Redesign
   ================================================================ */

export default function AdminVehicles() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── selection & UI state ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // ── data ──
  const { data: vehicles, isLoading: vehiclesLoading } = useVehiclesWithIntegrations();
  const { data: fleetSummary } = useFleetSummary();
  const { data: telemetry, isLoading: telemetryLoading } = useLatestTelemetry(selectedId);

  const selectedVehicle = vehicles?.find((v) => v.id === selectedId);

  // ── auto-select first vehicle ──
  useEffect(() => {
    if (vehicles && vehicles.length > 0 && !selectedId) {
      setSelectedId(vehicles[0].id);
    }
  }, [vehicles, selectedId]);

  // ── page title ──
  useEffect(() => {
    document.title = "Fleet Command";
  }, []);

  // ── token expired warning ──
  const { data: tokenExpired } = useQuery({
    queryKey: ["notifications", "intangles_token_expired"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, created_at")
        .eq("type", "intangles_token_expired")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    },
    refetchInterval: 30_000,
  });

  // ── telemetry refresh mutation ──
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("poll-vehicle-telemetry");
      if (res.error) throw new Error(res.error.message || "Refresh failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_telemetry"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_fleet_summary"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_alert_thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_sessions"] });
      toast.success("Fleet data refreshed");
    },
    onError: () => toast.error("Failed to refresh fleet data"),
  });

  // ─── Filtered vehicles ───
  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter((v) => {
      const matchesSearch = v.plate_number.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || v.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, search, statusFilter]);

  // ─── Fleet status pins ───
  const fleetStatuses: FleetStatus[] = useMemo(() => {
    if (!fleetSummary) return [];
    return [
      {
        label: "Moving",
        count: fleetSummary.moving,
        color: "text-success",
        bg: "bg-success/10",
        icon: Navigation,
      },
      {
        label: "Idle",
        count: fleetSummary.idling,
        color: "text-warning",
        bg: "bg-warning/10",
        icon: Zap,
      },
      {
        label: "Parked",
        count: fleetSummary.parked,
        color: "text-muted-foreground",
        bg: "bg-muted",
        icon: MapPin,
      },
      {
        label: "Off-Ntwk",
        count: fleetSummary.out_of_network,
        color: "text-destructive",
        bg: "bg-destructive/10",
        icon: PowerOff,
      },
    ];
  }, [fleetSummary]);

  // ─── Connection ring progress ───
  const totalVehicles = vehicles?.length ?? 0;
  const connectedPercent =
    totalVehicles > 0 && fleetSummary
      ? Math.round((fleetSummary.connected / totalVehicles) * 100)
      : 0;

  // ─── Vehicle status helpers ───
  const getVehicleStatusProps = (status: string) => {
    switch (status) {
      case "active":
        return {
          badge: "success" as const,
          iconColor: "text-success",
          barColor: "bg-success",
        };
      case "maintenance":
        return {
          badge: "warning" as const,
          iconColor: "text-warning",
          barColor: "bg-warning",
        };
      case "retired":
        return {
          badge: "destructive" as const,
          iconColor: "text-destructive",
          barColor: "bg-destructive",
        };
      default:
        return {
          badge: "outline" as const,
          iconColor: "text-muted-foreground",
          barColor: "bg-muted-foreground",
        };
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      {/* ── Top-level industrial grid background ── */}
      <div className="min-h-[calc(100vh-4rem)] bg-background relative">
        {/* faint grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
          {/* ═════════════════════════════════════════
               SIDEBAR – Fleet Navigation
              ═════════════════════════════════════════ */}
          <aside className="w-full lg:w-80 lg:shrink-0 flex flex-col border-r border-border/60 bg-card/80 backdrop-blur-sm">
            {/* Header */}
            <div className="p-4 border-b border-border/60">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                    <Truck className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm tracking-tight">Fleet Command</h2>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {totalVehicles} UNIT{totalVehicles !== 1 ? "S" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            refreshMutation.isPending ? "animate-spin" : ""
                          }`}
                          strokeWidth={1.5}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh Fleet Data</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Toggle Filters</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search plate number..."
                  className="pl-9 h-9 text-sm bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 font-mono"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Add Vehicle */}
              <Button
                size="sm"
                className="w-full text-xs h-9 gap-1.5 shadow-sm"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Add Vehicle
              </Button>

              {/* Expandable Filters */}
              {showFilters && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-slide-down">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Status:</span>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(search || statusFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs w-full gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                    >
                      <FilterX className="h-3 w-3" strokeWidth={1.5}/>
                      Clear Filters
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Fleet Overview */}
            {fleetSummary && (
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Fleet Status
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {fleetSummary.connected}/{totalVehicles} connected
                  </span>
                </div>
                {/* Connection progress */}
                <div className="mb-3">
                  <Progress value={connectedPercent} className="h-1.5" />
                </div>
                {/* Status pins */}
                <div className="grid grid-cols-2 gap-2">
                  {fleetStatuses.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 border border-border/40"
                    >
                      <div className={`w-6 h-6 rounded-md ${s.bg} flex items-center justify-center`}>
                        <s.icon className={`w-3 h-3 ${s.color}`} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-muted-foreground leading-none">{s.label}</div>
                        <div className="text-sm font-semibold font-mono leading-tight mt-0.5">{s.count}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle List */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {vehiclesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Truck className="h-8 w-8 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">
                    {search || statusFilter !== "all"
                      ? "No vehicles match your filters"
                      : "No vehicles in fleet"}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-[2px]">
                  {filteredVehicles.map((v) => {
                    const isSelected = selectedId === v.id;
                    const statusProps = getVehicleStatusProps(v.status);
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`w-full text-left rounded-lg p-3 transition-all duration-200 border group ${
                          isSelected
                            ? "bg-primary/5 border-primary/30 shadow-sm ring-1 ring-primary/10"
                            : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Vehicle indicator */}
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/10"
                            }`}
                          >
                            <Truck className="w-4 h-4" strokeWidth={1.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold font-mono truncate">
                                {v.plate_number}
                              </span>
                              {!v.is_tracked && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0 font-normal">
                                  Manual
                                </Badge>
                              )}
                              <Badge
                                variant={statusProps.badge}
                                className="text-[10px] h-4 px-1.5 font-medium capitalize ml-auto"
                              >
                                {v.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              {/* Connectivity dot */}
                              <span
                                className={`inline-block w-1.5 h-1.5 rounded-full ${
                                  v.is_tracked ? "bg-success" : "bg-muted-foreground/30"
                                }`}
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {v.is_tracked
                                  ? v.intangles_v_id
                                    ? "Tracked"
                                    : "No API link"
                                  : "Manual entry"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Bottom status bar */}
                        <div className="mt-2 flex items-center gap-2 pt-2 border-t border-border/30">
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${statusProps.barColor} ${
                                v.status === "active" ? "w-full" : v.status === "maintenance" ? "w-2/3" : "w-1/3"
                              }`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {v.status === "active" ? "Online" : v.status === "maintenance" ? "Service" : "Offline"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Nav */}
            <div className="p-3 border-t border-border/60 space-y-1 bg-card/50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-8 gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/vehicles/sessions")}
              >
                <Route className="h-3.5 w-3.5" strokeWidth={1.5} />
                Vehicle Sessions
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-8 gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/vehicles/settings")}
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
                Alert Settings
              </Button>
            </div>
          </aside>

          {/* ═════════════════════════════════════════
               MAIN – Command Console
              ═════════════════════════════════════════ */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Alert Banner */}
            {tokenExpired && (
              <div className="mx-6 mt-4 mb-0">
                <Alert variant="destructive" className="border-destructive/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Intangles API token has expired. Update it in Supabase Edge Function
                    environment variables to resume vehicle tracking.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Telemetry Metrics */}
            <div className="p-4 pb-2 shrink-0">
              <MetricCards
                telemetry={telemetry}
                isLoading={telemetryLoading && !!selectedId}
              />
            </div>

            {/* Map & Split Panel */}
            <div className="flex-1 min-h-0 p-4 pt-0">
              <Card className="h-full border border-border/60 shadow-sm overflow-hidden flex flex-col">
                {/* Map toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {selectedVehicle ? selectedVehicle.plate_number : "No vehicle selected"}
                    </span>
                    {telemetry?.speed !== null && telemetry?.speed !== undefined && (
                      <Badge variant="outline" className="text-[10px] h-5 font-mono">
                        <Gauge className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {telemetry.speed} km/h
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {telemetry?.connection_status ? (
                      <Badge variant="outline" className="text-[10px] h-5 border-success/30 text-success bg-success/5 gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        LIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5 border-destructive/30 text-destructive bg-destructive/5 gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        OFFLINE
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Map */}
                <div className="flex-1 min-h-0 relative">
                  <VehicleMap
                    telemetry={telemetry}
                    plateNumber={selectedVehicle?.plate_number ?? "Vehicle"}
                  />
                </div>
              </Card>
            </div>
          </main>
        </div>

        {/* Add Vehicle Dialog */}
        <AddVehicleDialog open={showAdd} onOpenChange={setShowAdd} />
      </div>
    </TooltipProvider>
  );
}
