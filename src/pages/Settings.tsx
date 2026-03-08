import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SettingsPage = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader title="Settings" subtitle="Company settings and system configuration" />
    <Tabs defaultValue="company">
      <TabsList>
        <TabsTrigger value="company">Company</TabsTrigger>
        <TabsTrigger value="store-types">Store Types</TabsTrigger>
        <TabsTrigger value="features">Features</TabsTrigger>
      </TabsList>

      <TabsContent value="company" className="mt-4 space-y-6">
        <div className="rounded-xl border bg-card p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold">Company Information</h3>
          <div className="space-y-3">
            <div><Label>Company Name</Label><Input defaultValue="BizManager Corp" className="mt-1" /></div>
            <div><Label>GST Number</Label><Input defaultValue="29AABCU9603R1ZM" className="mt-1" /></div>
            <div><Label>Customer Care Number</Label><Input defaultValue="+91 1800 123 4567" className="mt-1" /></div>
            <div><Label>Address</Label><Input defaultValue="123, MG Road, Bangalore" className="mt-1" /></div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="store-types" className="mt-4">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">Store Types</h3>
          <p className="text-sm text-muted-foreground">Manage store types, product access, and pricing here.</p>
        </div>
      </TabsContent>

      <TabsContent value="features" className="mt-4 space-y-4">
        <div className="rounded-xl border bg-card p-6 space-y-5 max-w-lg">
          <h3 className="font-semibold">Feature Toggles</h3>
          {[
            { label: "Location Validation", desc: "Require agents to be near store for sales" },
            { label: "Auto Orders", desc: "Enable automatic recurring orders" },
            { label: "Push Notifications", desc: "Send push notifications to users" },
            { label: "Partial Collections", desc: "Allow managers to collect partial amounts" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch />
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  </div>
);

export default SettingsPage;
