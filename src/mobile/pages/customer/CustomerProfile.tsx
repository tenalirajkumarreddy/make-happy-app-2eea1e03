import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { toast } from "sonner";
import { getOAuthRedirectUrl } from "@/lib/capacitorUtils";

interface CustomerRow {
  id: string;
  name: string;
  display_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface StoreRow {
  id: string;
  name: string;
  outstanding: number;
}

export function CustomerProfile() {
  const { user } = useAuth();
  const [linking, setLinking] = useState(false);

  const { data: liveAuthUser, refetch: refetchLiveAuthUser } = useQuery({
    queryKey: ["mobile-auth-user-live", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    enabled: !!user,
  });

  const googleIdentity = liveAuthUser?.identities?.find((identity) => identity.provider === "google");
  const isGoogleLinked = !!googleIdentity;

  const { data: customer, isLoading } = useQuery({
    queryKey: ["mobile-customer-profile", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id, name, display_id, phone, email, address")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-profile-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, outstanding")
        .eq("customer_id", customer!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as StoreRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: customerCare } = useQuery({
    queryKey: ["mobile-customer-profile-care"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", "customer_care_number")
        .maybeSingle();
      if (error) throw error;
      return data?.value || "";
    },
  });

  const { data: appSettings } = useQuery({
    queryKey: ["company-settings", "google-linking"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .eq("key", "google_linking_enabled")
        .maybeSingle();
      return data;
    },
  });

  const googleLinkingEnabled = appSettings?.value === "true";

  const handleLinkGoogle = async () => {
    if (!googleLinkingEnabled) {
      toast.error("Google account linking is currently disabled by the administrator.");
      return;
    }

    setLinking(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: getOAuthRedirectUrl("/"),
        },
      });

      if (error) {
        if (error.message.includes("Manual linking")) {
          toast.error("Manual account linking is disabled. Please contact support.", { duration: 5000 });
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Google account linking initiated.");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to link Google account");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const { data: latestAuthData } = await supabase.auth.getUser();
    const latestGoogleIdentity = latestAuthData.user?.identities?.find((identity) => identity.provider === "google");

    if (!latestGoogleIdentity) {
      toast.success("Google account is already unlinked");
      await refetchLiveAuthUser();
      return;
    }

    setLinking(true);
    try {
      const { error } = await supabase.auth.unlinkIdentity(latestGoogleIdentity);
      if (error) {
        if (error.message?.toLowerCase().includes("identity doesn't exist")) {
          toast.success("Google account is already unlinked");
          await refetchLiveAuthUser();
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Google account unlinked successfully");
        await refetchLiveAuthUser();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink Google account");
    } finally {
      setLinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!customer) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">No profile data found.</div>;
  }

  const totalOutstanding = (stores || []).reduce((sum, store) => sum + Number(store.outstanding || 0), 0);

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <p className="text-base font-bold text-slate-900 dark:text-white">{customer.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{customer.display_id}</p>

        <div className="mt-3 space-y-2 text-sm">
          <InfoRow label="Phone" value={customer.phone || "—"} />
          <InfoRow label="Email" value={customer.email || "—"} />
          <InfoRow label="Address" value={customer.address || "—"} />
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Stores Summary</p>
        <div className="mt-2 space-y-1.5 text-sm">
          <InfoRow label="Total Stores" value={String((stores || []).length)} />
          <InfoRow label="Outstanding" value={`₹${totalOutstanding.toLocaleString("en-IN")}`} />
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1.5">
          {(stores || []).map((store) => (
            <div key={store.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300 truncate">{store.name}</span>
              <span className="font-semibold">₹{Number(store.outstanding || 0).toLocaleString("en-IN")}</span>
            </div>
          ))}
          {(stores || []).length === 0 && <p className="text-xs text-muted-foreground text-center">No active stores</p>}
        </div>
      </div>

      {/* Google Account Link */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Google Account</p>
        {isGoogleLinked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Connected to Google</span>
            </div>
            <button
              type="button"
              onClick={handleUnlinkGoogle}
              disabled={linking || !googleLinkingEnabled}
              className="w-full h-10 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium disabled:opacity-50"
            >
              {linking ? "Unlinking..." : "Unlink Google"}
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">Link your Google account for easy sign-in</p>
            <button
              type="button"
              onClick={handleLinkGoogle}
              disabled={linking || !googleLinkingEnabled}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {linking ? (
                "Linking..."
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Link Google Account
                </>
              )}
            </button>
            {!googleLinkingEnabled && (
              <p className="text-xs text-slate-500 mt-2">Google linking is currently disabled.</p>
            )}
          </>
        )}
      </div>

      {customerCare && (
        <button
          type="button"
          onClick={() => window.open(`tel:${customerCare}`, "_self")}
          className="w-full h-11 rounded-xl border border-primary/30 text-primary font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Phone className="h-4 w-4" />
          Call Support
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}
