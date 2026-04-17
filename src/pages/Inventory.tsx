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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
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

type InventoryTab = "stock" | "staff-holdings" | "raw-materials" | "history";

const Inventory = () => {
  const { user, role } = useAuth();
  const { currentWarehouse, allWarehouses, assignedWarehouseId } = useWarehouse();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ─── Role flags ──────────────────────────────────────────────────────────────
  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isPos = role === "pos";
  const isInventoryViewer = isSuperAdmin || isManager || isPos;
  const canAdjustStock = isSuperAdmin || isManager;
  const canReviewReturns = isSuperAdmin || isManager;
  const canSeeStaffHoldings = isSuperAdmin || isManager;

  const allowedTransferTypes = useMemo(() => {
    if (isSuperAdmin) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff"];
    if (isManager) return ["warehouse_to_staff", "staff_to_staff"];
    if (isPos) return ["warehouse_to_staff"];
    return [] as string[];
  }, [isSuperAdmin, isManager, isPos]);
  const canTransferStock = allowedTransferTypes.length > 0;

  // ─── Tab visibility ──────────────────────────────────────────────────────────
  const visibleTabs = useMemo<InventoryTab[]>(() => {
    if (!isInventoryViewer) return [];
    const tabs: InventoryTab[] = ["stock"];
    if (canSeeStaffHoldings) tabs.push("staff-holdings");
    if (isSuperAdmin || isManager) tabs.push("raw-materials");
    tabs.push("history");
    return tabs;
  }, [isInventoryViewer, canSeeStaffHoldings, isSuperAdmin, isManager]);

  // ─── State ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

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

  // ─── Data fetching ───────────────────────────────────────────────────────────
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

  // Correctly typed — now returns { staffGroups, staffSummary, isLoadingStock }
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

  // Pending returns (used inside History tab)
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

  // ─── Auto-select warehouse ────────────────────────────────────────────────────
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

  // ─── Enforce valid active tab ─────────────────────────────────────────────────
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0]);
  }, [visibleTabs, activeTab]);

  // ─── Per-product staff holdings map (for warehouse stock cards) ───────────────
  const staffHoldingsByProduct = useMemo(() => {
    const map: Record<string, { user_id: string; full_name: string; quantity: number }[]> = {};
    for (const group of staffGroups) {
      for (const item of group.items) {
        if (!item.product_id || item.quantity <= 0) continue;
        if (!map[item.product_id]) map[item.product_id] = [];
        map[item.product_id].push({
          user_id: group.user_id,
          full_name: group.full_name,
          quantity: item.quantity,
        });
      }
    }
    return map;
  }, [staffGroups]);

  // ─── Summary stats ────────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => ({
    totalProducts: warehouseItems?.length ?? 0,
    totalStockValue: warehouseStats?.totalStockValue ?? 0,
    lowStockProducts: warehouseStats?.lowStockProducts ?? 0,
    negativeStockItems: staffSummary.reduce((sum, s) => sum + s.negative_products, 0),
    totalStaffHolding: staffGroups.length,
    staffHoldingValue: staffSummary.reduce((sum, s) => sum + s.total_value, 0),
    warehouseStockValue: warehouseStats?.totalStockValue ?? 0,
  }), [warehouseItems, warehouseStats, staffSummary, staffGroups]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    if (!isSuperAdmin && warehouseId !== (assignedWarehouseId ?? currentWarehouse?.id)) return;
    setSelectedWarehouseId(warehouseId);
  }, [isSuperAdmin, assignedWarehouseId, currentWarehouse?.id]);

  const handleRawAdjustSubmit = useCallback(async () => {
    if (!selectedWarehouseId || !selectedRawMaterial) {
      toast.error("Select a warehouse and raw material");
      return;
    }
    const quantity = Number(rawAdjustmentQuantity);
    if (Number.isNaN(quantity) || quantity < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (rawAdjustmentType === "used" && quantity === 0) {
      toast.error("Quantity used must be greater than 0");
      return;
    }
    await adjustRawMaterial.mutateAsync({
      rawMaterialId: selectedRawMaterial.id,
      warehouseId: selectedWarehouseId,
      adjustmentType: rawAdjustmentType,
      quantity,
      reason: rawAdjustmentReason || undefined,
    });
    setShowRawAdjustmentDialog(false);
    setSelectedRawMaterial(null);
    setRawAdjustmentQuantity("");
    setRawAdjustmentReason("");
    setRawAdjustmentType("used");
  }, [adjustRawMaterial, rawAdjustmentQuantity, rawAdjustmentReason, rawAdjustmentType, selectedRawMaterial, selectedWarehouseId]);

  const processReturn = useMutation({
    mutationFn: async ({
      transferId, approved, requestedQuantity, actualQty, action, notes,
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
      queryClient.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      setSelectedPendingReturn(null);
      setActualQuantity("");
      setReviewNotes("");
      setDifferenceAction("keep");
      toast.success("Return processed successfully");
    },
    onError: (error: any) => toast.error(error.message || "Failed to process return"),
  });

  // ─── Warehouse options ────────────────────────────────────────────────────────
  const warehouseOptions = useMemo(() => {
    if (isSuperAdmin) return warehouses ?? allWarehouses ?? [];
    const allowedId = assignedWarehouseId ?? currentWarehouse?.id;
    if (!allowedId) return [];
    return (warehouses ?? allWarehouses ?? []).filter((w) => w.id === allowedId);
  }, [isSuperAdmin, warehouses, allWarehouses, assignedWarehouseId, currentWarehouse?.id]);

  const isLoading = isLoadingWarehouse || isLoadingStaffStock;

  // ─── Access guard ─────────────────────────────────────────────────────────────
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

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Inventory Management"
          subtitle="Products, staff stock, transfers and history"
        />
        <div className="flex items-center gap-2">
          {canTransferStock && (
            <Button variant="outline" onClick={() => setShowTransferModal(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer Stock
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

      {/* ── Warehouse selector ── */}
      {warehouseOptions.length > 0 && (
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

      {/* ── Summary cards ── */}
      {(isSuperAdmin || isManager) && (
        <InventorySummaryCards
          summary={summaryStats}
          isLoading={isLoading}
          warehouseName={warehouses?.find((w) => w.id === selectedWarehouseId)?.name}
        />
      )}

      {/* ── Main tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <TabsList className="mb-6">
          {visibleTabs.includes("stock") && (
            <TabsTrigger value="stock" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock
            </TabsTrigger>
          )}

          {visibleTabs.includes("staff-holdings") && (
            <TabsTrigger value="staff-holdings" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Staff Holdings
              {staffGroups.length > 0 && (
                <Badge variant="secondary" className="ml-1">{staffGroups.length}</Badge>
              )}
            </TabsTrigger>
          )}

          {visibleTabs.includes("raw-materials") && (
            <TabsTrigger value="raw-materials" className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Raw Materials
            </TabsTrigger>
          )}

          {visibleTabs.includes("history") && (
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
              {(pendingReturns?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1">{pendingReturns!.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ──────────── Stock tab ──────────── */}
        {visibleTabs.includes("stock") && (
          <TabsContent value="stock" className="space-y-6">
            <WarehouseStockView
              warehouses={warehouseOptions}
              products={warehouseItems}
              selectedWarehouseId={selectedWarehouseId}
              staffHoldingsByProduct={staffHoldingsByProduct}
              onWarehouseChange={handleWarehouseChange}
              isLoading={isLoadingWarehouse}
              canEdit={canAdjustStock}
              canAdjust={canAdjustStock}
              canTransfer={canTransferStock}
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
          </TabsContent>
        )}

        {/* ──────────── Staff Holdings tab ──────────── */}
        {visibleTabs.includes("staff-holdings") && (
          <TabsContent value="staff-holdings" className="space-y-6">
            <StaffStockView
              staffStock={staffGroups}
              isLoading={isLoadingStaffStock}
              onViewDetails={(staff) => {
                toast.info(`Viewing details for ${staff.full_name ?? "staff member"}`);
              }}
              onTransfer={(staff) => {
                if (!canTransferStock) return;
                setShowTransferModal(true);
              }}
            />
          </TabsContent>
        )}

        {/* ──────────── Raw Materials tab ──────────── */}
        {visibleTabs.includes("raw-materials") && (
          <TabsContent value="raw-materials" className="space-y-6">
            <RawMaterialInventoryView
              materials={rawMaterials}
              adjustments={rawMaterialAdjustments as any[]}
              vendors={vendors}
              isLoading={isLoadingRawMaterials || isLoadingVendors}
              canEdit={canAdjustStock}
              onViewMaterial={(material) => setSelectedRawMaterial(material)}
              onAdjustStock={(material, type) => {
                if (!canAdjustStock) return;
                setSelectedRawMaterial(material);
                setRawAdjustmentType(type);
                setRawAdjustmentQuantity(type === "remaining" ? String(material.current_stock ?? 0) : "");
                setRawAdjustmentReason(type === "used" ? "Consumption" : "Physical count");
                setShowRawAdjustmentDialog(true);
              }}
              onViewVendor={(vendor) => navigate(`/inventory/vendors/${vendor.id}`)}
            />
          </TabsContent>
        )}

        {/* ──────────── History tab ──────────── */}
        {visibleTabs.includes("history") && (
          <TabsContent value="history" className="space-y-6">
            {/* Pending returns (only for manager/super_admin) */}
            {canReviewReturns && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Pending Returns
                  <Badge variant="secondary">{pendingReturns?.length ?? 0}</Badge>
                </h2>

                {isLoadingPendingReturns ? (
                  <div className="text-sm text-muted-foreground py-4">Loading…</div>
                ) : !pendingReturns || pendingReturns.length === 0 ? (
                  <div className="text-sm text-muted-foreground border border-dashed rounded-lg py-6 text-center">
                    No pending returns.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {pendingReturns.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">
                            {item.display_id} — {item.product?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            From {item.staff?.full_name ?? "Unknown"} • {item.quantity}{" "}
                            {item.product?.unit ?? "units"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPendingReturn(item);
                            setActualQuantity(String(item.quantity));
                            setDifferenceAction("keep");
                            setReviewNotes("");
                          }}
                        >
                          Review
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stock movements + transfers timeline */}
            <StockHistoryView warehouseId={scopedWarehouseId ?? ""} />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Modals ── */}
      {canTransferStock && selectedWarehouseId && (
        <StockTransferModal
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setPreselectedProduct(null);
          }}
          warehouseId={selectedWarehouseId}
          defaultProductId={preselectedProduct?.id}
          staffMembers={staffSummary ?? []}
        />
      )}

      {canAdjustStock && (
        <StockAdjustmentModal
          isOpen={showAdjustmentModal}
          onClose={() => {
            setShowAdjustmentModal(false);
            setPreselectedProduct(null);
          }}
          warehouseId={selectedWarehouseId}
          defaultProductId={preselectedProduct?.id}
        />
      )}

      {/* Raw-material adjustment dialog */}
      <Dialog
        open={showRawAdjustmentDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowRawAdjustmentDialog(false);
            setSelectedRawMaterial(null);
            setRawAdjustmentQuantity("");
            setRawAdjustmentReason("");
            setRawAdjustmentType("used");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Raw Material</DialogTitle>
            <DialogDescription>{selectedRawMaterial?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup
              value={rawAdjustmentType}
              onValueChange={(v) => setRawAdjustmentType(v as "used" | "remaining")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="used" id="type-used" />
                <Label htmlFor="type-used">Record Usage</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="remaining" id="type-remaining" />
                <Label htmlFor="type-remaining">Set Remaining</Label>
              </div>
            </RadioGroup>
            <div className="space-y-1">
              <Label>Quantity ({rawAdjustmentType === "used" ? "consumed" : "remaining"})</Label>
              <Input
                type="number"
                value={rawAdjustmentQuantity}
                onChange={(e) => setRawAdjustmentQuantity(e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                value={rawAdjustmentReason}
                onChange={(e) => setRawAdjustmentReason(e.target.value)}
                placeholder="Optional reason"
                className="h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRawAdjustmentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRawAdjustSubmit}
              disabled={adjustRawMaterial.isPending}
            >
              {adjustRawMaterial.isPending ? "Saving…" : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending-return review dialog */}
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
