import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ProductAccessMatrixProps {
  onBack: () => void;
}

export function ProductAccessMatrix({ onBack }: ProductAccessMatrixProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: storeTypes, isLoading: loadingTypes } = useQuery({
    queryKey: ["store-types-all"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: currentAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ["all-store-type-products"],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_products").select("store_type_id, product_id");
      return data || [];
    },
  });

  const { data: currentPricing, isLoading: loadingPricing } = useQuery({
    queryKey: ["all-store-type-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("store_type_id, product_id, price");
      return data || [];
    },
  });

  const accessSet = new Set(currentAccess?.map((a) => `${a.product_id}::${a.store_type_id}`) || []);
  const pricingLookup: Record<string, number> = {};
  currentPricing?.forEach((p) => { pricingLookup[`${p.product_id}::${p.store_type_id}`] = Number(p.price); });

  const key = (productId: string, storeTypeId: string) => `${productId}::${storeTypeId}`;

  const isChecked = (productId: string, storeTypeId: string) => {
    const k = key(productId, storeTypeId);
    if (k in accessMap) return accessMap[k];
    return accessSet.has(k);
  };

  const getPrice = (productId: string, storeTypeId: string) => {
    const k = key(productId, storeTypeId);
    if (k in priceMap) return priceMap[k];
    if (k in pricingLookup) return String(pricingLookup[k]);
    return "";
  };

  const toggleAccess = (productId: string, storeTypeId: string) => {
    const k = key(productId, storeTypeId);
    setAccessMap({ ...accessMap, [k]: !isChecked(productId, storeTypeId) });
  };

  const handleSave = async () => {
    setSaving(true);

    // Rebuild all access rows
    await supabase.from("store_type_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const accessInserts: { store_type_id: string; product_id: string }[] = [];
    for (const p of products || []) {
      for (const st of storeTypes || []) {
        if (isChecked(p.id, st.id)) {
          accessInserts.push({ store_type_id: st.id, product_id: p.id });
        }
      }
    }
    if (accessInserts.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < accessInserts.length; i += 100) {
        await supabase.from("store_type_products").insert(accessInserts.slice(i, i + 100));
      }
    }

    // Rebuild pricing
    await supabase.from("store_type_pricing").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const pricingInserts: { store_type_id: string; product_id: string; price: number }[] = [];
    for (const p of products || []) {
      for (const st of storeTypes || []) {
        const val = getPrice(p.id, st.id);
        if (val !== "" && Number(val) > 0) {
          pricingInserts.push({ store_type_id: st.id, product_id: p.id, price: Number(val) });
        }
      }
    }
    if (pricingInserts.length > 0) {
      for (let i = 0; i < pricingInserts.length; i += 100) {
        await supabase.from("store_type_pricing").insert(pricingInserts.slice(i, i + 100));
      }
    }

    setSaving(false);
    toast.success("Product access & pricing saved");
    qc.invalidateQueries({ queryKey: ["all-store-type-products"] });
    qc.invalidateQueries({ queryKey: ["all-store-type-pricing"] });
    qc.invalidateQueries({ queryKey: ["store-type-products"] });
    qc.invalidateQueries({ queryKey: ["store-type-pricing"] });
    setAccessMap({});
    setPriceMap({});
  };

  const loading = loadingProducts || loadingTypes || loadingAccess || loadingPricing;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Product Access Matrix</h2>
          <p className="text-sm text-muted-foreground">Toggle which products each store type can access and set type-level pricing</p>
        </div>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save All
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium sticky left-0 bg-muted/50 z-10 min-w-[180px]">Product</th>
                {storeTypes?.map((st) => (
                  <th key={st.id} className="p-3 font-medium text-center min-w-[140px]">
                    <span className="block">{st.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {products?.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 sticky left-0 bg-card z-10">
                    <div className="font-medium">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] font-mono">{p.sku}</Badge>
                      <span className="text-xs text-muted-foreground">₹{Number(p.base_price).toLocaleString()}</span>
                    </div>
                  </td>
                  {storeTypes?.map((st) => {
                    const checked = isChecked(p.id, st.id);
                    return (
                      <td key={st.id} className={`p-3 text-center transition-colors ${checked ? "bg-primary/5" : ""}`}>
                        <div className="flex flex-col items-center gap-1.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleAccess(p.id, st.id)}
                          />
                          {checked && (
                            <Input
                              type="number"
                              value={getPrice(p.id, st.id)}
                              onChange={(e) => setPriceMap({ ...priceMap, [key(p.id, st.id)]: e.target.value })}
                              placeholder="—"
                              className="w-20 h-7 text-xs text-center"
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {(!products || products.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">No active products found.</p>
          )}
          {(!storeTypes || storeTypes.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">No store types found. Create store types first.</p>
          )}
        </div>
      )}
    </div>
  );
}
