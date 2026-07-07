import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VehicleWithIntegration, FleetSummary } from "@/hooks/useVehicleTracking";
import {
  Search,
  Truck,
  Settings,
  ClipboardList,
  RefreshCw,
  Plus,
  Car,
} from "lucide-react";

interface Props {
  vehicles: VehicleWithIntegration[];
  fleetSummary: FleetSummary | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: () => void;
}

export default function VehicleSidebar({
  vehicles,
  fleetSummary,
  selectedId,
  onSelect,
  onAddClick,
}: Props) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

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
    },
  });

  const filtered = vehicles.filter((v) =>
    v.plate_number.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success/10 text-success border-success/30";
      case "maintenance":
        return "bg-warning/10 text-warning border-warning/30";
      case "retired":
        return "bg-destructive/10 text-destructive border-destructive/30";
      default:
        return "bg-muted text-muted-foreground border-border/50";
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "maintenance":
        return "warning";
      case "retired":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="flex flex-col h-full bg-card w-80 flex-shrink-0 border-r border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <h2 className="font-semibold text-sm tracking-tight">Fleet</h2>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {vehicles.length} unit{vehicles.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search vehicles..."
            className="pl-9 h-9 text-sm bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1 text-xs h-9 shadow-sm"
            onClick={onAddClick}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            Add Vehicle
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-9 px-2.5"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      </div>

      {/* Fleet Status */}
      {fleetSummary && (
        <div className="px-[16px] py-[14px] border-b border-border/50 bg-muted/20">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-[10px]">
            Fleet Overview
          </div>
          <div className="grid grid-cols-2 gap-[8px] text-xs">
            <div className="flex items-center gap-[8px] bg-success/5 rounded-lg px-[10px] py-[6px]">
              <div className="w-[6px] h-[6px] rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">Moving</span>
              <span className="font-semibold font-mono ml-auto">
                {fleetSummary.moving}
              </span>
            </div>
            <div className="flex items-center gap-[8px] bg-warning/5 rounded-lg px-[10px] py-[6px]">
              <div className="w-[6px] h-[6px] rounded-full bg-warning" />
              <span className="text-muted-foreground">Parked</span>
              <span className="font-semibold font-mono ml-auto">
                {fleetSummary.parked}
              </span>
            </div>
            <div className="flex items-center gap-[8px] bg-info/5 rounded-lg px-[10px] py-[6px]">
              <div className="w-[6px] h-[6px] rounded-full bg-info animate-pulse" />
              <span className="text-muted-foreground">Idling</span>
              <span className="font-semibold font-mono ml-auto">
                {fleetSummary.idling}
              </span>
            </div>
            <div className="flex items-center gap-[8px] bg-muted rounded-lg px-[10px] py-[6px]">
              <div className="w-[6px] h-[6px] rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">Off</span>
              <span className="font-semibold font-mono ml-auto">
                {fleetSummary.out_of_network}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-[10px] pt-[10px] border-t border-border/30 text-[11px] text-muted-foreground">
            <span>Connected: <span className="font-mono font-medium">{fleetSummary.connected}</span></span>
            <span>Disconnected: <span className="font-mono font-medium">{fleetSummary.disconnected}</span></span>
          </div>
        </div>
      )}

      {/* Vehicle list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-[2px]">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Car
                className="h-8 w-8 text-muted-foreground/30 mb-2"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {search ? "No vehicles match" : "No vehicles found"}
              </p>
            </div>
          )}
          {filtered.map((v) => {
            const isSelected = selectedId === v.id;
            return (
              <button
                key={v.id}
                on_packages={[]}
                onClick={() => onSelect(v.id)}
                className={`w-full text-left rounded-lg p-3 transition-all duration-200 border ${
                  isSelected
                    ? "bg-primary/5 border-primary/30 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-muted/60 hover:border-border/50"
                }`}
              >
                <div className="flex items-center gap-[10px]">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Truck className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6px]">
                      <span className="text-sm font-medium truncate">
                        {v.plate_number}
                      </span>
                      {!v.is_tracked && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1 shrink-0 font-normal"
                        >
                          Manual
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-[6px] mt-1">
                      <Badge
                        variant={getStatusVariant(v.status) as never}
                        className="text-[10px] h-4 px-1.5 font-normal"
                      >
                        {v.status}
                      </Badge>
                      {v.is_tracked && (
                        <span className="text-[11px] text-muted-foreground">
                          {v.intangles_v_id ? "Tracked" : "No API link"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer links */}
      <div className="p-2 border-t border-border/50 space-y-[2px]">
        <Link to="/admin/vehicles/sessions" className="block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs h-9 hover:bg-muted/60"
          >
            <ClipboardList className="h-3.5 w-3.5 mr-2" strokeWidth={1.5} />
            Vehicle Sessions
          </Button>
        </Link>
        <Link to="/admin/vehicles/settings" className="block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs h-9 hover:bg-muted/60"
          >
            <Settings className="h-3.5 w-3.5 mr-2" strokeWidth={1.5} />
            Alert Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}
