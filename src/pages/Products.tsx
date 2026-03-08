import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { ProductAccessMatrix } from "@/components/products/ProductAccessMatrix";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2, Grid3X3 } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const Products = () => {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
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
      image_url: imageUrl || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product added");
      logActivity(user!.id, "Added product", "product", name);
      setShowAdd(false);
      setName(""); setSku(""); setPrice(""); setUnit("PCS"); setCategory(""); setImageUrl("");
      qc.invalidateQueries({ queryKey: ["products"] });
    }
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
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
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

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and pricing"
        actionLabel="Add Product"
        onAction={() => setShowAdd(true)}
      />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowMatrix(true)}>
          <Grid3X3 className="mr-2 h-4 w-4" />
          Product Access
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={products || []}
        searchKey="name"
        searchPlaceholder="Search products..."
        renderMobileCard={(row: any) => (
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex gap-0">
              <div className="w-24 h-24 shrink-0 bg-muted flex items-center justify-center">
                {row.image_url ? (
                  <img src={row.image_url} alt={row.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{row.sku}</p>
                <div className="flex items-center gap-2 mt-2">
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
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Product
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
