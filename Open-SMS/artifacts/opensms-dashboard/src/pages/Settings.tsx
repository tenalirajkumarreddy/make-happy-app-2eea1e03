import { useState, useEffect } from "react";
import { 
  useGetGatewayConfig, 
  useUpdateGatewayConfig,
  useGetSettings,
  useUpdateSettings,
  useGetGatewayHealth
} from "@workspace/api-client-react";
import { Card, Button, Input, Badge } from "@/components/ui/Shared";
import { Server, KeyRound, Save, Activity, Link2, Shield, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  
  // Gateway Config
  const { data: config, isLoading: isConfigLoading } = useGetGatewayConfig();
  const updateConfigMutation = useUpdateGatewayConfig();
  
  // App Settings
  const { data: settings, isLoading: isSettingsLoading } = useGetSettings();
  const updateSettingsMutation = useUpdateSettings();

  // Test Connection
  const { refetch: testConnection, isFetching: isTesting } = useGetGatewayHealth({
    query: { enabled: false }
  });

  // Local state for Gateway Config
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");

  // Local state for Settings
  const [webhookUrl, setWebhookUrl] = useState("");
  const [rateLimit, setRateLimit] = useState(10);
  const [autoStart, setAutoStart] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);

  useEffect(() => {
    if (config) {
      setGatewayUrl(config.gatewayUrl);
      setApiKey(config.apiKey);
      setName(config.name);
    }
  }, [config]);

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhookUrl || "");
      setRateLimit(settings.smsRateLimit);
      setAutoStart(settings.autoStart);
      setNotifyOnFailure(settings.notifyOnFailure);
    }
  }, [settings]);

  const handleSaveConfig = () => {
    updateConfigMutation.mutate({
      data: { gatewayUrl, apiKey, name }
    }, {
      onSuccess: () => toast({ title: "Configuration Saved", description: "Gateway connection settings updated." }),
      onError: () => toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" })
    });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      data: { 
        webhookUrl: webhookUrl || null, 
        smsRateLimit: rateLimit, 
        autoStart, 
        notifyOnFailure 
      }
    }, {
      onSuccess: () => toast({ title: "Settings Saved", description: "Application settings updated." }),
      onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" })
    });
  };

  const handleTestConnection = async () => {
    const res = await testConnection();
    if (res.data?.status === 'ok') {
      toast({ title: "Connection Successful", description: "Gateway is responding normally.", variant: "default" });
    } else {
      toast({ title: "Connection Failed", description: "Could not reach gateway. Check URL and API Key.", variant: "destructive" });
    }
  };

  if (isConfigLoading || isSettingsLoading) {
    return <div className="p-12 text-center text-muted-foreground animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Configure gateway connection and application preferences.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Connection Configuration */}
        <Card className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Link2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-display font-bold">Gateway Connection</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" /> Gateway URL
              </label>
              <Input 
                value={gatewayUrl} 
                onChange={(e) => setGatewayUrl(e.target.value)} 
                placeholder="http://192.168.1.42:8080"
              />
              <p className="text-xs text-muted-foreground">The local IP or tunnel URL of the Android phone running OpenSMS.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" /> API Key
              </label>
              <Input 
                type="password"
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="32-character hex key"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" /> Configuration Name
              </label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Primary Gateway"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border/50 flex flex-wrap gap-4 justify-between items-center">
            <Button variant="outline" onClick={handleTestConnection} isLoading={isTesting}>
              <Activity className="w-4 h-4 mr-2" /> Test Connection
            </Button>
            <Button onClick={handleSaveConfig} isLoading={updateConfigMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save Config
            </Button>
          </div>
        </Card>

        {/* Global Settings */}
        <Card className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-display font-bold">Preferences</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                Global Webhook URL
              </label>
              <Input 
                value={webhookUrl} 
                onChange={(e) => setWebhookUrl(e.target.value)} 
                placeholder="https://yourapp.com/webhooks/sms"
              />
              <p className="text-xs text-muted-foreground">Receives delivery receipts for all messages if set.</p>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold flex items-center justify-between">
                <span>SMS Rate Limit (per minute)</span>
                <Badge variant="secondary">{rateLimit} msg/min</Badge>
              </label>
              <input 
                type="range" 
                min="1" 
                max="100" 
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span>1</span>
                <span>100</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <label className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-white/[0.02] cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold">Auto-start on boot</div>
                  <div className="text-xs text-muted-foreground">Start the gateway service when the phone restarts.</div>
                </div>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" style={{ backgroundColor: autoStart ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
                  <input type="checkbox" className="sr-only" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoStart ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </label>

              <label className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-white/[0.02] cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold flex items-center gap-2">Notify on failures <Bell className="w-3 h-3 text-destructive"/></div>
                  <div className="text-xs text-muted-foreground">Show Android notifications when SMS fails to send.</div>
                </div>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" style={{ backgroundColor: notifyOnFailure ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
                  <input type="checkbox" className="sr-only" checked={notifyOnFailure} onChange={(e) => setNotifyOnFailure(e.target.checked)} />
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notifyOnFailure ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50 flex justify-end">
            <Button onClick={handleSaveSettings} isLoading={updateSettingsMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save Preferences
            </Button>
          </div>
        </Card>

      </div>
    </div>
  );
}
