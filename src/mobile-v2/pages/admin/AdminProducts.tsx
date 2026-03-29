import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Package, 
  Search, 
  Filter,
  Plus,
  Edit,
  Archive
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminProducts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: products, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-products", categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(`
          id,
          name,
          sku,
          description,
          unit_price,
          category,
          stock_quantity,
          is_active,
          image_url
        `)
        .order("name", { ascending: true });

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Get unique categories
  const categories = [...new Set(products?.map(p => p.category).filter(Boolean))] as string[];

  const filteredProducts = products?.filter(product => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      product.name?.toLowerCase().includes(search) ||
      product.sku?.toLowerCase().includes(search) ||
      product.description?.toLowerCase().includes(search)
    );
  });

  // Stats
  const activeProducts = products?.filter(p => p.is_active !== false).length || 0;
  const lowStockProducts = products?.filter(p => (p.stock_quantity || 0) < 10).length || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <Loading.Skeleton key={i} className="h-24 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground">Manage product catalog</p>
        </div>
        <Button size="sm" className="mv2-btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="mv2-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-primary">
            {products?.length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {activeProducts}
          </p>
          <p className="text-xs text-muted-foreground">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-amber-600">
            {lowStockProducts}
          </p>
          <p className="text-xs text-muted-foreground">Low Stock</p>
        </Card>
      </div>

      {/* Products List */}
      <Section title="All Products">
        {filteredProducts && filteredProducts.length > 0 ? (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const isLowStock = (product.stock_quantity || 0) < 10;

              return (
                <Card key={product.id} variant="outline" className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">
                          {product.name}
                        </p>
                        {!product.is_active && (
                          <Badge variant="danger" className="text-xs">Inactive</Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        SKU: {product.sku || "N/A"}
                      </p>

                      {product.category && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          {product.category}
                        </Badge>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-primary">
                          {formatCurrency(product.unit_price || 0)}
                        </span>
                        <span className={`text-sm ${isLowStock ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                          Stock: {product.stock_quantity ?? "∞"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title="No products found"
            description="Add your first product"
          />
        )}
      </Section>
    </div>
  );
}
