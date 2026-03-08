import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Store } from "lucide-react";

const storeTypes = ["Retail", "Wholesale", "Restaurant"];

const routes = {
  Retail: [
    { name: "MG Road Route", stores: 45, outstanding: "₹1,25,000" },
    { name: "South Bangalore", stores: 32, outstanding: "₹85,000" },
    { name: "BTM Route", stores: 28, outstanding: "₹62,000" },
  ],
  Wholesale: [
    { name: "Industrial Area", stores: 15, outstanding: "₹3,45,000" },
    { name: "Market Road", stores: 12, outstanding: "₹2,10,000" },
  ],
  Restaurant: [
    { name: "East Route", stores: 22, outstanding: "₹1,80,000" },
    { name: "Central Zone", stores: 18, outstanding: "₹1,45,000" },
  ],
};

const Routes = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Routes" subtitle="Manage delivery routes by store type" actionLabel="Create Route" />

      <Tabs defaultValue="Retail">
        <TabsList>
          {storeTypes.map((type) => (
            <TabsTrigger key={type} value={type}>{type}</TabsTrigger>
          ))}
        </TabsList>

        {storeTypes.map((type) => (
          <TabsContent key={type} value={type} className="space-y-4 mt-4">
            {routes[type as keyof typeof routes]?.map((route) => (
              <div
                key={route.name}
                className="flex items-center justify-between rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                    <MapPin className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{route.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Store className="h-3.5 w-3.5" />
                        {route.stores} stores
                      </span>
                      <span>Outstanding: <span className="font-medium text-foreground">{route.outstanding}</span></span>
                    </div>
                  </div>
                </div>
                <button className="text-sm font-medium text-primary hover:underline">
                  More Details
                </button>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Routes;
