import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { generateDisplayId } from "@/lib/displayId";

// Helper to extract last 10 digits from any phone format
function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default function Onboarding() {
  const { user, role, customer, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"details" | "stores">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerIdForStore, setCustomerIdForStore] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  
  
  // Phone verified via login (no need for OTP)
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Check if Google is linked
  const isGoogleLinked = user?.app_metadata?.providers?.includes("google") || 
    (user?.identities || []).some((i: any) => i?.provider === "google");

  const { data: storeTypes = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["store-types-onboarding"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return (data as { id: string; name: string }[]) || [];
    },
    enabled: step === "stores",
  });

  useEffect(() => {
    if (authLoading) return;
    
    // If no user or stale session, redirect to auth
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    
    // If user is already set up, go home/dashboard
    if (customer) {
      navigate("/", { replace: true });
      return;
    }
    
    // Staff/admin roles should NEVER see onboarding - redirect to dashboard
    if (role && role !== "customer") {
      navigate("/", { replace: true });
      return;
    }

    if (profile) {
      setName(profile.full_name || "");
    }
    
    // Extract phone from user (handles +91, 91, or 10-digit formats)
    if (user?.phone) {
      const normalized = normalizePhone(user.phone);
      setPhone(normalized);
      setPhoneVerified(true); // Phone was verified during login
    }
  }, [authLoading, customer, role, profile, navigate, user]);

  const checkExistingCustomer = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);
    try {
      // 1. Check Staff Directory First
      const { data: staffRows, error: staffError } = await supabase
        .from("staff_directory")
        .select("id, user_id, phone")
        .not("phone", "is", null)
        .limit(5000);
        
      if (staffError) throw staffError;

      const existingStaff = (staffRows || []).find((row: any) => {
        const rowPhone = normalizePhone(row.phone);
        return rowPhone === normalizedPhone;
      });

      if (existingStaff) {
        if (existingStaff.user_id === user?.id) {
          toast.success("Account already linked!");
          navigate("/", { replace: true });
          return;
        }

        const last4 = normalizedPhone.slice(-4);
        toast.error(`This phone is linked to a staff account. Please login with phone ending in ${last4}.`);
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        return;
      }

      // 2. Check Customers Table
      const { data: customerRows, error } = await supabase
        .from("customers")
        .select("id, user_id, name, phone")
        .not("phone", "is", null)
        .limit(5000);

      if (error) throw error;

      const existing = (customerRows || []).find((row: any) => {
        const rowPhone = normalizePhone(row.phone);
        return rowPhone === normalizedPhone;
      });

      if (existing) {
        if (existing.user_id === user?.id) {
          toast.success("Account already linked!");
          navigate("/", { replace: true });
          return;
        }
        
        // Customer exists but linked to different user
        if (existing.user_id) {
          const last4 = normalizedPhone.slice(-4);
          toast.error(`This phone is already registered. Please login with phone ending in ${last4}.`);
          await supabase.auth.signOut();
          navigate("/auth", { replace: true });
          return;
        }

        // Customer exists, not linked - link it
        await linkCustomer(existing.id);
      } else {
        // New customer
        await createNewCustomer();
      }
    } catch (err: any) {
      // Handle stale session (FK constraint violation)
      if (err.message?.includes("foreign key constraint") || err.code === "23503") {
        toast.error("Session expired. Please login again.");
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        return;
      }
      toast.error(err.message || "Error checking existing account");
    } finally {
      setLoading(false);
    }
  };

  const linkGoogleAccount = async () => {
    try {
      const { error } = await supabase.auth.linkIdentity({ provider: "google" });
      if (error) {
        if (error.message?.toLowerCase().includes("manual linking")) {
          toast.error("Google linking is not configured. Please contact support.");
        } else {
          throw error;
        }
      }
      // Redirect will happen automatically
    } catch (err: any) {
      toast.error(err.message || "Failed to link Google account");
    }
  };

  const linkCustomer = async (customerId: string) => {
    const { error } = await supabase
      .from("customers")
      .update({ user_id: user?.id })
      .eq("id", customerId);

    if (error) throw error;

    const { data: existingStores } = await supabase
      .from("stores")
      .select("id")
      .eq("customer_id", customerId)
      .limit(1);

    if (existingStores && existingStores.length > 0) {
      toast.success("Profile linked successfully!");
      window.location.href = "/";
      return;
    }

    setCustomerIdForStore(customerId);
    setStep("stores");
  };

  const createNewCustomer = async () => {
    const displayId = generateDisplayId("CUST");
    const normalizedPhone = normalizePhone(phone);
    
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    const { data: createdCustomer, error } = await supabase.from("customers").insert({
      display_id: displayId,
      name: name.trim(),
      phone: `+91${normalizedPhone}`,
      user_id: user?.id,
      is_active: true
    }).select("id").single();

    if (error) throw error;

    setCustomerIdForStore(createdCustomer.id);
    setStep("stores");
  };

  const createStoreAndFinish = async () => {
    if (!customerIdForStore) return;
    if (!storeName.trim() || !storeTypeId) {
      toast.error("Store name and type are required");
      return;
    }

    setLoading(true);
    try {
      const displayId = generateDisplayId("STR");
      const { error } = await supabase.from("stores").insert({
        customer_id: customerIdForStore,
        store_type_id: storeTypeId,
        display_id: displayId,
        name: storeName.trim(),
        address: storeAddress.trim() || null,
        phone: phone || null,
      });
      if (error) throw error;

      toast.success("Welcome to Aqua Prime!");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md space-y-8 bg-white p-6 rounded-xl shadow-sm border">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Complete Profile</h2>
          <p className="text-sm text-gray-500 mt-2">
            Finish setting up your account
          </p>
        </div>

        {step === "details" && (
          <div className="space-y-4">
            {/* Banner for Google OAuth users */}
            {!phoneVerified && (
              <div className="rounded-lg bg-amber-50 p-4 border border-amber-200">
                <p className="text-sm text-amber-900">
                  <strong>Used the app before?</strong> Enter your phone number below to link your existing account. Otherwise, create a new one.
                </p>
              </div>
            )}

            <div>
              <Label>Full Name</Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Your Name"
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input 
                value={phone} 
                onChange={(e) => {
                  // Only allow digits, max 10
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setPhone(digits);
                }} 
                placeholder="10-digit number"
                maxLength={10}
                disabled={phoneVerified}
              />
              {phoneVerified && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Verified via login
                </p>
              )}
            </div>

            {/* Link Google Account - show only if not already linked */}
            {!isGoogleLinked && (
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  onClick={linkGoogleAccount} 
                  className="w-full flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Link Google Account
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  For faster login next time
                </p>
              </div>
            )}

            {isGoogleLinked && (
              <div className="rounded-lg bg-green-50 p-3 border border-green-200">
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Google account linked
                </p>
              </div>
            )}

            <Button onClick={checkExistingCustomer} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </div>
        )}

        {step === "stores" && (
          <div className="space-y-4">
            <div>
              <Label>Store Name</Label>
              <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. My Store" />
            </div>
            <div>
              <Label>Store Type</Label>
              <Select value={storeTypeId} onValueChange={setStoreTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store type" />
                </SelectTrigger>
                <SelectContent>
                  {storeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Address (Optional)</Label>
              <Input value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="Store address" />
            </div>
            <Button onClick={createStoreAndFinish} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Store & Finish
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                toast.success("Profile created. You can add a store later.");
                window.location.href = "/";
              }}
            >
              Skip for now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

