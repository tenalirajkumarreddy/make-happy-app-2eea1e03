import { PageHeader } from "@/components/shared/PageHeader";
import { useState } from "react";
import {
  Calendar, ShoppingCart, ClipboardList, Users, Package,
  Banknote, TrendingDown,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DailyReport from "@/components/reports/DailyReport";
import SalesReport from "@/components/reports/SalesReport";
import OrderReport from "@/components/reports/OrderReport";
import AgentPerformanceReport from "@/components/reports/AgentPerformanceReport";
import ProductReport from "@/components/reports/ProductReport";
import PaymentOutstandingReport from "@/components/reports/PaymentOutstandingReport";

const REPORT_SECTIONS = [
  { key: "daily", label: "Daily Reports", icon: Calendar },
  { key: "sales", label: "Sales Reports", icon: ShoppingCart },
  { key: "orders", label: "Order Reports", icon: ClipboardList },
  { key: "agent", label: "Agent Performance", icon: Users },
  { key: "product", label: "Product Reports", icon: Package },
  { key: "payment", label: "Payment & Outstanding", icon: Banknote },
] as const;

type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

const Reports = () => {
  const [active, setActive] = useState<SectionKey>("daily");
  const ActiveIcon = REPORT_SECTIONS.find(s => s.key === active)?.icon || Calendar;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Reports" subtitle="Generate and view business reports" />
        <Select value={active} onValueChange={(v) => setActive(v as SectionKey)}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <div className="flex items-center gap-2">
              <ActiveIcon className="h-4 w-4" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {REPORT_SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <SelectItem key={s.key} value={s.key}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        {active === "daily" && <DailyReport />}
        {active === "sales" && <SalesReport />}
        {active === "orders" && <OrderReport />}
        {active === "agent" && <AgentPerformanceReport />}
        {active === "product" && <ProductReport />}
        {active === "payment" && <PaymentOutstandingReport />}
      </div>
    </div>
  );
};

export default Reports;
