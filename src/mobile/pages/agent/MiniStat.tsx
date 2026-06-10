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
    <div className="rounded-xl bg-card shadow-sm border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground mt-1.5">{value}</p>
      {subValue && <p className="text-xs text-muted-foreground/70 mt-1">{subValue}</p>}
    </div>
  );
}
