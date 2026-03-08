import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function PricingTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: currentAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ["store-type-products", selectedTypeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_products").select("product_id").eq("store_type_id", selectedTypeId);
      return data || [];
    },
    enabled: !!selectedTypeId,
  });

  const { data: currentPricing, isLoading: loadingPricing } = useQuery({
    queryKey: ["store-type-pricing", selectedTypeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", selectedTypeId);
      return data || [];
    },
    enabled: !!selectedTypeId,
  });

  // Sync state when data loads
  const accessSet = new Set(currentAccess?.map((a) => a.product_id) || []);
  const pricingLookup: Record<string, number> = {};
  currentPricing?.forEach((p) => { pricingLookup[p.product_id] = Number(p.price); });

  const handleSelectType = (id: string) => {
    setSelectedTypeId(id);
    setAccessMap({});
    setPriceMap({});
  };

  const isChecked = (productId: string) => {
    if (productId in accessMap) return accessMap[productId];
    return accessSet.has(productId);
  };

  const getPrice = (productId: string) => {
    if (productId in priceMap) return priceMap[productId];
    if (productId in pricingLookup) return String(pricingLookup[productId]);
    return "";
  };

  const handleSave = async () => {
    if (!selectedTypeId) return;
    setSaving(true);

    // Determine final product access
    const finalAccess = (products || []).filter((p) => isChecked(p.id)).map((p) => p.id);

    // Delete existing, re-insert
    await supabase.from("store_type_products").delete().eq("store_type_id", selectedTypeId);
    if (finalAccess.length > 0) {
      await supabase.from("store_type_products").insert(
        finalAccess.map((pid) => ({ store_type_id: selectedTypeId, product_id: pid }))
      );
    }

    // Pricing: delete existing, insert non-empty
    await supabase.from("store_type_pricing").delete().eq("store_type_id", selectedTypeId);
    const pricingInserts = (products || [])
      .filter((p) => {
        const val = getPrice(p.id);
        return val !== "" && Number(val) > 0;
      })
      .map((p) => ({
        store_type_id: selectedTypeId,
        product_id: p.id,
        price: Number(getPrice(p.id)),
      }));
    if (pricingInserts.length > 0) {
      await supabase.from("store_type_pricing").insert(pricingInserts);
    }

    setSaving(false);
    toast.success("Pricing & access saved");
    qc.invalidateQueries({ queryKey: ["store-type-products", selectedTypeId] });
    qc.invalidateQueries({ queryKey: ["store-type-pricing", selectedTypeId] });
    setAccessMap({});
    setPriceMap({});
  };

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label>Select Store Type</Label>
        <Select value={selectedTypeId} onValueChange={handleSelectType}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Choose store type" /></SelectTrigger>
          <SelectContent>
            {storeTypes?.map((st) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selectedTypeId && (loadingAccess || loadingPricing) && (
        <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Loading...</span></div>
      )}

      {selectedTypeId && !loadingAccess && !loadingPricing && (
        <div className="rounded-xl border bg-card">
          <div className="grid grid-cols-[auto,1fr,auto,auto] gap-x-4 gap-y-0 p-4 text-xs font-medium text-muted-foreground border-b">
            <span>Access</span><span>Product</span><span>Base Price</span><span>Type Price</span>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {products?.map((p) => (
              <div key={p.id} className="grid grid-cols-[auto,1fr,auto,auto] gap-x-4 items-center p-3">
                <Checkbox
                  checked={isChecked(p.id)}
                  onCheckedChange={(v) => setAccessMap({ ...accessMap, [p.id]: !!v })}
                  disabled={!isAdmin}
                />
                <div>
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">{p.sku}</Badge>
                </div>
                <span className="text-sm text-muted-foreground">₹{Number(p.base_price).toLocaleString()}</span>
                <Input
                  type="number"
                  value={getPrice(p.id)}
                  onChange={(e) => setPriceMap({ ...priceMap, [p.id]: e.target.value })}
                  placeholder="—"
                  className="w-24 h-8 text-sm"
                  disabled={!isAdmin}
                />
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="p-4 border-t">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Access & Pricing
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
