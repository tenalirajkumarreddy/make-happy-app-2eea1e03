import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Users, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

interface InventorySummary {
  totalProducts: number;
  totalStockValue: number;
  lowStockProducts: number;
  negativeStockItems: number;
  totalStaffHolding: number;
  staffHoldingValue: number;
  warehouseStockValue: number;
}

interface InventorySummaryCardsProps {
  summary?: InventorySummary;
  isLoading?: boolean;
  warehouseName?: string;
}

export function InventorySummaryCards({ summary, isLoading, warehouseName }: InventorySummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Products",
      value: summary?.totalProducts ?? 0,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      subtitle: warehouseName ? `in ${warehouseName}` : "",
    },
  {
    title: "Stock Value",
    value: formatCurrency(summary?.totalStockValue ?? 0),
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    subtitle: "Total inventory value",
  },
    {
      title: "Low Stock Items",
      value: summary?.lowStockProducts ?? 0,
      icon: AlertTriangle,
      color: summary?.lowStockProducts ? "text-amber-600" : "text-slate-400",
      bgColor: summary?.lowStockProducts ? "bg-amber-50" : "bg-slate-50",
      subtitle: "Need attention",
      alert: summary?.lowStockProducts > 0,
    },
    {
      title: "Staff Holding",
      value: summary?.totalStaffHolding ?? 0,
      icon: Users,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    subtitle: summary?.staffHoldingValue
      ? `${formatCurrency(summary.staffHoldingValue)} value`
      : "Products with staff",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-2xl font-bold ${card.alert ? "text-amber-600" : ""}`}>
                    {card.value}
                  </p>
                </div>
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                )}
              </div>
              <div className={`h-12 w-12 rounded-full ${card.bgColor} flex items-center justify-center`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface WarehouseSummaryCardsProps {
  warehouseCount: number;
  totalStockValue: number;
  productCount: number;
  rawMaterialCount: number;
  isLoading?: boolean;
}

export function WarehouseSummaryCards({
  warehouseCount,
  totalStockValue,
  productCount,
  rawMaterialCount,
  isLoading,
}: WarehouseSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Warehouses</p>
              <p className="text-2xl font-bold">{warehouseCount}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
              <Warehouse className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">₹{totalStockValue.toLocaleString()}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Products</p>
              <p className="text-2xl font-bold">{productCount}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
              <Package className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Raw Materials</p>
              <p className="text-2xl font-bold">{rawMaterialCount}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
              <TrendingDown className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
