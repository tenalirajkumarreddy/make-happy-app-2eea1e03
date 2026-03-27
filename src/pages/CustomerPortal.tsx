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
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Secure your account</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                Link Google for faster, passwordless login next time.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300"
                onClick={handleLinkGoogle}
                disabled={linkingGoogle}
              >
                {linkingGoogle ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Redirecting…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Link Google
                  </span>
                )}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissLinkPrompt}
            className="shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
