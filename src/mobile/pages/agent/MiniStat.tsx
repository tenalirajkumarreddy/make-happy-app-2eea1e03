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
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">{label}</p>
        <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3 w-3 text-white" />
        </div>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {subValue && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{subValue}</p>}
    </div>
  );
}
