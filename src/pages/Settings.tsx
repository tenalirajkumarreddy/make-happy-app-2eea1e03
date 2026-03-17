import { getCurrentPosition } from "@/lib/capacitorUtils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, Upload, X, Navigation } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PricingTab } from "@/components/settings/PricingTab";
import { BannerManagement } from "@/components/banners/BannerManagement";

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
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          {isAdmin && <TabsTrigger value="banners">Banners</TabsTrigger>}
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4 space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-lg">
            <h3 className="font-semibold">Company Information</h3>
            <div className="space-y-3">
              {/* Company Logo */}
              <div>
                <Label>Company Logo</Label>
                <div className="mt-1 flex items-center gap-3">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  {settings.company_logo ? (
                    <div className="relative h-16 w-16 rounded-lg border bg-muted overflow-hidden">
                      <img src={settings.company_logo} alt="Logo" className="h-full w-full object-contain" />
                      {isAdmin && (
                        <button onClick={removeLogo} className="absolute top-0.5 right-0.5 rounded-full bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={!isAdmin || uploadingLogo} className="gap-1.5">
                      {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Upload Logo
                    </Button>
                  )}
                </div>
              </div>
              <div><Label>Company Name</Label><Input value={settings.company_name || ""} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div><Label>GST Number</Label><Input value={settings.gst_number || ""} onChange={(e) => setSettings({ ...settings, gst_number: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Customer Care Number</Label><Input value={settings.customer_care_number || ""} onChange={(e) => setSettings({ ...settings, customer_care_number: e.target.value })} className="mt-1" disabled={!isAdmin} placeholder="+91 98765 43210" /></div>
                <div><Label>Office Phone</Label><Input value={settings.company_phone || ""} onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })} className="mt-1" disabled={!isAdmin} placeholder="+91 22 1234 5678" /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={settings.company_email || ""} onChange={(e) => setSettings({ ...settings, company_email: e.target.value })} className="mt-1" disabled={!isAdmin} placeholder="info@company.com" /></div>
              <div><Label>Website</Label><Input value={settings.company_website || ""} onChange={(e) => setSettings({ ...settings, company_website: e.target.value })} className="mt-1" disabled={!isAdmin} placeholder="https://www.company.com" /></div>
              <div><Label>Address</Label><Input value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>City</Label><Input value={settings.company_city || ""} onChange={(e) => setSettings({ ...settings, company_city: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
                <div><Label>State</Label><Input value={settings.company_state || ""} onChange={(e) => setSettings({ ...settings, company_state: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
                <div><Label>PIN Code</Label><Input value={settings.company_pin || ""} onChange={(e) => setSettings({ ...settings, company_pin: e.target.value })} className="mt-1" disabled={!isAdmin} placeholder="400001" /></div>
              </div>
            </div>
            <div className="pt-2 border-t">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><Navigation className="h-4 w-4 text-primary" />Map Coordinates</h4>
              <p className="text-xs text-muted-foreground mb-3">Set your company's coordinates to show it as a pinned location on the map.</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Latitude</Label><Input value={settings.company_lat || ""} onChange={(e) => setSettings({ ...settings, company_lat: e.target.value })} className="mt-1 font-mono text-sm" disabled={!isAdmin} placeholder="e.g. 19.0760" /></div>
                <div><Label>Longitude</Label><Input value={settings.company_lng || ""} onChange={(e) => setSettings({ ...settings, company_lng: e.target.value })} className="mt-1 font-mono text-sm" disabled={!isAdmin} placeholder="e.g. 72.8777" /></div>
              </div>
              <div className="mt-3">
                <Label>Map Pin Label</Label>
                <select value={settings.company_marker_label || "HQ"} onChange={(e) => isAdmin && setSettings({ ...settings, company_marker_label: e.target.value })} disabled={!isAdmin} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="HQ">HQ (Headquarters)</option>
                  <option value="Factory">Factory</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Office">Office</option>
                  <option value="Store">Store</option>
                </select>
              </div>
              {isAdmin && (
                <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5 text-xs" onClick={async () => {
                  const p = await getCurrentPosition();
                  if (p) {
                    setSettings((prev) => ({ ...prev, company_lat: p.lat.toFixed(6), company_lng: p.lng.toFixed(6) }));
                  }
                }}>
                  <Navigation className="h-3.5 w-3.5" /> Use My Current Location
                </Button>
              )}
            </div>
            {isAdmin && (
              <Button onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Settings
              </Button>
            )}
          </div>
        </TabsContent>


        <TabsContent value="pricing" className="mt-4">
          <PricingTab isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="banners" className="mt-4">
            <BannerManagement />
          </TabsContent>
        )}

        <TabsContent value="features" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-5 max-w-lg">
            <h3 className="font-semibold">Feature Toggles</h3>
            {[
              { key: "location_validation", label: "Location Validation", desc: "Require agents to be near store for sales" },
              { key: "auto_orders", label: "Auto Orders", desc: "Enable automatic recurring orders" },
              { key: "push_notifications", label: "Push Notifications", desc: "Send push notifications to users" },
              { key: "partial_collections", label: "Partial Collections", desc: "Allow managers to collect partial amounts" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={settings[item.key] === "true"} onCheckedChange={() => toggleFeature(item.key)} disabled={!isAdmin} />
              </div>
            ))}
            {isAdmin && (
              <Button onClick={handleSaveSettings} disabled={savingSettings} className="mt-2">
                {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Features
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
};

export default SettingsPage;
