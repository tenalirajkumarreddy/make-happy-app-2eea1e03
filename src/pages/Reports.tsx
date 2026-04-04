import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  Calendar, ShoppingCart, ClipboardList, Users, Package,
  Banknote, TrendingDown, Sparkles, BookOpen, RotateCcw, 
  Truck, Archive, DollarSign, Receipt, FileText, PieChart,
  History, ArrowLeftRight, Wallet, CreditCard, Tag, AlertTriangle
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DailyReport from "@/components/reports/DailyReport";
import DayBookReport from "@/components/reports/DayBookReport";
import SalesReport from "@/components/reports/SalesReport";
import OrderReport from "@/components/reports/OrderReport";
import AgentPerformanceReport from "@/components/reports/AgentPerformanceReport";
import ProductReport from "@/components/reports/ProductReport";
import PaymentOutstandingReport from "@/components/reports/PaymentOutstandingReport";
import SmartInsightsReport from "@/components/reports/SmartInsightsReport";
import StockSummaryReport from "@/components/reports/StockSummaryReport";
import ProfitLossReport from "@/components/reports/ProfitLossReport";
import VendorReport from "@/components/reports/VendorReport";
import ItemWisePLReport from "@/components/reports/ItemWisePLReport";
import PaymentFlowReport from "@/components/reports/PaymentFlowReport";
import CustomerReport from "@/components/reports/CustomerReport";
import CustomerRiskReport from "@/components/reports/CustomerRiskReport";
import PriceChangeReport from "@/components/reports/PriceChangeReport";
import InventoryTimelineReport from "@/components/reports/InventoryTimelineReport";
import SalesReturnReport from "@/components/reports/SalesReturnReport";
import PurchaseReturnReport from "@/components/reports/PurchaseReturnReport";
import PurchaseReport from "@/components/reports/PurchaseReport";

// Organized report sections by category
const REPORT_CATEGORIES = {
  overview: {
    label: "Overview",
    reports: [
      { key: "smart", label: "Smart Insights", icon: Sparkles, component: SmartInsightsReport },
      { key: "daily", label: "Daily Reports", icon: Calendar, component: DailyReport },
      { key: "daybook", label: "Day Book", icon: BookOpen, component: DayBookReport },
    ],
  },
  sales: {
    label: "Sales & Revenue",
    reports: [
      { key: "sales", label: "Sales Reports", icon: ShoppingCart, component: SalesReport },
      { key: "orders", label: "Order Reports", icon: ClipboardList, component: OrderReport },
      { key: "sales-returns", label: "Sales Returns", icon: RotateCcw, component: SalesReturnReport },
      { key: "payment", label: "Collections", icon: Banknote, component: PaymentOutstandingReport },
      { key: "outstanding", label: "Outstanding", icon: TrendingDown, component: PaymentOutstandingReport },
      { key: "risk-engine", label: "Risk Engine", icon: AlertTriangle, component: CustomerRiskReport },
      { key: "customers", label: "Customer Analysis", icon: Users, component: CustomerReport },
    ],
  },
  purchases: {
    label: "Purchases",
    reports: [
      { key: "purchase", label: "Purchase Reports", icon: Truck, component: PurchaseReport },
      { key: "purchase-returns", label: "Purchase Returns", icon: RotateCcw, component: PurchaseReturnReport },
      { key: "vendors", label: "Vendor Analysis", icon: Truck, component: VendorReport },
    ],
  },
  inventory: {
    label: "Inventory",
    reports: [
      { key: "product", label: "Product Reports", icon: Package, component: ProductReport },
      { key: "stock", label: "Stock Summary", icon: Archive, component: StockSummaryReport },
      { key: "inventory-timeline", label: "Stock Timeline", icon: History, component: InventoryTimelineReport },
      { key: "price-changes", label: "Price Changes", icon: Tag, component: PriceChangeReport },
    ],
  },
  financial: {
    label: "Financial",
    reports: [
      { key: "pnl", label: "Profit & Loss", icon: PieChart, component: ProfitLossReport },
      { key: "item-pnl", label: "Item-wise P&L", icon: DollarSign, component: ItemWisePLReport },
      { key: "cashflow", label: "Cash Flow", icon: Wallet, component: PaymentFlowReport },
    ],
  },
  operations: {
    label: "Operations",
    reports: [
      { key: "agent", label: "Agent Performance", icon: Users, component: AgentPerformanceReport },
    ],
  },
};

// Flatten for easy lookup
const ALL_REPORTS = Object.values(REPORT_CATEGORIES).flatMap((cat) => cat.reports);
const VALID_KEYS = ALL_REPORTS.map((r) => r.key);

const Reports = () => {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();

  const isValid = type && VALID_KEYS.includes(type);
  const active = isValid ? type : "smart";
  const activeReport = ALL_REPORTS.find((r) => r.key === active);
  const ActiveIcon = activeReport?.icon || Sparkles;
  const ActiveComponent = activeReport?.component || SmartInsightsReport;

  useEffect(() => {
    if (!type || !VALID_KEYS.includes(type)) {
      navigate("/reports/smart", { replace: true });
    }
  }, [type, navigate]);

  const handleChange = (v: string) => {
    navigate(`/reports/${v}`, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Reports" subtitle="Generate and analyze business reports" />
        
        {/* Report Selector */}
        <Select value={active} onValueChange={handleChange}>
          <SelectTrigger className="w-full sm:w-[280px]" data-testid="select-report-type">
            <div className="flex items-center gap-2">
              <ActiveIcon className="h-4 w-4" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(REPORT_CATEGORIES).map(([catKey, category]) => (
              <div key={catKey}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {category.label}
                </div>
                {category.reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <SelectItem key={report.key} value={report.key} data-testid={`select-report-${report.key}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {report.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Navigation Tabs (Desktop) */}
      <div className="hidden lg:block overflow-x-auto pb-1">
        <div className="flex gap-1 border-b">
          {Object.entries(REPORT_CATEGORIES).map(([catKey, category]) => (
            <div key={catKey} className="flex">
              {category.reports.map((report) => {
                const Icon = report.icon;
                const isActive = active === report.key;
                return (
                  <button
                    key={report.key}
                    onClick={() => handleChange(report.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${isActive 
                        ? "border-primary text-primary" 
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    {report.label}
                  </button>
                );
              })}
              {catKey !== "operations" && <div className="w-px bg-border mx-2" />}
            </div>
          ))}
        </div>
      </div>

      {/* Report Content */}
      <div className="min-w-0">
        <ErrorBoundary>
          <ActiveComponent />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default Reports;
