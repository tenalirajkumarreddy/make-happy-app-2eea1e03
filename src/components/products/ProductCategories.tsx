import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, Save, X, Package, Tags } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProductCategoriesProps {
  onBack: () => void;
}

export function ProductCategories({ onBack }: ProductCategoriesProps) {
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, is_active, image_url")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const getProductsForCategory = (categoryName: string) =>
    products?.filter((p) => p.category === categoryName) || [];

  const uncategorizedProducts = products?.filter((p) => !p.category) || [];

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase.from("product_categories").insert({ name: trimmed });
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("Category already exists");
      else toast.error(error.message);
      return;
    }
    toast.success(`Category "${trimmed}" created`);
    setShowAdd(false);
    setNewCategory("");
    qc.invalidateQueries({ queryKey: ["product-categories"] });
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    const oldCat = categories?.find((c) => c.id === id);
    if (!oldCat || oldCat.name === trimmed) { setEditingId(null); return; }

    setSaving(true);
    // Update the category name
    const { error } = await supabase.from("product_categories").update({ name: trimmed }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }

    // Also update all products that had the old category name
    await supabase.from("products").update({ category: trimmed }).eq("category", oldCat.name);

    toast.success(`Renamed to "${trimmed}"`);
    setEditingId(null);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["product-categories"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const handleDelete = async (id: string, name: string) => {
    setSaving(true);
    // Clear category from products using this category
    await supabase.from("products").update({ category: null }).eq("category", name);
    // Delete the category
    const { error } = await supabase.from("product_categories").delete().eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Category "${name}" deleted`);
    qc.invalidateQueries({ queryKey: ["product-categories"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const loading = loadingCategories || loadingProducts;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Product Categories</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage categories. Assign categories when adding or editing products.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => { setNewCategory(""); setShowAdd(true); }}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Category</span>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (!categories || categories.length === 0) && uncategorizedProducts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tags className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No categories yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories?.map((cat) => {
            const catProducts = getProductsForCategory(cat.name);
            const isEditing = editingId === cat.id;

            return (
              <div key={cat.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 max-w-[200px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(cat.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleRename(cat.id)} disabled={saving}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{cat.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {catProducts.length} product{catProducts.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm" variant="ghost" className="h-7 text-xs gap-1"
                            onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                          >
                            <Pencil className="h-3 w-3" /> Rename
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" /> Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {catProducts.length > 0
                                    ? `${catProducts.length} product(s) will be moved to uncategorized.`
                                    : "This category has no products."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(cat.id, cat.name)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {catProducts.length > 0 ? (
                  <div className="divide-y">
                    {catProducts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
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
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No products in this category</p>
                )}
              </div>
            );
          })}

          {/* Uncategorized section */}
          {uncategorizedProducts.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                <div className="flex-1 flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Uncategorized</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {uncategorizedProducts.length} product{uncategorizedProducts.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
              <div className="divide-y">
                {uncategorizedProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
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
          )}
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
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Category
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
