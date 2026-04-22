import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {
  Package,
  Users,
  FlaskConical,
  History,
  Plus,
  ArrowRightLeft,
  AlertCircle,
  TrendingUp,
  Boxes,
  Search,
  Warehouse,
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

// Inventory hooks
import {
  useWarehouseStock,
  useStaffStockByWarehouse,
  useStockAdjustment,
  useStockHistory,
} from "@/hooks/inventory";

// Inventory components
import {
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

type InventoryTab = "stock" | "staff-holdings" | "raw-materials" | "history";

const Inventory = () => {
  const { user, role } = useAuth();
  const { currentWarehouse, allWarehouses, assignedWarehouseId } = useWarehouse();
  const queryClient = useQueryClient();

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

  // Data fetching
  const scopedWarehouseId = selectedWarehouseId || undefined;

  const {
    warehouses,
    items: warehouseItems,
    stats: warehouseStats,
    isLoading: isLoadingWarehouse,
  } = useWarehouseStock({
    warehouseId: scopedWarehouseId,
    enabled: true,
  });

  const { staffGroups, isLoadingStock: isLoadingStaffStock } =
    useStaffStockByWarehouse(scopedWarehouseId ?? "");

  const { movements: stockMovements, isLoading: isLoadingHistory } = useStockHistory({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "history",
    limit: 100,
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

  // Auto-select warehouse - only run once on mount or when user context changes
  useEffect(() => {
    if (!isInventoryViewer || selectedWarehouseId) return;
    // Use a timeout to ensure warehouses data is loaded
    const timer = setTimeout(() => {
      const fallback =
        (isSuperAdmin
          ? allWarehouses[0]?.id
          : assignedWarehouseId ?? currentWarehouse?.id) ?? "";
      if (fallback) setSelectedWarehouseId(fallback);
    }, 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInventoryViewer, selectedWarehouseId, isSuperAdmin, assignedWarehouseId, currentWarehouse?.id]);

  // Build staff holdings by product map
  const staffHoldingsByProduct = useMemo(() => {
    const map: Record<string, { user_id: string; full_name: string; quantity: number }[]> = {};
    staffGroups?.forEach((staff: any) => {
      staff.items?.forEach((item: any) => {
        const productId = item.product_id || item.product?.id;
        if (!productId) return;
        if (!map[productId]) map[productId] = [];
        map[productId].push({
          user_id: staff.user_id,
          full_name: staff.full_name,
          quantity: item.quantity || 0,
        });
      });
    });
    return map;
  }, [staffGroups]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalProducts = warehouseItems?.length || 0;
    const lowStockItems = warehouseItems?.filter((i: any) => (i.quantity || 0) <= (i.min_stock_level || 0)).length || 0;
    const totalStockValue = warehouseItems?.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0) || 0;
    const totalQuantity = warehouseItems?.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0) || 0;
    const totalStaffHoldings = staffGroups?.reduce((sum: number, g: any) => sum + (g.total_quantity || 0), 0) || 0;
    const rawMaterialsCount = rawMaterials?.length || 0;
    const pendingReturnsCount = pendingReturns?.length || 0;
    const staffCount = staffGroups?.length || 0;

    return {
      totalProducts,
      lowStockItems,
      totalStockValue,
      totalQuantity,
      totalStaffHoldings,
      rawMaterialsCount,
      pendingReturnsCount,
      staffCount,
    };
  }, [warehouseItems, staffGroups, rawMaterials, pendingReturns]);

  // Process return mutation
  const processReturn = useMutation({
    mutationFn: async ({
      transferId,
      approved,
      actualQty,
      notes,
    }: {
      transferId: string;
      approved: boolean;
      actualQty: number;
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

  // Warehouse options
  const warehouseOptions = useMemo(() => {
    if (isSuperAdmin) return allWarehouses?.length ? allWarehouses : warehouses || [];
    return warehouses || [];
  }, [isSuperAdmin, allWarehouses, warehouses]);

  const currentWarehouseName = useMemo(() => {
    return warehouseOptions.find((w) => w.id === selectedWarehouseId)?.name || "Select Warehouse";
  }, [warehouseOptions, selectedWarehouseId]);

  // Loading state
  const isLoading = isLoadingWarehouse || isLoadingStaffStock || isLoadingHistory || isLoadingRawMaterials || isLoadingPendingReturns;

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
      {/* Page Header */}
      <PageHeader
        title="Inventory Management"
        subtitle={`${currentWarehouseName} • ${stats.totalProducts} products • ${formatCurrency(stats.totalStockValue)} value`}
        filterNode={
          <div className="flex items-center gap-2">
            <Select value={selectedWarehouseId} onValueChange={handleWarehouseChange}>
              <SelectTrigger className="w-[180px] sm:w-[220px] bg-background">
                <Warehouse className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select Warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <TabsList className="w-full sm:w-auto justify-start overflow-x-auto bg-transparent p-0 h-auto gap-2">
            <TabsTrigger 
              value="stock" 
              className="gap-2 py-2 px-4 rounded-lg border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-foreground bg-transparent hover:bg-muted/50 data-[state=active]:shadow-sm"
            >
              <Package className="h-4 w-4" />
              Stock <span className="font-semibold ml-0.5">{stats.totalProducts}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="staff-holdings" 
              className="gap-2 py-2 px-4 rounded-lg border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-foreground bg-transparent hover:bg-muted/50 data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              Staff Holdings <span className="font-semibold ml-0.5">{stats.staffCount}</span>
            </TabsTrigger>
            {(isSuperAdmin || isManager) && (
              <TabsTrigger 
                value="raw-materials" 
                className="gap-2 py-2 px-4 rounded-lg border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-foreground bg-transparent hover:bg-muted/50 data-[state=active]:shadow-sm"
              >
                <FlaskConical className="h-4 w-4" />
                Raw Materials <span className="font-semibold ml-0.5">{stats.rawMaterialsCount}</span>
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="history" 
              className="gap-2 py-2 px-4 rounded-lg border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-foreground bg-transparent hover:bg-muted/50 data-[state=active]:shadow-sm"
            >
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {canTransferStock && (
              <Button variant="outline" className="flex-1 sm:flex-auto" onClick={() => setShowTransferModal(true)}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transfer
              </Button>
            )}
            {canAdjustStock && (
              <Button onClick={() => setShowAdjustmentModal(true)} className="flex-1 sm:flex-auto">
                <Plus className="h-4 w-4 mr-2" />
                Adjust Stock
              </Button>
            )}
          </div>
        </div>

        {/* Stock Tab */}
        <TabsContent value="stock" className="mt-0 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm border-none">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                  <p className="text-3xl font-bold">{stats.totalProducts}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Stock Quantity</p>
                  <p className="text-3xl font-bold">{stats.totalQuantity.toLocaleString("en-IN")}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Boxes className="h-6 w-6 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Stock Value</p>
                  <p className="text-3xl font-bold">{formatCurrency(stats.totalStockValue / 1000)}k</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card className={`shadow-sm border-none ${stats.lowStockItems > 0 ? "bg-red-50/50" : ""}`}>
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${stats.lowStockItems > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    Low Stock Items
                  </p>
                  <p className={`text-3xl font-bold ${stats.lowStockItems > 0 ? "text-red-600" : ""}`}>
                    {stats.lowStockItems}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${stats.lowStockItems > 0 ? "bg-red-100" : "bg-amber-100"}`}>
                  <AlertCircle className={`h-6 w-6 ${stats.lowStockItems > 0 ? "text-red-600" : "text-amber-600"}`} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 bg-background border-none shadow-sm rounded-xl"
              />
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-background text-muted-foreground border-none shadow-sm py-2 px-4 rounded-xl font-normal text-sm">
                <Package className="h-4 w-4 mr-2" />
                {warehouseItems?.length || 0} products
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-none shadow-sm py-2 px-4 rounded-xl font-medium text-sm">
                {formatCurrency(stats.totalStockValue)} total value
              </Badge>
            </div>
          </div>

          {/* Products Grid */}
          <WarehouseStockView
            products={warehouseItems}
            selectedWarehouseId={selectedWarehouseId}
            staffHoldingsByProduct={staffHoldingsByProduct}
            searchQuery={searchQuery}
            isLoading={isLoadingWarehouse}
            canAdjust={canAdjustStock}
            canTransfer={canTransferStock}
            onAdjustStock={(product) => {
              setPreselectedProduct(product);
              setShowAdjustmentModal(true);
            }}
            onTransferStock={(product) => {
              setPreselectedProduct(product);
              setShowTransferModal(true);
            }}
          />
        </TabsContent>

        {/* Staff Holdings Tab */}
        <TabsContent value="staff-holdings" className="mt-0">
          <StaffStockView
            staffStock={staffGroups}
            isLoading={isLoadingStaffStock}
            onViewDetails={(staff) => {
              console.log("View staff details:", staff);
            }}
            onTransfer={(staff) => {
              setPreselectedProduct(staff);
              setShowTransferModal(true);
            }}
          />
        </TabsContent>

        {/* Raw Materials Tab */}
        {(isSuperAdmin || isManager) && (
          <TabsContent value="raw-materials" className="mt-0">
            <RawMaterialInventoryView
              rawMaterials={rawMaterials}
              isLoading={isLoadingRawMaterials}
              canAdjust={canAdjustStock}
              onAdjust={(material) => {
                console.log("Adjust raw material:", material);
              }}
            />
          </TabsContent>
        )}

        {/* History Tab */}
        <TabsContent value="history" className="mt-0">
          <StockHistoryView warehouseId={selectedWarehouseId} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <StockTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        warehouseId={selectedWarehouseId}
        defaultProductId={preselectedProduct?.product?.id}
        allowedTransferTypes={allowedTransferTypes as any}
        currentUserId={user?.id}
      />

      <StockAdjustmentModal
        isOpen={showAdjustmentModal}
        onClose={() => {
          setShowAdjustmentModal(false);
          setPreselectedProduct(null);
        }}
        warehouseId={selectedWarehouseId}
        defaultProductId={preselectedProduct?.product?.id || preselectedProduct?.id}
      />

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
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="action"
                        value="keep"
                        checked={differenceAction === "keep"}
                        onChange={() => setDifferenceAction("keep")}
                      />
                      <span className="text-sm">Keep (write off)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="action"
                        value="flag"
                        checked={differenceAction === "flag"}
                        onChange={() => setDifferenceAction("flag")}
                      />
                      <span className="text-sm">Flag for investigation</span>
                    </label>
                  </div>
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
                  actualQty: 0,
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
                  actualQty,
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
