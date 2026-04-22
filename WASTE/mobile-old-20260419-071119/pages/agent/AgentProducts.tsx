import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, ScanLine, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentProducts() {
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

      // Fetch stock levels
      const { data: stockData } = await supabase
        .from("product_stock")
        .select("product_id, quantity");

      // Map stock to products (sum quantity across warehouses if multiple)
      const stockMap: Record<string, number> = {};
      stockData?.forEach((item) => {
        stockMap[item.product_id] = (stockMap[item.product_id] || 0) + Number(item.quantity);
      });

      // Merge
      return productsData.map(p => ({
        ...p,
        stock_quantity: stockMap[p.id] || 0
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
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
    staleTime: 1000 * 60 * 60, // 1 hour cache
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
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search products..." 
            className="pl-9 bg-muted/50 border-none shadow-none focus-visible:ring-1"
          />
          {search && (
            <button 
              onClick={() => setSearch("")} 
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {/* Categories scroll */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-3 px-3">
          <Button 
            variant="outline" 
            size="sm" 
            className={`rounded-full h-8 whitespace-nowrap ${!categoryFilter ? "bg-primary text-primary-foreground border-primary" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </Button>
          {categories?.map((c: any) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className={`rounded-full h-8 whitespace-nowrap ${categoryFilter === c.name ? "bg-primary text-primary-foreground border-primary" : ""}`}
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
            <div 
              onClick={() => setSelectedProduct(p)}
              className="flex items-center gap-3 p-4 border-b bg-card active:bg-muted/50 transition-colors"
            >
              <div className="h-14 w-14 rounded-lg bg-muted border overflow-hidden flex-shrink-0">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <ScanLine className="h-6 w-6 opacity-30" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate pr-2">{p.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                    {p.sku || "No SKU"}
                  </Badge>
                  {p.category && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                      {p.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="font-semibold text-sm block">₹{Number(p.base_price).toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">per {p.unit}</span>
              </div>
            </div>
          )}
        />
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
                  <Button size="icon" variant="secondary" className="rounded-full shadow-md h-8 w-8" onClick={() => setSelectedProduct(null)}>
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
                    {selectedProduct.stock_quantity !== null && (
                       <Badge variant={selectedProduct.stock_quantity > 0 ? "default" : "destructive"}>
                         {selectedProduct.stock_quantity > 0 ? `${selectedProduct.stock_quantity} in stock` : "Out of stock"}
                       </Badge>
                    )}
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
