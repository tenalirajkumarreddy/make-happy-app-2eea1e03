import {
  Fuel,
  Droplets,
  Gauge,
  Timer,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TelemetryData } from "@/hooks/useVehicleTracking";

/* ─── animated card entry with pure CSS ─── */
interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string | null;
  alert?: boolean;
  badge?: React.ReactNode;
  hasData: boolean;
  index: number;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  alert,
  badge,
  hasData,
  index,
}: MetricCardProps) {
  const borderClass = alert
    ? "border-l-4 border-l-destructive"
    : hasData
      ? "border-l-4 border-l-primary"
      : "border-l-4 border-l-muted";

  return (
    <div
      className={`bg-card rounded-xl border border-border/40 p-5 shadow-sm transition-all duration-500 hover:shadow-md hover:-translate-y-0.5 ${borderClass} animate-fade-in-up`}
      style={{
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            alert
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        </div>
        <span className="font-medium">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        {badge || (
          <span className={`text-lg font-semibold tracking-tight ${alert ? "text-destructive" : "text-foreground"}`}>
            {value}
          </span>
        )}
      </div>

      {sub && (
        <div className="text-xs text-muted-foreground mt-1.5 font-mono">
          {sub}
        </div>
      )}
    </div>
  );
}

interface Props {
  telemetry: TelemetryData | null;
  isLoading: boolean;
  selectedVehicle?: { plate_number: string };
}

export default function MetricCards({ telemetry, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border/40 p-4 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4 animate-pulse">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[140px] bg-background rounded-lg border border-border/40 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex-shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="h-2.5 w-8 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-card/50 rounded-xl border border-dashed border-border/50">
        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
          <Activity className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">
          No vehicle selected
        </h3>
        <p className="text-xs text-muted-foreground/70 max-w-xs">
          Select a vehicle from the sidebar to view live telemetry data
        </p>
      </div>
    );
  }

  const statusVariant =
    telemetry.status === "MOVING"
      ? "default"
      : telemetry.status === "PARKED"
        ? "secondary"
        : telemetry.status === "IDLING"
          ? "warning"
          : "outline";

  const statusLabel =
    telemetry.status === "MOVING"
      ? "Moving"
      : telemetry.status === "PARKED"
        ? "Parked"
        : telemetry.status === "IDLING"
          ? "Idling"
          : telemetry.status || "--";

  const fuelLow = telemetry.fuel_percentage !== null && telemetry.fuel_percentage <= 15;
  const adblueLow = telemetry.adblue_percentage !== null && telemetry.adblue_percentage <= 15;
  const healthAlert = telemetry.dtc_count > 0 || telemetry.has_warning_lamps;

  const cards: Omit<MetricCardProps, "index">[] = [
    {
      icon: Fuel,
      label: "Fuel",
      value: telemetry.fuel_amount !== null ? `${telemetry.fuel_amount} L` : "--",
      sub: telemetry.fuel_percentage !== null ? `${telemetry.fuel_percentage}%` : null,
      alert: fuelLow,
      hasData: telemetry.fuel_amount !== null,
    },
    {
      icon: Droplets,
      label: "AdBlue",
      value: telemetry.adblue_level !== null ? `${telemetry.adblue_level} L` : "--",
      sub: telemetry.adblue_percentage !== null ? `${telemetry.adblue_percentage}%` : null,
      alert: adblueLow,
      hasData: telemetry.adblue_level !== null,
    },
    {
      icon: Gauge,
      label: "Odometer",
      value: telemetry.odometer_km !== null ? `${telemetry.odometer_km.toLocaleString()} km` : "--",
      sub: null,
      alert: false,
      hasData: telemetry.odometer_km !== null,
    },
    {
      icon: Timer,
      label: "Engine",
      value: telemetry.engine_hours !== null ? `${telemetry.engine_hours} hrs` : "--",
      sub: null,
      alert: false,
      hasData: telemetry.engine_hours !== null,
    },
    {
      icon: Activity,
      label: "Status",
      value: statusLabel,
      sub: telemetry.speed !== null ? `${telemetry.speed} km/h` : null,
      badge: (
        <Badge variant={statusVariant as never} className="text-[10px] font-medium px-1.5 py-0 h-5">
          {statusLabel}
        </Badge>
      ),
      alert: false,
      hasData: true,
    },
    {
      icon: AlertTriangle,
      label: "Health",
      value: telemetry.dtc_count > 0 ? `${telemetry.dtc_count} DTCs` : "Good",
      sub: telemetry.has_warning_lamps ? "Warning lamps on" : telemetry.dtc_count === 0 ? "No issues" : null,
      alert: healthAlert,
      hasData: true,
    },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/40 p-4 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4 animate-fade-in-up">
      {cards.map((card, index) => {
        const borderClass = card.alert
          ? "border-l-4 border-l-destructive"
          : card.hasData
            ? "border-l-4 border-l-primary"
            : "border-l-4 border-l-muted";

        return (
          <div
            key={card.label}
            className={`flex-1 min-w-[140px] bg-background rounded-lg border border-border/40 px-4 py-3 shadow-sm flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${borderClass}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                card.alert
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
            >
              <card.icon className="w-4 h-4" strokeWidth={1.5} />
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-muted-foreground font-medium leading-none mb-0.5">{card.label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                {card.badge ? (
                  card.badge
                ) : (
                  <span className={`text-sm font-semibold tracking-tight truncate ${card.alert ? "text-destructive" : "text-foreground"}`}>
                    {card.value}
                  </span>
                )}
              </div>
              {card.sub && (
                <span className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                  {card.sub}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
