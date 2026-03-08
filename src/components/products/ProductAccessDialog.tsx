import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface ProductAccessDialogProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductAccessDialog({ product, open, onOpenChange }: ProductAccessDialogProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-all"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: currentAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ["product-store-type-access", product?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_products").select("store_type_id").eq("product_id", product.id);
      return data || [];
    },
    enabled: !!product,
  });

  const { data: currentPricing, isLoading: loadingPricing } = useQuery({
    queryKey: ["product-store-type-pricing", product?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("store_type_id, price").eq("product_id", product.id);
      return data || [];
    },
    enabled: !!product,
  });

  if (!product) return null;

  const accessSet = new Set(currentAccess?.map((a) => a.store_type_id) || []);
  const pricingLookup: Record<string, number> = {};
  currentPricing?.forEach((p) => { pricingLookup[p.store_type_id] = Number(p.price); });

  const isChecked = (storeTypeId: string) => {
    if (storeTypeId in accessMap) return accessMap[storeTypeId];
    return accessSet.has(storeTypeId);
  };

  const getPrice = (storeTypeId: string) => {
    if (storeTypeId in priceMap) return priceMap[storeTypeId];
    if (storeTypeId in pricingLookup) return String(pricingLookup[storeTypeId]);
    return "";
  };

  const handleSave = async () => {
    setSaving(true);

    // Determine final access
    const finalAccess = (storeTypes || []).filter((st) => isChecked(st.id)).map((st) => st.id);

    // Delete existing access for this product, re-insert
    await supabase.from("store_type_products").delete().eq("product_id", product.id);
    if (finalAccess.length > 0) {
      await supabase.from("store_type_products").insert(
        finalAccess.map((stId) => ({ store_type_id: stId, product_id: product.id }))
      );
    }

    // Pricing: delete existing for this product, insert non-empty
    await supabase.from("store_type_pricing").delete().eq("product_id", product.id);
    const pricingInserts = (storeTypes || [])
      .filter((st) => {
        const val = getPrice(st.id);
        return val !== "" && Number(val) > 0;
      })
      .map((st) => ({
        store_type_id: st.id,
        product_id: product.id,
        price: Number(getPrice(st.id)),
      }));
    if (pricingInserts.length > 0) {
      await supabase.from("store_type_pricing").insert(pricingInserts);
    }

    setSaving(false);
    toast.success("Access & pricing saved");
    qc.invalidateQueries({ queryKey: ["product-store-type-access", product.id] });
    qc.invalidateQueries({ queryKey: ["product-store-type-pricing", product.id] });
    qc.invalidateQueries({ queryKey: ["store-type-products"] });
    qc.invalidateQueries({ queryKey: ["store-type-pricing"] });
    setAccessMap({});
    setPriceMap({});
  };

  const loading = loadingAccess || loadingPricing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Store Type Access
            <Badge variant="outline" className="text-xs font-mono">{product.sku}</Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Control which store types can access <span className="font-medium text-foreground">{product.name}</span> and set type-level pricing.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            <div className="grid grid-cols-[auto,1fr,auto] gap-x-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
              <span>Enable</span><span>Store Type</span><span>Type Price (₹)</span>
            </div>
            {storeTypes?.map((st) => (
              <div
                key={st.id}
                className={`grid grid-cols-[auto,1fr,auto] gap-x-3 items-center px-3 py-2.5 rounded-lg transition-colors ${
                  isChecked(st.id) ? "bg-accent/50" : ""
                }`}
              >
                <Checkbox
                  checked={isChecked(st.id)}
                  onCheckedChange={(v) => setAccessMap({ ...accessMap, [st.id]: !!v })}
                />
                <span className="text-sm font-medium">{st.name}</span>
                <Input
                  type="number"
                  value={getPrice(st.id)}
                  onChange={(e) => setPriceMap({ ...priceMap, [st.id]: e.target.value })}
                  placeholder={`₹${Number(product.base_price).toLocaleString()}`}
                  className="w-28 h-8 text-sm"
                  disabled={!isChecked(st.id)}
                />
              </div>
            ))}
            {(!storeTypes || storeTypes.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">No store types found. Create store types first.</p>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || loading} className="w-full">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Access & Pricing
        </Button>
      </DialogContent>
    </Dialog>
  );
}
