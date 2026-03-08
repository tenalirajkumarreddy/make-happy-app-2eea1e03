import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Save } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PricingTab } from "@/components/settings/PricingTab";

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
      await supabase.from("company_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    }
    setSavingSettings(false);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  };


  const toggleFeature = (key: string) => {
    setSettings((prev) => ({ ...prev, [key]: prev[key] === "true" ? "false" : "true" }));
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
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4 space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-lg">
            <h3 className="font-semibold">Company Information</h3>
            <div className="space-y-3">
              <div><Label>Company Name</Label><Input value={settings.company_name || ""} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div><Label>GST Number</Label><Input value={settings.gst_number || ""} onChange={(e) => setSettings({ ...settings, gst_number: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div><Label>Customer Care Number</Label><Input value={settings.customer_care_number || ""} onChange={(e) => setSettings({ ...settings, customer_care_number: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
              <div><Label>Address</Label><Input value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} className="mt-1" disabled={!isAdmin} /></div>
            </div>
            {isAdmin && (
              <Button onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Settings
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="store-types" className="mt-4 space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAddType(true)}><Plus className="mr-2 h-4 w-4" />Add Store Type</Button>
            </div>
          )}
          <DataTable columns={storeTypeColumns} data={storeTypes || []} searchKey="name" searchPlaceholder="Search store types..." />
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <PricingTab isAdmin={isAdmin} />
        </TabsContent>

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

      <Dialog open={showAddType} onOpenChange={setShowAddType}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Store Type</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStoreType} className="space-y-4">
            <div><Label>Type Name</Label><Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} required className="mt-1" placeholder="e.g., Retail, Wholesale" /></div>
            <div>
              <Label>Order Type</Label>
              <Select value={newOrderType} onValueChange={setNewOrderType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={savingType}>
              {savingType && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Store Type
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
