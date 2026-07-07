import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, Target, Store, Users, Check } from "lucide-react";

interface BusinessSetting {
  setting_key: string;
  setting_value: string;
  description: string;
}

interface StoreTarget {
  id: string;
  store_id: string;
  store_name?: string;
  month: number;
  year: number;
  target_amount: number;
}

interface MarketerTarget {
  id: string;
  user_id: string;
  user_name?: string;
  month: number;
  year: number;
  target_type: string;
  target_amount: number;
}

export default function AdminCrmSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("business");
  const [saving, setSaving] = useState(false);

  // Business Settings State
  const [leadTime, setLeadTime] = useState(2);
  const [gracePeriod, setGracePeriod] = useState(2);
  const [safetyFloor, setSafetyFloor] = useState(50);

  // Controlled row states
  const [storeInputs, setStoreInputs] = useState<Record<string, string>>({});
  const [marketerInputs, setMarketerInputs] = useState<Record<string, string>>({});
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);
  const [savingMarketerId, setSavingMarketerId] = useState<string | null>(null);

  // Fetch business settings
  const { data: businessSettings, isLoading: loadingBusiness } = useQuery({
    queryKey: ["crm-business-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("setting_key, setting_value, description");
      if (error) throw error;
      return data as BusinessSetting[];
    },
  });

  // Load settings into state
  useEffect(() => {
    if (businessSettings) {
      const getValue = (key: string, def: number) => {
        const found = businessSettings.find((s) => s.setting_key === key);
        return found ? parseInt(found.setting_value, 10) : def;
      };
      setLeadTime(getValue("follow_up_lead_time_days", 2));
      setGracePeriod(getValue("follow_up_grace_period_days", 2));
      setSafetyFloor(getValue("burn_rate_safety_floor_percent", 50));
    }
  }, [businessSettings]);

  // Fetch stores
  const { data: storesData } = useQuery({
    queryKey: ["crm-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  // Fetch store targets for current month
  const { data: storeTargetsData } = useQuery<StoreTarget[]>({
    queryKey: ["crm-store-targets", new Date().getMonth() + 1, new Date().getFullYear()],
    queryFn: async () => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const { data, error } = await supabase
        .from("store_targets")
        .select("id, store_id, month, year, target_amount")
        .eq("month", month)
        .eq("year", year)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch marketers (user_roles with role = 'marketer')
  const { data: marketersData, isLoading: loadingMarketers } = useQuery({
    queryKey: ["crm-marketers"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "marketer");
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in(
          "user_id",
          roles.map((r) => r.user_id)
        );
      if (profilesError) throw profilesError;

      return (roles || []).map((r) => {
        const profile = profilesData?.find((p) => p.user_id === r.user_id);
        return {
          id: r.user_id,
          full_name: profile?.full_name || "Unnamed",
        };
      }) as { id: string; full_name: string }[];
    },
  });

  // Fetch marketer targets for current month
  const { data: marketerTargetsData } = useQuery<MarketerTarget[]>({
    queryKey: ["crm-marketer-targets", new Date().getMonth() + 1, new Date().getFullYear()],
    queryFn: async () => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const { data, error } = await supabase
        .from("marketer_targets")
        .select("id, user_id, month, year, target_type, target_amount")
        .eq("month", month)
        .eq("year", year)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
  });

  // Sync local inputs when target data arrives
  useEffect(() => {
    const map: Record<string, string> = {};
    storeTargetsData?.forEach((t) => {
      map[t.store_id] = String(t.target_amount);
    });
    setStoreInputs((prev) => ({ ...prev, ...map }));
  }, [storeTargetsData]);

  useEffect(() => {
    const map: Record<string, string> = {};
    marketerTargetsData?.forEach((t) => {
      map[t.user_id] = String(t.target_amount);
    });
    setMarketerInputs((prev) => ({ ...prev, ...map }));
  }, [marketerTargetsData]);

  // Save business settings
  const handleSaveBusinessSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { setting_key: "follow_up_lead_time_days", setting_value: String(leadTime) },
        { setting_key: "follow_up_grace_period_days", setting_value: String(gracePeriod) },
        { setting_key: "burn_rate_safety_floor_percent", setting_value: String(safetyFloor) },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("business_settings")
          .update({ setting_value: update.setting_value })
          .eq("setting_key", update.setting_key);
        if (error) throw error;
      }

      toast({ title: "Business settings saved successfully" });
    } catch (error: any) {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Set target for a store
  const handleSetStoreTarget = async (storeId: string) => {
    const raw = storeInputs[storeId];
    const val = parseInt(raw || "0", 10) || 0;
    if (val < 0) {
      toast({ title: "Invalid value", description: "Target cannot be negative", variant: "destructive" });
      return;
    }
    setSavingStoreId(storeId);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const { data, error } = await supabase
        .from("store_targets")
        .upsert(
          {
            store_id: storeId,
            month,
            year,
            target_amount: val,
            status: "active",
          },
          { onConflict: "store_id,month,year" }
        )
        .select();

      console.log("Store target upsert response:", { data, error });
      if (error) throw error;
      toast({ title: "Store target updated" });
      queryClient.invalidateQueries({ queryKey: ["crm-store-targets"] });
    } catch (error: any) {
      console.error("Store target save error:", error);
      toast({ title: "Error updating store target", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setSavingStoreId(null);
    }
  };

  // Set target for a marketer
  const handleSetMarketerTarget = async (userId: string) => {
    const raw = marketerInputs[userId];
    const val = parseInt(raw || "0", 10) || 0;
    if (val < 0) {
      toast({ title: "Invalid value", description: "Target cannot be negative", variant: "destructive" });
      return;
    }
    setSavingMarketerId(userId);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const { data, error } = await supabase
        .from("marketer_targets")
        .upsert(
          {
            user_id: userId,
            month,
            year,
            target_type: "units",
            target_amount: val,
            status: "active",
          },
          { onConflict: "user_id,month,year" }
        )
        .select();

      console.log("Marketer target upsert response:", { data, error });
      if (error) throw error;
      toast({ title: "Marketer target updated" });
      queryClient.invalidateQueries({ queryKey: ["crm-marketer-targets"] });
    } catch (error: any) {
      console.error("Marketer target save error:", error);
      toast({ title: "Error updating marketer target", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setSavingMarketerId(null);
    }
  };

  const getSavedStoreTarget = (storeId: string) => {
    return storeTargetsData?.find((t) => t.store_id === storeId)?.target_amount || 0;
  };

  const getSavedMarketerTarget = (userId: string) => {
    return marketerTargetsData?.find((t) => t.user_id === userId)?.target_amount || 0;
  };

  const isStoreDirty = (storeId: string) => {
    const current = storeInputs[storeId];
    const saved = getSavedStoreTarget(storeId);
    return current !== undefined && current !== "" && parseInt(current || "0", 10) !== saved;
  };

  const isMarketerDirty = (userId: string) => {
    const current = marketerInputs[userId];
    const saved = getSavedMarketerTarget(userId);
    return current !== undefined && current !== "" && parseInt(current || "0", 10) !== saved;
  };

  if (loadingBusiness) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="CRM Settings"
        subtitle="Configure follow-up rules, store targets, and marketer targets."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="business">
            <Settings className="h-4 w-4 mr-1.5" />
            Business Rules
          </TabsTrigger>
          <TabsTrigger value="stores">
            <Store className="h-4 w-4 mr-1.5" />
            Store Targets
          </TabsTrigger>
          <TabsTrigger value="marketers">
            <Users className="h-4 w-4 mr-1.5" />
            Marketer Targets
          </TabsTrigger>
        </TabsList>

        {/* Business Rules Tab */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Follow-up Rules</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure how the replenishment engine calculates follow-ups.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Lead Time */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Follow-up Lead Time</Label>
                  <Badge variant="secondary">{leadTime} days</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Days before projected runout to show the follow-up reminder.
                </p>
                <Slider
                  value={[leadTime]}
                  onValueChange={(v) => setLeadTime(v[0])}
                  min={1}
                  max={7}
                  step={1}
                />
              </div>

              {/* Grace Period */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Grace Period</Label>
                  <Badge variant="secondary">{gracePeriod} days</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Days after runout before triggering MUST_ORDER status.
                </p>
                <Slider
                  value={[gracePeriod]}
                  onValueChange={(v) => setGracePeriod(v[0])}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>

              {/* Safety Floor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Safety Floor</Label>
                  <Badge variant="secondary">{safetyFloor}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum daily burn rate as a percentage of the base rate (prevents over-relaxation).
                </p>
                <Slider
                  value={[safetyFloor]}
                  onValueChange={(v) => setSafetyFloor(v[0])}
                  min={10}
                  max={80}
                  step={5}
                />
              </div>

              <Button onClick={handleSaveBusinessSettings} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Rules
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Store Targets Tab */}
        <TabsContent value="stores" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Monthly Store Targets</CardTitle>
              <p className="text-sm text-muted-foreground">
                Set sales targets for each store for the current month.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {storesData?.map((store) => {
                  const isSaving = savingStoreId === store.id;
                  return (
                    <div key={store.id} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{store.name}</p>
                        <p className="text-xs text-muted-foreground">Store ID: {store.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-xs text-muted-foreground">Target (units)</Label>
                        <Input
                          type="number"
                          value={storeInputs[store.id] ?? ""}
                          className="w-24"
                          min={0}
                          onChange={(e) =>
                            setStoreInputs((prev) => ({ ...prev, [store.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSetStoreTarget(store.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketer Targets Tab */}
        <TabsContent value="marketers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Monthly Marketer Targets</CardTitle>
              <p className="text-sm text-muted-foreground">
                Set sales targets for each marketer for the current month.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {marketersData?.map((marketer) => {
                  const isSaving = savingMarketerId === marketer.id;
                  return (
                    <div key={marketer.id} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{marketer.full_name}</p>
                        <p className="text-xs text-muted-foreground">User ID: {marketer.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-xs text-muted-foreground">Target (units)</Label>
                        <Input
                          type="number"
                          value={marketerInputs[marketer.id] ?? ""}
                          className="w-24"
                          min={0}
                          onChange={(e) =>
                            setMarketerInputs((prev) => ({ ...prev, [marketer.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSetMarketerTarget(marketer.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
