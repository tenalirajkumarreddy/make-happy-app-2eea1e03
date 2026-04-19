import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Factory, 
  Package, 
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
  TrendingUpIcon,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Legend, 
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  ComposedChart,
  Scatter
} from "recharts";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#14b8a6', '#6366f1', '#f43f5e'
];

export default function CostInsights() {
  const { user } = useAuth();
  const { currentWarehouse, allWarehouses } = useWarehouse();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(currentWarehouse?.id || "all");
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState<string>("30days");

  // Warehouse options
  const warehouseOptions = useMemo(() => {
    return [{ id: "all", name: "All Warehouses" }, ...(allWarehouses || [])];
  }, [allWarehouses]);

  // Date range calculation
  const dateRangeCalc = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "7days":
        return { from: subDays(now, 7), to: now };
      case "30days":
        return { from: subDays(now, 30), to: now };
      case "90days":
        return { from: subDays(now, 90), to: now };
      case "month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      default:
        return { from: subDays(now, 30), to: now };
    }
  }, [dateRange]);

  // Raw materials list
  const { data: rawMaterials, isLoading: loadingMaterials } = useQuery({
    queryKey: ["raw_materials_list", selectedWarehouse],
    queryFn: async () => {
      let query = supabase.from("raw_materials").select("id, name, unit, unit_cost, current_stock").eq("is_active", true);
      if (selectedWarehouse !== "all") {
        query = query.eq("warehouse_id", selectedWarehouse);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // WAC cost history
  const { data: wacHistory, isLoading: loadingWac } = useQuery({
    queryKey: ["wac_cost_history", selectedWarehouse, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("wac_cost_history")
        .select(`*, raw_materials(name, unit)`)
        .gte("created_at", dateRangeCalc.from.toISOString())
        .lte("created_at", dateRangeCalc.to.toISOString())
        .order("created_at", { ascending: true });
      
      if (selectedWarehouse !== "all") {
        query = query.eq("warehouse_id", selectedWarehouse);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // BOM costs summary
  const { data: bomSummary, isLoading: loadingBom } = useQuery({
    queryKey: ["bom_summary", selectedWarehouse],
    queryFn: async () => {
      const warehouseFilter = selectedWarehouse !== "all" ? selectedWarehouse : null;
      
      // Get all products with BOMs
      const { data: boms, error: bomError } = await supabase
        .from("bill_of_materials")
        .select(`
          finished_product_id,
          raw_material:raw_materials!bill_of_materials_raw_material_id_fkey(unit_cost, name),
          quantity
        `)
        .eq("is_active", true);
      
      if (bomError) throw bomError;
      
      // Get product names
      const productIds = [...new Set(boms?.map(b => b.finished_product_id) || [])];
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, name, base_price")
        .in("id", productIds);
      
      if (prodError) throw prodError;
      
      // Calculate costs
      const summary = products?.map(product => {
        const productBoms = boms?.filter(b => b.finished_product_id === product.id) || [];
        const bomCost = productBoms.reduce((sum, b) => {
          const cost = (b.quantity || 0) * (b.raw_material?.unit_cost || 0);
          return sum + cost;
        }, 0);
        
        const materialCount = productBoms.length;
        
        return {
          id: product.id,
          name: product.name,
          bomCost,
          materialCount,
          sellingPrice: product.base_price || 0,
        };
      }) || [];
      
      return summary;
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    // WAC metrics
    const wacChanges = wacHistory?.length || 0;
    const latestWac = wacHistory?.[wacHistory.length - 1];
    const avgWacChange = wacHistory?.reduce((sum, h) => {
      const change = Math.abs((h.new_cost || 0) - (h.old_cost || 0));
      return sum + change;
    }, 0) / (wacChanges || 1);
    
    // BOM metrics
    const totalBoms = bomSummary?.length || 0;
    const avgBomCost = bomSummary?.reduce((sum, b) => sum + b.bomCost, 0) / (totalBoms || 1);
    
    // Material price variance
    const priceVariance = rawMaterials?.reduce((sum, m) => {
      const variance = Math.abs((m.unit_cost || 0) * 0.05); // Assume 5% variance
      return sum + variance;
    }, 0) || 0;
    
    return {
      wacChanges,
      avgWacChange,
      latestWacMove: latestWac ? (latestWac.new_cost || 0) - (latestWac.old_cost || 0) : 0,
      totalBoms,
      avgBomCost,
      priceVariance,
      materialsTracked: rawMaterials?.length || 0,
    };
  }, [wacHistory, bomSummary, rawMaterials]);

  // Chart data preparation
  const wacChartData = useMemo(() => {
    if (!wacHistory) return [];
    const filtered = selectedMaterial === "all"
      ? wacHistory
      : wacHistory.filter((h: any) => h.raw_material_id === selectedMaterial);
    
    return filtered.map((record: any) => ({
      date: format(new Date(record.created_at), "MMM dd"),
      cost: Number(record.new_cost),
      oldCost: Number(record.old_cost),
      change: Number(record.new_cost) - Number(record.old_cost),
      name: record.raw_materials?.name || "Unknown",
      variance: (((Number(record.new_cost) - Number(record.old_cost)) / Number(record.old_cost)) * 100).toFixed(1),
    }));
  }, [wacHistory, selectedMaterial]);

  const bomChartData = useMemo(() => {
    if (!bomSummary) return [];
    return bomSummary
      .sort((a, b) => b.bomCost - a.bomCost)
      .slice(0, 10) // Top 10
      .map(b => ({
        name: b.name.length > 20 ? b.name.substring(0, 20) + "..." : b.name,
        bomCost: b.bomCost,
        sellingPrice: b.sellingPrice,
        margin: b.sellingPrice - b.bomCost,
        marginPct: b.sellingPrice > 0 ? ((b.sellingPrice - b.bomCost) / b.sellingPrice * 100).toFixed(1) : 0,
        materialCount: b.materialCount,
      }));
  }, [bomSummary]);

  const materialCostData = useMemo(() => {
    if (!rawMaterials) return [];
    return rawMaterials
      .sort((a, b) => (b.unit_cost || 0) - (a.unit_cost || 0))
      .slice(0, 8)
      .map(m => ({
        name: m.name.length > 15 ? m.name.substring(0, 15) + "..." : m.name,
        cost: m.unit_cost || 0,
        stock: m.current_stock || 0,
        value: (m.unit_cost || 0) * (m.current_stock || 0),
      }));
  }, [rawMaterials]);

  // Loading state
  const isLoading = loadingMaterials || loadingWac || loadingBom;

  // Export data function
  const handleExport = () => {
    const data = {
      bomSummary,
      wacHistory,
      rawMaterials,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cost-insights-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    toast.success("Cost data exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cost Intelligence"
        subtitle="Real-time cost analytics, WAC tracking, and profitability insights"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
          <SelectTrigger className="w-[200px]">
            <Factory className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Select Warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouseOptions.map((w: any) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <BarChart3 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="90days">Last 90 Days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">WAC Adjustments</p>
                    <p className="text-2xl font-bold">{metrics.wacChanges}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last 30 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Latest Cost Move</p>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-2xl font-bold",
                        metrics.latestWacMove >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {metrics.latestWacMove >= 0 ? "+" : ""}
                        ₹{Math.abs(metrics.latestWacMove).toFixed(2)}
                      </p>
                      {metrics.latestWacMove >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    metrics.latestWacMove >= 0 ? "bg-green-100" : "bg-red-100"
                  )}>
                    <IndianRupee className={cn(
                      "h-5 w-5",
                      metrics.latestWacMove >= 0 ? "text-green-600" : "text-red-600"
                    )} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  vs previous WAC
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active BOMs</p>
                    <p className="text-2xl font-bold">{metrics.totalBoms}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Avg cost: ₹{metrics.avgBomCost.toFixed(2)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Materials Tracked</p>
                    <p className="text-2xl font-bold">{metrics.materialsTracked}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Factory className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  With real-time WAC
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="wac" className="flex-1">
                <TrendingUpIcon className="h-4 w-4 mr-2" />
                WAC Trends
              </TabsTrigger>
              <TabsTrigger value="products" className="flex-1">
                <Package className="h-4 w-4 mr-2" />
                Product Costs
              </TabsTrigger>
              <TabsTrigger value="materials" className="flex-1">
                <Factory className="h-4 w-4 mr-2" />
                Material Analysis
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* BOM Cost Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      BOM Cost Distribution
                    </CardTitle>
                    <CardDescription>
                      Top 10 products by BOM cost
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      {bomChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={bomChartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickFormatter={(v) => `₹${v}`} fontSize={12} />
                            <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                            <RechartsTooltip 
                              formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="bomCost" radius={[0, 4, 4, 0]}>
                              {bomChartData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          No BOM data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Material Cost Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Material Costs (Top 8)
                    </CardTitle>
                    <CardDescription>
                      Highest cost per unit materials
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      {materialCostData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={materialCostData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={60} />
                            <YAxis tickFormatter={(v) => `₹${v}`} fontSize={12} />
                            <RechartsTooltip 
                              formatter={(value: any) => `₹${Number(value).toFixed(2)}`}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                              {materialCostData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          No material data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Summary Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cost Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Avg WAC Change</p>
                      <p className="text-xl font-bold">₹{metrics.avgWacChange.toFixed(2)}</p>
                      <Badge variant="outline" className="text-xs">Per adjustment</Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Avg BOM Cost</p>
                      <p className="text-xl font-bold">₹{metrics.avgBomCost.toFixed(2)}</p>
                      <Badge variant="outline" className="text-xs">Per product</Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Price Variance</p>
                      <p className="text-xl font-bold">₹{metrics.priceVariance.toFixed(0)}</p>
                      <Badge variant="outline" className="text-xs">Estimated ±5%</Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Materials</p>
                      <p className="text-xl font-bold">{metrics.materialsTracked}</p>
                      <Badge variant="outline" className="text-xs">Tracked with WAC</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* WAC Trends Tab */}
            <TabsContent value="wac" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUpIcon className="h-5 w-5" />
                      Weighted Average Cost Trends
                    </CardTitle>
                    <CardDescription>
                      Historical WAC changes for raw materials
                    </CardDescription>
                  </div>
                  <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Materials" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Materials</SelectItem>
                      {rawMaterials?.map((mat: any) => (
                        <SelectItem key={mat.id} value={mat.id}>{mat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    {wacChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={wacChartData}>
                          <defs>
                            <linearGradient id="wacGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" fontSize={12} tickLine={false} />
                          <YAxis tickFormatter={(v) => `₹${v}`} fontSize={12} />
                          <RechartsTooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background border rounded-lg p-3 shadow-lg">
                                    <p className="font-semibold text-sm">{data.name}</p>
                                    <p className="text-sm text-muted-foreground">{data.date}</p>
                                    <div className="mt-2 space-y-1">
                                      <p className="text-sm">
                                        New Cost: <span className="font-semibold">₹{data.cost}</span>
                                      </p>
                                      <p className="text-sm">
                                        Previous: <span className="font-semibold">₹{data.oldCost}</span>
                                      </p>
                                      <p className={cn(
                                        "text-sm font-medium",
                                        Number(data.change) >= 0 ? "text-green-600" : "text-red-600"
                                      )}>
                                        Change: {Number(data.change) >= 0 ? "+" : ""}₹{Math.abs(data.change).toFixed(2)} ({data.variance}%)
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="cost" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            fill="url(#wacGradient)" 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cost" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            dot={{ fill: "#3b82f6", r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p>No WAC history data available</p>
                          <p className="text-sm text-muted-foreground">
                            WAC changes will appear here when materials are purchased
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* WAC Change Log */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">WAC Change Log</CardTitle>
                  <CardDescription>Recent cost adjustments</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Previous</TableHead>
                        <TableHead className="text-right">New Cost</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wacHistory?.slice(0, 10).map((h: any) => {
                        const change = (h.new_cost || 0) - (h.old_cost || 0);
                        const isIncrease = change >= 0;
                        return (
                          <TableRow key={h.id}>
                            <TableCell className="font-medium">
                              {h.raw_materials?.name}
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{(h.old_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ₹{(h.new_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className={cn(
                              "text-right font-medium",
                              isIncrease ? "text-green-600" : "text-red-600"
                            )}>
                              <div className="flex items-center justify-end gap-1">
                                {isIncrease ? (
                                  <ArrowUpRight className="h-4 w-4" />
                                ) : (
                                  <ArrowDownRight className="h-4 w-4" />
                                )}
                                {Math.abs(change).toFixed(2)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {format(new Date(h.created_at), "MMM dd, yyyy")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!wacHistory?.length && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No WAC adjustments recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Product Costs Tab */}
            <TabsContent value="products" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Product Cost Analysis
                  </CardTitle>
                  <CardDescription>
                    BOM cost breakdown and profitability per product
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Stacked Bar Chart */}
                  <div className="h-[350px] mb-6">
                    {bomChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bomChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" fontSize={11} tickLine={false} angle={-45} textAnchor="end" height={80} />
                          <YAxis tickFormatter={(v) => `₹${v}`} fontSize={12} />
                          <RechartsTooltip 
                            formatter={(value: any, name: string) => {
                              return [`₹${Number(value).toFixed(2)}`, name];
                            }}
                            contentStyle={{ fontSize: 12 }}
                          />
                          <Legend />
                          <Bar dataKey="bomCost" name="BOM Cost" stackId="a" fill="#3b82f6" />
                          <Bar dataKey="margin" name="Margin" stackId="a" fill="#10b981" />
                          <ReferenceLine y={0} stroke="#000" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        No product cost data available
                      </div>
                    )}
                  </div>

                  {/* Detailed Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">BOM Cost</TableHead>
                        <TableHead className="text-right">Materials</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bomSummary?.map((product: any) => {
                        const margin = product.sellingPrice - product.bomCost;
                        const marginPct = product.sellingPrice > 0 ? (margin / product.sellingPrice) * 100 : 0;
                        const isProfitable = margin > 0;
                        
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">{product.name}</TableCell>
                            <TableCell className="text-right">
                              ₹{product.bomCost.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{product.materialCount}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{product.sellingPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className={cn(
                              "text-right font-semibold",
                              isProfitable ? "text-green-600" : "text-red-600"
                            )}>
                              {isProfitable ? "+" : ""}₹{margin.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge 
                                variant={marginPct >= 20 ? "default" : marginPct >= 10 ? "secondary" : "destructive"}
                              >
                                {marginPct.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isProfitable ? (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-sm">Profitable</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-red-600">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span className="text-sm">Loss</span>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!bomSummary?.length && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No BOM data available. Create BOMs in Inventory → BOM.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Materials Analysis Tab */}
            <TabsContent value="materials" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Factory className="h-5 w-5" />
                    Raw Materials Inventory Value
                  </CardTitle>
                  <CardDescription>
                    Current stock value based on WAC
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] mb-6">
                    {materialCostData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={materialCostData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" fontSize={11} tickLine={false} angle={-45} textAnchor="end" height={80} />
                          <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} fontSize={12} />
                          <RechartsTooltip 
                            formatter={(value: any, name: string, props: any) => {
                              if (name === "value") {
                                return [`₹${Number(value).toLocaleString('en-IN')}`, "Total Value"];
                              }
                              return [`₹${Number(value).toFixed(2)}`, name];
                            }}
                            contentStyle={{ fontSize: 12 }}
                          />
                          <Legend />
                          <Bar dataKey="value" name="Inventory Value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        No materials data
                      </div>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Cost (WAC)</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawMaterials?.sort((a: any, b: any) => {
                        const valueA = (a.unit_cost || 0) * (a.current_stock || 0);
                        const valueB = (b.unit_cost || 0) * (b.current_stock || 0);
                        return valueB - valueA;
                      }).map((m: any) => {
                        const totalValue = (m.unit_cost || 0) * (m.current_stock || 0);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.name}</TableCell>
                            <TableCell>{m.unit}</TableCell>
                            <TableCell className="text-right">
                              ₹{(m.unit_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(m.current_stock || 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ₹{totalValue.toLocaleString('en-IN')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!rawMaterials?.length && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No raw materials found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
