import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {
  Package,
  Warehouse,
  Users,
  FlaskConical,
  History,
  Plus,
  ArrowRightLeft,
  AlertCircle,
  TrendingUp,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Inventory hooks
import {
  useWarehouseStock,
  useStaffStockByWarehouse,
  useStockAdjustment,
  useStockHistory,
  useVendorBalance,
} from "@/hooks/inventory";

// Inventory components
import {
  InventorySummaryCards,
  WarehouseStockView,
  StaffStockView,
  StockTransferModal,
  StockAdjustmentModal,
  StockHistoryView,
  RawMaterialInventoryView,
} from "@/components/inventory";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type InventoryTab = "stock" | "staff-holdings" | "raw-materials" | "history";

const Inventory = () => {
  const { user, role } = useAuth();
  const { currentWarehouse, allWarehouses, assignedWarehouseId } = useWarehouse();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Role flags
  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isPos = role === "pos";
  const isAgent = role === "agent";
  const isMarketer = role === "marketer";
  const isInventoryViewer = isSuperAdmin || isManager || isPos || isAgent || isMarketer;
  const canAdjustStock = isSuperAdmin || isManager;
  const canReviewReturns = isSuperAdmin || isManager;
  const canSeeStaffHoldings = isSuperAdmin || isManager;

  const allowedTransferTypes = useMemo(() => {
    if (isSuperAdmin) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff", "warehouse_to_warehouse"];
    if (isManager) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff"];
    if (isPos) return ["warehouse_to_staff", "staff_to_staff"];
    if (isAgent || isMarketer) return ["staff_to_warehouse", "staff_to_staff"];
    return [] as string[];
  }, [isSuperAdmin, isManager, isPos, isAgent, isMarketer]);
  const canTransferStock = allowedTransferTypes.length > 0;

  // Tab visibility
  const visibleTabs = useMemo<InventoryTab[]>(() => {
    if (!isInventoryViewer) return [];
    const tabs: InventoryTab[] = ["stock"];
    if (canSeeStaffHoldings || isAgent || isMarketer || isPos) tabs.push("staff-holdings");
    if (isSuperAdmin || isManager) tabs.push("raw-materials");
    tabs.push("history");
    return tabs;
  }, [isInventoryViewer, canSeeStaffHoldings, isSuperAdmin, isManager, isAgent, isMarketer, isPos]);

  // State
  const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [preselectedProduct, setPreselectedProduct] = useState<any>(null);

  // Pending-return review state
  const [selectedPendingReturn, setSelectedPendingReturn] = useState<any>(null);
  const [actualQuantity, setActualQuantity] = useState("");
  const [differenceAction, setDifferenceAction] = useState<"keep" | "flag">("keep");
  const [reviewNotes, setReviewNotes] = useState("");

  // Raw-material adjustment state
  const [showRawAdjustmentDialog, setShowRawAdjustmentDialog] = useState(false);
  const [selectedRawMaterial, setSelectedRawMaterial] = useState<any>(null);
  const [rawAdjustmentType, setRawAdjustmentType] = useState<"used" | "remaining">("used");
  const [rawAdjustmentQuantity, setRawAdjustmentQuantity] = useState("");
  const [rawAdjustmentReason, setRawAdjustmentReason] = useState("");

  // Data fetching
  const scopedWarehouseId = selectedWarehouseId || undefined;

  const {
    warehouses,
    items: warehouseItems,
    stats: warehouseStats,
    isLoading: isLoadingWarehouse,
  } = useWarehouseStock({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "stock" || activeTab === "history",
  });

  const { adjustRawMaterial } = useStockAdjustment({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "raw-materials" && !!scopedWarehouseId,
  });

  const { staffGroups, staffSummary, isLoadingStock: isLoadingStaffStock } =
    useStaffStockByWarehouse(scopedWarehouseId ?? "");

  const { movements: stockMovements, isLoading: isLoadingHistory } = useStockHistory({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "history",
    limit: 100,
  });

  const { vendors, isLoading: isLoadingVendors } = useVendorBalance({
    enabled: activeTab === "raw-materials",
  });

  // Pending returns
  const { data: pendingReturns, isLoading: isLoadingPendingReturns } = useQuery({
    queryKey: ["inventory-pending-returns", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId || !canReviewReturns) return [];
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          id, display_id, quantity, description, created_at,
          from_user_id, to_warehouse_id,
          product:products!stock_transfers_product_id_fkey(id, name, sku, unit),
          staff:profiles!stock_transfers_from_user_id_profiles_fkey(id, full_name, avatar_url)
        `)
        .eq("transfer_type", "staff_to_warehouse")
        .eq("status", "pending")
        .eq("to_warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedWarehouseId && canReviewReturns && activeTab === "history",
  });

  // Raw materials
  const { data: rawMaterials, isLoading: isLoadingRawMaterials } = useQuery({
    queryKey: ["raw-materials-inventory", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data: materials } = await supabase
        .from("raw_materials")
        .select(`
          id, display_id, name, unit, category, min_stock_level, current_stock,
          unit_cost, image_url, is_active, vendor_id,
          vendor:vendors!raw_materials_vendor_id_fkey(id, name)
        `)
        .eq("is_active", true)
        .order("name");

      if (!materials) return [];

      const { data: stocks } = await supabase
        .from("raw_material_stock")
        .select("raw_material_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);

      const stockMap = new Map(stocks?.map((s) => [s.raw_material_id, s.quantity]) ?? []);
      return materials.map((m) => ({ ...m, current_stock: stockMap.get(m.id) ?? 0 }));
    },
    enabled: activeTab === "raw-materials" && !!selectedWarehouseId,
  });

  const { data: rawMaterialAdjustments } = useQuery({
    queryKey: ["raw-material-adjustments", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data, error } = await supabase
        .from("raw_material_adjustments")
        .select(`
          id, raw_material_id, adjustment_type, quantity_before, quantity_change,
          quantity_after, reason, created_at,
          raw_material:raw_materials!raw_material_adjustments_raw_material_id_fkey(
            id, name, unit, display_id, current_stock, unit_cost
          )
        `)
        .eq("warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: activeTab === "raw-materials" && !!selectedWarehouseId,
  });

  // Auto-select warehouse
  useEffect(() => {
    if (!isInventoryViewer || selectedWarehouseId) return;
    const fallback =
      (isSuperAdmin
        ? allWarehouses[0]?.id ?? warehouses?.[0]?.id
        : assignedWarehouseId ?? currentWarehouse?.id ?? warehouses?.[0]?.id) ?? "";
    if (fallback) setSelectedWarehouseId(fallback);
  }, [
    isInventoryViewer, selectedWarehouseId, isSuperAdmin,
    allWarehouses, warehouses, assignedWarehouseId, currentWarehouse?.id,
  ]);

  // Enforce valid active tab
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0]);
  }, [visibleTabs, activeTab]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalProducts = warehouseItems?.length || 0;
    const lowStockItems = warehouseItems?.filter((i: any) => (i.quantity || 0) <= (i.min_stock_level || 0)).length || 0;
    const totalStockValue = warehouseItems?.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0) || 0;
    const totalQuantity = warehouseItems?.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) || 0;
    const totalStaffHoldings = staffGroups?.reduce((sum: number, g: any) => sum + (g.total_quantity || 0), 0) || 0;
    const rawMaterialsCount = rawMaterials?.length || 0;
    const pendingReturnsCount = pendingReturns?.length || 0;

    return {
      totalProducts,
      lowStockItems,
      totalStockValue,
      totalQuantity,
      totalStaffHoldings,
      rawMaterialsCount,
      pendingReturnsCount,
    };
  }, [warehouseItems, staffGroups, rawMaterials, pendingReturns]);

  // Process return mutation
  const processReturn = useMutation({
    mutationFn: async ({
      transferId,
      approved,
      requestedQuantity,
      actualQty,
      action,
      notes,
    }: {
      transferId: string;
      approved: boolean;
      requestedQuantity: number;
      actualQty: number;
      action: string;
      notes: string;
    }) => {
      const { data, error } = await supabase.rpc("review_stock_return", {
        p_transfer_id: transferId,
        p_approved: approved,
        p_actual_quantity: actualQty,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Return reviewed successfully");
      setSelectedPendingReturn(null);
      setActualQuantity("");
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to process return");
    },
  });

  // Handle warehouse change
  const handleWarehouseChange = (value: string) => {
    setSelectedWarehouseId(value);
  };

  // Handle raw material adjustment
  const handleRawMaterialAdjustment = async () => {
    if (!selectedRawMaterial || !rawAdjustmentQuantity) return;
    try {
      await adjustRawMaterial({
        rawMaterialId: selectedRawMaterial.id,
        quantity: parseFloat(rawAdjustmentQuantity),
        adjustmentType: rawAdjustmentType,
        reason: rawAdjustmentReason,
        warehouseId: selectedWarehouseId,
      });
      toast.success("Raw material adjusted");
      setShowRawAdjustmentDialog(false);
      setSelectedRawMaterial(null);
      setRawAdjustmentQuantity("");
      setRawAdjustmentReason("");
      queryClient.invalidateQueries({ queryKey: ["raw-materials-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["raw-material-adjustments"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to adjust raw material");
    }
  };

  // Warehouse options
  const warehouseOptions = useMemo(() => {
    if (isSuperAdmin) return allWarehouses?.length ? allWarehouses : warehouses || [];
    return warehouses || [];
  }, [isSuperAdmin, allWarehouses, warehouses]);

  const currentWarehouseName = useMemo(() => {
    return warehouseOptions.find((w) => w.id === selectedWarehouseId)?.name || "Select Warehouse";
  }, [warehouseOptions, selectedWarehouseId]);

  // Loading state
  const isLoading = isLoadingWarehouse || isLoadingStaffStock || isLoadingHistory || isLoadingVendors || isLoadingRawMaterials || isLoadingPendingReturns;

  if (!isInventoryViewer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inventory" subtitle="Inventory management" />
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to view inventory. Contact your administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading && !warehouseItems?.length && !staffGroups?.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inventory" subtitle="Loading inventory data..." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        subtitle={`${currentWarehouseName} • ${stats.totalProducts} products • ₹${stats.totalStockValue.toLocaleString("en-IN")} value`}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{stats.totalProducts}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Quantity</p>
                <p className="text-2xl font-bold">{stats.totalQuantity.toLocaleString("en-IN")}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Boxes className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Value</p>
                <p className="text-2xl font-bold">₹{(stats.totalStockValue / 1000).toFixed(1)}k</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(stats.lowStockItems > 0 && "border-red-200 bg-red-50/50")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={cn("text-sm", stats.lowStockItems > 0 ? "text-red-600" : "text-muted-foreground")}>
                  Low Stock Items
                </p>
                <p className={cn("text-2xl font-bold", stats.lowStockItems > 0 && "text-red-600")}>
                  {stats.lowStockItems}
                </p>
              </div>
              <div className={cn("h-10 w-10 rounded-full flex items-center justify-center",
                stats.lowStockItems > 0 ? "bg-red-100" : "bg-amber-100"
              )}>
                <AlertCircle className={cn("h-5 w-5", stats.lowStockItems > 0 ? "text-red-600" : "text-amber-600")} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouse Selector & Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Select value={selectedWarehouseId} onValueChange={handleWarehouseChange}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <Warehouse className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Select Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouseOptions.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-[200px]"
            />
          </div>
          {canTransferStock && (
            <Button variant="outline" onClick={() => setShowTransferModal(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer
            </Button>
          )}
          {canAdjustStock && (
            <Button onClick={() => setShowAdjustmentModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adjust Stock
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <TabsList className="w-full">
          {visibleTabs.includes("stock") && (
            <TabsTrigger value="stock" className="flex-1">
              <Package className="h-4 w-4 mr-2" />
              Stock
              <Badge variant="secondary" className="ml-2">{stats.totalProducts}</Badge>
            </TabsTrigger>
          )}
          {visibleTabs.includes("staff-holdings") && (
            <TabsTrigger value="staff-holdings" className="flex-1">
              <Users className="h-4 w-4 mr-2" />
              Staff Holdings
              <Badge variant="secondary" className="ml-2">{staffGroups?.length || 0}</Badge>
            </TabsTrigger>
          )}
          {visibleTabs.includes("raw-materials") && (
            <TabsTrigger value="raw-materials" className="flex-1">
              <FlaskConical className="h-4 w-4 mr-2" />
              Raw Materials
              <Badge variant="secondary" className="ml-2">{stats.rawMaterialsCount}</Badge>
            </TabsTrigger>
          )}
          {visibleTabs.includes("history") && (
            <TabsTrigger value="history" className="flex-1">
              <History className="h-4 w-4 mr-2" />
              History
              {stats.pendingReturnsCount > 0 && (
                <Badge variant="destructive" className="ml-2">{stats.pendingReturnsCount}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Stock Tab */}
        <TabsContent value="stock" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Warehouse Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <WarehouseStockView
                warehouses={warehouseOptions}
                products={warehouseItems}
                selectedWarehouseId={selectedWarehouseId}
                isLoading={isLoadingWarehouse}
                canEdit={canAdjustStock}
                canAdjust={canAdjustStock}
                canTransfer={canTransferStock}
                searchQuery={searchQuery}
                onWarehouseChange={handleWarehouseChange}
                onViewProduct={(product) => {
                  setPreselectedProduct(product);
                  if (canAdjustStock) setShowAdjustmentModal(true);
                  else if (canTransferStock) setShowTransferModal(true);
                }}
                onAdjustStock={(product) => {
                  setPreselectedProduct(product);
                  setShowAdjustmentModal(true);
                }}
                onTransferStock={(product) => {
                  setPreselectedProduct(product);
                  setShowTransferModal(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff Holdings Tab */}
        {visibleTabs.includes("staff-holdings") && (
          <TabsContent value="staff-holdings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Staff Holdings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <StaffStockView
                  staffGroups={staffGroups}
                  staffSummary={staffSummary}
                  isLoading={isLoadingStaffStock}
                  canTransfer={canTransferStock}
                  selectedWarehouseId={selectedWarehouseId}
                  onTransfer={(item) => {
                    setPreselectedProduct(item);
                    setShowTransferModal(true);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Raw Materials Tab */}
        {visibleTabs.includes("raw-materials") && (
          <TabsContent value="raw-materials" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FlaskConical className="h-5 w-5" />
                  Raw Materials Inventory
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <RawMaterialInventoryView
                  rawMaterials={rawMaterials}
                  adjustments={rawMaterialAdjustments}
                  isLoading={isLoadingRawMaterials}
                  canAdjust={canAdjustStock}
                  searchQuery={searchQuery}
                  onAdjust={(material) => {
                    setSelectedRawMaterial(material);
                    setShowRawAdjustmentDialog(true);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Stock Movement History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <StockHistoryView
                movements={stockMovements}
                pendingReturns={pendingReturns}
                isLoading={isLoadingHistory || isLoadingPendingReturns}
                canReviewReturns={canReviewReturns}
                onReviewReturn={(returnItem) => {
                  setSelectedPendingReturn(returnItem);
                  setActualQuantity(String(returnItem.quantity));
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <StockTransferModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        warehouses={warehouseOptions}
        preselectedProduct={preselectedProduct}
        allowedTransferTypes={allowedTransferTypes}
        selectedWarehouseId={selectedWarehouseId}
      />

      <StockAdjustmentModal
        open={showAdjustmentModal}
        onOpenChange={setShowAdjustmentModal}
        warehouses={warehouseOptions}
        products={warehouseItems}
        preselectedProduct={preselectedProduct}
        selectedWarehouseId={selectedWarehouseId}
      />

      {/* Raw Material Adjustment Dialog */}
      <Dialog open={showRawAdjustmentDialog} onOpenChange={setShowRawAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Raw Material</DialogTitle>
            <DialogDescription>
              {selectedRawMaterial?.name} • Current: {selectedRawMaterial?.current_stock} {selectedRawMaterial?.unit}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <RadioGroup
                value={rawAdjustmentType}
                onValueChange={(v) => setRawAdjustmentType(v as "used" | "remaining")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="used" id="used" />
                  <Label htmlFor="used">Mark as Used</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="remaining" id="remaining" />
                  <Label htmlFor="remaining">Record Remaining</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={rawAdjustmentQuantity}
                onChange={(e) => setRawAdjustmentQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={rawAdjustmentReason}
                onChange={(e) => setRawAdjustmentReason(e.target.value)}
                placeholder="Optional reason for adjustment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRawAdjustmentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRawMaterialAdjustment}>
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Return Review Dialog */}
      <Dialog
        open={!!selectedPendingReturn}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPendingReturn(null);
            setActualQuantity("");
            setReviewNotes("");
            setDifferenceAction("keep");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Return</DialogTitle>
            <DialogDescription>
              {selectedPendingReturn?.display_id} • {selectedPendingReturn?.product?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedPendingReturn && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  Requested:{" "}
                  <span className="font-medium">{selectedPendingReturn.quantity}</span>{" "}
                  {selectedPendingReturn.product?.unit}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  From {selectedPendingReturn.staff?.full_name ?? "Unknown"}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Actual Quantity Received</Label>
                <Input
                  type="number"
                  value={actualQuantity}
                  onChange={(e) => setActualQuantity(e.target.value)}
                  placeholder={String(selectedPendingReturn.quantity)}
                  min={0}
                />
              </div>
              {Number(actualQuantity) < selectedPendingReturn.quantity && (
                <div className="space-y-2">
                  <Label>Difference Action</Label>
                  <RadioGroup
                    value={differenceAction}
                    onValueChange={(v) => setDifferenceAction(v as "keep" | "flag")}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="keep" id="diff-keep" />
                      <Label htmlFor="diff-keep">Keep (write off)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="flag" id="diff-flag" />
                      <Label htmlFor="diff-flag">Flag for investigation</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="h-16"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedPendingReturn) return;
                processReturn.mutate({
                  transferId: selectedPendingReturn.id,
                  approved: false,
                  requestedQuantity: selectedPendingReturn.quantity,
                  actualQty: 0,
                  action: "flag",
                  notes: reviewNotes,
                });
              }}
              disabled={processReturn.isPending}
            >
              Reject
            </Button>
            <Button
              onClick={() => {
                if (!selectedPendingReturn) return;
                const actualQty = Number(actualQuantity);
                if (Number.isNaN(actualQty) || actualQty < 0) {
                  toast.error("Enter a valid quantity");
                  return;
                }
                processReturn.mutate({
                  transferId: selectedPendingReturn.id,
                  approved: true,
                  requestedQuantity: selectedPendingReturn.quantity,
                  actualQty,
                  action: differenceAction,
                  notes: reviewNotes,
                });
              }}
              disabled={processReturn.isPending}
            >
              {processReturn.isPending ? "Processing…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
