import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Store, ShoppingCart, DollarSign, FileCheck, Phone, Link2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { BannerCarousel } from "@/components/banners/BannerCarousel";
import { NoticeBox } from "@/components/shared/NoticeBox";

const CustomerPortal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [linkDismissed, setLinkDismissed] = useState(
    () => localStorage.getItem("link_prompt_dismissed") === "true"
  );
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  // Check if Google is already linked
  const isGoogleLinked = user?.app_metadata?.providers?.includes("google") || 
    (user?.identities || []).some((i: any) => i?.provider === "google");
  const isPhoneOnlyUser = !!user?.email?.endsWith("@phone.aquaprime.app");

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      if (error.message?.toLowerCase().includes("manual linking")) {
        toast.error("Google linking is not configured. Please contact support.");
      } else {
        toast.error(error.message);
      }
      setLinkingGoogle(false);
    }
    // On success the browser will redirect to Google — no further action needed here
  };

  const handleDismissLinkPrompt = () => {
    localStorage.setItem("link_prompt_dismissed", "true");
    setLinkDismissed(true);
  };

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-portal"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s) => { map[s.key] = s.value || ""; });
      return map;
    },
  });

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => resolveCustomer(user!.id),
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["my-stores", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("*, store_types(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: orders } = useQuery({
    queryKey: ["my-orders-count", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, status").eq("customer_id", customer!.id);
      return data || [];
    },
    enabled: !!customer,
  });

  const totalOutstanding = stores?.reduce((s, st) => s + Number(st.outstanding), 0) || 0;
  const pendingOrders = orders?.filter((o) => o.status === "pending").length || 0;

  const storeColumns = [
    { header: "Store", accessor: "name" as const, className: "font-medium" },
    { header: "Type", accessor: (row: any) => <Badge variant="secondary">{row.store_types?.name || "—"}</Badge> },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  if (loadingCustomer) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Customer Portal" subtitle="Your account is not linked to a customer profile yet." />
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          Please contact the admin to link your account to a customer profile.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Dashboard" subtitle={`Welcome, ${customer.name}`} primaryAction={{ label: "Place Order", onClick: () => navigate("/portal/orders") }} />

      {/* Promotional Banners */}
      <BannerCarousel storeTypeIds={stores?.map((s: any) => s.store_type_id).filter(Boolean)} />

      {/* Link Google account prompt for phone-only users who haven't linked yet */}
      {isPhoneOnlyUser && !isGoogleLinked && !linkDismissed && (
        <NoticeBox
          variant="premium"
          icon={Link2}
          onClose={handleDismissLinkPrompt}
          title="Secure your account"
          message={
            <div className="space-y-2">
              <p>Link Google for faster, passwordless login next time.</p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-primary/20 bg-background/50 hover:bg-background"
                onClick={handleLinkGoogle}
                disabled={linkingGoogle}
              >
                {linkingGoogle ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Redirecting…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 capitalize">
                    Link Google Account
                  </span>
                )}
              </Button>
            </div>
          }
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="My Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor="bg-warning" />
        <StatCard title="Pending Orders" value={String(pendingOrders)} icon={ShoppingCart} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/portal/orders")}>
          <ShoppingCart className="h-5 w-5" />
          <span className="text-xs">Place Order</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/portal/sales")}>
          <DollarSign className="h-5 w-5" />
          <span className="text-xs">My Sales</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/portal/transactions")}>
          <FileCheck className="h-5 w-5" />
          <span className="text-xs">Transactions</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/portal/profile")}>
          <Store className="h-5 w-5" />
          <span className="text-xs">My Profile</span>
        </Button>
        {companySettings?.customer_care_number && (
          <Button
            variant="outline"
            className="h-auto py-4 flex-col gap-2 border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => window.open(`tel:${companySettings.customer_care_number}`, "_self")}
          >
            <Phone className="h-5 w-5" />
            <span className="text-xs">Call Agent</span>
          </Button>
        )}
      </div>

      {/* Stores Overview */}
      <div>
        <h3 className="text-sm font-semibold mb-3">My Stores</h3>
        <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." />
      </div>
    </div>
  );
};

export default CustomerPortal;
