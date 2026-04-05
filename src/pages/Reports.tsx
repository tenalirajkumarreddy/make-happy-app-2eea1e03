import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Calendar, ShoppingCart, ClipboardList, Users, Package,
  Banknote, TrendingDown, Sparkles, BookOpen, RotateCcw, 
  Truck, Archive, DollarSign, PieChart,
  History, Wallet, Tag, AlertTriangle
} from "lucide-react";
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

const REPORT_CATEGORIES = {
  overview: {
    label: "Overview",
    description: "Daily summaries and insights",
    color: "bg-violet-500/10 text-violet-600 border-violet-200",
    reports: [
      { key: "smart", label: "Smart Insights", icon: Sparkles, component: SmartInsightsReport, description: "AI-powered business insights" },
      { key: "daily", label: "Daily Reports", icon: Calendar, component: DailyReport, description: "Complete daily summary" },
      { key: "daybook", label: "Day Book", icon: BookOpen, component: DayBookReport, description: "Traditional ledger view" },
    ],
  },
  sales: {
    label: "Sales & Revenue",
    description: "Track sales performance and collections",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    reports: [
      { key: "sales", label: "Sales Reports", icon: ShoppingCart, component: SalesReport, description: "Sales performance analysis" },
      { key: "orders", label: "Order Reports", icon: ClipboardList, component: OrderReport, description: "Order tracking and status" },
      { key: "sales-returns", label: "Sales Returns", icon: RotateCcw, component: SalesReturnReport, description: "Return analysis" },
      { key: "payment", label: "Collections", icon: Banknote, component: PaymentOutstandingReport, description: "Payment collections" },
      { key: "outstanding", label: "Outstanding", icon: TrendingDown, component: PaymentOutstandingReport, description: "Pending receivables" },
      { key: "risk-engine", label: "Risk Engine", icon: AlertTriangle, component: CustomerRiskReport, description: "Customer risk scoring" },
      { key: "customers", label: "Customer Analysis", icon: Users, component: CustomerReport, description: "Customer insights" },
    ],
  },
  purchases: {
    label: "Purchases",
    description: "Vendor and purchase tracking",
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
    reports: [
      { key: "purchase", label: "Purchase Reports", icon: Truck, component: PurchaseReport, description: "Purchase analysis" },
      { key: "purchase-returns", label: "Purchase Returns", icon: RotateCcw, component: PurchaseReturnReport, description: "Return to vendors" },
      { key: "vendors", label: "Vendor Analysis", icon: Truck, component: VendorReport, description: "Vendor performance" },
    ],
  },
  inventory: {
    label: "Inventory",
    description: "Stock levels and movements",
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    reports: [
      { key: "product", label: "Product Reports", icon: Package, component: ProductReport, description: "Product performance" },
      { key: "stock", label: "Stock Summary", icon: Archive, component: StockSummaryReport, description: "Current stock levels" },
      { key: "inventory-timeline", label: "Stock Timeline", icon: History, component: InventoryTimelineReport, description: "Stock movement history" },
      { key: "price-changes", label: "Price Changes", icon: Tag, component: PriceChangeReport, description: "Price revision history" },
    ],
  },
  financial: {
    label: "Financial",
    description: "Profit, loss and cash flow",
    color: "bg-rose-500/10 text-rose-600 border-rose-200",
    reports: [
      { key: "pnl", label: "Profit & Loss", icon: PieChart, component: ProfitLossReport, description: "Company P&L statement" },
      { key: "item-pnl", label: "Item-wise P&L", icon: DollarSign, component: ItemWisePLReport, description: "Product-level profitability" },
      { key: "cashflow", label: "Cash Flow", icon: Wallet, component: PaymentFlowReport, description: "Cash flow analysis" },
    ],
  },
  operations: {
    label: "Operations",
    description: "Team and route performance",
    color: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
    reports: [
      { key: "agent", label: "Agent Performance", icon: Users, component: AgentPerformanceReport, description: "Agent productivity metrics" },
    ],
  },
};

const ALL_REPORTS = Object.values(REPORT_CATEGORIES).flatMap((cat) => cat.reports);
const VALID_KEYS = ALL_REPORTS.map((r) => r.key);

const Reports = () => {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();

  const isValid = type && VALID_KEYS.includes(type);
  const activeReport = isValid ? ALL_REPORTS.find((r) => r.key === type) : null;
  const ActiveComponent = activeReport?.component;

  useEffect(() => {
    // Only redirect if URL has an invalid report type (not just missing)
    if (type && !VALID_KEYS.includes(type)) {
      navigate("/reports", { replace: true });
    }
  }, [type, navigate]);

  const handleReportSelect = (key: string) => {
    navigate(`/reports/${key}`);
  };

  // If a specific report is selected, show that report
  if (activeReport && ActiveComponent) {
    return (
      <div className="animate-fade-in flex flex-col h-full gap-4 pb-12">
        <div className="shrink-0 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/reports")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            All Reports
          </Button>
        </div>
        <div className="flex-1 bg-card rounded-xl border border-border/60 overflow-y-auto shadow-sm p-4 md:p-6 custom-scrollbar">
          <ErrorBoundary>
            <ActiveComponent />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  // Report selection page - clean category-based UI
  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-12">
      <PageHeader 
        title="Reports" 
        subtitle="Select a report to generate and analyze business data" 
      />

      <div className="grid gap-8">
        {Object.entries(REPORT_CATEGORIES).map(([catKey, category]) => (
          <section key={catKey} className="space-y-3">
            {/* Category Header */}
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                {category.label}
              </h2>
              <span className="text-xs text-muted-foreground">
                {category.description}
              </span>
            </div>

            {/* Report Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {category.reports.map((report) => {
                const Icon = report.icon;
                return (
                  <Card
                    key={report.key}
                    className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 group border-border/60`}
                    onClick={() => handleReportSelect(report.key)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${category.color} group-hover:scale-105 transition-transform`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                          {report.label}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {report.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Reports;
