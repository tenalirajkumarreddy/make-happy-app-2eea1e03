import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Package, Pencil, X, Save, AlertTriangle, Grid3X3, Download, Tags, CheckSquare,
  DollarSign, Box, ArrowRightLeft, Plus, Minus, RefreshCw, Users, Warehouse,
  CheckCircle, XCircle, Loader2, Search, Filter
} from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ProductAccessMatrix } from "@/components/products/ProductAccessMatrix";
import { ProductCategories } from "@/components/products/ProductCategories";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { NoticeBox } from "@/components/shared/NoticeBox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type StockOperation = "purchase" | "sale" | "transfer" | "return" | "adjustment";
type TransferDirection = "warehouse_to_staff" | "staff_to_warehouse" | "staff_to_staff";

interface StockHolder {
  user_id: string;
  full_name: string;
  quantity: number;
  role: string;
}

interface ProductWithStock {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category?: string;
  base_price: number;
  image_url?: string;
  is_active: boolean;
  hsn_code?: string;
  gst_rate?: number;
  description?: string;
  warehouse_quantity: number;
  staff_holdings: StockHolder[];
  total_quantity: number;
}

const Products = () => {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "manager";
  const canAdjustStock = canEdit || role === "pos" || role === "agent";
  const isAdmin = role === "super_admin";

  const [showAdd, setShowAdd] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);
  const [showReturnReview, setShowReturnReview] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);

  // Form states
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  // Stock operation states
  const [stockOperation, setStockOperation] = useState<StockOperation>("purchase");
  const [transferDirection, setTransferDirection] = useState<TransferDirection>("warehouse_to_staff");
  const [stockQty, setStockQty] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [returnActualQty, setReturnActualQty] = useState("");
  const [returnAction, setReturnAction] = useState<"keep" | "flag">("keep");
  const [returnNotes, setReturnNotes] = useState("");

  // Fetch Warehouses
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  // Set default warehouse
  if (warehouses?.length && !selectedWarehouseId) {
    setSelectedWarehouseId(warehouses[0].id);
  }

  // Fetch Products
  const { data: products, isLoading: loadProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch Warehouse Stock
  const { data: warehouseStock } = useQuery({
    queryKey: ["warehouse-stock", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Staff Stock with Profiles
  const { data: staffStock } = useQuery({
    queryKey: ["staff-stock-all", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`
          id,
          user_id,
          product_id,
          quantity,
          profile:profiles(id, full_name, user_roles(role))
        `)
        .eq("warehouse_id", selectedWarehouseId)
        .gt("quantity", 0);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Staff Members
  const { data: staffMembers } = useQuery({
    queryKey: ["staff-members", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role, profile:profiles(id, full_name, avatar_url)")
        .eq("warehouse_id", selectedWarehouseId)
        .in("role", ["agent", "marketer", "pos"]);
      return data?.map((s: any) => ({
        id: s.user_id,
        full_name: s.profile?.full_name || "Unknown",
        avatar_url: s.profile?.avatar_url,
        role: s.role,
      })) || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Stock Movements
  const { data: stockMovements } = useQuery({
    queryKey: ["stock-movements", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .eq("warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Pending Returns
  const { data: pendingReturns } = useQuery({
    queryKey: ["pending-returns", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("stock_transfers")
        .select(`
          *,
          product:products(id, name, sku, unit),
          from_user:profiles!stock_transfers_from_user_id_fkey(id, full_name, avatar_url)
        `)
        .eq("transfer_type", "staff_to_warehouse")
        .eq("from_warehouse_id", selectedWarehouseId)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Categories
  const { data: categoryList } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Build products with stock
  const productsWithStock = useMemo((): ProductWithStock[] => {
    if (!products) return [];

    const warehouseStockMap = new Map(warehouseStock?.map((s: any) => [s.product_id, s.quantity]) || []);
    const staffStockMap = new Map<string, StockHolder[]>();

    staffStock?.forEach((item: any) => {
      const existing = staffStockMap.get(item.product_id) || [];
      existing.push({
        user_id: item.user_id,
        full_name: item.profile?.full_name || "Unknown",
        quantity: item.quantity,
        role: item.profile?.user_roles?.[0]?.role || "staff",
      });
      staffStockMap.set(item.product_id, existing);
    });

    return products.map((product: any) => {
      const warehouseQty = warehouseStockMap.get(product.id) || 0;
      const staffHoldings = staffStockMap.get(product.id) || [];
      const staffQty = staffHoldings.reduce((sum, h) => sum + h.quantity, 0);

      return {
        ...product,
        warehouse_quantity: warehouseQty,
        staff_holdings: staffHoldings,
        total_quantity: warehouseQty + staffQty,
      };
    });
  }, [products, warehouseStock, staffStock]);

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!productsWithStock) return [];
    if (!searchTerm.trim()) return productsWithStock;
    const term = searchTerm.toLowerCase();
    return productsWithStock.filter((p) =>
      p.name?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.category?.toLowerCase().includes(term)
    );
  }, [productsWithStock, searchTerm]);

  const handleStockOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !stockQty) return;

    const qty = parseFloat(stockQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Invalid quantity");
      return;
    }

    setSaving(true);
    try {
      switch (stockOperation) {
        case "purchase":
          await supabase.rpc("record_stock_movement", {
            p_product_id: selectedProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: qty,
            p_type: "purchase",
            p_reason: stockReason,
            p_user_id: user?.id,
          });
          toast.success("Stock purchased successfully");
          break;

        case "sale":
          await supabase.rpc("record_stock_movement", {
            p_product_id: selectedProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: -qty,
            p_type: "sale",
            p_reason: stockReason,
            p_user_id: user?.id,
          });
          toast.success("Sale recorded successfully");
          break;

        case "adjustment":
          await supabase.rpc("record_stock_movement", {
            p_product_id: selectedProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: qty,
            p_type: "adjustment",
            p_reason: stockReason,
            p_user_id: user?.id,
          });
          toast.success("Stock adjusted successfully");
          break;

        case "transfer":
          // Validate permissions
          if (transferDirection === "staff_to_warehouse" && !isAdmin) {
            toast.error("Only admin can transfer from staff to warehouse");
            return;
          }

          await supabase.rpc("record_stock_transfer", {
            p_transfer_type: transferDirection,
            p_from_warehouse_id: selectedWarehouseId,
            p_from_user_id: transferDirection === "warehouse_to_staff" ? null : fromUserId,
            p_to_warehouse_id: selectedWarehouseId,
            p_to_user_id: transferDirection === "staff_to_warehouse" ? null : toUserId,
            p_product_id: selectedProduct.id,
            p_quantity: qty,
            p_reason: stockReason,
            p_created_by: user?.id,
          });
          toast.success("Stock transfer initiated");
          break;
      }

      setShowStockModal(false);
      resetStockForm();
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-all"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["pending-returns"] });
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReturnReview = async (approved: boolean) => {
    if (!selectedReturn) return;

    const actualQty = parseFloat(returnActualQty) || selectedReturn.quantity;
    const difference = selectedReturn.quantity - actualQty;

    setSaving(true);
    try {
      await supabase.rpc("process_stock_return", {
        p_transfer_id: selectedReturn.id,
        p_actual_quantity: actualQty,
        p_difference: difference,
        p_action: returnAction,
        p_notes: returnNotes,
        p_reviewed_by: user?.id,
        p_approved: approved,
      });

      toast.success(approved ? "Return approved" : "Return rejected");
      setShowReturnReview(false);
      resetReturnForm();
      qc.invalidateQueries({ queryKey: ["pending-returns"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-all"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetStockForm = () => {
    setStockOperation("purchase");
    setTransferDirection("warehouse_to_staff");
    setStockQty("");
    setStockReason("");
    setFromUserId("");
    setToUserId("");
  };

  const resetReturnForm = () => {
    setSelectedReturn(null);
    setReturnActualQty("");
    setReturnAction("keep");
    setReturnNotes("");
  };

  const openStockModal = (product: ProductWithStock, operation: StockOperation = "purchase") => {
    setSelectedProduct(product);
    setStockOperation(operation);
    resetStockForm();
    setShowStockModal(true);
  };

  const openReturnReview = (returnReq: any) => {
    setSelectedReturn(returnReq);
    setReturnActualQty(returnReq.quantity.toString());
    setShowReturnReview(true);
  };

  // Product CRUD handlers
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      name, sku, base_price: parseFloat(price) || 0, unit,
      category: category || null, description: description || null,
      image_url: imageUrl || null, hsn_code: hsnCode.trim() || null,
      gst_rate: parseFloat(gstRate) || 18, is_gst_inclusive: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product added");
      logActivity(user!.id, "Added product", "product", name);
      setShowAdd(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;
    setSaving(true);
    const { error } = await supabase.from("products").update({
      name, sku, base_price: parseFloat(price) || 0, unit,
      category: category || null, description: description || null,
      image_url: imageUrl || null, hsn_code: hsnCode.trim() || null,
      gst_rate: parseFloat(gstRate) || 18,
    }).eq("id", editProduct.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product updated");
      logActivity(user!.id, "Updated product", "product", name, editProduct.id);
      setEditProduct(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  };

  const handleToggleActive = async (product: any) => {
    const newVal = !product.is_active;
    const { error } = await supabase.from("products").update({ is_active: newVal }).eq("id", product.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Product ${newVal ? "activated" : "deactivated"}`);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const resetForm = () => {
    setName(""); setSku(""); setPrice(""); setUnit("PCS"); setCategory("");
    setDescription(""); setImageUrl(""); setHsnCode(""); setGstRate("18");
  };

  const openEdit = (product: any) => {
    setEditProduct(product);
    setName(product.name || "");
    setSku(product.sku || "");
    setPrice(String(product.base_price || 0));
    setUnit(product.unit || "PCS");
    setCategory(product.category || "");
    setDescription(product.description || "");
    setImageUrl(product.image_url || "");
    setHsnCode(product.hsn_code || "");
    setGstRate(String(product.gst_rate || 18));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (activate: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from("products").update({ is_active: activate }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} product(s) ${activate ? "activated" : "deactivated"}`);
    setSelectedIds(new Set());
    setSelectMode(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const isLoading = loadProducts;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showMatrix) {
    return <ProductAccessMatrix onBack={() => setShowMatrix(false)} />;
  }

  if (showCategories) {
    return <ProductCategories onBack={() => setShowCategories(false)} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and stock"
        primaryAction={{ label: "Add Product", onClick: () => { resetForm(); setShowAdd(true); } }}
        actions={[
          { label: "Categories", icon: Tags, onClick: () => setShowCategories(true), priority: 1 },
          { label: "Product Access", icon: Grid3X3, onClick: () => setShowMatrix(true), priority: 2 },
          ...(canEdit ? [{ label: selectMode ? "Done" : "Select", icon: CheckSquare, onClick: () => { setSelectMode((v) => !v); setSelectedIds(new Set()); }, priority: 3 }] : []),
        ]}
      />

      {/* Warehouse Selector */}
      <div className="flex items-center gap-3">
        <Warehouse className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select Warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouses?.map((w: any) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && pendingReturns && pendingReturns.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <RefreshCw className="h-3 w-3" />
            {pendingReturns.length} Pending Returns
          </Badge>
        )}
      </div>

      {/* Bulk Actions */}
      {selectMode && selectedIds.size > 0 && (
        <NoticeBox
          variant="premium"
          message={
            <div className="flex flex-wrap items-center gap-2 w-full">
              <span className="font-semibold">{selectedIds.size} selected</span>
              <div className="flex gap-2 ml-3">
                <Button size="sm" variant="outline" className="h-8 bg-background text-green-600 border-green-600/40" onClick={() => handleBulkStatus(true)}>Activate</Button>
                <Button size="sm" variant="outline" className="h-8 bg-background text-destructive border-destructive/40" onClick={() => setConfirmBulkDeactivate(true)}>Deactivate</Button>
                <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              </div>
            </div>
          }
        />
      )}

      {/* Products Grid with Stock */}
      {!isMobile ? (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <Card key={product.id} className={`overflow-hidden group ${!product.is_active ? "opacity-60" : ""}`}>
                {/* Header with Image */}
                <div className="relative h-32 bg-muted flex items-center justify-center">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    {selectMode && (
                      <Checkbox
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={() => toggleSelect(product.id)}
                      />
                    )}
                    <StatusBadge status={product.is_active ? "active" : "inactive"} />
                  </div>
                </div>

                <CardContent className="p-4 space-y-3">
                  {/* Product Info */}
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                  </div>

                  {product.category && (
                    <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                  )}

                  {/* Stock Breakdown */}
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total Stock</span>
                      <span className="font-bold text-emerald-600">{product.total_quantity} {product.unit}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Warehouse className="h-3 w-3" /> Warehouse
                      </span>
                      <span className="font-medium">{product.warehouse_quantity}</span>
                    </div>
                    {product.staff_holdings.length > 0 && (
                      <div className="space-y-1 border-t pt-1 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> With Staff
                        </span>
                        {product.staff_holdings.map((holder) => (
                          <div key={holder.user_id} className="flex items-center justify-between text-xs pl-2">
                            <span className="truncate max-w-[100px]">{holder.full_name}</span>
                            <span className="font-medium">{holder.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price & Value */}
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Price</span>
                      <p className="font-bold">₹{Number(product.base_price).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">Stock Value</span>
                      <p className="font-bold">₹{(product.total_quantity * product.base_price).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {canAdjustStock && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openStockModal(product)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                        Adjust Stock
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No products found.
            </div>
          )}
        </div>
      ) : (
        // Mobile View
        <div className="space-y-3">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className={`p-4 border rounded-lg space-y-3 ${!product.is_active ? "opacity-60" : ""}`}
              onClick={() => { if (canEdit && !selectMode) openEdit(product); }}
            >
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold">{product.name}</h3>
                    <StatusBadge status={product.is_active ? "active" : "inactive"} />
                  </div>
                  <p className="text-xs text-muted-foreground">{product.sku}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold">₹{Number(product.base_price).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">/ {product.unit}</span>
                  </div>
                </div>
              </div>

              {/* Mobile Stock Info */}
              <div className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                <span className="text-muted-foreground">Stock: {product.total_quantity} {product.unit}</span>
                <span className="text-xs text-muted-foreground">W: {product.warehouse_quantity}</span>
              </div>

              {canAdjustStock && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => { e.stopPropagation(); openStockModal(product); }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                  Adjust Stock
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stock Flow Section */}
      {canEdit && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Products Stock Flow
          </h3>
          <p className="text-sm text-muted-foreground">
            Recent product stock movements in the selected warehouse.
          </p>

          {/* Pending Returns */}
          {pendingReturns && pendingReturns.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-amber-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Pending Returns ({pendingReturns.length})
              </h4>
              {pendingReturns.map((returnReq: any) => (
                <Card key={returnReq.id} className="border-amber-200 bg-amber-50/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={returnReq.from_user?.avatar_url} />
                          <AvatarFallback>{returnReq.from_user?.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{returnReq.from_user?.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {returnReq.product?.name} - {returnReq.quantity} {returnReq.product?.unit}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReturnReview(returnReq)}
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Stock Movements Table */}
          <div className="rounded-md border">
            <DataTable
              data={stockMovements || []}
              columns={[
                { header: "Date", accessor: (row: any) => format(new Date(row.created_at), "dd MMM HH:mm"), className: "text-xs whitespace-nowrap" },
                { header: "Product", accessor: (row: any) => row.products?.name },
                { header: "Type", accessor: (row: any) => <Badge variant="outline">{row.type}</Badge> },
                { header: "Qty", accessor: (row: any) => (
                  <span className={row.quantity > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                    {row.quantity > 0 ? "+" : ""}{row.quantity}
                  </span>
                ), className: "text-right" },
                { header: "Reason", accessor: "reason", className: "text-xs max-w-[200px] truncate" },
              ]}
            />
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      <Dialog open={showStockModal} onOpenChange={setShowStockModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjust Stock - {selectedProduct?.name}</DialogTitle>
            <DialogDescription>
              Manage stock for {selectedProduct?.sku}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStockOperation} className="space-y-4">
            {/* Operation Type */}
            <div className="space-y-2">
              <Label>Operation Type</Label>
              <Tabs value={stockOperation} onValueChange={(v) => setStockOperation(v as StockOperation)}>
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="purchase">
                    <Plus className="h-4 w-4 mr-1" /> Purchase
                  </TabsTrigger>
                  <TabsTrigger value="sale">
                    <Minus className="h-4 w-4 mr-1" /> Sale
                  </TabsTrigger>
                  <TabsTrigger value="transfer">
                    <ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Transfer Direction (only for transfer) */}
            {stockOperation === "transfer" && (
              <div className="space-y-2">
                <Label>Transfer Direction</Label>
                <Select value={transferDirection} onValueChange={(v) => setTransferDirection(v as TransferDirection)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse_to_staff">Warehouse → Staff</SelectItem>
                    {isAdmin && (
                      <SelectItem value="staff_to_warehouse">Staff → Warehouse</SelectItem>
                    )}
                    <SelectItem value="staff_to_staff">Staff → Staff</SelectItem>
                  </SelectContent>
                </Select>

                {/* From Staff (for staff-to-warehouse or staff-to-staff) */}
                {(transferDirection === "staff_to_warehouse" || transferDirection === "staff_to_staff") && (
                  <div className="space-y-2">
                    <Label>From Staff</Label>
                    <Select value={fromUserId} onValueChange={setFromUserId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source staff" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffMembers?.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* To Staff (for warehouse-to-staff or staff-to-staff) */}
                {(transferDirection === "warehouse_to_staff" || transferDirection === "staff_to_staff") && (
                  <div className="space-y-2">
                    <Label>To Staff</Label>
                    <Select value={toUserId} onValueChange={setToUserId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination staff" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffMembers
                          ?.filter((s: any) => s.id !== fromUserId)
                          ?.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Current Stock Info */}
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Stock:</span>
                <span className="font-medium">{selectedProduct?.total_quantity} {selectedProduct?.unit}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">In Warehouse:</span>
                <span className="font-medium">{selectedProduct?.warehouse_quantity} {selectedProduct?.unit}</span>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantity ({selectedProduct?.unit})</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter quantity"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                required
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason / Notes</Label>
              <Textarea
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder="e.g. Purchase order #123, Customer return, etc."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowStockModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {stockOperation === "purchase" ? "Record Purchase" :
                 stockOperation === "sale" ? "Record Sale" : "Transfer Stock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return Review Modal */}
      <Dialog open={showReturnReview} onOpenChange={setShowReturnReview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Return Request</DialogTitle>
            <DialogDescription>
              Review stock return from {selectedReturn?.from_user?.full_name}
            </DialogDescription>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-medium">{selectedReturn.product?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested:</span>
                  <span className="font-medium">{selectedReturn.quantity} {selectedReturn.product?.unit}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Actual Quantity Received</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedReturn.quantity}
                  value={returnActualQty}
                  onChange={(e) => setReturnActualQty(e.target.value)}
                />
                {parseFloat(returnActualQty || "0") < selectedReturn.quantity && (
                  <p className="text-sm text-amber-600">
                    Difference: {selectedReturn.quantity - parseFloat(returnActualQty || "0")} {selectedReturn.product?.unit}
                  </p>
                )}
              </div>

              {parseFloat(returnActualQty || "0") < selectedReturn.quantity && (
                <div className="space-y-2">
                  <Label>Handle Difference</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant={returnAction === "keep" ? "default" : "outline"}
                      onClick={() => setReturnAction("keep")}
                      className="flex-1"
                    >
                      Keep with User
                    </Button>
                    <Button
                      type="button"
                      variant={returnAction === "flag" ? "default" : "outline"}
                      onClick={() => setReturnAction("flag")}
                      className="flex-1"
                    >
                      Flag Error
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Review Notes</Label>
                <Textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Add notes about this return..."
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowReturnReview(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleReturnReview(false)}
                  disabled={saving}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleReturnReview(true)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product Dialogs */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex items-start gap-4">
              <ImageUpload folder="products" currentUrl={imageUrl || null} onUploaded={setImageUrl} onRemoved={() => setImageUrl("")} />
              <div className="flex-1 space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
                <div><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} required className="mt-1" placeholder="WB-500" /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Price (₹) <span className="text-xs text-muted-foreground">(incl. GST)</span></Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1" /></div>
              <div><Label>Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>HSN Code</Label><Input value={hsnCode} onChange={e => setHsnCode(e.target.value)} className="mt-1" placeholder="22011010" /></div>
              <div>
                <Label>GST Rate (%)</Label>
                <Select value={gstRate} onValueChange={setGstRate}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exempt)</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                    <SelectItem value="28">28%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoryList?.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Product
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProduct} onOpenChange={(open) => { if (!open) { setEditProduct(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editProduct && !editProduct.is_active && (
            <NoticeBox
              variant="error"
              className="mb-4"
              icon={AlertTriangle}
              message="This product is inactive. Activate it to use in sales."
            />
          )}
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="flex items-start gap-4">
              <ImageUpload folder="products" currentUrl={imageUrl || null} onUploaded={setImageUrl} onRemoved={() => setImageUrl("")} />
              <div className="flex-1 space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
                <div><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} required className="mt-1" /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Price (₹) <span className="text-xs text-muted-foreground">(incl. GST)</span></Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1" /></div>
              <div><Label>Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>HSN Code</Label><Input value={hsnCode} onChange={e => setHsnCode(e.target.value)} className="mt-1" placeholder="22011010" /></div>
              <div>
                <Label>GST Rate (%)</Label>
                <Select value={gstRate} onValueChange={setGstRate}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exempt)</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                    <SelectItem value="28">28%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoryList?.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmBulkDeactivate} onOpenChange={setConfirmBulkDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selectedIds.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected products will no longer appear in order forms. This can be reversed by reactivating them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { setConfirmBulkDeactivate(false); handleBulkStatus(false); }}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Products;
