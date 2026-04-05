import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2, Package, Plus, Minus, BoxSelect, ArrowUpRight, FlaskConical } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type MovementType = "purchase" | "sale" | "adjustment" | "return" | "transfer_in" | "transfer_out";
type RawMaterialAdjustType = "used" | "remaining";

const MOVEMENT_TYPES: Record<MovementType, string> = {
  purchase: "Purchase (In)",
  sale: "Sale (Out)",
  adjustment: "Correction (+/-)",
  return: "Return (In)",
  transfer_in: "Transfer (In)",
  transfer_out: "Transfer (Out)",
};

const RAW_MATERIAL_ADJUST_TYPES: Record<RawMaterialAdjustType, string> = {
  used: "Used (Consumption)",
  remaining: "Remaining (Physical Count)",
};

const Inventory = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const canEdit = ["super_admin", "manager", "pos"].includes(role || "");
  const [activeView, setActiveView] = useState<"products" | "raw-materials">("products");
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  const [adjustType, setAdjustType] = useState<MovementType>("adjustment");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Raw materials state
  const [showRawMaterialAdjust, setShowRawMaterialAdjust] = useState(false);
  const [adjustRawMaterial, setAdjustRawMaterial] = useState<any>(null);
  const [rawMaterialAdjustType, setRawMaterialAdjustType] = useState<RawMaterialAdjustType>("used");
  const [rawMaterialQty, setRawMaterialQty] = useState("");
  const [rawMaterialReason, setRawMaterialReason] = useState("");
  const [rawMaterialSearchTerm, setRawMaterialSearchTerm] = useState("");

  // Fetch Warehouses
  const { data: warehouses, isLoading: loadWh } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  // Set default warehouse - must be in useEffect to avoid state mutation during render
  useEffect(() => {
    if (warehouses?.length && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses, selectedWarehouseId]);

  // Fetch Inventory for selected warehouse
  const { data: inventory, isLoading: loadInv } = useQuery({
    queryKey: ["inventory", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      
      // We need products and their stock in this warehouse
      // Supabase join syntax: product_stock(quantity, warehouse_id)
      
      // Strategy: Fetch all products, then fetch stock for this warehouse
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, unit, category, image_url, base_price")
        .eq("is_active", true)
        .order("name");
        
      if (!products) return [];

      const { data: stocks } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);
      
      const stockMap = new Map(stocks?.map(s => [s.product_id, s.quantity]));

      return products.map(p => ({
        ...p,
        quantity: stockMap.get(p.id) || 0,
      }));
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Raw Materials for selected warehouse
  const { data: rawMaterials, isLoading: loadRawMaterials } = useQuery({
    queryKey: ["raw-materials-inventory", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      
      // Get raw materials with their stock in this warehouse
      const { data: materials, error: matError } = await supabase
        .from("raw_materials")
        .select("id, display_id, name, unit, category, min_stock_level, current_stock, unit_cost, image_url")
        .eq("is_active", true)
        .order("name");
        
      if (matError || !materials) return [];

      // Get per-warehouse stock
      const { data: stocks } = await supabase
        .from("raw_material_stock")
        .select("raw_material_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);
      
      const stockMap = new Map(stocks?.map(s => [s.raw_material_id, s.quantity]));

      return materials.map(m => ({
        ...m,
        warehouse_quantity: stockMap.get(m.id) || 0,
      }));
    },
    enabled: !!selectedWarehouseId,
  });

  // Filter raw materials based on search term
  const filteredRawMaterials = useMemo(() => {
    if (!rawMaterials) return [];
    if (!rawMaterialSearchTerm.trim()) return rawMaterials;
    const term = rawMaterialSearchTerm.toLowerCase();
    return rawMaterials.filter((item: any) =>
      item.name?.toLowerCase().includes(term) ||
      item.display_id?.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term)
    );
  }, [rawMaterials, rawMaterialSearchTerm]);

  // Filter inventory based on search term
  const filteredInventory = useMemo(() => {
    if (!inventory) return [];
    if (!searchTerm.trim()) return inventory;
    const term = searchTerm.toLowerCase();
    return inventory.filter((item: any) =>
      item.name?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term)
    );
  }, [inventory, searchTerm]);

  // Fetch Recent Movements
  const { data: productMovements } = useQuery({
    queryKey: ["stock-movements", selectedWarehouseId],
    queryFn: async () => {
        if (!selectedWarehouseId) return [];
        const { data } = await supabase
            .from("stock_movements")
            .select("id, product_id, warehouse_id, quantity, type, reason, reference_id, created_at, products(name, sku)")
            .eq("warehouse_id", selectedWarehouseId)
            .order("created_at", { ascending: false })
            .limit(50);
        return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  const { data: rawMaterialMovements } = useQuery({
    queryKey: ["raw-material-adjustments", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("raw_material_adjustments")
        .select("id, display_id, raw_material_id, warehouse_id, adjustment_type, quantity_before, quantity_change, quantity_after, reason, reference_id, created_at, raw_materials(name, display_id, unit)")
        .eq("warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId || !adjustProduct) return;
    setSaving(true);
    
    try {
        const qty = parseFloat(adjustQty);
        if (isNaN(qty) || qty === 0) throw new Error("Invalid quantity");

        // Calculate actual change based on type
        // For 'adjustment', we accept +/-. For others, we enforce sign logic?
        // Let's keep it simple: user inputs positive number, type determines sign
        
        let finalQty = qty;
        if (["sale", "transfer_out"].includes(adjustType)) {
            finalQty = -Math.abs(qty);
        } else if (["purchase", "return", "transfer_in"].includes(adjustType)) {
            finalQty = Math.abs(qty);
        }
        // 'adjustment' can be either, assume user entered correct sign or use UI toggle?
        // Let's make UI simple: Input always positive, Type determines direction
        
        // Actually for adjustment, allow negative input
        if (adjustType === "adjustment") {
            finalQty = qty; // User can type -5
        }

        // Call single RPC for atomic transaction
        const { error: stockError, data: result } = await supabase.rpc("record_stock_movement", {
            p_product_id: adjustProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: finalQty,
            p_type: adjustType,
            p_reason: adjustReason,
            p_user_id: user?.id
        });

        if (stockError) throw stockError;

        toast.success("Stock updated successfully");
        setShowAdjust(false);
        setAdjustQty("");
        setAdjustReason("");
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["stock-movements"] });
        logActivity(user!.id, `Adjusted stock for ${adjustProduct.name}`, "stock", adjustProduct.id);

    } catch (err: any) {
        toast.error(err.message);
    } finally {
        setSaving(false);
    }
  };

  // Handle raw material adjustment
  const handleRawMaterialAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId || !adjustRawMaterial) return;
    setSaving(true);
    
    try {
        const qty = parseFloat(rawMaterialQty);
        if (isNaN(qty) || qty < 0) throw new Error("Invalid quantity");

        const currentStock = adjustRawMaterial.warehouse_quantity || 0;
        let quantityChange: number;
        let quantityAfter: number;

        if (rawMaterialAdjustType === "used") {
            // "Used" reduces stock by the entered amount
            if (qty > currentStock) throw new Error(`Cannot use more than available stock (${currentStock})`);
            quantityChange = -qty;
            quantityAfter = currentStock - qty;
        } else {
            // "Remaining" sets stock to the entered value (physical count)
            quantityChange = qty - currentStock;
            quantityAfter = qty;
        }

        // Insert adjustment record
        const { error: adjError } = await supabase
            .from("raw_material_adjustments")
            .insert({
                raw_material_id: adjustRawMaterial.id,
                warehouse_id: selectedWarehouseId,
                adjustment_type: rawMaterialAdjustType,
                quantity_before: currentStock,
                quantity_change: quantityChange,
                quantity_after: quantityAfter,
                reason: rawMaterialReason || (rawMaterialAdjustType === "used" ? "Consumption" : "Physical count"),
                performed_by: user?.id,
            });

        if (adjError) throw adjError;

        // Update or insert stock record
        const { data: existingStock } = await supabase
            .from("raw_material_stock")
            .select("id")
            .eq("raw_material_id", adjustRawMaterial.id)
            .eq("warehouse_id", selectedWarehouseId)
            .single();

        if (existingStock) {
            await supabase
                .from("raw_material_stock")
                .update({ quantity: quantityAfter, updated_at: new Date().toISOString() })
                .eq("id", existingStock.id);
        } else {
            await supabase
                .from("raw_material_stock")
                .insert({
                    raw_material_id: adjustRawMaterial.id,
                    warehouse_id: selectedWarehouseId,
                    quantity: quantityAfter,
                });
        }

        toast.success(`Raw material ${rawMaterialAdjustType === "used" ? "consumption" : "count"} recorded`);
        setShowRawMaterialAdjust(false);
        setRawMaterialQty("");
        setRawMaterialReason("");
        qc.invalidateQueries({ queryKey: ["raw-materials-inventory"] });
        logActivity(user!.id, `Adjusted raw material: ${adjustRawMaterial.name} (${rawMaterialAdjustType})`, "raw_material", adjustRawMaterial.id);

    } catch (err: any) {
        toast.error(err.message);
    } finally {
        setSaving(false);
    }
  };

  const columns = [
    { header: "SKU", accessor: "sku", className: "w-[100px] font-mono text-xs" },
    { header: "Product", accessor: "name", className: "font-medium" },
    { header: "Category", accessor: "category" },
    { 
        header: "Stock", 
        accessor: (row: any) => (
            <div className={`font-bold ${row.quantity < 0 ? "text-red-500" : row.quantity === 0 ? "text-slate-400" : "text-green-600"}`}>
                {row.quantity} <span className="text-xs font-normal text-slate-500">{row.unit}</span>
            </div>
        ) 
    },
    {
        header: "Action",
        accessor: (row: any) => canEdit && (
            <Button variant="ghost" size="sm" onClick={() => {
                setAdjustProduct(row);
                setAdjustType("adjustment");
                setShowAdjust(true);
            }}>
                Adjust
            </Button>
        )
    }
  ];

  const productMovementColumns = [
      { header: "Date", accessor: (row: any) => format(new Date(row.created_at), "dd MMM HH:mm"), className: "text-xs text-slate-500" },
      { header: "Product", accessor: (row: any) => row.products?.name },
      { header: "Type", accessor: (row: any) => <Badge variant="outline">{row.type}</Badge> },
      { 
          header: "Qty", 
          accessor: (row: any) => (
             <span className={row.quantity > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                 {row.quantity > 0 ? "+" : ""}{row.quantity}
             </span>
          ) 
      },
      { header: "Reason", accessor: "reason", className: "text-xs block max-w-[200px] truncate" },
  ];

      const rawMaterialMovementColumns = [
        { header: "Date", accessor: (row: any) => format(new Date(row.created_at), "dd MMM HH:mm"), className: "text-xs text-slate-500" },
        { header: "Material", accessor: (row: any) => row.raw_materials?.name },
        { header: "Type", accessor: (row: any) => <Badge variant="outline">{row.adjustment_type}</Badge> },
        {
          header: "Change",
          accessor: (row: any) => (
           <span className={row.quantity_change > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
             {row.quantity_change > 0 ? "+" : ""}{row.quantity_change}
           </span>
          )
        },
        { header: "After", accessor: (row: any) => `${row.quantity_after} ${row.raw_materials?.unit || ""}`, className: "text-sm" },
        { header: "Reason", accessor: "reason", className: "text-xs block max-w-[200px] truncate" },
      ];

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Inventory Management" subtitle="Manage products and raw materials stock by warehouse" />
          <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:items-center gap-2">
                <BoxSelect className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Select Warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                        {warehouses?.map((w: any) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
          <Button variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => navigate(activeView === "products" ? "/products" : "/raw-materials")}>
            {activeView === "products" ? "Products" : "Raw Materials"}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
            </div>
        </div>

      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as "products" | "raw-materials") }>
            <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="raw-materials">Raw Materials</TabsTrigger>
            </TabsList>

        <TabsContent value="products" className="space-y-6">
                {loadInv ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin" /></div>
                ) : !isMobile ? (
                    /* Desktop: Card Grid */
                    <div className="space-y-4">
                      <Input 
                        placeholder="Search products..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                      />
                      <div className="entity-grid">
                        {filteredInventory.map((row: any) => {
                          const stockStatus = row.quantity < 0 ? "critical" : row.quantity === 0 ? "empty" : row.quantity < 10 ? "low" : "good";
                          const statusColors = {
                            critical: { badge: "bg-red-100 text-red-700", text: "text-red-600" },
                            empty: { badge: "bg-slate-100 text-slate-600", text: "text-slate-500" },
                            low: { badge: "bg-amber-100 text-amber-700", text: "text-amber-600" },
                            good: { badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600" },
                          };
                          const colors = statusColors[stockStatus];
                          
                          return (
                            <div
                              key={row.id}
                              className="group entity-card"
                            >
                              {/* Header */}
                              <div className="entity-card-header">
                                <div className="entity-card-icon-box">
                                  {row.image_url ? (
                                    <Avatar className="h-12 w-12 rounded-lg">
                                      <AvatarImage src={row.image_url} alt={row.name} className="object-cover" />
                                      <AvatarFallback className="rounded-lg bg-muted">
                                        <Package className={`h-6 w-6 ${colors.text}`} />
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <Package className={`h-8 w-8 ${colors.text}`} />
                                  )}
                                </div>
                                {/* Status Badge */}
                                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors.badge}`}>
                                  {stockStatus === "critical" ? "Critical" : stockStatus === "empty" ? "Out of Stock" : stockStatus === "low" ? "Low Stock" : "In Stock"}
                                </div>
                              </div>
                              
                              {/* Content */}
                              <div className="entity-card-content">
                                <div>
                                  <h3 className="entity-card-title">{row.name}</h3>
                                  <p className="entity-card-subtitle mt-0.5">{row.sku}</p>
                                </div>

                                {row.category && (
                                  <Badge variant="outline" className="text-xs font-normal">{row.category}</Badge>
                                )}

                                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</p>
                                    <p className="font-semibold">₹{Number(row.base_price || 0).toLocaleString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stock Value</p>
                                    <p className="font-semibold">₹{Number((row.quantity || 0) * Number(row.base_price || 0)).toLocaleString()}</p>
                                  </div>
                                </div>

                                {/* Stock display */}
                                <div className="bg-muted/50 rounded-xl p-3">
                                  <div className="flex items-center justify-between">
                                    <span className="entity-card-label">Current Stock</span>
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-2xl font-bold tracking-tight ${colors.text}`}>
                                      {row.quantity}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{row.unit}</span>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1 h-9 font-medium" onClick={() => navigate("/products")}>View Product <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button>
                                  {canEdit && (
                                    <Button 
                                      variant="default" 
                                      size="sm" 
                                      className="flex-1 h-9 font-medium"
                                      onClick={() => {
                                        setAdjustProduct(row);
                                        setAdjustType("adjustment");
                                        setShowAdjust(true);
                                      }}
                                    >
                                      <Plus className="h-4 w-4 mr-1.5" />
                                      Adjust Stock
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {filteredInventory.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          No products found.
                        </div>
                      )}

                      <div className="rounded-xl border bg-card p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">Products Stock Flow</h3>
                            <p className="text-sm text-muted-foreground">Recent product stock movements in the selected warehouse.</p>
                          </div>
                        </div>
                        <DataTable data={productMovements || []} columns={productMovementColumns} />
                      </div>
                    </div>
                ) : (
                    /* Mobile: DataTable with compact cards */
                    <div className="space-y-4">
                      <DataTable 
                          data={filteredInventory || []} 
                          columns={columns} 
                          searchKey="name"
                          searchPlaceholder="Search products..."
                          renderMobileCard={(row: any) => {
                          const stockStatus = row.quantity < 0 ? "critical" : row.quantity === 0 ? "empty" : row.quantity < 10 ? "low" : "good";
                          const statusColors = {
                            critical: { text: "text-red-600", pill: "bg-red-100 text-red-700" },
                            empty: { text: "text-slate-500", pill: "bg-slate-100 text-slate-700" },
                            low: { text: "text-amber-600", pill: "bg-amber-100 text-amber-700" },
                            good: { text: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
                          };
                          const colors = statusColors[stockStatus];
                          return (
                            <div className="rounded-2xl border bg-gradient-to-b from-card to-muted/20 p-3.5 shadow-sm">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="font-mono text-[11px] text-muted-foreground">{row.sku}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors.pill}`}>
                                  {stockStatus === "critical" ? "Critical" : stockStatus === "empty" ? "Out" : stockStatus === "low" ? "Low" : "In Stock"}
                                </span>
                              </div>
                              <p className="font-semibold text-sm truncate">{row.name}</p>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className={`font-bold text-base ${colors.text}`}>
                                  {row.quantity} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">current</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Price</p>
                                  <p className="font-semibold">₹{Number(row.base_price || 0).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-muted-foreground">Value</p>
                                  <p className="font-semibold">₹{Number((row.quantity || 0) * Number(row.base_price || 0)).toLocaleString()}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                                <span className="text-xs text-muted-foreground">{row.category || "—"}</span>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigate("/products"); }}>
                                    View
                                  </Button>
                                  {canEdit && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAdjustProduct(row);
                                        setAdjustType("adjustment");
                                        setShowAdjust(true);
                                      }}
                                    >
                                      Adjust
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />

                      <div className="rounded-xl border bg-card p-3">
                        <p className="text-sm font-semibold">Products Stock Flow</p>
                        <p className="text-xs text-muted-foreground mb-2">Latest product movements for selected warehouse.</p>
                        <div className="space-y-2">
                          {(productMovements || []).slice(0, 8).map((m: any) => (
                            <div key={m.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium truncate">{m.products?.name || "Product"}</p>
                                <p className={`text-xs font-bold ${Number(m.quantity) > 0 ? "text-emerald-600" : "text-red-600"}`}>{Number(m.quantity) > 0 ? "+" : ""}{m.quantity}</p>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="capitalize">{m.type}</span>
                                <span>{format(new Date(m.created_at), "dd MMM, hh:mm a")}</span>
                              </div>
                            </div>
                          ))}
                          {(productMovements || []).length === 0 && <p className="text-xs text-muted-foreground">No movements yet.</p>}
                        </div>
                      </div>
                    </div>
                )}
            </TabsContent>

            {/* Raw Materials Tab */}
            <TabsContent value="raw-materials" className="space-y-4">
                {loadRawMaterials ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin" /></div>
                ) : !isMobile ? (
                    /* Desktop: Card Grid for Raw Materials */
                    <div className="space-y-4">
                      <Input 
                        placeholder="Search raw materials..." 
                        value={rawMaterialSearchTerm}
                        onChange={(e) => setRawMaterialSearchTerm(e.target.value)}
                        className="max-w-sm"
                      />
                      <div className="entity-grid">
                        {filteredRawMaterials.map((row: any) => {
                          const minStock = row.min_stock_level || 0;
                          const stockStatus = row.warehouse_quantity < 0 ? "critical" 
                            : row.warehouse_quantity === 0 ? "empty" 
                            : row.warehouse_quantity <= minStock ? "low" 
                            : "good";
                          const statusColors = {
                            critical: { badge: "bg-red-100 text-red-700", text: "text-red-600" },
                            empty: { badge: "bg-slate-100 text-slate-600", text: "text-slate-500" },
                            low: { badge: "bg-amber-100 text-amber-700", text: "text-amber-600" },
                            good: { badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600" },
                          };
                          const colors = statusColors[stockStatus];
                          
                          return (
                            <div
                              key={row.id}
                              className="group entity-card"
                            >
                              {/* Header */}
                              <div className="entity-card-header">
                                <div className="entity-card-icon-box">
                                  {row.image_url ? (
                                    <Avatar className="h-12 w-12 rounded-lg">
                                      <AvatarImage src={row.image_url} alt={row.name} className="object-cover" />
                                      <AvatarFallback className="rounded-lg bg-muted">
                                        <FlaskConical className={`h-6 w-6 ${colors.text}`} />
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <FlaskConical className={`h-8 w-8 ${colors.text}`} />
                                  )}
                                </div>
                                {/* Status Badge */}
                                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors.badge}`}>
                                  {stockStatus === "critical" ? "Critical" : stockStatus === "empty" ? "Out of Stock" : stockStatus === "low" ? "Low Stock" : "In Stock"}
                                </div>
                              </div>
                              
                              {/* Content */}
                              <div className="entity-card-content">
                                <div>
                                  <h3 className="entity-card-title">{row.name}</h3>
                                  <p className="entity-card-subtitle mt-0.5">{row.display_id}</p>
                                </div>

                                {row.category && (
                                  <Badge variant="outline" className="text-xs font-normal">{row.category}</Badge>
                                )}

                                {/* Stock display */}
                                <div className="bg-muted/50 rounded-xl p-3">
                                  <div className="flex items-center justify-between">
                                    <span className="entity-card-label">Warehouse Stock</span>
                                    {minStock > 0 && (
                                      <span className="text-xs text-muted-foreground">Min: {minStock}</span>
                                    )}
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-2xl font-bold tracking-tight ${colors.text}`}>
                                      {row.warehouse_quantity}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{row.unit}</span>
                                  </div>
                                  {row.unit_cost > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Unit cost: ₹{row.unit_cost?.toFixed(2)}
                                    </p>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit Cost</p>
                                    <p className="font-semibold">₹{Number(row.unit_cost || 0).toLocaleString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stock Value</p>
                                    <p className="font-semibold">₹{Number((row.warehouse_quantity || 0) * Number(row.unit_cost || 0)).toLocaleString()}</p>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1 h-9 font-medium" onClick={() => navigate("/raw-materials")}>Raw Materials <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button>
                                  {canEdit && (
                                    <>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="flex-1 h-9 font-medium"
                                        onClick={() => {
                                          setAdjustRawMaterial(row);
                                          setRawMaterialAdjustType("used");
                                          setShowRawMaterialAdjust(true);
                                        }}
                                      >
                                        <Minus className="h-4 w-4 mr-1.5" />
                                        Used
                                      </Button>
                                      <Button 
                                        variant="default" 
                                        size="sm" 
                                        className="flex-1 h-9 font-medium"
                                        onClick={() => {
                                          setAdjustRawMaterial(row);
                                          setRawMaterialAdjustType("remaining");
                                          setShowRawMaterialAdjust(true);
                                        }}
                                      >
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        Remaining
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {filteredRawMaterials.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          No raw materials found. Add raw materials in the Purchases section.
                        </div>
                      )}

                      <div className="rounded-xl border bg-card p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">Raw Materials Stock Flow</h3>
                            <p className="text-sm text-muted-foreground">Recent raw material usage and count adjustments in the selected warehouse.</p>
                          </div>
                        </div>
                        <DataTable data={rawMaterialMovements || []} columns={rawMaterialMovementColumns} />
                      </div>
                    </div>
                ) : (
                    /* Mobile: DataTable for Raw Materials */
                    <div className="space-y-4">
                      <DataTable 
                        data={filteredRawMaterials || []} 
                        columns={[
                          { header: "ID", accessor: "display_id", className: "w-[80px] font-mono text-xs" },
                          { header: "Material", accessor: "name", className: "font-medium" },
                          { header: "Category", accessor: "category" },
                            { header: "Unit Cost", accessor: (row: any) => `₹${Number(row.unit_cost || 0).toLocaleString()}` },
                          { 
                              header: "Stock", 
                              accessor: (row: any) => (
                                  <div className={`font-bold ${row.warehouse_quantity < 0 ? "text-red-500" : row.warehouse_quantity === 0 ? "text-slate-400" : "text-green-600"}`}>
                                      {row.warehouse_quantity} <span className="text-xs font-normal text-slate-500">{row.unit}</span>
                                  </div>
                              ) 
                          },
                          {
                              header: "Action",
                              accessor: (row: any) => canEdit && (
                                <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate("/raw-materials")}>View</Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                                      setAdjustRawMaterial(row);
                                      setRawMaterialAdjustType("used");
                                      setShowRawMaterialAdjust(true);
                                  }}>
                                      Used
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                                      setAdjustRawMaterial(row);
                                      setRawMaterialAdjustType("remaining");
                                      setShowRawMaterialAdjust(true);
                                  }}>
                                      Count
                                  </Button>
                                </div>
                              )
                          }
                        ]} 
                        searchKey="name"
                        searchPlaceholder="Search raw materials..."
                        renderMobileCard={(row: any) => {
                          const minStock = Number(row.min_stock_level || 0);
                          const stockStatus = row.warehouse_quantity <= 0 ? "empty" : row.warehouse_quantity <= minStock ? "low" : "good";
                          const statusPill = stockStatus === "empty"
                            ? "bg-slate-100 text-slate-700"
                            : stockStatus === "low"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700";
                          return (
                            <div className="rounded-2xl border bg-gradient-to-b from-card to-muted/20 p-3.5 shadow-sm">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="font-mono text-[11px] text-muted-foreground">{row.display_id}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusPill}`}>
                                  {stockStatus === "empty" ? "Out" : stockStatus === "low" ? "Low" : "In Stock"}
                                </span>
                              </div>
                              <p className="font-semibold text-sm truncate">{row.name}</p>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="font-bold text-base text-foreground">{row.warehouse_quantity} {row.unit}</span>
                                <span className="text-xs text-muted-foreground">stock</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Unit Cost</p>
                                  <p className="font-semibold">₹{Number(row.unit_cost || 0).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-muted-foreground">Value</p>
                                  <p className="font-semibold">₹{Number((row.warehouse_quantity || 0) * Number(row.unit_cost || 0)).toLocaleString()}</p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                                <span className="text-xs text-muted-foreground">{row.category || "—"}</span>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigate("/raw-materials"); }}>
                                    View
                                  </Button>
                                  {canEdit && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => {
                                      e.stopPropagation();
                                      setAdjustRawMaterial(row);
                                      setRawMaterialAdjustType("remaining");
                                      setShowRawMaterialAdjust(true);
                                    }}>
                                      Adjust
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />

                      <div className="rounded-xl border bg-card p-3">
                        <p className="text-sm font-semibold">Raw Materials Stock Flow</p>
                        <p className="text-xs text-muted-foreground mb-2">Latest usage/count adjustments for selected warehouse.</p>
                        <div className="space-y-2">
                          {(rawMaterialMovements || []).slice(0, 8).map((m: any) => (
                            <div key={m.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium truncate">{m.raw_materials?.name || "Material"}</p>
                                <p className={`text-xs font-bold ${Number(m.quantity_change) > 0 ? "text-emerald-600" : "text-red-600"}`}>{Number(m.quantity_change) > 0 ? "+" : ""}{m.quantity_change}</p>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="capitalize">{m.adjustment_type}</span>
                                <span>{format(new Date(m.created_at), "dd MMM, hh:mm a")}</span>
                              </div>
                            </div>
                          ))}
                          {(rawMaterialMovements || []).length === 0 && <p className="text-xs text-muted-foreground">No movements yet.</p>}
                        </div>
                      </div>
                    </div>
                )}
            </TabsContent>
        </Tabs>

        <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Adjust Stock for {adjustProduct?.name}</DialogTitle>
                    <DialogDescription>
                        Record a stock movement. Current stock: {adjustProduct?.quantity} {adjustProduct?.unit}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdjust} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Movement Type</Label>
                        <Select value={adjustType} onValueChange={(v) => setAdjustType(v as MovementType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(MOVEMENT_TYPES).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Quantity ({adjustProduct?.unit})</Label>
                        <Input 
                            type="number" 
                            step="0.01"
                            placeholder="0.00" 
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(e.target.value)}
                            required
                        />
                         <p className="text-xs text-muted-foreground">
                            {adjustType === "adjustment" ? "Use negative for reduction." : "Enter positive value, system will apply sign."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Reason / Note</Label>
                        <Textarea 
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            placeholder="e.g. Broken stock, Received shipment #123"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Adjustment
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        {/* Raw Material Adjustment Dialog */}
        <Dialog open={showRawMaterialAdjust} onOpenChange={setShowRawMaterialAdjust}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {rawMaterialAdjustType === "used" ? "Record Usage" : "Physical Count"} - {adjustRawMaterial?.name}
                    </DialogTitle>
                    <DialogDescription>
                        {rawMaterialAdjustType === "used" 
                            ? `Record how much was consumed. Current stock: ${adjustRawMaterial?.warehouse_quantity || 0} ${adjustRawMaterial?.unit}`
                            : `Enter the actual remaining quantity. Current stock: ${adjustRawMaterial?.warehouse_quantity || 0} ${adjustRawMaterial?.unit}`
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRawMaterialAdjust} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Adjustment Type</Label>
                        <Select value={rawMaterialAdjustType} onValueChange={(v) => setRawMaterialAdjustType(v as RawMaterialAdjustType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(RAW_MATERIAL_ADJUST_TYPES).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            {rawMaterialAdjustType === "used" ? "Quantity Used" : "Remaining Quantity"} ({adjustRawMaterial?.unit})
                        </Label>
                        <Input 
                            type="number" 
                            step="0.01"
                            min="0"
                            placeholder="0.00" 
                            value={rawMaterialQty}
                            onChange={(e) => setRawMaterialQty(e.target.value)}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            {rawMaterialAdjustType === "used" 
                                ? "This amount will be deducted from stock."
                                : "Stock will be set to this value. Difference = consumption."
                            }
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Reason / Note (optional)</Label>
                        <Textarea 
                            value={rawMaterialReason}
                            onChange={(e) => setRawMaterialReason(e.target.value)}
                            placeholder={rawMaterialAdjustType === "used" 
                                ? "e.g. Used for batch #123, Daily production"
                                : "e.g. Physical count, Stock audit"
                            }
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setShowRawMaterialAdjust(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {rawMaterialAdjustType === "used" ? "Record Usage" : "Update Count"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default Inventory;