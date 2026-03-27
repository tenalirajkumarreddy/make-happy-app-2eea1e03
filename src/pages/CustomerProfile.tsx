import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Phone } from "lucide-react";
import { GoogleAccountLink } from "@/components/shared/GoogleAccountLink";

const CustomerProfile = () => {
  const { user } = useAuth();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => resolveCustomer(user!.id),
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["my-stores", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("*, store_types(name)").eq("customer_id", customer!.id);
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: settings } = useQuery({
    queryKey: ["company-settings-care"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").eq("key", "customer_care_number").single();
      return data;
    },
  });



  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) return null;

  const totalOutstanding = stores?.reduce((s, st) => s + Number(st.outstanding), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Profile" subtitle="Personal info and account settings" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
          <CardTitle className="text-base">
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{customer.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Customer ID</span>
              <span className="font-mono text-xs">{customer.display_id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span>{customer.phone || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{customer.email || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right max-w-[200px]">{customer.address || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stores Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stores Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Stores</span>
              <span className="font-semibold">{stores?.length || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Outstanding</span>
              <span className="font-semibold text-warning">₹{totalOutstanding.toLocaleString()}</span>
            </div>
            <div className="border-t pt-3 space-y-2">
              {stores?.map((store) => (
                <div key={store.id} className="flex justify-between text-sm">
                  <span>{store.name}</span>
                  <span className="font-medium">₹{Number(store.outstanding).toLocaleString()}</span>
                </div>
              ))}
              {(!stores || stores.length === 0) && (
                <p className="text-xs text-muted-foreground text-center">No stores linked</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Google Account Link */}
      <GoogleAccountLink />

      {/* Call Agent */}
      {settings?.value && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Need Help?</p>
              <p className="text-xs text-muted-foreground">Contact customer care</p>
            </div>
            <Button variant="outline" asChild>
              <a href={`tel:${settings.value}`}>
                <Phone className="mr-2 h-4 w-4" />
                {settings.value}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}


    </div>
  );
};

export default CustomerProfile;
