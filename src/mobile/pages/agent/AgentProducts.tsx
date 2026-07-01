import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, ScanLine, X, Package } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentProducts() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["mobile-products"],
    queryFn: async () => {
      // Fetch products
      const { data: productsData, error } = await supabase
        .from("products")
        .select(`
          *,
          product_categories(name)
        `)
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;

      // Fetch stock via RPC (warehouse-scoped, role-aware)
      const productIds = (productsData || []).map((p: any) => p.id);
      const stockMap: Record<string, number> = {};
      if (productIds.length > 0 && user?.id) {
        const { data: stockData } = await supabase.rpc("check_stock_availability", {
          p_user_id: user.id,
          p_recorded_for: null,
          p_items: productIds.map((id: string) => ({ product_id: id, quantity: 0 })),
        } as any) as any;
        (stockData as any[])?.forEach((s: any) => {
          stockMap[s.out_product_id] = Number(s.out_available_qty);
        });
      }

      // Merge
      return (productsData || []).map((p: any) => ({
        ...p,
        stock_quantity: stockMap[p.id] || 0
      }));
    },
// 5 minutes cache
  });

  const { data: categories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, name")
        .order("name");
      return data || [];
    },
// 1 hour cache
  });

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? p.category === categoryFilter || p.product_categories?.name === categoryFilter : true;
    return matchesSearch && matchesCategory;
  }) || [];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search products..." 
            className="pl-10 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl h-12 shadow-sm font-medium focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
          />
          {search && (
            <button 
              onClick={() => setSearch("")} 
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {/* Categories scroll */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
          <Button 
            variant="outline" 
            size="sm" 
            className={cn("rounded-xl h-10 px-4 font-bold transition-all shadow-sm", !categoryFilter ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700")}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </Button>
          {categories?.map((c: any) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className={cn("rounded-xl h-10 px-4 font-bold transition-all shadow-sm", categoryFilter === c.name ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700")}
              onClick={() => setCategoryFilter(categoryFilter === c.name ? null : c.name)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 p-0 overflow-y-auto">
        <VirtualDataTable
          columns={[]} // Not used for mobile card render
          data={filteredProducts}
          height="100%"
          renderMobileCard={(p: any) => (
            <div className="px-4 py-2 w-full">
              <div 
                onClick={() => setSelectedProduct(p)}
                className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm active:scale-[0.98] transition-all"
              >
                <div className="h-14 w-14 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <ScanLine className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate text-slate-800 dark:text-white pr-2">{p.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {p.sku || "NO SKU"}
                    </span>
                    {p.stock_quantity !== null && (() => {
                      const minLevel = p.min_stock_level ?? 0;
                      const isOut = p.stock_quantity <= 0;
                      const isLow = !isOut && p.stock_quantity <= minLevel;
                      const cls = isOut ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700" : isLow ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700";
                      const label = isOut ? "Out of stock" : isLow ? "Low stock" : `${p.stock_quantity} in stock`;
                      return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${cls} uppercase tracking-wider`}>{label}</span>;
                    })()}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end">
                  <span className="font-black text-base text-slate-800 dark:text-white">₹{Number(p.base_price).toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">/{p.unit}</span>
                </div>
              </div>
            </div>
          )}
        />

        {!isLoading && search && filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No products found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          </div>
        )}

        {!isLoading && !search && (!products || products.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No products assigned</p>
            <p className="text-xs text-muted-foreground mt-1">Products will appear here once assigned</p>
          </div>
        )}
      </div>

      {/* Product Detail Sheet */}
      <Sheet open={!!selectedProduct} onOpenChange={(o) => !o && setSelectedProduct(null)}>
        <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-xl">
          {selectedProduct && (
            <div className="h-full flex flex-col">
              <div className="relative h-64 bg-muted w-full">
                {selectedProduct.image_url ? (
                   <img 
                    src={selectedProduct.image_url} 
                    alt={selectedProduct.name} 
                    className="h-full w-full object-cover"
                   />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <ScanLine className="h-16 w-16 opacity-20" />
                  </div>
                )}
                <div className="absolute top-4 right-4">
                  <Button size="icon" variant="secondary" className="rounded-full shadow-md h-10 w-10" onClick={() => setSelectedProduct(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold leading-tight">{selectedProduct.name}</h2>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-primary">₹{Number(selectedProduct.base_price).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Base Price</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline">{selectedProduct.sku}</Badge>
                    <Badge variant="secondary">{selectedProduct.category}</Badge>
                    <Badge variant="outline">Unit: {selectedProduct.unit}</Badge>
                    {selectedProduct.stock_quantity !== null && (() => {
                      const qty = selectedProduct.stock_quantity;
                      const minLevel = selectedProduct.min_stock_level ?? 0;
                      const isOut = qty <= 0;
                      const isLow = !isOut && qty <= minLevel;
                      const cls = isOut ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700" : isLow ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700";
                      const label = isOut ? "Out of stock" : isLow ? `Low stock (${qty})` : `${qty} in stock`;
                      return <Badge className={cls}>{label}</Badge>;
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground/80">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedProduct.description || "No description available for this product."}
                  </p>
                </div>

                {/* Additional Details could go here (e.g., specific pricing for customer types, taxes) */}
              </div>
              
              <div className="p-4 border-t bg-background">
                <Button className="w-full" onClick={() => setSelectedProduct(null)}>Close</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
