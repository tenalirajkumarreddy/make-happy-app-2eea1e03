import React, { useMemo } from 'react';
import { Package, ArrowRightLeft, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StaffHolding {
  user_id: string;
  full_name: string;
  quantity: number;
}

function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const { data } = supabase.storage.from('entity-photos').getPublicUrl(path);
  return data?.publicUrl || null;
}

interface ProductInventoryCardProps {
  item: {
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      sku: string;
      unit: string;
      base_price: number;
      image_url?: string;
      min_stock_level?: number;
    };
  };
  warehouseId?: string;
  staffHoldings?: StaffHolding[];
  onAdjust?: () => void;
  onTransfer?: () => void;
}

export function ProductInventoryCard({ item, staffHoldings = [], onAdjust, onTransfer }: ProductInventoryCardProps) {
  const { product, quantity } = item;
  if (!product) return null;
  const rawBasePrice = Number(product.base_price);
  const basePrice = Number.isFinite(rawBasePrice) ? rawBasePrice : 0;

  const getStatusColor = (qty: number, minLevel: number = 0) => {
    if (qty <= 0) return "text-red-500 bg-red-50 ring-red-500/20";
    if (qty <= minLevel) return "text-amber-500 bg-amber-50 ring-amber-500/20";
    return "text-emerald-500 bg-emerald-50 ring-emerald-500/20";
  };

  const getStatusText = (qty: number, minLevel: number = 0) => {
    if (qty <= 0) return "OUT OF STOCK";
    if (qty <= minLevel) return "LOW STOCK";
    return "IN STOCK";
  };

  const minLevel = product.min_stock_level || 0;
  const statusColor = getStatusColor(quantity, minLevel);

  const imageUrl = useMemo(() => getImageUrl(product?.image_url), [product?.image_url]);

  return (
    <Card className="overflow-hidden flex flex-col hover:border-border transition-colors">
      <div className="relative h-40 bg-muted/30 flex items-center justify-center p-4 border-b">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-auto object-contain drop-shadow-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <Package className="h-16 w-16 text-muted-foreground/30" />
        )}
      <div 
        className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ring-1 ring-inset shadow-xs uppercase ${statusColor}`}
        role="status"
        aria-label={`Stock status: ${getStatusText(quantity, minLevel)}. Current quantity: ${quantity} ${product.unit}`}
      >
        <span className="sr-only">Stock status: </span>
        {getStatusText(quantity, minLevel)}
      </div>
      </div>
      
      <CardContent className="p-4 flex-1 flex flex-col">
        <div className="flex-1">
          <div className="flex flex-col mb-3">
            <h3 className="font-semibold text-base leading-tight truncate" title={product.name}>{product.name}</h3>
            <p className="text-xs text-muted-foreground font-medium bg-muted/50 w-fit px-1.5 py-0.5 rounded mt-1">{product.sku || 'No SKU'}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-slate-50 rounded p-2 border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Price / {product.unit}</span>
              <span className="font-medium text-sm">{formatCurrency(basePrice)}</span>
            </div>
            <div className="bg-slate-50 rounded p-2 border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Total Value</span>
              <span className="font-medium text-sm">{formatCurrency(basePrice * Number(quantity || 0))}</span>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-bold tracking-tight" style={{ color: quantity <= minLevel ? 'var(--destructive)' : 'var(--emerald-600)'}}>{quantity}</span>
              <span className="text-sm font-medium text-muted-foreground">{product.unit}(s)</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${quantity > minLevel ? 'bg-emerald-500' : quantity > 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.max(2, (quantity / Math.max(100, minLevel * 3)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="pt-3 pb-1 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
              STAFF HOLDINGS
              <span className="bg-muted px-1.5 rounded">{staffHoldings?.length || 0}</span>
            </h4>
            <div className="space-y-1.5">
              {staffHoldings && staffHoldings.length > 0 ? (
                staffHoldings.map((staff, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm py-1 px-2 bg-slate-50 rounded border">
                    <span className="truncate pr-2 font-medium text-slate-700">{staff.full_name}</span>
                    <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded">{staff.quantity}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded text-center border border-dashed">
                  No staff holdings
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" className="w-full text-xs h-9 uppercase font-semibold tracking-wider hover:bg-slate-50" onClick={onAdjust}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Adjust
          </Button>
          <Button variant="default" size="sm" className="w-full text-xs h-9 uppercase font-semibold tracking-wider" onClick={onTransfer}>
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Transfer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
