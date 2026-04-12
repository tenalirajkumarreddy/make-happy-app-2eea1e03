import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Package, ArrowUpRight, Plus, Minus, ArrowRightLeft, History } from "lucide-react";

interface ProductInventoryCardProps {
  product: {
    id: string;
    name: string;
    sku: string;
    category?: string;
    unit: string;
    base_price: number;
    image_url?: string;
    quantity: number;
    min_stock_level?: number;
  };
  canEdit?: boolean;
  onView?: () => void;
  onAdjust?: () => void;
  onTransfer?: () => void;
  onHistory?: () => void;
  compact?: boolean;
}

export function ProductInventoryCard({
  product,
  canEdit = false,
  onView,
  onAdjust,
  onTransfer,
  onHistory,
  compact = false,
}: ProductInventoryCardProps) {
  const minStock = product.min_stock_level || 0;
  const stockStatus = product.quantity < 0 
    ? "critical" 
    : product.quantity === 0 
    ? "empty" 
    : product.quantity <= minStock 
    ? "low" 
    : "good";

  const statusConfig = {
    critical: { 
      badge: "bg-red-100 text-red-700 border-red-200", 
      text: "text-red-600",
      bg: "bg-red-50",
      label: "Critical"
    },
    empty: { 
      badge: "bg-slate-100 text-slate-600 border-slate-200", 
      text: "text-slate-500",
      bg: "bg-slate-50",
      label: "Out of Stock"
    },
    low: { 
      badge: "bg-amber-100 text-amber-700 border-amber-200", 
      text: "text-amber-600",
      bg: "bg-amber-50",
      label: "Low Stock"
    },
    good: { 
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200", 
      text: "text-emerald-600",
      bg: "bg-emerald-50",
      label: "In Stock"
    },
  };

  const status = statusConfig[stockStatus];
  const stockValue = (product.quantity || 0) * (product.base_price || 0);

  if (compact) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg ${status.bg} flex items-center justify-center shrink-0`}>
            {product.image_url ? (
              <Avatar className="h-10 w-10 rounded-lg">
                <AvatarImage src={product.image_url} alt={product.name} className="object-cover" />
                <AvatarFallback className="rounded-lg">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
            ) : (
              <Package className={`h-5 w-5 ${status.text}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.sku}</p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${status.badge}`}>
                {status.label}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className={`font-bold ${status.text}`}>
                {product.quantity} <span className="text-xs font-normal text-muted-foreground">{product.unit}</span>
              </p>
              <p className="text-xs text-muted-foreground">₹{stockValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-xl ${status.bg} flex items-center justify-center shrink-0`}>
              {product.image_url ? (
                <Avatar className="h-12 w-12 rounded-xl">
                  <AvatarImage src={product.image_url} alt={product.name} className="object-cover" />
                  <AvatarFallback className="rounded-lg">
                    <Package className={`h-6 w-6 ${status.text}`} />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Package className={`h-6 w-6 ${status.text}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base truncate">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">{product.sku}</p>
                </div>
                <Badge className={`${status.badge} shrink-0`}>
                  {status.label}
                </Badge>
              </div>
              {product.category && (
                <Badge variant="outline" className="mt-2 text-xs font-normal">
                  {product.category}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stock Info */}
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Stock</span>
              {minStock > 0 && (
                <span className="text-xs text-muted-foreground">Min: {minStock}</span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${status.text}`}>
                {product.quantity}
              </span>
              <span className="text-sm text-muted-foreground">{product.unit}</span>
            </div>
            {stockValue > 0 && (
              <p className="text-xs text-muted-foreground">
                Value: ₹{stockValue.toLocaleString()}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Price</p>
              <p className="font-semibold">₹{Number(product.base_price || 0).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stock Value</p>
              <p className="font-semibold">₹{stockValue.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t bg-muted/30 p-3">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 h-9"
              onClick={onView}
            >
              View <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
            {canEdit && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 h-9"
                  onClick={onAdjust}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adjust
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="flex-1 h-9"
                  onClick={onTransfer}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transfer
                </Button>
              </>
            )}
            {onHistory && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 shrink-0"
                onClick={onHistory}
                title="View History"
              >
                <History className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ProductInventoryListItemProps {
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    quantity: number;
    min_stock_level?: number;
  };
  onClick?: () => void;
}

export function ProductInventoryListItem({ product, onClick }: ProductInventoryListItemProps) {
  const minStock = product.min_stock_level || 0;
  const isLow = product.quantity <= minStock && product.quantity > 0;
  const isCritical = product.quantity <= 0;

  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-4 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
          isCritical ? "bg-red-50" : isLow ? "bg-amber-50" : "bg-slate-50"
        }`}>
          <Package className={`h-5 w-5 ${
            isCritical ? "text-red-500" : isLow ? "text-amber-500" : "text-slate-400"
          }`} />
        </div>
        <div>
          <p className="font-medium text-sm">{product.name}</p>
          <p className="text-xs text-muted-foreground">{product.sku}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-bold text-sm ${
          isCritical ? "text-red-600" : isLow ? "text-amber-600" : "text-foreground"
        }`}>
          {product.quantity} {product.unit}
        </p>
        {isLow && (
          <p className="text-[10px] text-amber-600">Low stock</p>
        )}
      </div>
    </div>
  );
}
