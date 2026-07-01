import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Package, ScanLine, Tag, IndianRupee } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function AdminProducts() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-mobile-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_categories(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const { data: stockData } = await (supabase as any).from("product_stock").select("product_id, quantity");
      const stockMap: Record<string, number> = {};
      stockData?.forEach((item: any) => { stockMap[item.product_id] = (stockMap[item.product_id] || 0) + Number(item.quantity); });
      return (data || []).map((p: any) => ({ ...p, stock_quantity: stockMap[p.id] || 0 }));
    },
    staleTime: 300_000,
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-mobile-product-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("id, name").order("name");
      return data || [];
    },
    staleTime: 3600_000,
  });

  const filtered = (products || []).filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || p.category === categoryFilter || p.product_categories?.name === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Product Catalog</p>
          <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
            {products?.length ?? 0}
          </h2>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full mt-1">
            <Package className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Active Items
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-white dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex items-center pr-3 border-transparent focus-within:border-pink-500 dark:focus-within:border-pink-500 transition-colors border">
          <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, SKU..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="h-8 w-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-transform shrink-0">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide -mx-5 px-5 snap-x">
          <button
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "snap-start px-4 py-2 rounded-xl text-[13px] font-bold tracking-tight whitespace-nowrap transition-all active:scale-95 shadow-sm border",
              !categoryFilter
                ? "bg-pink-500 text-white border-pink-500 dark:bg-pink-600 dark:border-pink-600"
                : "bg-white dark:bg-[#1a1d24] text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-800"
            )}
          >
            All Items
          </button>
          {(categories || []).map((c: any) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(categoryFilter === c.name ? null : c.name)}
              className={cn(
                "snap-start px-4 py-2 rounded-xl text-[13px] font-bold tracking-tight whitespace-nowrap transition-all active:scale-95 shadow-sm border",
                categoryFilter === c.name
                  ? "bg-pink-500 text-white border-pink-500 dark:bg-pink-600 dark:border-pink-600"
                  : "bg-white dark:bg-[#1a1d24] text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-800"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-1 mt-4 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Products</h3>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No products found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different filter or search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p: any) => {
              const inStock = p.stock_quantity > 0;
              
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="w-full text-left bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-3.5 active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200/50 dark:border-slate-700/50 relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/30 dark:to-rose-900/30">
                          <Package className="h-6 w-6 text-pink-600/40 dark:text-pink-400/40" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex justify-between items-start">
                        <div className="pr-2 min-w-0 flex-1">
                          <h4 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                              {p.sku || "N/A"}
                            </span>
                            {p.category && (
                              <span className="text-[10px] font-medium text-slate-400 truncate flex items-center gap-1">
                                <Tag className="h-2.5 w-2.5" />
                                {p.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
                        <div>
                          <p className="text-[15px] font-black tracking-tight text-slate-900 dark:text-white flex items-center">
                            <IndianRupee className="h-3.5 w-3.5 -mr-0.5 text-slate-400" />
                            {Number(p.base_price).toLocaleString("en-IN")} 
                            <span className="text-[10px] font-medium text-slate-400 ml-1">/{p.unit}</span>
                          </p>
                        </div>
                        
                        <div className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase",
                          inStock 
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" 
                            : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                        )}>
                          {inStock ? `${p.stock_quantity} in stock` : "Out of stock"}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modern Detail Sheet */}
      <Sheet open={!!selectedProduct} onOpenChange={(o) => !o && setSelectedProduct(null)}>
        <SheetContent side="bottom" className="h-[80vh] p-0 rounded-t-[2rem] border-t-0 bg-slate-50 dark:bg-[#0f1115] shadow-2xl outline-none">
          {selectedProduct && (
            <div className="h-full flex flex-col relative overflow-hidden">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/50 backdrop-blur-md rounded-full z-50"></div>
              
              <div className="relative h-[40%] bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden">
                {selectedProduct.image_url ? (
                  <>
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                  </>
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-pink-500/10 to-rose-500/10">
                    <Package className="h-20 w-20 text-pink-500/20" />
                  </div>
                )}
                
                <div className="absolute bottom-5 left-5 right-5">
                  <div className="flex gap-2 mb-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-white/20 backdrop-blur-md text-white px-2 py-1 rounded-md">
                      {selectedProduct.sku}
                    </span>
                    {selectedProduct.category && (
                      <span className="text-[10px] font-bold tracking-widest uppercase bg-white/20 backdrop-blur-md text-white px-2 py-1 rounded-md">
                        {selectedProduct.category}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black text-white leading-tight drop-shadow-md pb-[10px]">
                    {selectedProduct.name}
                  </h2>
                </div>
                
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-5 right-5 h-9 w-9 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white active:scale-95 transition-transform"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-5 pt-6 pb-24 bg-white dark:bg-[#1a1d24] rounded-t-3xl -mt-6 relative z-10 space-y-6">
                
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#0f1115] rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Base Price</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white flex items-center">
                      <IndianRupee className="h-6 w-6 -mr-1 text-slate-400" />
                      {Number(selectedProduct.base_price).toLocaleString("en-IN")}
                      <span className="text-sm font-bold text-slate-400 ml-1">/{selectedProduct.unit}</span>
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Inventory</p>
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-sm",
                      selectedProduct.stock_quantity > 0 
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" 
                        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    )}>
                      {selectedProduct.stock_quantity > 0 ? (
                        <>{selectedProduct.stock_quantity} Left</>
                      ) : (
                        "Out of Stock"
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <ScanLine className="h-4 w-4" /> Description
                  </p>
                  <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {selectedProduct.description || "No detailed description available for this product."}
                  </p>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-white via-white to-transparent dark:from-[#1a1d24] dark:via-[#1a1d24] z-20">
                <button 
                  className="w-full h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold text-[15px] shadow-xl active:scale-[0.98] transition-transform"
                  onClick={() => setSelectedProduct(null)}
                >
                  Close Details
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
