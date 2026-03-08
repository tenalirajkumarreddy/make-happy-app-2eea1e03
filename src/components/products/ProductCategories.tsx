import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, Save, X, Package } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ProductCategoriesProps {
  onBack: () => void;
}

export function ProductCategories({ onBack }: ProductCategoriesProps) {
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, is_active, image_url")
        .order("category", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const categories = useMemo(() => {
    if (!products) return [];
    const catMap = new Map<string, typeof products>();
    products.forEach((p) => {
      const cat = p.category || "Uncategorized";
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(p);
    });
    return Array.from(catMap.entries())
      .sort(([a], [b]) => {
        if (a === "Uncategorized") return 1;
        if (b === "Uncategorized") return -1;
        return a.localeCompare(b);
      })
      .map(([name, items]) => ({ name, products: items }));
  }, [products]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Category already exists");
      return;
    }
    // Categories are derived from products, so we just close the dialog.
    // The user needs to assign products to this category.
    toast.info(`Category "${trimmed}" will appear once products are assigned to it.`);
    setShowAdd(false);
    setNewCategory("");
  };

  const handleRenameCategory = async (oldName: string) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCategory(null);
      return;
    }
    setSaving(true);
    const productsInCat = products?.filter((p) => (p.category || "Uncategorized") === oldName) || [];
    const ids = productsInCat.map((p) => p.id);

    if (ids.length > 0) {
      const newCatValue = trimmed === "Uncategorized" ? null : trimmed;
      const { error } = await supabase
        .from("products")
        .update({ category: newCatValue })
        .in("id", ids);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(`Category renamed to "${trimmed}"`);
    setEditingCategory(null);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const handleDeleteCategory = async (categoryName: string) => {
    if (categoryName === "Uncategorized") return;
    setSaving(true);
    const productsInCat = products?.filter((p) => p.category === categoryName) || [];
    const ids = productsInCat.map((p) => p.id);

    if (ids.length > 0) {
      const { error } = await supabase
        .from("products")
        .update({ category: null })
        .in("id", ids);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(`Category "${categoryName}" removed. ${ids.length} product(s) moved to Uncategorized.`);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Product Categories</h2>
          <p className="text-sm text-muted-foreground">
            View and manage product categories. Rename or remove categories to reorganize products.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => { setNewCategory(""); setShowAdd(true); }}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Category</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No products found. Add products first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isEditing = editingCategory === cat.name;
            const isUncategorized = cat.name === "Uncategorized";

            return (
              <div key={cat.name} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 max-w-[200px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCategory(cat.name);
                          if (e.key === "Escape") setEditingCategory(null);
                        }}
                      />
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleRenameCategory(cat.name)} disabled={saving}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingCategory(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{cat.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {cat.products.length} product{cat.products.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {canEdit && !isUncategorized && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1"
                            onClick={() => { setEditingCategory(cat.name); setEditName(cat.name); }}
                          >
                            <Pencil className="h-3 w-3" /> Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteCategory(cat.name)}
                            disabled={saving}
                          >
                            <Trash2 className="h-3 w-3" /> Remove
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="divide-y">
                  {cat.products.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{p.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>
                      </div>
                      <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Category Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div>
              <Label>Category Name</Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="mt-1"
                placeholder="e.g., Water, Soda, Juice"
                required
              />
              <p className="text-xs text-muted-foreground mt-2">
                To assign products to this category, edit each product and set its category field.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Create Category
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
