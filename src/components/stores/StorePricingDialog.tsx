import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface StorePricingDialogProps {
  store: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StorePricingDialog({ store, open, onOpenChange }: StorePricingDialogProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["products-for-store", store?.store_type_id],
    queryFn: async () => {
      // Get products accessible to this store type
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", store.store_type_id);

      if (accessData && accessData.length > 0) {
        return accessData.map((a: any) => a.products).filter(Boolean);
      }
      // If no access matrix, show all active products
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!store,
  });

  const { data: typePricing } = useQuery({
    queryKey: ["store-type-pricing-for", store?.store_type_id],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", store.store_type_id);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!store,
  });

  const { data: storePricing, isLoading } = useQuery({
    queryKey: ["store-pricing", store?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", store.id);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!store,
  });

  if (!store) return null;

  const getStorePrice = (productId: string) => {
    if (productId in priceMap) return priceMap[productId];
    if (storePricing && productId in storePricing) return String(storePricing[productId]);
    return "";
  };

  const getEffectivePrice = (product: any) => {
    const storeP = getStorePrice(product.id);
    if (storeP && Number(storeP) > 0) return `₹${Number(storeP).toLocaleString()} (store)`;
    if (typePricing && product.id in typePricing) return `₹${typePricing[product.id].toLocaleString()} (type)`;
    return `₹${Number(product.base_price).toLocaleString()} (base)`;
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("store_pricing").delete().eq("store_id", store.id);
    const inserts = (products || [])
      .filter((p: any) => {
        const val = getStorePrice(p.id);
        return val !== "" && Number(val) > 0;
      })
      .map((p: any) => ({
        store_id: store.id,
        product_id: p.id,
        price: Number(getStorePrice(p.id)),
      }));
    if (inserts.length > 0) {
      await supabase.from("store_pricing").insert(inserts);
    }
    setSaving(false);
    toast.success("Store pricing saved");
    qc.invalidateQueries({ queryKey: ["store-pricing", store.id] });
    setPriceMap({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pricing — {store.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {products?.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{p.sku}</Badge>
                    <span className="text-xs text-muted-foreground">{getEffectivePrice(p)}</span>
                  </div>
                </div>
                <Input
                  type="number"
                  value={getStorePrice(p.id)}
                  onChange={(e) => setPriceMap({ ...priceMap, [p.id]: e.target.value })}
                  placeholder="—"
                  className="w-24 h-8 text-sm"
                />
              </div>
            ))}
          </div>
        )}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Store Pricing
        </Button>
      </DialogContent>
    </Dialog>
  );
}
