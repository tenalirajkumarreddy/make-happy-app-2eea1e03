import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, Tag, Droplets, Box } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";
import { Card } from "../../components/ui/Card";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  unit: string | null;
  category: string | null;
  is_active: boolean;
  image_url: string | null;
}

export function AgentProducts() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["mobile-v2-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, price, unit, category, is_active, image_url")
        .eq("is_active", true)
        .order("name");
      return (data as ProductRow[]) || [];
    },
  });

  // Get unique categories
  const categories = [...new Set(products?.map(p => p.category).filter(Boolean) || [])];

  const filteredProducts = products?.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !category || product.category === category;
    return matchesSearch && matchesCategory;
  }) || [];

  if (isLoading) {
    return (
      <div className="mv2-page">
        <LoadingCenter />
      </div>
    );
  }

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 mv2-text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mv2-input pl-10"
          />
        </div>

        {/* Category Filters */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4 scrollbar-hide">
            <button
              className={`mv2-chip mv2-chip-sm whitespace-nowrap ${!category ? "mv2-bg-primary text-white" : ""}`}
              onClick={() => setCategory(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`mv2-chip mv2-chip-sm whitespace-nowrap ${category === cat ? "mv2-bg-primary text-white" : ""}`}
                onClick={() => setCategory(cat === category ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Products List */}
        <Section title={`Products (${filteredProducts.length})`}>
          {filteredProducts.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={Package}
                title={search || category ? "No Results" : "No Products"}
                description={search || category ? "Try different filters" : "No products available"}
              />
            </Card>
          ) : (
            <div className="mv2-list">
              {filteredProducts.map((product) => (
                <ListItem
                  key={product.id}
                  title={product.name}
                  subtitle={product.sku || "No SKU"}
                  meta={product.category || undefined}
                  avatar={product.image_url || undefined}
                  icon={!product.image_url ? (product.category?.toLowerCase().includes("water") ? Droplets : Box) : undefined}
                  badge={
                    <div className="text-right">
                      <p className="text-sm font-bold">₹{Number(product.price).toLocaleString("en-IN")}</p>
                      {product.unit && (
                        <p className="text-[11px] mv2-text-muted">per {product.unit}</p>
                      )}
                    </div>
                  }
                  showArrow={false}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
