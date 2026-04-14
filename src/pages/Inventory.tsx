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
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Import inventory hooks
import {
  useWarehouseStock,
  useStaffStock,
  useStockTransfer,
  useStockHistory,
  useVendorBalance,
} from "@/hooks/inventory";

// Import inventory components
import {
  InventorySummaryCards,
  WarehouseStockView,
  StaffStockView,
  StockTransferModal,
  StockAdjustmentModal,
  StockHistoryView,
  RawMaterialInventoryView,
} from "@/components/inventory";

// Import existing hooks for raw materials
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type InventoryTab = "my-stock" | "warehouse" | "products" | "raw-materials" | "history";

const Inventory = () => {
  const { user, role } = useAuth();
  const { currentWarehouse, allWarehouses, assignedWarehouseId } = useWarehouse();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isPos = role === "pos";
  const isInventoryViewer = isSuperAdmin || isManager || isPos;
  const canAdjustStock = isSuperAdmin || isManager;
  const canReviewReturns = isSuperAdmin || isManager;
  const allowedTransferTypes = useMemo(() => {
    if (isSuperAdmin) {
      return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff"];
    }
    if (isManager) {
      return ["warehouse_to_staff", "staff_to_staff"];
    }
    if (isPos) {
      return ["warehouse_to_staff"];
    }
    return [] as string[];
  }, [isSuperAdmin, isManager, isPos]);
  const canTransferStock = allowedTransferTypes.length > 0;

  // Role-based tab visibility
  const visibleTabs = useMemo(() => {
    if (!isInventoryViewer) {
      return [] as InventoryTab[];
    }

    const tabs: InventoryTab[] = ["warehouse", "products", "history"];
    if (isSuperAdmin || isManager) {
      tabs.push("raw-materials");
    }
    return tabs;
  }, [isInventoryViewer, isManager, isSuperAdmin]);

  const [activeTab, setActiveTab] = useState<InventoryTab>("warehouse");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  // Modals state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [preselectedProduct, setPreselectedProduct] = useState<any>(null);
  const [preselectedStaff, setPreselectedStaff] = useState<any>(null);
  const [selectedPendingReturn, setSelectedPendingReturn] = useState<any>(null);
  const [actualQuantity, setActualQuantity] = useState("");
  const [differenceAction, setDifferenceAction] = useState<"keep" | "flag">("keep");
  const [reviewNotes, setReviewNotes] = useState("");

  // Data fetching
  const scopedWarehouseId = selectedWarehouseId || undefined;
  const { 
    warehouses, 
    products, 
    stats: warehouseStats, 
    isLoading: isLoadingWarehouse,
    updateStock,
  } = useWarehouseStock({ 
    warehouseId: scopedWarehouseId,
    enabled: ["warehouse", "products", "history"].includes(activeTab),
  });

  const {
    staffStock,
    summary: staffSummary,
    isLoading: isLoadingStaffStock,
  } = useStaffStock({
    warehouseId: scopedWarehouseId,
    enabled: ["warehouse", "products"].includes(activeTab),
  });

  const {
    createTransfer,
  } = useStockTransfer({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "history" || canTransferStock,
  });

  const {
    movements: stockMovements,
    isLoading: isLoadingHistory,
  } = useStockHistory({
    warehouseId: scopedWarehouseId,
    enabled: activeTab === "history",
    limit: 100,
  });

  const {
    vendors,
    isLoading: isLoadingVendors,
  } = useVendorBalance({
    enabled: activeTab === "raw-materials",
  });

  const { data: pendingReturns, isLoading: isLoadingPendingReturns } = useQuery({
    queryKey: ["inventory-pending-returns", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId || !canReviewReturns) return [];

    const selectClause = `
      id,
      display_id,
      quantity,
      description,
      created_at,
      from_user_id,
      to_warehouse_id,
      product:products!stock_transfers_product_id_fkey(id, name, sku, unit),
      staff:profiles!stock_transfers_from_user_id_profiles_fkey(id, full_name, avatar_url)
    `;

      const { data, error } = await supabase
        .from("stock_transfers")
        .select(selectClause)
        .eq("transfer_type", "staff_to_warehouse")
        .eq("status", "pending")
        .eq("to_warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWarehouseId && canReviewReturns,
  });

  // Fetch raw materials
  const { data: rawMaterials, isLoading: isLoadingRawMaterials } = useQuery({
    queryKey: ["raw-materials-inventory", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      
      const { data: materials } = await supabase
        .from("raw_materials")
        .select(`
          id, display_id, name, unit, category, 
          min_stock_level, current_stock, unit_cost, image_url, 
          is_active, vendor_id,
          vendor:vendors(id, name, current_balance, total_purchases, total_payments, last_purchase_at)
        `)
        .eq("is_active", true)
        .order("name");

      if (!materials) return [];

      // Get per-warehouse stock
      const { data: stocks } = await supabase
        .from("raw_material_stock")
        .select("raw_material_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);

      const stockMap = new Map(stocks?.map(s => [s.raw_material_id, s.quantity]) || []);

      return materials.map(m => ({
        ...m,
        current_stock: stockMap.get(m.id) || 0,
      }));
    },
    enabled: activeTab === "raw-materials" && !!selectedWarehouseId,
  });

  useEffect(() => {
    if (!isInventoryViewer || selectedWarehouseId) return;

    const fallbackWarehouseId =
      (isSuperAdmin
        ? allWarehouses[0]?.id || warehouses?.[0]?.id
        : assignedWarehouseId || currentWarehouse?.id || warehouses?.[0]?.id) || "";

    if (fallbackWarehouseId) {
      setSelectedWarehouseId(fallbackWarehouseId);
    }
  }, [
    isInventoryViewer,
    selectedWarehouseId,
    isSuperAdmin,
    allWarehouses,
    warehouses,
    assignedWarehouseId,
    currentWarehouse?.id,
  ]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  // Group staff stock by user
  const staffStockByUser = useMemo(() => {
    if (!staffStock) return [];
    const staffSummaryMap = new Map(
      (staffSummary || []).map((s) => [
        s.user_id,
        {
          full_name: s.full_name,
          email: s.email,
          avatar_url: s.avatar_url,
          role: s.user_role,
        },
      ])
    );
    
    const map = new Map<string, { 
      user_id: string;
      full_name?: string;
      email?: string;
      avatar_url?: string;
      role?: string;
      items: typeof staffStock; 
      totalValue: number;
      totalQuantity: number;
      negativeItems: number;
      lastActivity?: string;
    }>();
    
    staffStock.forEach((row: any) => {
      const uid = row.user_id;
      if (!map.has(uid)) {
        const summaryProfile = staffSummaryMap.get(uid);
        map.set(uid, { 
          user_id: uid,
          full_name: summaryProfile?.full_name,
          email: summaryProfile?.email,
          avatar_url: summaryProfile?.avatar_url,
          role: summaryProfile?.role,
          items: [], 
          totalValue: 0,
          totalQuantity: 0,
          negativeItems: 0,
          lastActivity: undefined,
        });
      }
      const entry = map.get(uid)!;
      entry.items.push(row);
      entry.totalValue += (row.quantity || 0) * Number(row.product?.base_price || 0);
      entry.totalQuantity += row.quantity || 0;
      if (row.is_negative) entry.negativeItems++;
      
      // Track last activity
      const activityDate = row.last_sale_at || row.last_received_at;
      if (activityDate && (!entry.lastActivity || activityDate > entry.lastActivity)) {
        entry.lastActivity = activityDate;
      }
    });
    
    return Array.from(map.values()).sort((a, b) => 
      (a.full_name || "").localeCompare(b.full_name || "")
    );
  }, [staffStock, staffSummary]);

  // Handle warehouse change
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    if (!isSuperAdmin && warehouseId !== (assignedWarehouseId || currentWarehouse?.id)) {
      return;
    }
    setSelectedWarehouseId(warehouseId);
  }, [isSuperAdmin, assignedWarehouseId, currentWarehouse?.id]);

  // Handle stock transfer
  const handleTransfer = useCallback(async (transferData: any) => {
    await createTransfer.mutateAsync(transferData);
    setShowTransferModal(false);
    setPreselectedProduct(null);
    setPreselectedStaff(null);
  }, [createTransfer]);

  // Handle stock adjustment
  const handleAdjust = useCallback(async (adjustData: any) => {
    await updateStock.mutateAsync({
      productId: adjustData.productId,
      warehouseId: selectedWarehouseId,
      quantity: adjustData.quantity,
      type: adjustData.adjustmentType,
      reason: adjustData.reason,
    });
    setShowAdjustmentModal(false);
    setPreselectedProduct(null);
  }, [updateStock, selectedWarehouseId]);

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
      action: "keep" | "flag";
      notes: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const difference = Math.max(requestedQuantity - actualQty, 0);
      const { data, error } = await supabase.rpc("process_stock_return", {
        p_transfer_id: transferId,
        p_actual_quantity: actualQty,
        p_difference: difference,
        p_action: action,
        p_notes: notes || "",
        p_reviewed_by: user.id,
        p_approved: approved,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      setSelectedPendingReturn(null);
      setActualQuantity("");
      setReviewNotes("");
      setDifferenceAction("keep");
      toast.success("Return processed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to process return");
    },
  });

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    return {
      totalProducts: products?.length || 0,
      totalStockValue: warehouseStats?.totalStockValue || 0,
      lowStockProducts: warehouseStats?.lowStockProducts || 0,
      negativeStockItems: staffSummary?.reduce((sum, s) => sum + s.negative_products, 0) || 0,
      totalStaffHolding: staffStock?.length || 0,
      staffHoldingValue: staffSummary?.reduce((sum, s) => sum + s.total_value, 0) || 0,
      warehouseStockValue: warehouseStats?.totalStockValue || 0,
    };
  }, [products, warehouseStats, staffSummary, staffStock]);

  // Loading state
  const isLoading = isLoadingWarehouse || isLoadingStaffStock || isLoadingHistory || isLoadingVendors || isLoadingRawMaterials;

  const warehouseOptions = useMemo(() => {
    if (isSuperAdmin) return warehouses || allWarehouses || [];
    const allowedId = assignedWarehouseId || currentWarehouse?.id;
    if (!allowedId) return [];
    return (warehouses || allWarehouses || []).filter((w) => w.id === allowedId);
  }, [isSuperAdmin, warehouses, allWarehouses, assignedWarehouseId, currentWarehouse?.id]);

  if (!isInventoryViewer) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Inventory Management"
          subtitle="You don't have access to inventory management."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title="Inventory Management" 
          subtitle="Manage products, staff stock, and raw materials"
        />
        <div className="flex items-center gap-2">
          {canTransferStock && (
            <Button
              variant="outline"
              onClick={() => setShowTransferModal(true)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer Stock
            </Button>
          )}
          {canAdjustStock && (
            <Button
              onClick={() => setShowAdjustmentModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adjust Stock
            </Button>
          )}
        </div>
      </div>

      {/* Warehouse Selector */}
      {warehouseOptions && warehouseOptions.length > 0 && (
        <div className="flex items-center gap-3">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedWarehouseId} onValueChange={handleWarehouseChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouseOptions.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!isSuperAdmin && !selectedWarehouseId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No warehouse is assigned to this account. Contact your administrator to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards - Only for managers/admins */}
      {(isSuperAdmin || isManager) && (
        <InventorySummaryCards 
          summary={summaryStats}
          isLoading={isLoading}
          warehouseName={warehouses?.find(w => w.id === selectedWarehouseId)?.name}
        />
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <TabsList className="mb-6">

          {/* Warehouse Tab */}
          {visibleTabs.includes("warehouse") && (
            <TabsTrigger value="warehouse" className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Warehouse
            </TabsTrigger>
          )}

          {/* Products Tab */}
          {visibleTabs.includes("products") && (
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products
            </TabsTrigger>
          )}

          {/* Raw Materials Tab */}
          {visibleTabs.includes("raw-materials") && (
            <TabsTrigger value="raw-materials" className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Raw Materials
            </TabsTrigger>
          )}

          {/* History Tab */}
          {visibleTabs.includes("history") && (
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          )}
        </TabsList>

        {/* Warehouse Tab Content */}
        {visibleTabs.includes("warehouse") && (
          <TabsContent value="warehouse" className="space-y-6">
            <WarehouseStockView
              warehouses={warehouseOptions}
              products={products}
              selectedWarehouseId={selectedWarehouseId}
              onWarehouseChange={handleWarehouseChange}
              isLoading={isLoadingWarehouse}
              canEdit={canAdjustStock}
              canAdjust={canAdjustStock}
              canTransfer={canTransferStock}
              onViewProduct={(product) => {
                setPreselectedProduct(product);
                if (canAdjustStock) {
                  setShowAdjustmentModal(true);
                } else if (canTransferStock) {
                  setShowTransferModal(true);
                }
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
          </TabsContent>
        )}

        {/* Products Tab Content */}
        {visibleTabs.includes("products") && (
          <TabsContent value="products" className="space-y-6">
            <WarehouseStockView
              warehouses={warehouseOptions}
              products={products}
              selectedWarehouseId={selectedWarehouseId}
              onWarehouseChange={handleWarehouseChange}
              isLoading={isLoadingWarehouse}
              canEdit={canAdjustStock}
              canAdjust={canAdjustStock}
              canTransfer={canTransferStock}
              onViewProduct={(product) => {
                setPreselectedProduct(product);
                if (canAdjustStock) {
                  setShowAdjustmentModal(true);
                } else if (canTransferStock) {
                  setShowTransferModal(true);
                }
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
          </TabsContent>
        )}

        {/* Raw Materials Tab Content */}
        {visibleTabs.includes("raw-materials") && (
          <TabsContent value="raw-materials" className="space-y-6">
            <RawMaterialInventoryView
              materials={rawMaterials}
              vendors={vendors}
              isLoading={isLoadingRawMaterials || isLoadingVendors}
              canEdit={canAdjustStock}
              onViewMaterial={(material) => {
                toast.info(`Viewing ${material.name}`);
              }}
              onAdjustStock={(material, type) => {
                toast.info(`${type === "used" ? "Recording usage" : "Physical count"} for ${material.name}`);
              }}
              onViewVendor={(vendor) => {
                toast.info(`Viewing vendor: ${vendor.name}`);
              }}
            />
          </TabsContent>
        )}

        {/* History Tab Content */}
        {visibleTabs.includes("history") && (
          <TabsContent value="history" className="space-y-6">
            <StockHistoryView
              movements={stockMovements}
              isLoading={isLoadingHistory}
              products={products?.map(p => ({ id: p.id, name: p.name }))}
              warehouses={warehouseOptions}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Staff Stock Section - For managers/super_admins */}
      {(isSuperAdmin || isManager) && staffStockByUser.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Stock Holdings
            <Badge variant="secondary">{staffStockByUser.length}</Badge>
          </h2>
          <StaffStockView
            staffStock={staffStockByUser}
            isLoading={isLoadingStaffStock}
            onViewDetails={(staff) => {
              toast.info(`Viewing details for ${staff.full_name || "staff member"}`);
            }}
              onTransfer={(staff) => {
                if (!canTransferStock) return;
                setPreselectedStaff(staff);
                setShowTransferModal(true);
              }}
          />
        </div>
      )}

      {canReviewReturns && (
        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Pending Returns
            <Badge variant="secondary">{pendingReturns?.length || 0}</Badge>
          </h2>

          {isLoadingPendingReturns ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Loading pending returns...
              </CardContent>
            </Card>
          ) : !pendingReturns || pendingReturns.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No pending returns.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingReturns.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {item.display_id} - {item.product?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        From {item.staff?.full_name || "Unknown staff"} • {item.quantity}{" "}
                        {item.product?.unit || "units"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedPendingReturn(item);
                        setActualQuantity(String(item.quantity));
                        setDifferenceAction("keep");
                        setReviewNotes("");
                      }}
                    >
                      Review
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {canTransferStock && (
        <StockTransferModal
          open={showTransferModal}
          onOpenChange={setShowTransferModal}
          warehouses={warehouses || []}
          staffMembers={staffSummary?.map(s => ({
            id: s.user_id,
            full_name: s.full_name || "Unknown",
            email: s.email || "",
            role: s.user_role || "staff",
            avatar_url: s.avatar_url,
            warehouse_id: s.warehouse_id,
          })) || []}
          products={products || []}
          currentUserId={user?.id || ""}
          currentWarehouseId={selectedWarehouseId}
          onTransfer={handleTransfer}
          preselectedProduct={preselectedProduct}
          preselectedStaff={preselectedStaff}
          allowedTransferTypes={allowedTransferTypes}
        />
      )}

      {canAdjustStock && (
        <StockAdjustmentModal
          open={showAdjustmentModal}
          onOpenChange={setShowAdjustmentModal}
          products={products || []}
          warehouseName={warehouses?.find(w => w.id === selectedWarehouseId)?.name}
          onAdjust={handleAdjust}
          preselectedProduct={preselectedProduct}
        />
      )}

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
                  Requested: <span className="font-medium">{selectedPendingReturn.quantity}</span>{" "}
                  {selectedPendingReturn.product?.unit || "units"}
                </p>
                <p>
                  Staff: <span className="font-medium">{selectedPendingReturn.staff?.full_name || "Unknown"}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="actual-qty">Actual Quantity Received</Label>
                <Input
                  id="actual-qty"
                  type="number"
                  min={0}
                  max={selectedPendingReturn.quantity}
                  value={actualQuantity}
                  onChange={(e) => setActualQuantity(e.target.value)}
                />
              </div>

              {Math.max(
                Number(selectedPendingReturn.quantity) - Number(actualQuantity || 0),
                0
              ) > 0 && (
                <div className="space-y-2">
                  <Label>Handle Difference</Label>
                  <RadioGroup
                    value={differenceAction}
                    onValueChange={(value: "keep" | "flag") => setDifferenceAction(value)}
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep" id="diff-keep" />
                      <Label htmlFor="diff-keep">Keep with User</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="flag" id="diff-flag" />
                      <Label htmlFor="diff-flag">Flag as Error</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="review-notes">Notes</Label>
                <Textarea
                  id="review-notes"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPendingReturn(null);
                setActualQuantity("");
                setReviewNotes("");
                setDifferenceAction("keep");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedPendingReturn) return;
                processReturn.mutate({
                  transferId: selectedPendingReturn.id,
                  approved: false,
                  requestedQuantity: Number(selectedPendingReturn.quantity),
                  actualQty: 0,
                  action: "keep",
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
                const parsedActual = Number(actualQuantity);
                if (Number.isNaN(parsedActual) || parsedActual < 0) {
                  toast.error("Enter a valid actual quantity");
                  return;
                }
                if (parsedActual > Number(selectedPendingReturn.quantity)) {
                  toast.error("Actual quantity cannot exceed requested quantity");
                  return;
                }
                processReturn.mutate({
                  transferId: selectedPendingReturn.id,
                  approved: true,
                  requestedQuantity: Number(selectedPendingReturn.quantity),
                  actualQty: parsedActual,
                  action: differenceAction,
                  notes: reviewNotes,
                });
              }}
              disabled={processReturn.isPending}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
