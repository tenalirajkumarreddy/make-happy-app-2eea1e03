import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical,
  Package,
  AlertTriangle,
  Search,
  TrendingDown,
  TrendingUp,
  User,
  IndianRupee,
  History,
  ArrowRightLeft,
  Plus,
  Minus,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";

interface Vendor {
  id: string;
  name: string;
  current_balance: number;
  total_purchases: number;
  total_payments: number;
  last_purchase_at?: string;
}

interface RawMaterial {
  id: string;
  display_id: string;
  name: string;
  unit: string;
  category?: string;
  min_stock_level?: number;
  current_stock: number;
  unit_cost: number;
  image_url?: string;
  vendor_id?: string;
  vendor?: Vendor;
}

interface RawMaterialAdjustment {
  id: string;
  raw_material_id: string;
  adjustment_type: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason?: string;
  created_at: string;
  raw_material?: RawMaterial;
}

interface RawMaterialInventoryViewProps {
  materials?: RawMaterial[];
  adjustments?: RawMaterialAdjustment[];
  vendors?: Vendor[];
  isLoading?: boolean;
  canEdit?: boolean;
  onViewMaterial?: (material: RawMaterial) => void;
  onAdjustStock?: (material: RawMaterial, type: "used" | "remaining") => void;
  onViewHistory?: (material: RawMaterial) => void;
  onViewVendor?: (vendor: Vendor) => void;
}

export function RawMaterialInventoryView({
  materials,
  adjustments,
  vendors,
  isLoading,
  canEdit = false,
  onViewMaterial,
  onAdjustStock,
  onViewHistory,
  onViewVendor,
}: RawMaterialInventoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];

    let filtered = materials;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.display_id.toLowerCase().includes(term) ||
          m.category?.toLowerCase().includes(term) ||
          m.vendor?.name?.toLowerCase().includes(term)
      );
    }

    // Filter by stock status
    switch (activeTab) {
      case "low":
        filtered = filtered.filter((m) => {
          const minStock = m.min_stock_level || 0;
          return m.current_stock <= minStock && m.current_stock > 0;
        });
        break;
      case "out":
        filtered = filtered.filter((m) => m.current_stock <= 0);
        break;
      case "good":
        filtered = filtered.filter((m) => {
          const minStock = m.min_stock_level || 0;
          return m.current_stock > minStock;
        });
        break;
      default:
        break;
    }

    return filtered;
  }, [materials, searchTerm, activeTab]);

  const stats = useMemo(() => {
    if (!materials) {
      return {
        total: 0,
        low: 0,
        out: 0,
        value: 0,
        vendorCount: 0,
      };
    }

    const result = materials.reduce(
      (acc, m) => {
        acc.total++;
        acc.value += (m.current_stock || 0) * (m.unit_cost || 0);

        const minStock = m.min_stock_level || 0;
        if (m.current_stock <= 0) acc.out++;
        else if (m.current_stock <= minStock) acc.low++;

        return acc;
      },
      { total: 0, low: 0, out: 0, value: 0 }
    );

    result.vendorCount = vendors?.length || 0;

    return result;
  }, [materials, vendors]);

  const recentAdjustments = useMemo(() => {
    return (adjustments || []).slice(0, 10);
  }, [adjustments]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Raw Materials
                </p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                <FlaskConical className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Stock Value
                </p>
                <p className="text-2xl font-bold">
                  ₹{stats.value.toLocaleString()}
                </p>
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
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Low Stock
                </p>
                <p
                  className={`text-2xl font-bold ${
                    stats.low > 0 ? "text-amber-600" : ""
                  }`}
                >
                  {stats.low}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Vendors
                </p>
                <p className="text-2xl font-bold">{stats.vendorCount}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
                <User className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vendor Balances */}
      {vendors && vendors.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Vendor Balances
              <Badge variant="secondary">{vendors.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  onClick={() => onViewVendor?.(vendor)}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{vendor.name}</span>
                    <Badge
                      variant={vendor.current_balance > 0 ? "destructive" : "outline"}
                      className="text-xs"
                    >
                      {vendor.current_balance > 0 ? "Due" : "Paid"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance:</span>
                      <span
                        className={`font-semibold ${
                          vendor.current_balance > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        ₹{vendor.current_balance.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Total Purchases:</span>
                      <span>₹{vendor.total_purchases.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Total Payments:</span>
                      <span>₹{vendor.total_payments.toLocaleString()}</span>
                    </div>
                    {vendor.last_purchase_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last purchase: {format(new Date(vendor.last_purchase_at), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials Grid */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Raw Materials
              <Badge variant="secondary">{filteredMaterials.length}</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Materials</TabsTrigger>
              <TabsTrigger value="good">In Stock</TabsTrigger>
              <TabsTrigger value="low">
                Low Stock
                {stats.low > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {stats.low}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="out">
                Out of Stock
                {stats.out > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {stats.out}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {filteredMaterials.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No raw materials found matching your criteria.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMaterials.map((material) => (
                    <RawMaterialCard
                      key={material.id}
                      material={material}
                      canEdit={canEdit}
                      onView={() => onViewMaterial?.(material)}
                      onUsed={() => onAdjustStock?.(material, "used")}
                      onRemaining={() => onAdjustStock?.(material, "remaining")}
                      onHistory={() => onViewHistory?.(material)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Recent Adjustments */}
      {recentAdjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Adjustments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAdjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        adj.quantity_change > 0 ? "bg-emerald-50" : "bg-red-50"
                      }`}
                    >
                      {adj.quantity_change > 0 ? (
                        <Plus className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Minus className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{adj.raw_material?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(adj.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-bold text-sm ${
                        adj.quantity_change > 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {adj.quantity_change > 0 ? "+" : ""}
                      {adj.quantity_change}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {adj.quantity_after} {adj.raw_material?.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface RawMaterialCardProps {
  material: RawMaterial;
  canEdit?: boolean;
  onView?: () => void;
  onUsed?: () => void;
  onRemaining?: () => void;
  onHistory?: () => void;
}

function RawMaterialCard({
  material,
  canEdit,
  onView,
  onUsed,
  onRemaining,
  onHistory,
}: RawMaterialCardProps) {
  const minStock = material.min_stock_level || 0;
  const stockPercent =
    minStock > 0 ? Math.min((material.current_stock / minStock) * 100, 100) : 100;
  const stockStatus =
    material.current_stock < 0
      ? "critical"
      : material.current_stock === 0
      ? "empty"
      : material.current_stock <= minStock
      ? "low"
      : "good";

  const statusConfig = {
    critical: {
      badge: "bg-red-100 text-red-700",
      text: "text-red-600",
      bg: "bg-red-50",
      label: "Critical",
    },
    empty: {
      badge: "bg-slate-100 text-slate-600",
      text: "text-slate-500",
      bg: "bg-slate-50",
      label: "Out of Stock",
    },
    low: {
      badge: "bg-amber-100 text-amber-700",
      text: "text-amber-600",
      bg: "bg-amber-50",
      label: "Low Stock",
    },
    good: {
      badge: "bg-emerald-100 text-emerald-700",
      text: "text-emerald-600",
      bg: "bg-emerald-50",
      label: "In Stock",
    },
  };

  const status = statusConfig[stockStatus];
  const stockValue = (material.current_stock || 0) * (material.unit_cost || 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-base">{material.name}</p>
              <p className="text-sm text-muted-foreground">{material.display_id}</p>
            </div>
            <Badge className={`${status.badge} shrink-0`}>{status.label}</Badge>
          </div>
          {material.category && (
            <Badge variant="outline" className="mt-2 text-xs font-normal">
              {material.category}
            </Badge>
          )}
        </div>

        {/* Stock Info */}
        <div className="px-4 pb-4">
          <div className={`rounded-lg ${status.bg} p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Stock</span>
              {minStock > 0 && (
                <span className="text-xs text-muted-foreground">Min: {minStock}</span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${status.text}`}>
                {material.current_stock}
              </span>
              <span className="text-sm text-muted-foreground">{material.unit}</span>
            </div>
            {minStock > 0 && (
              <div className="space-y-1">
                <Progress value={stockPercent} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {stockPercent.toFixed(0)}% of minimum level
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Unit Cost
              </p>
              <p className="font-semibold">
                ₹{Number(material.unit_cost || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Stock Value
              </p>
              <p className="font-semibold">₹{stockValue.toLocaleString()}</p>
            </div>
          </div>

          {material.vendor && (
            <div className="mt-3 p-2 bg-muted rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vendor:</span>
                <span className="font-medium">{material.vendor.name}</span>
              </div>
              {material.vendor.current_balance > 0 && (
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-muted-foreground">Balance Due:</span>
                  <span className="text-red-600 font-medium">
                    ₹{material.vendor.current_balance.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t bg-muted/30 p-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={onView}>
              View
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9"
                  onClick={onUsed}
                >
                  <Minus className="h-4 w-4 mr-1" /> Used
                </Button>
                <Button variant="default" size="sm" className="flex-1 h-9" onClick={onRemaining}>
                  <Plus className="h-4 w-4 mr-1" /> Count
                </Button>
              </>
            )}
            {onHistory && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onHistory}>
                <History className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
