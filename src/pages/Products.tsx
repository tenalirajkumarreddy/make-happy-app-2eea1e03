import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProductCard } from "@/components/inventory/ProductCard";
import { AdjustStockModal } from "@/components/inventory/AdjustStockModal";
import { PendingReturns } from "@/components/inventory/PendingReturns";
import { ReturnReviewModal } from "@/components/inventory/ReturnReviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search, History } from "lucide-react";
import { Product, StockTransfer } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import StockMovementReport from "@/components/reporting/StockMovementReport";

const Products = () => {
  const { warehouse, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "manager";

  const [searchTerm, setSearchTerm] = useState("");
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [adjustStockProduct, setAdjustStockProduct] = useState<Product | null>(null);
  const [showReturnReviewModal, setShowReturnReviewModal] = useState(false);
  const [reviewingTransfer, setReviewingTransfer] = useState<StockTransfer | null>(null);
  const [showStockHistory, setShowStockHistory] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products_with_stock', warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return [];
      const { data, error } = await supabase.rpc('get_products_with_stock_breakdown', {
        p_warehouse_id: warehouse.id
      });
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!warehouse?.id,
  });

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [products, searchTerm]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setShowAddEditModal(true);
  };

  const handleOpenAdjustStock = (product: Product) => {
    setAdjustStockProduct(product);
    setShowAdjustStockModal(true);
  };

  const handleOpenReturnReview = (transfer: StockTransfer) => {
    setReviewingTransfer(transfer);
    setShowReturnReviewModal(true);
  };

  const handleCloseModals = () => {
    setShowAddEditModal(false);
    setEditingProduct(null);
    setShowAdjustStockModal(false);
    setAdjustStockProduct(null);
    setShowReturnReviewModal(false);
    setReviewingTransfer(null);
    setShowStockHistory(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Products & Inventory" description="View and manage product stock across the warehouse and staff." />

      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowStockHistory(true)}>
                <History className="mr-2 h-4 w-4" /> Stock History
            </Button>
            {canEdit && (
            <Button onClick={handleOpenAdd}>
                <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
            )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => handleOpenEdit(product)}
              onAdjustStock={() => handleOpenAdjustStock(product)}
            />
          ))}
        </div>
      )}

      <PendingReturns onReview={handleOpenReturnReview} />

      {showAddEditModal && (
        <AddEditProductModal
          isOpen={showAddEditModal}
          onClose={handleCloseModals}
          product={editingProduct}
        />
      )}

      {showAdjustStockModal && adjustStockProduct && (
        <AdjustStockModal
          isOpen={showAdjustStockModal}
          onClose={handleCloseModals}
          product={adjustStockProduct}
        />
      )}

      {showReturnReviewModal && reviewingTransfer && (
        <ReturnReviewModal
          isOpen={showReturnReviewModal}
          onClose={handleCloseModals}
          transfer={reviewingTransfer}
        />
      )}

      <Dialog open={showStockHistory} onOpenChange={setShowStockHistory}>
        <DialogContent className="max-w-6xl">
            <DialogHeader>
                <DialogTitle>Stock Movement History</DialogTitle>
                <DialogDescription>
                    Audit trail of all stock movements in the warehouse.
                </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-4">
              <StockMovementReport />
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Add/Edit Product Modal Component
interface AddEditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

const AddEditProductModal: React.FC<AddEditProductModalProps> = ({ isOpen, onClose, product }) => {
    const qc = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState(product?.name || "");
    const [sku, setSku] = useState(product?.sku || "");
    const [price, setPrice] = useState(product?.price?.toString() || "");
    const [unit, setUnit] = useState(product?.unit || "PCS");
    const [category, setCategory] = useState(product?.category_id || "");
    const [description, setDescription] = useState(product?.description || "");
    const [imageUrl, setImageUrl] = useState(product?.image_url || "");
    const [hsnCode, setHsnCode] = useState(product?.hsn_code || "");
    const [gstRate, setGstRate] = useState(product?.gst_rate?.toString() || "18");

    const { data: categories } = useQuery({
        queryKey: ['product_categories'],
        queryFn: async () => {
            const { data, error } = await supabase.from('product_categories').select('*');
            if (error) throw error;
            return data;
        }
    });

    const handleSave = async () => {
        setSaving(true);
        const productData = {
            name,
            sku,
            price: parseFloat(price) || 0,
            unit,
            category_id: category || null,
            description,
            image_url: imageUrl,
            hsn_code: hsnCode,
            gst_rate: parseInt(gstRate) || 18,
        };

        let error;
        if (product) {
            const { error: updateError } = await supabase.from('products').update(productData).eq('id', product.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase.from('products').insert(productData);
            error = insertError;
        }

        if (error) {
            toast.error(`Failed to save product: ${error.message}`);
        } else {
            toast.success(`Product ${product ? 'updated' : 'added'} successfully!`);
            qc.invalidateQueries({ queryKey: ['products_with_stock'] });
            onClose();
        }
        setSaving(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{product ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                    <DialogDescription>
                        {product ? 'Update the details for this product.' : 'Fill in the details for the new product.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Name</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="sku" className="text-right">SKU</Label>
                        <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="price" className="text-right">Price</Label>
                        <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="unit" className="text-right">Unit</Label>
                        <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="hsn" className="text-right">HSN Code</Label>
                        <Input id="hsn" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="gst" className="text-right">GST Rate (%)</Label>
                         <Select value={gstRate} onValueChange={setGstRate}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="12">12%</SelectItem>
                                <SelectItem value="18">18%</SelectItem>
                                <SelectItem value="28">28%</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">Description</Label>
                        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Image</Label>
                        <div className="col-span-3">
                            <ImageUpload
                                onUpload={(url) => setImageUrl(url)}
                                currentImage={imageUrl}
                                bucket="product-images"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {saving ? 'Saving...' : 'Save Product'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default Products;
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  const { data: products, isLoading } = useQuery({
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

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch staff list
  const { data: staffList } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["agent", "manager", "pos"]);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch stock data
  const { data: stockData } = useQuery({
    queryKey: ["stock-data", selectedWarehouse],
    queryFn: async () => {
      const stockMap: Record<string, StockData> = {};
      
      // Get warehouse stock
      let warehouseQuery = supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, qty");
      
      if (selectedWarehouse !== "all") {
        warehouseQuery = warehouseQuery.eq("warehouse_id", selectedWarehouse);
      }
      
      const { data: warehouseStock, error: whError } = await warehouseQuery;
      if (whError) throw whError;
      
      // Get staff stock
      let staffQuery = supabase
        .from("staff_stock")
        .select("product_id, user_id, quantity");
      
      if (selectedWarehouse !== "all") {
        // Filter by warehouse if needed - join with profiles to filter by warehouse
        staffQuery = staffQuery.eq("warehouse_id", selectedWarehouse);
      }
      
      const { data: staffStock, error: staffError } = await staffQuery;
      if (staffError) throw staffError;
      
      // Build stock map
      products?.forEach((product: any) => {
        stockMap[product.id] = {
          product_id: product.id,
          warehouse_qty: 0,
          staff_holdings: [],
        };
      });
      
      // Aggregate warehouse stock
      warehouseStock?.forEach((item: any) => {
        if (stockMap[item.product_id]) {
          stockMap[item.product_id].warehouse_qty += item.qty || 0;
        }
      });
      
      // Aggregate staff stock
      const staffMap: Record<string, { staff_id: string; staff_name: string; qty: number }> = {};
      staffStock?.forEach((item: any) => {
        const key = `${item.product_id}-${item.user_id}`;
        const staffName = staffList?.find(s => s.id === item.user_id)?.full_name || 'Unknown';
        staffMap[key] = {
          staff_id: item.user_id,
          staff_name: staffName,
          qty: item.quantity || 0,
        };
      });
      
      Object.entries(staffMap).forEach(([key, holding]) => {
        const productId = key.split('-')[0];
        if (stockMap[productId] && holding.qty > 0) {
          stockMap[productId].staff_holdings.push(holding);
        }
      });
      
      return stockMap;
    },
    enabled: !!products,
  });

  // Fetch pending returns
  const { data: pendingReturns } = useQuery({
    queryKey: ["pending-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_returns")
        .select(`
          id,
          product_id,
          staff_id,
          qty,
          reason,
          status,
          created_at,
          products:product_id(name),
          profiles:staff_id(full_name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      return (data || []).map((r: any) => ({
        id: r.id,
        product_id: r.product_id,
        product_name: r.products?.name || 'Unknown Product',
        staff_id: r.staff_id,
        staff_name: r.profiles?.full_name || 'Unknown Staff',
        qty: r.qty,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
      })) as PendingReturn[];
    },
  });

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter((p: any) =>
      p.name?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.category?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      name,
      sku,
      base_price: parseFloat(price) || 0,
      unit,
      category: category || null,
      description: description || null,
      image_url: imageUrl || null,
      hsn_code: hsnCode.trim() || null,
      gst_rate: parseFloat(gstRate) || 18,
      is_gst_inclusive: true,
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

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name,
        sku,
        base_price: parseFloat(price) || 0,
        unit,
        category: category || null,
        description: description || null,
        image_url: imageUrl || null,
        hsn_code: hsnCode.trim() || null,
        gst_rate: parseFloat(gstRate) || 18,
      })
      .eq("id", editProduct.id);
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
    const { error } = await supabase
      .from("products")
      .update({ is_active: newVal })
      .eq("id", product.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Product ${newVal ? "activated" : "deactivated"}`);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const resetForm = () => {
    setName("");
    setSku("");
    setPrice("");
    setUnit("PCS");
    setCategory("");
    setDescription("");
    setImageUrl("");
    setHsnCode("");
    setGstRate("18");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkStatus = async (activate: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase
      .from("products")
      .update({ is_active: activate })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} product(s) ${activate ? "activated" : "deactivated"}`);
    setSelectedIds(new Set());
    setSelectMode(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  // Stock adjustment handlers
  const openAdjustStock = (product: any) => {
    setAdjustStockProduct(product);
    setStockAdjustmentType('purchase');
    setStockAdjustmentQty("");
    setStockAdjustmentSource("");
    setStockAdjustmentDestination("");
    setAdjustmentNotes("");
    setShowAdjustStockModal(true);
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustStockProduct) return;
    
    const qty = parseInt(stockAdjustmentQty) || 0;
    if (qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    setSaving(true);
    
    try {
      if (stockAdjustmentType === 'purchase') {
        // Add to warehouse
        const { error } = await supabase.rpc('add_warehouse_stock', {
          p_product_id: adjustStockProduct.id,
          p_warehouse_id: selectedWarehouse === 'all' ? warehouses?.[0]?.id : selectedWarehouse,
          p_qty: qty,
          p_notes: adjustmentNotes,
        });
        if (error) throw error;
        toast.success(`Added ${qty} units to warehouse`);
      } else if (stockAdjustmentType === 'sale') {
        // Deduct from warehouse
        const { error } = await supabase.rpc('deduct_warehouse_stock', {
          p_product_id: adjustStockProduct.id,
          p_warehouse_id: selectedWarehouse === 'all' ? warehouses?.[0]?.id : selectedWarehouse,
          p_qty: qty,
          p_notes: adjustmentNotes,
        });
        if (error) throw error;
        toast.success(`Deducted ${qty} units from warehouse`);
      } else if (stockAdjustmentType === 'transfer') {
        // Transfer between locations
        if (!stockAdjustmentSource || !stockAdjustmentDestination) {
          toast.error("Please select source and destination");
          setSaving(false);
          return;
        }
        
        const { error } = await supabase.rpc('transfer_stock', {
          p_product_id: adjustStockProduct.id,
          p_from_type: stockAdjustmentSource.startsWith('staff_') ? 'staff' : 'warehouse',
          p_from_id: stockAdjustmentSource.replace('staff_', ''),
          p_to_type: stockAdjustmentDestination.startsWith('staff_') ? 'staff' : 'warehouse',
          p_to_id: stockAdjustmentDestination.replace('staff_', ''),
          p_qty: qty,
          p_notes: adjustmentNotes,
        });
        if (error) throw error;
        toast.success(`Transferred ${qty} units`);
      }
      
      // Refresh stock data
      qc.invalidateQueries({ queryKey: ["stock-data"] });
      setShowAdjustStockModal(false);
      setAdjustStockProduct(null);
    } catch (error: any) {
      toast.error(error.message || "Stock adjustment failed");
    } finally {
      setSaving(false);
    }
  };

  // Return review handlers
  const openReturnReview = (returnItem: PendingReturn) => {
    setSelectedReturn(returnItem);
    setShowReturnReviewModal(true);
  };

  const handleReturnDecision = async (approved: boolean) => {
    if (!selectedReturn) return;
    
    setSaving(true);
    const { error } = await supabase
      .from("stock_returns")
      .update({ 
        status: approved ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq("id", selectedReturn.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Return ${approved ? 'approved' : 'rejected'}`);
      qc.invalidateQueries({ queryKey: ["pending-returns"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
      setShowReturnReviewModal(false);
      setSelectedReturn(null);
    }
    setSaving(false);
  };

  // Get total stock for a product
  const getTotalStock = (productId: string) => {
    const data = stockData?.[productId];
    if (!data) return 0;
    const staffTotal = data.staff_holdings.reduce((sum, h) => sum + h.qty, 0);
    return data.warehouse_qty + staffTotal;
  };

  // Get warehouse stock for a product
  const getWarehouseStock = (productId: string) => {
    return stockData?.[productId]?.warehouse_qty || 0;
  };

  // Get staff holdings for a product
  const getStaffHoldings = (productId: string) => {
    return stockData?.[productId]?.staff_holdings || [];
  };

  const columns = [
    ...(selectMode
      ? [
          {
            header: "",
            accessor: (row: any) => (
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={() => toggleSelect(row.id)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            ),
            className: "w-10",
          },
        ]
      : []),
    {
      header: "Product",
      accessor: (row: any) => (
        <div className="flex items-center gap-2">
          {row.image_url && (
            <img
              src={row.image_url}
              alt=""
              loading="lazy"
              className="h-8 w-8 rounded-md object-cover"
            />
          )}
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      header: "SKU",
      accessor: "sku" as const,
      className: "font-mono text-xs text-muted-foreground hidden sm:table-cell",
    },
    {
      header: "Category",
      accessor: (row: any) =>
        row.category ? (
          <Badge variant="secondary">{row.category}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: "hidden md:table-cell",
    },
    {
      header: "Base Price",
      accessor: (row: any) => `₹${Number(row.base_price).toLocaleString()}`,
    },
    {
      header: "Unit",
      accessor: "unit" as const,
      className: "hidden sm:table-cell",
    },
    {
      header: "Status",
      accessor: (row: any) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.is_active ? "active" : "inactive"} />
          {canEdit && (
            <Switch
              checked={row.is_active}
              onCheckedChange={() => handleToggleActive(row)}
              className="scale-75"
            />
          )}
        </div>
      ),
    },
    ...(canEdit
      ? [
          {
            header: "Actions",
            accessor: (row: any) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  openEdit(row);
                }}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            ),
            hideOnMobile: true,
          },
        ]
      : []),
  ];

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
        subtitle="Manage your product catalog and pricing"
        primaryAction={{
          label: "Add Product",
          onClick: () => {
            resetForm();
            setShowAdd(true);
          },
        }}
        actions={[
          {
            label: "Categories",
            icon: Tags,
            onClick: () => setShowCategories(true),
            priority: 1,
          },
          {
            label: "Product Access",
            icon: Grid3X3,
            onClick: () => setShowMatrix(true),
            priority: 2,
          },
          ...(canEdit
            ? [
                {
                  label: selectMode ? "Done" : "Select",
                  icon: CheckSquare,
                  onClick: () => {
                    setSelectMode((v) => !v);
                    setSelectedIds(new Set());
                  },
                  priority: 3,
                },
              ]
            : []),
        ]}
      />

      {selectMode && selectedIds.size > 0 && (
        <NoticeBox
          variant="premium"
          message={
            <div className="flex flex-wrap items-center gap-2 w-full">
              <span className="font-semibold">{selectedIds.size} selected</span>
              <div className="flex gap-2 ml-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 bg-background text-green-600 border-green-600/40"
                  onClick={() => handleBulkStatus(true)}
                >
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 bg-background text-destructive border-destructive/40"
                  onClick={() => setConfirmBulkDeactivate(true)}
                >
                  Deactivate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 ml-auto"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          }
        />
      )}

      {/* Warehouse Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Warehouse:</span>
        </div>
        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Card Grid, Mobile: DataTable */}
      {!isMobile ? (
        <div className="space-y-4">
          {/* Search bar for desktop */}
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <div className="entity-grid">
            {filteredProducts.map((row: any) => {
              const totalStock = getTotalStock(row.id);
              const warehouseStock = getWarehouseStock(row.id);
              const staffHoldings = getStaffHoldings(row.id);
              
              return (
                <div
                  key={row.id}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(row.id);
                    } else if (canEdit) {
                      openEdit(row);
                    }
                  }}
                  className={`group entity-card ${!row.is_active ? "entity-card-inactive" : ""} ${
                    selectedIds.has(row.id) ? "entity-card-selected" : ""
                  }`}
                >
                  {/* Header with image */}
                  <div className="entity-card-header !h-36">
                    {row.image_url ? (
                      <img
                        src={row.image_url}
                        alt={row.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <Package className="h-12 w-12 text-muted-foreground/30" />
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      {selectMode && (
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            toggleSelect(row.id);
                          }}
                          className="bg-background"
                        />
                      )}
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="entity-card-content">
                    <div>
                      <h3 className="entity-card-title">{row.name}</h3>
                      <p className="entity-card-subtitle mt-0.5">{row.sku}</p>
                    </div>
                    {row.category && (
                      <Badge variant="secondary" className="text-xs">
                        {row.category}
                      </Badge>
                    )}

                    {/* HSN and GST info */}
                    {(row.hsn_code || row.gst_rate) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {row.hsn_code && <span>HSN: {row.hsn_code}</span>}
                        {row.gst_rate && (
                          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                            {row.gst_rate}% GST
                          </span>
                        )}
                      </div>
                    )}

                    {/* Stock Breakdown */}
                    <div className="space-y-2 p-2 bg-muted/50 rounded-md">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Total Stock</span>
                        <span className="text-sm font-bold">{totalStock}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Warehouse</span>
                        <span className="text-sm">{warehouseStock}</span>
                      </div>
                      {staffHoldings.length > 0 && (
                        <div className="pt-1 border-t border-border/50">
                          <span className="text-xs font-medium text-muted-foreground block mb-1">Staff Holdings:</span>
                          {staffHoldings.map((holding) => (
                            <div key={holding.staff_id} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[120px]">{holding.staff_name}</span>
                              <span className="font-medium">{holding.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Price and unit */}
                    <div className="entity-card-stat">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Box className="h-3.5 w-3.5" />
                        <span className="text-xs">{row.unit}</span>
                      </div>
                      <div className="text-right">
                        <p className="entity-card-label">Price (incl. GST)</p>
                        <p className="font-bold text-foreground">
                          ₹{Number(row.base_price).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {canEdit && (
                      <div className="pt-2 border-t flex items-center justify-between gap-2">
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={() => handleToggleActive(row)}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="scale-90"
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              openEdit(row);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              openAdjustStock(row);
                            }}
                          >
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            Stock
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No products found.
            </div>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={products || []}
          searchKey="name"
          searchPlaceholder="Search products..."
          onRowClick={(row) => {
            if (canEdit && !selectMode) openEdit(row);
          }}
          renderMobileCard={(row: any) => (
            <div
              className={`entity-card-mobile ${!row.is_active ? "entity-card-inactive" : ""}`}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(row.id);
                } else if (canEdit) {
                  openEdit(row);
                }
              }}
            >
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={row.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    {canEdit && (
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(e) => {
                          handleToggleActive(row);
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="scale-90"
                      />
                    )}
                  </div>
                </div>
                <p className="entity-card-subtitle mt-0.5">{row.sku}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-foreground">
                    ₹{Number(row.base_price).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {row.unit}</span>
                </div>
                {row.category && (
                  <Badge variant="secondary" className="mt-1 text-xs h-5">
                    {row.category}
                  </Badge>
                )}
                {/* Stock info on mobile */}
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <Box className="h-3 w-3 text-muted-foreground" />
                  <span>Stock: {getTotalStock(row.id)}</span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        openAdjustStock(row);
                      }}
                    >
                      Adjust
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        />
      )}

      {/* Pending Returns Section */}
      {pendingReturns && pendingReturns.length > 0 && (
        <div className="space-y-4 mt-8">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Pending Returns ({pendingReturns.length})
          </h3>
          <div className="entity-grid">
            {pendingReturns.map((returnItem) => (
              <div
                key={returnItem.id}
                className="entity-card border-l-4 border-l-amber-500"
              >
                <div className="entity-card-content">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold">{returnItem.product_name}</h4>
                      <p className="text-sm text-muted-foreground">From: {returnItem.staff_name}</p>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      Pending
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>Qty: <strong>{returnItem.qty}</strong></span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(returnItem.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {returnItem.reason && (
                    <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                      "{returnItem.reason}"
                    </p>
                  )}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openReturnReview(returnItem)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review Return
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Product Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex items-start gap-4">
              <ImageUpload
                folder="products"
                currentUrl={imageUrl || null}
                onUploaded={setImageUrl}
                onRemoved={() => setImageUrl("")}
              />
              <div className="flex-1 space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    required
                    className="mt-1"
                    placeholder="WB-500"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>
                  Price (₹) <span className="text-xs text-muted-foreground">(incl. GST)</span>
                </Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>HSN Code</Label>
                <Input
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className="mt-1"
                  placeholder="22011010"
                />
              </div>
              <div>
                <Label>GST Rate (%)</Label>
                <Select value={gstRate} onValueChange={setGstRate}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
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
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoryList?.map((c: any) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Product
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog
        open={!!editProduct}
        onOpenChange={(open) => {
          if (!open) {
            setEditProduct(null);
            resetForm();
          }
        }}
      >
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
              <ImageUpload
                folder="products"
                currentUrl={imageUrl || null}
                onUploaded={setImageUrl}
                onRemoved={() => setImageUrl("")}
              />
              <div className="flex-1 space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} required className="mt-1" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>
                  Price (₹) <span className="text-xs text-muted-foreground">(incl. GST)</span>
                </Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>HSN Code</Label>
                <Input
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className="mt-1"
                  placeholder="22011010"
                />
              </div>
              <div>
                <Label>GST Rate (%)</Label>
                <Select value={gstRate} onValueChange={setGstRate}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
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
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoryList?.map((c: any) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Modal */}
      <Dialog open={showAdjustStockModal} onOpenChange={setShowAdjustStockModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock: {adjustStockProduct?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockAdjustment} className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <Box className="h-4 w-4" />
              <span className="text-sm">
                Current Stock: <strong>{getTotalStock(adjustStockProduct?.id || '')}</strong>
                {' '}(Warehouse: {getWarehouseStock(adjustStockProduct?.id || '')})
              </span>
            </div>

            <div>
              <Label>Adjustment Type</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <Button
                  type="button"
                  variant={stockAdjustmentType === 'purchase' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStockAdjustmentType('purchase')}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs">Purchase</span>
                </Button>
                <Button
                  type="button"
                  variant={stockAdjustmentType === 'sale' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStockAdjustmentType('sale')}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <Minus className="h-4 w-4" />
                  <span className="text-xs">Sale</span>
                </Button>
                <Button
                  type="button"
                  variant={stockAdjustmentType === 'transfer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStockAdjustmentType('transfer')}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs">Transfer</span>
                </Button>
              </div>
            </div>

            {stockAdjustmentType === 'transfer' && (
              <>
                <div>
                  <Label>From</Label>
                  <Select value={stockAdjustmentSource} onValueChange={setStockAdjustmentSource}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={`warehouse_${selectedWarehouse === 'all' ? warehouses?.[0]?.id : selectedWarehouse}`}>
                        Warehouse
                      </SelectItem>
                      {staffList?.map((s: any) => (
                        <SelectItem key={s.id} value={`staff_${s.id}`}>
                          {s.full_name} (Staff)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To</Label>
                  <Select value={stockAdjustmentDestination} onValueChange={setStockAdjustmentDestination}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={`warehouse_${selectedWarehouse === 'all' ? warehouses?.[0]?.id : selectedWarehouse}`}>
                        Warehouse
                      </SelectItem>
                      {staffList?.map((s: any) => (
                        <SelectItem key={s.id} value={`staff_${s.id}`}>
                          {s.full_name} (Staff)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={stockAdjustmentQty}
                onChange={(e) => setStockAdjustmentQty(e.target.value)}
                className="mt-1"
                placeholder="Enter quantity"
              />
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={adjustmentNotes}
                onChange={(e) => setAdjustmentNotes(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Reason for adjustment..."
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowAdjustStockModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return Review Modal */}
      <Dialog open={showReturnReviewModal} onOpenChange={setShowReturnReviewModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Return Request</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Product</span>
                  <span className="font-medium">{selectedReturn.product_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">From</span>
                  <span className="font-medium">{selectedReturn.staff_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quantity</span>
                  <span className="font-medium">{selectedReturn.qty}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span>{new Date(selectedReturn.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {selectedReturn.reason && (
                <div className="p-3 bg-muted rounded-md">
                  <span className="text-sm text-muted-foreground block mb-1">Reason:</span>
                  <p className="text-sm italic">"{selectedReturn.reason}"</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleReturnDecision(false)}
                  disabled={saving}
                >
                  Reject
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleReturnDecision(true)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmBulkDeactivate} onOpenChange={setConfirmBulkDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selectedIds.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected products will no longer appear in order forms. This can be reversed by
              reactivating them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                setConfirmBulkDeactivate(false);
                handleBulkStatus(false);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Products;
