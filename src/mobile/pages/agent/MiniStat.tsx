import { cn } from "@/lib/utils";

type MiniStatProps = {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: string;
};

export function MiniStat({ icon: Icon, label, value, subValue, color }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-card shadow-sm border p-3.5 relative overflow-hidden">
      {/* Subtle gradient accent at top */}
      <div className={cn("absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r", color)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider leading-tight">{label}</p>
        <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm", color)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <p className="text-lg font-bold text-foreground mt-1.5 tabular-nums">{value}</p>
      {subValue && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subValue}</p>}
    </div>
  );
}
