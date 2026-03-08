import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const Products = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
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
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product added");
      setShowAdd(false);
      setName(""); setSku(""); setPrice(""); setUnit("PCS"); setCategory("");
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  };

  const columns = [
    { header: "Product Name", accessor: "name" as const, className: "font-medium" },
    { header: "SKU", accessor: "sku" as const, className: "font-mono text-xs text-muted-foreground" },
    { header: "Category", accessor: (row: any) => row.category ? <Badge variant="secondary">{row.category}</Badge> : <span className="text-muted-foreground">—</span> },
    { header: "Base Price", accessor: (row: any) => `₹${Number(row.base_price).toLocaleString()}` },
    { header: "Unit", accessor: "unit" as const },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and pricing"
        actionLabel="Add Product"
        onAction={() => setShowAdd(true)}
      />
      <DataTable columns={columns} data={products || []} searchKey="name" searchPlaceholder="Search products..." />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
            <div><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} required className="mt-1" placeholder="WB-500" /></div>
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
