import { getCurrentPosition } from "@/lib/capacitorUtils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, Upload, X, Navigation, Trash2, Plus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PricingTab } from "@/components/settings/PricingTab";
import { SmsGatewayTab } from "@/components/settings/SmsGatewayTab";
import { WarehouseManagement } from "@/components/settings/WarehouseManagement";

const SettingsPage = () => {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin";

  // Company settings
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const { data: companySettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((s) => { map[s.key] = s.value || ""; });
      return map;
    },
  });

  const { data: storeTypes = [] } = useQuery({
    queryKey: ["store-types-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return (data || []) as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    if (companySettings) setSettings(companySettings);
  }, [companySettings]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    for (const [key, value] of Object.entries(settings)) {
      // Try update first, then insert if not exists
      const { data } = await supabase.from("company_settings").select("id").eq("key", key).maybeSingle();
      if (data) {
        await supabase.from("company_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      } else {
        await supabase.from("company_settings").insert({ key, value });
      }
    }
    setSavingSettings(false);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  };


  const toggleFeature = (key: string) => {
    setSettings((prev) => ({ ...prev, [key]: prev[key] === "true" ? "false" : "true" }));
  };

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `company/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("entity-photos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploadingLogo(false); return; }
    const { data: urlData } = supabase.storage.from("entity-photos").getPublicUrl(path);
    setSettings((prev) => ({ ...prev, company_logo: urlData.publicUrl }));
    setUploadingLogo(false);
    toast.success("Logo uploaded — save settings to apply");
  };

  const removeLogo = () => {
    setSettings((prev) => ({ ...prev, company_logo: "" }));
    if (logoInputRef.current) logoInputRef.current.value = "";
  };


  if (loadingSettings) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" subtitle="Company settings and system configuration" />
      <Tabs defaultValue="company">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="h-auto flex-wrap sm:flex-nowrap w-max min-w-full justify-start md:w-auto">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            {isAdmin && <TabsTrigger value="invoice">Invoice</TabsTrigger>}
            {isAdmin && <TabsTrigger value="warehouses">Warehouses</TabsTrigger>}
            <TabsTrigger value="features">Features</TabsTrigger>
            {isAdmin && <TabsTrigger value="sms_gateway">SMS Gateway</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="company" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Logo and Primary Info */}
            <div className="md:col-span-1 space-y-6">
              <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Branding
                </h3>
                <div className="flex flex-col items-center gap-4 py-2">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <div className="relative h-32 w-32 rounded-2xl border-2 border-dashed border-primary/20 bg-muted/30 flex items-center justify-center overflow-hidden group">
                    {settings.company_logo ? (
                      <>
                        <img src={settings.company_logo} alt="Logo" className="h-full w-full object-contain p-2" />
                        {isAdmin && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => logoInputRef.current?.click()}>
                              <Upload className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={removeLogo}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center p-4">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                        <p className="text-xs text-muted-foreground">Premium Logo (Max 2MB)</p>
                      </div>
                    )}
                  </div>
                  {!settings.company_logo && (
                    <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={!isAdmin || uploadingLogo} className="w-full gap-2">
                      {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Upload Logo
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                <h4 className="font-medium flex items-center gap-2 border-b pb-2">
                  <Navigation className="h-4 w-4 text-primary" />
                  Location HQ
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[10px] uppercase text-muted-foreground">Latitude</Label><Input value={settings.company_lat || ""} onChange={(e) => setSettings({ ...settings, company_lat: e.target.value })} className="h-8 font-mono text-xs" disabled={!isAdmin} placeholder="19.0760" /></div>
                  <div className="space-y-1.5"><Label className="text-[10px] uppercase text-muted-foreground">Longitude</Label><Input value={settings.company_lng || ""} onChange={(e) => setSettings({ ...settings, company_lng: e.target.value })} className="h-8 font-mono text-xs" disabled={!isAdmin} placeholder="72.8777" /></div>
                </div>
                {isAdmin && (
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={async () => {
                    const p = await getCurrentPosition();
                    if (p) setSettings((prev) => ({ ...prev, company_lat: p.lat.toFixed(6), company_lng: p.lng.toFixed(6) }));
                  }}>
                    Set current location
                  </Button>
                )}
              </div>
            </div>

            {/* General Settings */}
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-xl border bg-card p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">Company Profile</h3>
                    <p className="text-sm text-muted-foreground">Official business information for invoices and portals</p>
                  </div>
                  {isAdmin && (
                    <Button onClick={handleSaveSettings} disabled={savingSettings} className="shadow-lg shadow-primary/20 transition-all active:scale-95">
                      {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Profile
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  <div className="space-y-2"><Label className="text-xs font-semibold">Business Name</Label><Input value={settings.company_name || ""} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} disabled={!isAdmin} placeholder="Aqua Prime Solutions" /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">GST Registration</Label><Input value={settings.gst_number || ""} onChange={(e) => setSettings({ ...settings, gst_number: e.target.value })} disabled={!isAdmin} placeholder="27XXXXX0000X1ZX" /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">Primary Email</Label><Input type="email" value={settings.company_email || ""} onChange={(e) => setSettings({ ...settings, company_email: e.target.value })} disabled={!isAdmin} placeholder="admin@aquaprime.com" /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">Official Website</Label><Input value={settings.company_website || ""} onChange={(e) => setSettings({ ...settings, company_website: e.target.value })} disabled={!isAdmin} placeholder="https://aquaprime.app" /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">Customer Support</Label><Input value={settings.customer_care_number || ""} onChange={(e) => setSettings({ ...settings, customer_care_number: e.target.value })} disabled={!isAdmin} placeholder="+91 999 000 1111" /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">Office Contact</Label><Input value={settings.company_phone || ""} onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })} disabled={!isAdmin} /></div>
                  <div className="sm:col-span-2 space-y-2"><Label className="text-xs font-semibold">Headquarters Address</Label><Input value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} disabled={!isAdmin} /></div>
                  <div className="space-y-2"><Label className="text-xs font-semibold">City</Label><Input value={settings.company_city || ""} onChange={(e) => setSettings({ ...settings, company_city: e.target.value })} disabled={!isAdmin} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-xs font-semibold">State</Label><Input value={settings.company_state || ""} onChange={(e) => setSettings({ ...settings, company_state: e.target.value })} disabled={!isAdmin} /></div>
                    <div className="space-y-2"><Label className="text-xs font-semibold">PIN Code</Label><Input value={settings.company_pin || ""} onChange={(e) => setSettings({ ...settings, company_pin: e.target.value })} disabled={!isAdmin} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>


        <TabsContent value="pricing" className="mt-4">
          <PricingTab isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="invoice" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Business Details for Invoice */}
              <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="font-bold">Invoice Business Details</h3>
                    <p className="text-xs text-muted-foreground">These appear on generated invoices</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Business Name (for Invoice)</Label>
                    <Input value={settings.business_name || ""} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} placeholder="Your Company Name" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Business Address</Label>
                    <Input value={settings.business_address || ""} onChange={(e) => setSettings({ ...settings, business_address: e.target.value })} placeholder="Street address" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">City</Label>
                      <Input value={settings.business_city || ""} onChange={(e) => setSettings({ ...settings, business_city: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">State</Label>
                      <Input value={settings.business_state || ""} onChange={(e) => setSettings({ ...settings, business_state: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">PIN</Label>
                      <Input value={settings.business_pincode || ""} onChange={(e) => setSettings({ ...settings, business_pincode: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Phone</Label>
                      <Input value={settings.business_phone || ""} onChange={(e) => setSettings({ ...settings, business_phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Email</Label>
                      <Input type="email" value={settings.business_email || ""} onChange={(e) => setSettings({ ...settings, business_email: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">GSTIN</Label>
                      <Input value={settings.business_gstin || ""} onChange={(e) => setSettings({ ...settings, business_gstin: e.target.value.toUpperCase() })} placeholder="27XXXXX0000X1ZX" className="font-mono" maxLength={15} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">PAN</Label>
                      <Input value={settings.business_pan || ""} onChange={(e) => setSettings({ ...settings, business_pan: e.target.value.toUpperCase() })} placeholder="XXXXX0000X" className="font-mono" maxLength={10} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">State Code</Label>
                      <Input value={settings.business_state_code || ""} onChange={(e) => setSettings({ ...settings, business_state_code: e.target.value })} placeholder="27" className="font-mono" maxLength={2} />
                      <p className="text-[10px] text-muted-foreground">First 2 digits of GSTIN</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Logo URL</Label>
                    <Input value={settings.business_logo_url || ""} onChange={(e) => setSettings({ ...settings, business_logo_url: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="space-y-6">
                <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
                  <div className="border-b pb-4">
                    <h3 className="font-bold">Bank Details</h3>
                    <p className="text-xs text-muted-foreground">For payment collection via invoice</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Bank Name</Label>
                      <Input value={settings.bank_name || ""} onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })} placeholder="State Bank of India" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Account Number</Label>
                      <Input value={settings.bank_account_number || ""} onChange={(e) => setSettings({ ...settings, bank_account_number: e.target.value })} placeholder="XXXXXXXXXXXX" className="font-mono" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">IFSC Code</Label>
                        <Input value={settings.bank_ifsc || ""} onChange={(e) => setSettings({ ...settings, bank_ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0000XXX" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Branch</Label>
                        <Input value={settings.bank_branch || ""} onChange={(e) => setSettings({ ...settings, bank_branch: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
                  <div className="border-b pb-4">
                    <h3 className="font-bold">Invoice Settings</h3>
                    <p className="text-xs text-muted-foreground">Customize invoice numbering and terms</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Invoice Prefix</Label>
                      <Input value={settings.invoice_prefix || "INV"} onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value.toUpperCase() })} placeholder="INV" className="font-mono w-32" maxLength={10} />
                      <p className="text-[10px] text-muted-foreground">e.g., INV-000001</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Terms & Conditions</Label>
                      <textarea 
                        className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                        value={settings.invoice_terms || ""} 
                        onChange={(e) => setSettings({ ...settings, invoice_terms: e.target.value })} 
                        placeholder="Goods once sold will not be taken back..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} disabled={savingSettings} className="shadow-lg">
                {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Invoice Settings
              </Button>
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="warehouses" className="mt-6">
            <WarehouseManagement />
          </TabsContent>
        )}

        <TabsContent value="features" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
              <h3 className="font-bold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                Access & Registration
              </h3>
              <div className="space-y-6">
                {[
                  { key: "customer_signup_enabled", label: "Self-service Registration", desc: "Allow new customers to register via phone OTP" },
                  { key: "google_linking_enabled", label: "Google OAuth Linking", desc: "Enable seamless Google account connection" },
                ].map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                    <Switch checked={settings[item.key] !== "false"} onCheckedChange={() => toggleFeature(item.key)} disabled={!isAdmin} className="mt-1" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
              <h3 className="font-bold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                Operational Toggles
              </h3>
              <div className="space-y-6">
                {[
                  { key: "location_validation", label: "Geofencing", desc: "Verify agent proximity to store during visits" },
                  { key: "auto_orders", label: "Smart Auto-Orders", desc: "AI-driven recurring order generation" },
                  { key: "push_notifications", label: "Push Engagement", desc: "Real-time system notifications to staff/customers" },
                  { key: "partial_collections", label: "Collection Flexibility", desc: "Allow staff to record partial payment collections" },
                ].map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                    <Switch checked={settings[item.key] === "true"} onCheckedChange={() => toggleFeature(item.key)} disabled={!isAdmin} className="mt-1" />
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 rounded-xl border-t-4 border-t-primary bg-card p-6 shadow-md flex items-center justify-between gap-6">
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Store Defaults</h3>
                <p className="text-sm text-muted-foreground">Define business rules for new customer onboarding</p>
                <div className="mt-4 max-w-sm">
                  <Select 
                    value={settings.default_store_type_id || ""} 
                    onValueChange={(val) => setSettings({ ...settings, default_store_type_id: val })}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Select primary industry..." />
                    </SelectTrigger>
                    <SelectContent>
                      {storeTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isAdmin && (
                <Button onClick={handleSaveSettings} disabled={savingSettings} size="lg" className="px-8 shadow-lg shadow-primary/20">
                  {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save All Controls
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="sms_gateway" className="mt-4">
            <SmsGatewayTab />
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
};

export default SettingsPage;
