import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { Loader2, MapPin, ChevronRight, ChevronLeft, Plus, Check } from "lucide-react";
import { toast } from "sonner";

interface CreateStoreWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type Step = "customer" | "details" | "pricing";

export function CreateStoreWizard({ open, onOpenChange, onCreated }: CreateStoreWizardProps) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("customer");
  const [saving, setSaving] = useState(false);

  // Customer step
  const [customerMode, setCustomerMode] = useState<"select" | "create">("select");
  const [customerId, setCustomerId] = useState("");
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");

  // Details step
  const [name, setName] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [locating, setLocating] = useState(false);

  // Pricing step
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});

  const canEditPricing = role === "super_admin" || role === "manager";

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, display_id").eq("is_active", true);
      return data || [];
    },
    enabled: open,
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true);
      return data || [];
    },
    enabled: open,
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-list", storeTypeId],
    queryFn: async () => {
      let q = supabase.from("routes").select("*").eq("is_active", true);
      if (storeTypeId) q = q.eq("store_type_id", storeTypeId);
      const { data } = await q;
      return data || [];
    },
    enabled: open,
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-wizard", storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) {
        const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
        return data || [];
      }
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);
      if (accessData && accessData.length > 0) {
        return accessData.map((a: any) => a.products).filter(Boolean);
      }
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: open && step === "pricing",
  });

  const { data: typePricing } = useQuery({
    queryKey: ["store-type-pricing-wizard", storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) return {};
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", storeTypeId);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: open && step === "pricing",
  });

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lt = pos.coords.latitude;
        const ln = pos.coords.longitude;
        setLat(lt);
        setLng(ln);

        // Reverse geocode using Nominatim
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lt}&lon=${ln}&format=json&addressdetails=1`, {
            headers: { "Accept-Language": "en" },
          });
          const data = await res.json();
          const addr = data.address || {};
          setStreet(addr.road || addr.street || "");
          setArea(addr.suburb || addr.neighbourhood || addr.village || "");
          setCity(addr.city || addr.town || addr.municipality || "");
          setDistrict(addr.county || addr.state_district || "");
          setState(addr.state || "");
          setPincode(addr.postcode || "");
          setAddress(data.display_name || "");
        } catch {
          toast.error("Could not fetch address");
        }
        setLocating(false);
      },
      (err) => {
        toast.error("Location error: " + err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const resetForm = () => {
    setStep("customer");
    setCustomerMode("select");
    setCustomerId("");
    setNewCustName(""); setNewCustPhone(""); setNewCustEmail("");
    setName(""); setStoreTypeId(""); setRouteId(""); setPhone("");
    setPhotoUrl(""); setLat(null); setLng(null);
    setStreet(""); setArea(""); setCity(""); setDistrict(""); setState(""); setPincode(""); setAddress("");
    setOpeningBalance("");
    setPriceMap({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalCustomerId = customerId;

      // Create customer if needed
      if (customerMode === "create") {
        if (!newCustName.trim()) { toast.error("Customer name required"); setSaving(false); return; }
        const { data: allCusts } = await supabase.from("customers").select("id");
        const count = (allCusts?.length || 0) + 1;
        const displayId = `CUST-${String(count).padStart(6, "0")}`;
        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          display_id: displayId,
          name: newCustName,
          phone: newCustPhone || null,
          email: newCustEmail || null,
        }).select("id").single();
        if (custErr) { toast.error(custErr.message); setSaving(false); return; }
        finalCustomerId = newCust.id;
      }

      if (!finalCustomerId || !name.trim() || !storeTypeId) {
        toast.error("Please fill required fields");
        setSaving(false);
        return;
      }

      // Create store
      const { data: allStores } = await supabase.from("stores").select("id");
      const storeCount = (allStores?.length || 0) + 1;
      const storeDisplayId = `STR-${String(storeCount).padStart(6, "0")}`;

      const ob = openingBalance ? Number(openingBalance) : 0;
      const { data: newStore, error: storeErr } = await supabase.from("stores").insert({
        display_id: storeDisplayId,
        name,
        customer_id: finalCustomerId,
        store_type_id: storeTypeId,
        route_id: routeId || null,
        phone: phone || null,
        photo_url: photoUrl || null,
        lat, lng,
        address: address || null,
        street: street || null,
        area: area || null,
        city: city || null,
        district: district || null,
        state: state || null,
        pincode: pincode || null,
        opening_balance: ob,
        outstanding: ob,
      }).select("id").single();

      if (storeErr) { toast.error(storeErr.message); setSaving(false); return; }

      // Save store pricing if any
      const pricingInserts = Object.entries(priceMap)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([productId, price]) => ({
          store_id: newStore.id,
          product_id: productId,
          price: Number(price),
        }));
      if (pricingInserts.length > 0) {
        await supabase.from("store_pricing").insert(pricingInserts);
      }

      toast.success("Store created successfully!");
      resetForm();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to create store");
    }
    setSaving(false);
  };

  const canGoToDetails = customerMode === "select" ? !!customerId : !!newCustName.trim();
  const canGoToPricing = !!name.trim() && !!storeTypeId;

  const getEffectivePrice = (product: any) => {
    if (typePricing && product.id in (typePricing as any)) return `₹${(typePricing as any)[product.id]} (type)`;
    return `₹${Number(product.base_price)} (base)`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "customer" ? "Step 1: Customer" : step === "details" ? "Step 2: Store Details" : "Step 3: Products & Pricing"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-2">
          {["customer", "details", "pricing"].map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${step === s ? "bg-primary text-primary-foreground" : i < ["customer", "details", "pricing"].indexOf(step) ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {i < ["customer", "details", "pricing"].indexOf(step) ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-muted" />}
            </div>
          ))}
        </div>

        {/* Step 1: Customer */}
        {step === "customer" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" variant={customerMode === "select" ? "default" : "outline"} size="sm" onClick={() => setCustomerMode("select")}>
                Select Existing
              </Button>
              <Button type="button" variant={customerMode === "create" ? "default" : "outline"} size="sm" onClick={() => setCustomerMode("create")}>
                <Plus className="mr-1 h-3 w-3" /> Create New
              </Button>
            </div>

            {customerMode === "select" ? (
              <div>
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.display_id})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={newCustName} onChange={e => setNewCustName(e.target.value)} className="mt-1" /></div>
                <div><Label>Phone</Label><Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} className="mt-1" /></div>
                <div><Label>Email</Label><Input type="email" value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} className="mt-1" /></div>
              </div>
            )}

            <Button className="w-full" disabled={!canGoToDetails} onClick={() => setStep("details")}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Store Details */}
        {step === "details" && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <ImageUpload folder="stores" currentUrl={photoUrl || null} onUploaded={setPhotoUrl} onRemoved={() => setPhotoUrl("")} size="lg" />
              <div className="flex-1 space-y-3">
                <div><Label>Store Name *</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
                <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" /></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Store Type *</Label>
                <Select value={storeTypeId} onValueChange={(v) => { setStoreTypeId(v); setRouteId(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{storeTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Route</Label>
                <Select value={routeId} onValueChange={setRouteId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select route" /></SelectTrigger>
                  <SelectContent>{routes?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Location</Label>
                <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>
                  {locating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MapPin className="mr-1 h-3 w-3" />}
                  {locating ? "Locating..." : "Capture Location"}
                </Button>
              </div>
              {lat && lng && (
                <p className="text-xs text-muted-foreground mb-2">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Street</Label><Input value={street} onChange={e => setStreet(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
              <div><Label className="text-xs">Area</Label><Input value={area} onChange={e => setArea(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
              <div><Label className="text-xs">City</Label><Input value={city} onChange={e => setCity(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
              <div><Label className="text-xs">District</Label><Input value={district} onChange={e => setDistrict(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
              <div><Label className="text-xs">State</Label><Input value={state} onChange={e => setState(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
              <div><Label className="text-xs">Pincode</Label><Input value={pincode} onChange={e => setPincode(e.target.value)} className="mt-0.5 h-8 text-sm" /></div>
            </div>

            <div>
              <Label>Opening Balance</Label>
              <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} className="mt-1" placeholder="0 (can be negative)" />
              <p className="text-[11px] text-muted-foreground mt-0.5">Enter negative for advance/credit, positive for dues</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("customer")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" disabled={!canGoToPricing} onClick={() => setStep("pricing")}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Products & Pricing */}
        {step === "pricing" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {canEditPricing ? "Set store-level prices (leave blank to use type/base price)." : "Review product pricing for this store."}
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {products?.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{p.sku}</Badge>
                      <span className="text-[11px] text-muted-foreground">{getEffectivePrice(p)}</span>
                    </div>
                  </div>
                  {canEditPricing && (
                    <Input
                      type="number"
                      value={priceMap[p.id] || ""}
                      onChange={(e) => setPriceMap({ ...priceMap, [p.id]: e.target.value })}
                      placeholder="—"
                      className="w-24 h-8 text-sm"
                    />
                  )}
                </div>
              ))}
              {(!products || products.length === 0) && (
                <p className="text-center text-sm text-muted-foreground py-4">No products available</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("details")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Create Store
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
