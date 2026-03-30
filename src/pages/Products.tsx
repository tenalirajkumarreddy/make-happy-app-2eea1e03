import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, X, Save, AlertTriangle, Grid3X3, Download, Tags, CheckSquare, DollarSign, Box } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ProductAccessMatrix } from "@/components/products/ProductAccessMatrix";
import { ProductCategories } from "@/components/products/ProductCategories";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const Products = () => {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = role === "super_admin" || role === "manager";
  const [showAdd, setShowAdd] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
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
  const qc = useQueryClient();

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
    const { error } = await supabase.from("products").update({
      name,
      sku,
      base_price: parseFloat(price) || 0,
      unit,
      category: category || null,
      description: description || null,
      image_url: imageUrl || null,
      hsn_code: hsnCode.trim() || null,
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
    setName(""); setSku(""); setPrice(""); setUnit("PCS"); setCategory(""); setDescription(""); setImageUrl(""); setHsnCode(""); setGstRate("18");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  const columns = [
    ...(selectMode ? [{
      header: "",
      accessor: (row: any) => (
        <Checkbox
          checked={selectedIds.has(row.id)}
          onCheckedChange={() => toggleSelect(row.id)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
      className: "w-10",
    }] : []),
    { header: "Product", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        {row.image_url && <img src={row.image_url} alt="" loading="lazy" className="h-8 w-8 rounded-md object-cover" />}
        <span className="font-medium">{row.name}</span>
      </div>
    )},
    { header: "SKU", accessor: "sku" as const, className: "font-mono text-xs text-muted-foreground hidden sm:table-cell" },
    { header: "Category", accessor: (row: any) => row.category ? <Badge variant="secondary">{row.category}</Badge> : <span className="text-muted-foreground">—</span>, className: "hidden md:table-cell" },
    { header: "Base Price", accessor: (row: any) => `₹${Number(row.base_price).toLocaleString()}` },
    { header: "Unit", accessor: "unit" as const, className: "hidden sm:table-cell" },
    { header: "Status", accessor: (row: any) => (
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
    )},
    ...(canEdit ? [{
      header: "Actions",
      accessor: (row: any) => (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEdit(row); }}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      ),
      hideOnMobile: true,
    }] : []),
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
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
        primaryAction={{ label: "Add Product", onClick: () => { resetForm(); setShowAdd(true); } }}
        actions={[
          { label: "Categories", icon: Tags, onClick: () => setShowCategories(true), priority: 1 },
          { label: "Product Access", icon: Grid3X3, onClick: () => setShowMatrix(true), priority: 2 },
          ...(canEdit ? [{ label: selectMode ? "Done" : "Select", icon: CheckSquare, onClick: () => { setSelectMode((v) => !v); setSelectedIds(new Set()); }, priority: 3 }] : []),
        ]}
      />

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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((row: any) => (
              <div
                key={row.id}
                onClick={() => { if (selectMode) { toggleSelect(row.id); } else if (canEdit) { openEdit(row); } }}
                className={`group rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer ${!row.is_active ? "opacity-60" : ""} ${selectedIds.has(row.id) ? "ring-2 ring-primary" : ""}`}
              >
                {/* Header with image */}
                <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
                  {row.image_url ? (
                    <img src={row.image_url} alt={row.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  ) : (
                    <Package className="h-16 w-16 text-muted-foreground/30" />
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    {selectMode && (
                      <Checkbox 
                        checked={selectedIds.has(row.id)}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleSelect(row.id); }}
                        className="bg-background"
                      />
                    )}
                    <StatusBadge status={row.is_active ? "active" : "inactive"} />
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-foreground truncate">{row.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{row.sku}</p>
                  </div>

                  {row.category && (
                    <Badge variant="secondary" className="text-xs">{row.category}</Badge>
                  )}

                  {/* HSN and GST info */}
                  {(row.hsn_code || row.gst_rate) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {row.hsn_code && <span>HSN: {row.hsn_code}</span>}
                      {row.gst_rate && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{row.gst_rate}% GST</span>}
                    </div>
                  )}

                  {/* Price and unit */}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Box className="h-3.5 w-3.5" />
                      <span className="text-xs">{row.unit}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price (incl. GST)</p>
                      <p className="font-bold text-foreground">₹{Number(row.base_price).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div className="pt-2 border-t flex items-center justify-between">
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={() => handleToggleActive(row)}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="scale-90"
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-xs gap-1.5"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEdit(row); }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
          onRowClick={(row) => { if (canEdit && !selectMode) openEdit(row); }}
          renderMobileCard={(row: any) => (
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow active:bg-muted/30" onClick={() => { if (selectMode) { toggleSelect(row.id); } else if (canEdit) { openEdit(row); } }}>
              <div className="flex">
                <div className="w-24 self-stretch shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                  {row.image_url ? (
                    <img src={row.image_url} alt={row.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 p-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                      {canEdit && (
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(e) => { handleToggleActive(row); }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="scale-75"
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{row.sku}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm font-bold text-foreground">₹{Number(row.base_price).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">/ {row.unit}</span>
                  </div>
                  {row.category && (
                    <Badge variant="secondary" className="mt-1.5 text-[10px] h-5">{row.category}</Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        />
      )}

      {/* Add Product Dialog */}
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

      {/* Edit Product Dialog */}
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
