import { useState, useEffect } from "react";
import { useVehicleSessions, useVehicleSessionStops } from "@/hooks/useVehicleSessions";
import { useVehiclesWithIntegrations } from "@/hooks/useVehicleTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function VehicleSessions() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterVehicle, setFilterVehicle] = useState<string>("all");

  useEffect(() => {
    document.title = "Vehicle Sessions";
  }, []);

  const { data: vehicles } = useVehiclesWithIntegrations();
  const { data: sessions, isLoading } = useVehicleSessions(
    filterVehicle !== "all" ? filterVehicle : undefined
  );
  const { data: stops } = useVehicleSessionStops(expandedId);

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Vehicle Sessions</h1>
        <Select value={filterVehicle} onValueChange={setFilterVehicle}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Vehicles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vehicles</SelectItem>
            {(vehicles ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Fuel Used</TableHead>
                  <TableHead className="text-right">Fuel Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <>
                    <TableRow key={s.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            setExpandedId(expandedId === s.id ? null : s.id)
                          }
                        >
                          {expandedId === s.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.vehicle_plate || s.vehicle_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(s.start_time).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.end_time
                          ? new Date(s.end_time).toLocaleString()
                          : "--"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.total_distance_km
                          ? `${s.total_distance_km.toFixed(1)} km`
                          : "--"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.fuel_used_liters
                          ? `${s.fuel_used_liters.toFixed(1)} L`
                          : "--"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.fuel_cost ? `₹${s.fuel_cost.toFixed(2)}` : "--"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "active" ? "secondary" : "default"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expandedId === s.id && (
                      <TableRow key={`${s.id}-stops`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-3">
                          {stops && stops.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">
                                Stops
                              </p>
                              {stops.map((stop: any) => (
                                <div
                                  key={stop.id}
                                  className="flex items-center justify-between text-xs bg-background rounded px-2.5 py-1.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {stop.store_name || "Unknown Location"}
                                    </span>
                                    {stop.store_id && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        Store
                                      </Badge>
                                    )}
                                    {!stop.store_id && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {stop.stop_type}
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-muted-foreground">
                                    {new Date(
                                      stop.arrival_time
                                    ).toLocaleTimeString()}{" "}
                                    {stop.departure_time
                                      ? `- ${new Date(
                                          stop.departure_time
                                        ).toLocaleTimeString()}`
                                      : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No stop data available
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No vehicle sessions found. Sessions are automatically created when
              a vehicle leaves the warehouse.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
