import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Store, ShoppingCart, DollarSign, FileCheck, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { BannerCarousel } from "@/components/banners/BannerCarousel";

const CustomerPortal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).single();
      return data;
    },
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

      {/* KYC Banner */}
      {customer.kyc_status === "not_requested" && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCheck className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium">Complete KYC Verification</p>
              <p className="text-xs text-muted-foreground">Verify your identity to unlock higher credit limits</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/portal/profile")}>
            <Upload className="mr-2 h-4 w-4" />Upload Documents
          </Button>
        </div>
      )}
      {customer.kyc_status === "pending" && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-info animate-spin" />
          <p className="text-sm font-medium">KYC verification is under review</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="My Stores" value={String(stores?.length || 0)} icon={Store} />
        <StatCard title="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor="bg-warning" />
        <StatCard title="Pending Orders" value={String(pendingOrders)} icon={ShoppingCart} />
        <StatCard title="KYC Status" value={customer.kyc_status.replace("_", " ")} icon={FileCheck} iconColor={customer.kyc_status === "verified" ? "bg-success" : "bg-muted"} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
