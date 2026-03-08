import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, X, Save, AlertTriangle, Grid3X3, Download, Tags } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ProductAccessMatrix } from "@/components/products/ProductAccessMatrix";
import { ProductCategories } from "@/components/products/ProductCategories";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const Products = () => {
  const { user, role } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";
  const [showAdd, setShowAdd] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
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
    setName(""); setSku(""); setPrice(""); setUnit("PCS"); setCategory(""); setDescription(""); setImageUrl("");
  };

  const columns = [
    { header: "Product", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        {row.image_url && <img src={row.image_url} alt="" className="h-8 w-8 rounded-md object-cover" />}
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

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and pricing"
        primaryAction={{ label: "Add Product", onClick: () => { resetForm(); setShowAdd(true); } }}
        actions={[
          { label: "Product Access", icon: Grid3X3, onClick: () => setShowMatrix(true), priority: 1 },
        ]}
      />
      <DataTable
        columns={columns}
        data={products || []}
        searchKey="name"
        searchPlaceholder="Search products..."
        onRowClick={(row) => { if (canEdit) openEdit(row); }}
        renderMobileCard={(row: any) => (
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow active:bg-muted/30" onClick={() => { if (canEdit) openEdit(row); }}>
            <div className="flex">
              <div className="w-20 h-20 shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                {row.image_url ? (
                  <img src={row.image_url} alt={row.name} className="w-full h-full object-cover" />
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

      {/* Add Product Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
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
              <div><Label>Base Price (₹)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1" /></div>
              <div><Label>Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Category</Label><Input value={category} onChange={e => setCategory(e.target.value)} className="mt-1" placeholder="e.g., Water, Soda" /></div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editProduct && !editProduct.is_active && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">This product is inactive. Activate it to use in sales.</p>
            </div>
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
              <div><Label>Base Price (₹)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1" /></div>
              <div><Label>Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Category</Label><Input value={category} onChange={e => setCategory(e.target.value)} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
