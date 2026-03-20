import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

export function PricingTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  // Matrix State
  const [matrixData, setMatrixData] = useState<Record<string, { kyc: string; noKyc: string; autoOrder: boolean }>>({});
  const [matrixSaving, setMatrixSaving] = useState(false);

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-full"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_types")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Initialize matrix data when storeTypes are loaded
  useEffect(() => {
    if (storeTypes && storeTypes.length > 0) {
      setMatrixData((prev) => {
        // Only initialize keys that don't exist to preserve edits
        const next = { ...prev };
        let changed = false;
        storeTypes.forEach((t: any) => {
          if (!next[t.id]) {
            next[t.id] = {
              kyc: String(t.credit_limit_kyc || 0),
              noKyc: String(t.credit_limit_no_kyc || 0),
              autoOrder: t.auto_order_enabled || false,
            };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [storeTypes]);
  
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

  const saveMatrixRow = async (typeId: string) => {
    const row = matrixData[typeId];
    if (!row) return;

    setMatrixSaving(true);
    const { error } = await supabase
      .from("store_types")
      .update({
        credit_limit_kyc: Number(row.kyc),
        credit_limit_no_kyc: Number(row.noKyc),
        auto_order_enabled: row.autoOrder,
      })
      .eq("id", typeId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Store type settings updated");
      qc.invalidateQueries({ queryKey: ["store-types-full"] });
    }
    setMatrixSaving(false);
  };

  const updateMatrix = (typeId: string, field: "kyc" | "noKyc" | "autoOrder", value: any) => {
    setMatrixData((prev) => ({
      ...prev,
      [typeId]: {
        ...(prev[typeId] || { kyc: "0", noKyc: "0", autoOrder: false }),
        [field]: value,
      },
    }));
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
        created_by: "system" // user.id not available in props easily, DB defaults?
      }));
    
    if (pricingInserts.length > 0) {
        const { error } = await supabase.from("store_type_pricing").insert(pricingInserts);
        if (error) {
             toast.error("Error saving pricing: " + error.message);
             setSaving(false);
             return;
        }
    }

    setSaving(false);
    toast.success("Pricing configurations saved");
  };

  return (
    <div className="space-y-8">
      {/* 1. Configuration Matrix */}
      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Store Type Rules</h3>
            <p className="text-sm text-slate-500">Global limits and features per store type</p>
        </div>
        
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Store Type</TableHead>
                    <TableHead>Credit Limit (No KYC)</TableHead>
                    <TableHead>Credit Limit (KYC Verified)</TableHead>
                    <TableHead>Auto Order</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {storeTypes?.map((t: any) => {
                    const data = matrixData[t.id] || {
                         kyc: String(t.credit_limit_kyc || 0),
                         noKyc: String(t.credit_limit_no_kyc || 0),
                         autoOrder: t.auto_order_enabled || false
                    };
                    
                    return (
                    <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                            <Input 
                                type="number" 
                                className="h-8 w-32" 
                                value={data.noKyc} 
                                onChange={(e) => updateMatrix(t.id, "noKyc", e.target.value)}
                            />
                        </TableCell>
                        <TableCell>
                            <Input 
                                type="number" 
                                className="h-8 w-32" 
                                value={data.kyc} 
                                onChange={(e) => updateMatrix(t.id, "kyc", e.target.value)}
                            />
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center space-x-2">
                                <Switch 
                                    checked={data.autoOrder}
                                    onCheckedChange={(c) => updateMatrix(t.id, "autoOrder", c)}
                                />
                                <span className="text-xs">{data.autoOrder ? "Enabled" : "Disabled"}</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <Button size="sm" variant="outline" onClick={() => saveMatrixRow(t.id)} disabled={matrixSaving}>
                                Save
                            </Button>
                        </TableCell>
                    </TableRow>
                    );
                })}
            </TableBody>
        </Table>
      </div>

      {/* 2. Product Pricing & Access */}
      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-slate-800">Product Pricing & Access</h3>
            <Select value={selectedTypeId} onValueChange={handleSelectType}>
                <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select Store Type to Edit" />
                </SelectTrigger>
                <SelectContent>
                {storeTypes?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
                </SelectContent>
            </Select>
          </div>

          {!selectedTypeId ? (
            <div className="py-10 text-center text-slate-500 bg-slate-50 rounded-lg">
                Select a store type above to configure product availability and special pricing.
            </div>
          ) : (
             <div className="space-y-4">
               {(loadingAccess || loadingPricing) && (
                 <div className="flex items-center gap-2 py-4">
                   <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Loading...</span>
                 </div>
               )}

               {!loadingAccess && !loadingPricing && (
                <div className="rounded-xl border bg-card">
                  <div className="grid grid-cols-[auto,1fr,auto,auto] gap-x-4 gap-y-0 p-4 text-xs font-medium text-muted-foreground border-b">
                    <span>Access</span><span>Product</span><span>Base Price</span><span>Type Price</span>
                  </div>
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {products?.map((p) => (
                      <div key={p.id} className="grid grid-cols-[auto,1fr,auto,auto] gap-x-4 items-center p-3">
                        <Checkbox
                          checked={isChecked(p.id)}
                          onCheckedChange={(v) => typeof v === 'boolean' && setAccessMap((prev) => ({ ...prev, [p.id]: v }))}
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
          )}
      </div>
    </div>
  );
}
