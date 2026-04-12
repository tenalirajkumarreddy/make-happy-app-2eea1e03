import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import {
  Loader2,
  Package,
  Warehouse,
  Users,
  FlaskConical,
  History,
  Plus,
  ArrowRightLeft,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type InventoryTab = "my-stock" | "warehouse" | "products" | "raw-materials" | "history";

const Inventory = () => {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const canManageInventory = usePermission("inventory", "manage");
  const canTransferStock = usePermission("stock", "transfer");

  // Role-based tab visibility
  const visibleTabs = useMemo(() => {
    const tabs: InventoryTab[] = [];
    
    // Staff see their own stock
    if (["agent", "marketer", "pos"].includes(role || "")) {
      tabs.push("my-stock");
    }
    
    // Managers and admins see warehouse
    if (["super_admin", "manager"].includes(role || "")) {
      tabs.push("warehouse", "products", "raw-materials", "history");
    }
    
    // Staff with transfer permission
    if (canTransferStock && !tabs.includes("my-stock")) {
      tabs.unshift("my-stock");
    }
    
    return tabs;
  }, [role, canTransferStock]);

  const [activeTab, setActiveTab] = useState<InventoryTab>(visibleTabs[0] || "warehouse");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  // Modals state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [preselectedProduct, setPreselectedProduct] = useState<any>(null);
  const [preselectedStaff, setPreselectedStaff] = useState<any>(null);

  // Data fetching
  const { 
    warehouses, 
    products, 
    stats: warehouseStats, 
    isLoading: isLoadingWarehouse,
    updateStock,
  } = useWarehouseStock({ 
    warehouseId: selectedWarehouseId || undefined,
    enabled: ["warehouse", "products", "history"].includes(activeTab),
  });

  const {
    staffStock,
    summary: staffSummary,
    isLoading: isLoadingStaffStock,
  } = useStaffStock({
    warehouseId: selectedWarehouseId || undefined,
    enabled: ["my-stock", "warehouse"].includes(activeTab),
  });

  const {
    transfers,
    isLoading: isLoadingTransfers,
    createTransfer,
  } = useStockTransfer({
    warehouseId: selectedWarehouseId || undefined,
    enabled: activeTab === "history" || canTransferStock,
  });

  const {
    movements: stockMovements,
    rawMaterialAdjustments,
    isLoading: isLoadingHistory,
  } = useStockHistory({
    warehouseId: selectedWarehouseId || undefined,
    enabled: activeTab === "history",
    limit: 100,
  });

  const {
    vendors,
    stats: vendorStats,
    isLoading: isLoadingVendors,
  } = useVendorBalance({
    enabled: activeTab === "raw-materials",
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

  // Set default warehouse
  useMemo(() => {
    if (warehouses?.length && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses, selectedWarehouseId]);

  // Group staff stock by user
  const staffStockByUser = useMemo(() => {
    if (!staffStock) return [];
    
    const map = new Map<string, { 
      user_id: string;
      profile: any; 
      items: typeof staffStock; 
      totalValue: number;
      totalQuantity: number;
      negativeItems: number;
      lastActivity?: string;
    }>();
    
    staffStock.forEach((row: any) => {
      const uid = row.user_id;
      if (!map.has(uid)) {
        map.set(uid, { 
          user_id: uid,
          profile: row.profile, 
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
      (a.profile?.full_name || "").localeCompare(b.profile?.full_name || "")
    );
  }, [staffStock]);

  // Current user's stock
  const myStock = useMemo(() => {
    return staffStock?.filter(item => item.user_id === user?.id) || [];
  }, [staffStock, user?.id]);

  // Handle warehouse change
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
  }, []);

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
          {canManageInventory && (
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
      {warehouses && warehouses.length > 0 && (
        <div className="flex items-center gap-3">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedWarehouseId} onValueChange={handleWarehouseChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary Cards - Only for managers/admins */}
      {["super_admin", "manager"].includes(role || "") && (
        <InventorySummaryCards 
          summary={summaryStats}
          isLoading={isLoading}
          warehouseName={warehouses?.find(w => w.id === selectedWarehouseId)?.name}
        />
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <TabsList className="mb-6">
          {/* My Stock Tab - For staff */}
          {visibleTabs.includes("my-stock") && (
            <TabsTrigger value="my-stock" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              My Stock
              {myStock.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {myStock.length}
                </Badge>
              )}
            </TabsTrigger>
          )}

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

        {/* My Stock Tab Content */}
        {visibleTabs.includes("my-stock") && (
          <TabsContent value="my-stock" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : myStock.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">No Stock Assigned</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  You don&apos;t have any stock assigned to you yet. Stock will appear here once transferred by a manager.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-6 border rounded-xl">
                    <p className="text-sm text-muted-foreground">Total Products</p>
                    <p className="text-2xl font-bold">{myStock.length}</p>
                  </div>
                  <div className="p-6 border rounded-xl">
                    <p className="text-sm text-muted-foreground">Total Quantity</p>
                    <p className="text-2xl font-bold">
                      {myStock.reduce((sum, item) => sum + item.quantity, 0)}
                    </p>
                  </div>
                  <div className="p-6 border rounded-xl">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">
                      ₹{myStock.reduce((sum, item) => sum + (item.amount_value || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {myStock.map((item) => (
                    <div key={item.id} className="p-4 border rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{item.product?.name}</p>
                          <p className="text-sm text-muted-foreground">{item.product?.sku}</p>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className={`text-xl font-bold ${
                              item.is_negative ? "text-red-600" : "text-emerald-600"
                            }`}>
                              {item.quantity}
                            </span>
                            <span className="text-sm text-muted-foreground">{item.product?.unit}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Value: ₹{(item.amount_value || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        )}

        {/* Warehouse Tab Content */}
        {visibleTabs.includes("warehouse") && (
          <TabsContent value="warehouse" className="space-y-6">
            <WarehouseStockView
              warehouses={warehouses}
              products={products}
              selectedWarehouseId={selectedWarehouseId}
              onWarehouseChange={handleWarehouseChange}
              isLoading={isLoadingWarehouse}
              canEdit={canManageInventory}
              onViewProduct={(product) => {
                setPreselectedProduct(product);
                setShowAdjustmentModal(true);
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
              warehouses={warehouses}
              products={products}
              selectedWarehouseId={selectedWarehouseId}
              onWarehouseChange={handleWarehouseChange}
              isLoading={isLoadingWarehouse}
              canEdit={canManageInventory}
              onViewProduct={(product) => {
                setPreselectedProduct(product);
                setShowAdjustmentModal(true);
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
              canEdit={canManageInventory}
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
              warehouses={warehouses}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Staff Stock Section - For managers/super_admins */}
      {["super_admin", "manager"].includes(role || "") && staffStockByUser.length > 0 && (
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
              toast.info(`Viewing details for ${staff.profile?.full_name || "staff member"}`);
            }}
            onTransfer={(staff) => {
              setPreselectedStaff(staff);
              setShowTransferModal(true);
            }}
          />
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
        />
      )}

      {canManageInventory && (
        <StockAdjustmentModal
          open={showAdjustmentModal}
          onOpenChange={setShowAdjustmentModal}
          products={products || []}
          warehouseName={warehouses?.find(w => w.id === selectedWarehouseId)?.name}
          onAdjust={handleAdjust}
          preselectedProduct={preselectedProduct}
        />
      )}
    </div>
  );
};

export default Inventory;
