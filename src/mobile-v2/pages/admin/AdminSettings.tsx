import { useState } from "react";
import { 
  Settings, 
  Bell, 
  Shield, 
  Database,
  Globe,
  Palette,
  ChevronRight,
  Save,
  RotateCcw
} from "lucide-react";
import { Section, Card, ListItem } from "../../components/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AdminSettings() {
  const [settings, setSettings] = useState({
    notifications: true,
    emailAlerts: true,
    autoOrders: false,
    darkMode: document.documentElement.classList.contains("dark"),
    maintenanceMode: false,
    debugMode: false,
  });

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => {
      const newValue = !prev[key];
      
      // Handle dark mode toggle
      if (key === "darkMode") {
        document.documentElement.classList.toggle("dark", newValue);
        localStorage.setItem("theme", newValue ? "dark" : "light");
      }
      
      return { ...prev, [key]: newValue };
    });
  };

  const handleSave = () => {
    // In a real app, save to database
    toast.success("Settings saved");
  };

  const handleReset = () => {
    setSettings({
      notifications: true,
      emailAlerts: true,
      autoOrders: false,
      darkMode: document.documentElement.classList.contains("dark"),
      maintenanceMode: false,
      debugMode: false,
    });
    toast.info("Settings reset to defaults");
  };

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure application settings</p>
      </div>

      {/* Notifications */}
      <Section title="Notifications" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Receive push notifications</p>
              </div>
            </div>
            <Switch 
              checked={settings.notifications} 
              onCheckedChange={() => handleToggle("notifications")} 
            />
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Email Alerts</p>
                <p className="text-sm text-muted-foreground">Receive email notifications</p>
              </div>
            </div>
            <Switch 
              checked={settings.emailAlerts} 
              onCheckedChange={() => handleToggle("emailAlerts")} 
            />
          </div>
        </Card>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">Use dark theme</p>
              </div>
            </div>
            <Switch 
              checked={settings.darkMode} 
              onCheckedChange={() => handleToggle("darkMode")} 
            />
          </div>
        </Card>
      </Section>

      {/* Business */}
      <Section title="Business Settings" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Auto Orders</p>
                <p className="text-sm text-muted-foreground">Enable automatic order processing</p>
              </div>
            </div>
            <Switch 
              checked={settings.autoOrders} 
              onCheckedChange={() => handleToggle("autoOrders")} 
            />
          </div>
        </Card>
      </Section>

      {/* System */}
      <Section title="System" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">Maintenance Mode</p>
                <p className="text-sm text-muted-foreground">Temporarily disable user access</p>
              </div>
            </div>
            <Switch 
              checked={settings.maintenanceMode} 
              onCheckedChange={() => handleToggle("maintenanceMode")} 
            />
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Debug Mode</p>
                <p className="text-sm text-muted-foreground">Enable debug logging</p>
              </div>
            </div>
            <Switch 
              checked={settings.debugMode} 
              onCheckedChange={() => handleToggle("debugMode")} 
            />
          </div>
        </Card>
      </Section>

      {/* Data Management */}
      <Section title="Data Management" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <ListItem
            icon={Database}
            title="Export Data"
            subtitle="Download all data as CSV"
            trailing={<ChevronRight className="w-5 h-5 text-muted-foreground" />}
          />
          <ListItem
            icon={Shield}
            title="Backup Settings"
            subtitle="Configure automatic backups"
            trailing={<ChevronRight className="w-5 h-5 text-muted-foreground" />}
          />
        </Card>
      </Section>

      {/* Actions */}
      <div className="flex gap-3">
        <Button 
          variant="outline" 
          className="flex-1"
          onClick={handleReset}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
        <Button 
          className="flex-1 mv2-btn-primary"
          onClick={handleSave}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
