import { PageHeader } from "@/components/shared/PageHeader";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Calendar, ShoppingCart, ClipboardList, Users, Package,
  Banknote, TrendingDown,
} from "lucide-react";
import DailyReport from "@/components/reports/DailyReport";

const REPORT_SECTIONS = [
  { key: "daily", label: "Daily Reports", icon: Calendar },
  { key: "sales", label: "Sales Reports", icon: ShoppingCart },
  { key: "orders", label: "Order Reports", icon: ClipboardList },
  { key: "agent", label: "Agent Performance", icon: Users },
  { key: "product", label: "Product Reports", icon: Package },
  { key: "payment", label: "Payment Reports", icon: Banknote },
  { key: "outstanding", label: "Outstanding Reports", icon: TrendingDown },
] as const;

type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

const Reports = () => {
  const [active, setActive] = useState<SectionKey>("daily");

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reports" subtitle="Generate and view business reports" />

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="hidden md:flex flex-col gap-1 min-w-[200px] shrink-0">
          {REPORT_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                  active === s.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile dropdown */}
        <div className="md:hidden w-full">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as SectionKey)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {REPORT_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {active === "daily" && <DailyReport />}
          {active === "sales" && <ComingSoon label="Sales Reports" />}
          {active === "orders" && <ComingSoon label="Order Reports" />}
          {active === "agent" && <ComingSoon label="Agent Performance" />}
          {active === "product" && <ComingSoon label="Product Reports" />}
          {active === "payment" && <ComingSoon label="Payment Reports" />}
          {active === "outstanding" && <ComingSoon label="Outstanding Reports" />}
        </div>
      </div>
    </div>
  );
};

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-xl border bg-card p-12 text-center">
      <p className="text-muted-foreground text-lg font-medium">{label}</p>
      <p className="text-muted-foreground text-sm mt-1">Coming soon</p>
    </div>
  );
}

export default Reports;
