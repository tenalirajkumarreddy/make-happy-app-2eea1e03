import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Warehouse, Package, AlertTriangle, Search, TrendingDown, TrendingUp, Box } from "lucide-react";
import { ProductInventoryCard, ProductInventoryListItem } from "./ProductInventoryCard";
import { useState, useMemo } from "react";

interface WarehouseStock {
  id: string;
  name: string;
  code?: string;
  address?: string;
  is_active: boolean;
}

interface ProductStock {
  id: string;
  name: string;
  sku: string;
  category?: string;
  unit: string;
  base_price: number;
  image_url?: string;
  quantity: number;
  min_stock_level?: number;
}

interface WarehouseStockViewProps {
  warehouses?: WarehouseStock[];
  products?: ProductStock[];
  selectedWarehouseId?: string;
  onWarehouseChange?: (warehouseId: string) => void;
  isLoading?: boolean;
  canEdit?: boolean;
  onViewProduct?: (product: ProductStock) => void;
  onAdjustStock?: (product: ProductStock) => void;
  onTransferStock?: (product: ProductStock) => void;
  onViewHistory?: (product: ProductStock) => void;
}

export function WarehouseStockView({
  warehouses,
  products,
  selectedWarehouseId,
  onWarehouseChange,
  isLoading,
  canEdit = false,
  onViewProduct,
  onAdjustStock,
  onTransferStock,
  onViewHistory,
}: WarehouseStockViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const selectedWarehouse = useMemo(() => 
    warehouses?.find(w => w.id === selectedWarehouseId),
    [warehouses, selectedWarehouseId]
  );

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    let filtered = products;
    
    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term)
      );
    }
    
    // Filter by stock status
    switch (activeTab) {
      case "low":
        filtered = filtered.filter(p => {
          const minStock = p.min_stock_level || 0;
          return p.quantity <= minStock && p.quantity > 0;
        });
        break;
      case "out":
        filtered = filtered.filter(p => p.quantity <= 0);
        break;
      case "good":
        filtered = filtered.filter(p => {
          const minStock = p.min_stock_level || 0;
          return p.quantity > minStock;
        });
        break;
      default:
        break;
    }
    
    return filtered;
  }, [products, searchTerm, activeTab]);

  const stats = useMemo(() => {
    if (!products) return { total: 0, low: 0, out: 0, value: 0 };
    
    return products.reduce((acc, p) => {
      acc.total++;
      acc.value += (p.quantity || 0) * (p.base_price || 0);
      
      const minStock = p.min_stock_level || 0;
      if (p.quantity <= 0) acc.out++;
      else if (p.quantity <= minStock) acc.low++;
      
      return acc;
    }, { total: 0, low: 0, out: 0, value: 0 });
  }, [products]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!warehouses || warehouses.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Warehouse className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">No Warehouses</h3>
          <p className="text-muted-foreground text-sm">
            Create warehouses to manage inventory stock levels.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warehouse Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Warehouse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Selected Warehouse</p>
                <p className="font-semibold">{selectedWarehouse?.name || "Select a warehouse"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {warehouses.map((w) => (
                <Button
                  key={w.id}
                  variant={selectedWarehouseId === w.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onWarehouseChange?.(w.id)}
                >
                  {w.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Stock Value</p>
                <p className="text-2xl font-bold">₹{stats.value.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Low Stock</p>
                <p className={`text-2xl font-bold ${stats.low > 0 ? "text-amber-600" : ""}`}>
                  {stats.low}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Out of Stock</p>
                <p className={`text-2xl font-bold ${stats.out > 0 ? "text-red-600" : ""}`}>
                  {stats.out}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                <Box className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5" />
              Products
              <Badge variant="secondary">{filteredProducts.length}</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Products</TabsTrigger>
              <TabsTrigger value="good">In Stock</TabsTrigger>
              <TabsTrigger value="low">
                Low Stock
                {stats.low > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {stats.low}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="out">
                Out of Stock
                {stats.out > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {stats.out}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No products found matching your criteria.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.map((product) => (
                    <ProductInventoryCard
                      key={product.id}
                      product={product}
                      canEdit={canEdit}
                      onView={() => onViewProduct?.(product)}
                      onAdjust={() => onAdjustStock?.(product)}
                      onTransfer={() => onTransferStock?.(product)}
                      onHistory={() => onViewHistory?.(product)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Low Stock Alert Section */}
      {(stats.low > 0 || stats.out > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700 mb-4">
              {stats.out > 0 && `${stats.out} products are out of stock. `}
              {stats.low > 0 && `${stats.low} products are running low on stock. `}
              Consider restocking or transferring from other warehouses.
            </p>
            <div className="space-y-2">
              {products
                ?.filter(p => {
                  const minStock = p.min_stock_level || 0;
                  return p.quantity <= minStock;
                })
                .slice(0, 5)
                .map(product => (
                  <ProductInventoryListItem
                    key={product.id}
                    product={product}
                    onClick={() => onViewProduct?.(product)}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface WarehouseSelectorProps {
  warehouses: WarehouseStock[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export function WarehouseSelector({ warehouses, selectedId, onSelect, isLoading }: WarehouseSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {warehouses.map((warehouse) => (
        <Button
          key={warehouse.id}
          variant={selectedId === warehouse.id ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(warehouse.id)}
          className="flex items-center gap-2"
        >
          <Warehouse className="h-4 w-4" />
          {warehouse.name}
          {!warehouse.is_active && (
            <Badge variant="secondary" className="ml-1 text-[10px]">Inactive</Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
