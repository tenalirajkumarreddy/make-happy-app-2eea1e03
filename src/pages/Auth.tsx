import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Smartphone, MapPin, Navigation } from "lucide-react";
import { generateDisplayId } from "@/lib/displayId";
import { useQuery } from "@tanstack/react-query";
import { getCurrentPosition } from "@/lib/capacitorUtils";

type Step = "phone" | "otp" | "register" | "add-store" | "link-google";
type IdentityResolution =
  | { type: "staff"; role: string; staffId?: string | null }
  | { type: "existing_customer"; customerId: string; googleLinked: boolean }
  | { type: "new_customer_known_phone"; maskedPhone: string }
  | { type: "onboarding_required"; authUserId: string; loginMethod: "google" | "phone" };

const Logo = () => (
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl mb-4">
    AP
  </div>
);

async function resolveUserIdentity(): Promise<IdentityResolution> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const { data, error } = await supabase.functions.invoke("resolve-user-identity", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (error) throw error;
  if (!data?.type) throw new Error("Invalid identity resolution response");
  return data as IdentityResolution;
}

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("phone");

  // Phone / OTP
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [pendingCustomerEmail, setPendingCustomerEmail] = useState<string | null>(null);
  const [otpSessionToken, setOtpSessionToken] = useState<string | null>(null);

  // New-customer registration
  const [regName, setRegName] = useState("");
  const [newCustomerId, setNewCustomerId] = useState<string | null>(null);

  // Store creation (step: add-store)
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // App settings
  const { data: appSettings } = useQuery({
    queryKey: ["app-settings-auth"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { map[s.key] = s.value || ""; });
      return map;
    },
  });

  const customerSignupEnabled = appSettings?.customer_signup_enabled !== "false";
  const googleLinkingEnabled = appSettings?.google_linking_enabled !== "false";

  useEffect(() => {
    const resolveExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      try {
        const identity = await resolveUserIdentity();
        if (identity.type === "staff") {
          toast.success("Logged in as staff");
          navigate("/", { replace: true });
          return;
        }
        if (identity.type === "existing_customer") {
          navigate("/", { replace: true });
          return;
        }
        if (identity.type === "new_customer_known_phone") {
          toast.error(`This phone already exists. Please login with phone ending in ${identity.maskedPhone}.`);
          await supabase.auth.signOut();
          navigate("/auth", { replace: true });
          return;
        }
        navigate("/onboarding", { replace: true });
      } catch (error) {
        console.error("Identity resolution failed", error);
        navigate("/onboarding", { replace: true });
      }
    };

    resolveExistingSession();
  }, [navigate]);

  // ── Handlers ──

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      const fullPhone = `+91${phoneNumber}`;

      // Use OpenSMS instead of Firebase
      const { data, error } = await supabase.functions.invoke("send-otp-opensms", {
        body: { phone: fullPhone }
      });

      if (error) {
        throw new Error(error.message || "Failed to send OTP");
      }

      if (!data?.success || !data?.session_token) {
        throw new Error(data?.error || "Failed to send OTP");
      }

      setOtpSessionToken(data.session_token);
      setVerifiedPhone(data.phone || fullPhone.replace(/(\d{2})(\d+)(\d{4})/, '$1***$3'));
      setStep("otp");
      toast.success(`OTP sent to ${data.phone || fullPhone.replace(/(\d{2})(\d+)(\d{4})/, '$1***$3')}`);

      // Show OTP in development mode
      if (data.otp_for_dev) {
        toast.info(`Development OTP: ${data.otp_for_dev}`, { duration: 10000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSessionToken) {
      toast.error("OTP session expired. Please request a new OTP.");
      setStep("phone");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp-opensms", {
        body: {
          session_token: otpSessionToken,
          otp_code: phoneCode,
        },
      });

      if (error || !data?.access_token) {
        throw error || new Error(data?.error || "OTP verification failed");
      }

      // Set the session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) throw sessionError;

      // Resolve user identity
      const identity = await resolveUserIdentity();
      if (identity.type === "staff") {
        toast.success("Logged in successfully");
        navigate("/");
        return;
      }

      if (identity.type === "existing_customer") {
        if (!identity.googleLinked) {
          const { data: linkedCustomer } = await supabase
            .from("customers")
            .select("email")
            .eq("id", identity.customerId)
            .maybeSingle();
          setPendingCustomerEmail(linkedCustomer?.email || "");
          setStep("link-google");
          setLoading(false);
          return;
        }
        toast.success("Logged in successfully");
        navigate("/");
        return;
      }

      if (identity.type === "new_customer_known_phone") {
        toast.error(`Phone already exists. Please login with phone ending in ${identity.maskedPhone}.`);
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        return;
      }

      // Brand-new customer — check if signup is enabled
      if (!customerSignupEnabled) {
        toast.error("New customer registration is currently disabled. Please contact support.");
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        return;
      }

      // Collect their details
      setStep("register");
      toast.success("Phone verified! Complete your profile to continue.");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "OTP verification failed";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      toast.error("Name is required");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const displayId = generateDisplayId("CUST");

      const { data: cust, error } = await supabase
        .from("customers")
        .insert({
          user_id: user.id,
          display_id: displayId,
          name: regName.trim(),
          phone: verifiedPhone || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Mark onboarding complete so user doesn't see it again
      await supabase.from("profiles").upsert({
        user_id: user.id,
        full_name: regName.trim(),
        phone: verifiedPhone || null,
        onboarding_complete: true,
        phone_verified: true,
      }, { onConflict: "user_id" });

      // Ensure user_roles has customer role
      await supabase.from("user_roles").upsert({
        user_id: user.id,
        role: "customer",
      }, { onConflict: "user_id" });

      setNewCustomerId(cust.id);
      setStep("add-store");
    } catch (error: any) {
      // Handle stale session (FK constraint violation)
      if (error.message?.includes("foreign key constraint") || error.code === "23503") {
        toast.error("Session expired. Please login again.");
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        return;
      }
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchLocationFromCoords = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await response.json();
      if (data?.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const area = addr.suburb || addr.neighbourhood || addr.road || "";
        const state = addr.state || "";
        const postcode = addr.postcode || "";
        
        setStoreCity(city);
        setStoreAddress(`${area}${area && city ? ", " : ""}${city}${state ? ", " + state : ""}${postcode ? " - " + postcode : ""}`);
      }
    } catch (err) {
      console.error("Reverse geocoding failed:", err);
    }
  };

  const handleGetLocation = async () => {
    setFetchingLocation(true);
    try {
      const position = await getCurrentPosition();
      if (position) {
        setStoreLat(position.lat);
        setStoreLng(position.lng);
        await fetchLocationFromCoords(position.lat, position.lng);
        toast.success("Location captured!");
      } else {
        toast.error("Could not get location. Please enable GPS.");
      }
    } catch (err) {
      toast.error("Location access denied");
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      toast.error("Store name is required");
      return;
    }
    if (!storeAddress.trim()) {
      toast.error("Address is required. Please use 'Get Current Location' or enter manually.");
      return;
    }
    setLoading(true);
    try {
      const displayId = generateDisplayId("STR");
      const { error } = await supabase.from("stores").insert({
        customer_id: newCustomerId,
        display_id: displayId,
        name: storeName.trim(),
        address: storeAddress.trim(),
        city: storeCity.trim() || null,
        lat: storeLat,
        lng: storeLng,
        phone: verifiedPhone || null,
        // store_type_id will be assigned by agent/manager later
      });
      if (error) throw error;
      toast.success("Account set up successfully! Welcome.");
      
      const { data: { user } } = await supabase.auth.getUser();
      const providers = (user?.app_metadata?.providers || []) as string[];
      if (googleLinkingEnabled && !providers.includes("google")) {
        setStep("link-google");
      } else {
        navigate("/");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create store");
    } finally {
      setLoading(false);
    }
  };

  // ── REGISTER STEP ──
  if (step === "register") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Create Your Account</h1>
            <p className="text-sm text-muted-foreground mt-1">Phone verified: {verifiedPhone}</p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <Label htmlFor="reg-name">Full Name <span className="text-destructive">*</span></Label>
                <Input id="reg-name" placeholder="Your full name" value={regName}
                  onChange={(e) => setRegName(e.target.value)} className="mt-1" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (step === "link-google") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Link Google Account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your Google account for easier login next time
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-3">
            <Button
              className="w-full flex items-center justify-center gap-2"
              onClick={async () => {
                const { error } = await supabase.auth.linkIdentity({
                  provider: "google",
                  options: { redirectTo: `${window.location.origin}/auth` },
                });
                if (error) {
                  if (error.message?.toLowerCase().includes("manual linking")) {
                    toast.error("Google linking is not configured. Please contact support or skip for now.");
                  } else {
                    toast.error(error.message || "Could not link Google account");
                  }
                }
              }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Link Google Account
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>Skip for now</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── ADD STORE STEP ──
  if (step === "add-store") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Add Your Store</h1>
            <p className="text-sm text-muted-foreground mt-1">Tell us about your business location</p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form onSubmit={handleAddStore} className="space-y-4">
              <div>
                <Label htmlFor="store-name">Store Name <span className="text-destructive">*</span></Label>
                <Input id="store-name" placeholder="e.g. My Shop" value={storeName}
                  onChange={(e) => setStoreName(e.target.value)} className="mt-1" required />
              </div>
              
              {/* Location Picker */}
              <div className="space-y-2">
                <Label>Store Location <span className="text-destructive">*</span></Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleGetLocation}
                  disabled={fetchingLocation}
                >
                  {fetchingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  {storeLat ? "Update Location" : "Get Current Location"}
                </Button>
                {storeLat && storeLng && (
                  <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded">
                    <MapPin className="h-3 w-3" />
                    Location captured ({storeLat.toFixed(4)}, {storeLng.toFixed(4)})
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="store-address">
                  Address <span className="text-destructive">*</span>
                </Label>
                <Textarea 
                  id="store-address" 
                  placeholder="Full store address (auto-filled from location or enter manually)" 
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)} 
                  className="mt-1 min-h-[80px]" 
                  required 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use "Get Current Location" button above or enter address manually
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading || !storeName.trim() || !storeAddress.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Store & Finish
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN SCREEN (phone → otp) ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Logo />
          <h1 className="text-2xl font-bold tracking-tight">Aqua Prime</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "otp" ? `Code sent to ${verifiedPhone}` : "Login or sign up with your phone"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          {/* Google OAuth — for returning users who have linked Google */}
          <Button
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${window.location.origin}/auth` },
              });
              if (error) {
                toast.error(error.message || "Google sign-in failed");
                setLoading(false);
              }
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or use phone OTP</span>
            </div>
          </div>

          {/* Phone number entry */}
          {step === "phone" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <Label htmlFor="phone-number">Phone Number</Label>
                <div className="relative mt-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 border-r pr-2 py-1 border-input/40 z-10">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">+91</span>
                  </div>
                  <Input
                    id="phone-number"
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543210"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 10) setPhoneNumber(val);
                    }}
                    className="pl-20"
                    required
                    maxLength={10}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Enter your 10-digit mobile number</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send OTP
              </Button>
            </form>
          )}

          {/* OTP entry */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <Label htmlFor="phone-otp">Verification Code</Label>
                <Input
                  id="phone-otp"
                  inputMode="numeric"
                  placeholder="• • • • • •"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className="mt-1 text-center text-xl tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Login
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setStep("phone"); setPhoneCode(""); setVerifiedPhone(""); }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Use different number
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
