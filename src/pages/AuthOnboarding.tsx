import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { generateDisplayId } from "@/lib/displayId";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { useAuth } from "@/contexts/AuthContext";

type OnboardingStep = "profile" | "store";

const Logo = () => (
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl mb-4">
    AP
  </div>
);

const OnboardingProgress = ({ step }: { step: OnboardingStep }) => {
  const steps = [
    { key: "profile", label: "Profile" },
    { key: "store", label: "Store Details" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((item, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <div key={item.key} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "border border-primary bg-primary/10 text-primary"
                    : "border border-border bg-background text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              <span className={`text-xs font-medium ${isActive || isDone ? "text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`h-px flex-1 ${index < activeIndex ? "bg-primary/60" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function AuthOnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("profile");

  // Profile step
  const [name, setName] = useState("");

  // Store step
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
   const [fetchingLocation, setFetchingLocation] = useState(false);

  // Auth guards
  const { user, needsOnboarding, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!needsOnboarding) {
    return <Navigate to="/" replace />;
  }

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
        setStoreAddress(
          `${area}${area && city ? ", " : ""}${city}${state ? ", " + state : ""}${postcode ? " - " + postcode : ""}`
        );
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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    setStep("store");
  };

  const handleFinish = async (e: React.FormEvent) => {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const phone = user.phone || user.user_metadata?.phone || null;

      // 1. Create customer record FIRST
      const displayId = generateDisplayId("CUST");
      const { data: cust, error: customerError } = await supabase
        .from("customers")
        .insert({
          display_id: displayId,
          name: name.trim(),
          phone: phone,
        })
        .select("id")
        .single();

      if (customerError) throw customerError;

      // 2. Create profile with onboarding_complete = true (ONLY at the end)
      await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          full_name: name.trim(),
          phone: phone,
          onboarding_complete: true,
          phone_verified: true,
        } as any,
        { onConflict: "user_id" }
      );

      // 3. Ensure user_roles has customer role
      await supabase.from("user_roles").upsert(
        {
          user_id: user.id,
          role: "customer",
        },
        { onConflict: "user_id" }
      );

      // 4. Create store record
      const defaultStoreTypeId = "76efecec-3e6b-4142-beaa-885c06f41ba2";
      const { data: defaultWarehouse } = await supabase
        .from("warehouses")
        .select("id")
        .limit(1)
        .single();

      const storeDisplayId = generateDisplayId("STR");
      const { error: storeError } = await supabase.from("stores").insert({
        customer_id: cust.id,
        store_type_id: defaultStoreTypeId,
        display_id: storeDisplayId,
        name: storeName.trim(),
        address: storeAddress.trim(),
        city: storeCity.trim() || null,
        lat: storeLat,
        lng: storeLng,
        phone: phone,
        warehouse_id: (defaultWarehouse as any)?.id || null,
      });

      if (storeError) throw storeError;

      toast.success("Account set up successfully! Welcome.");
      // Reload to trigger AuthContext refresh, then the user will be redirected to "/"
      window.location.href = "/";
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo />
          <h1 className="text-2xl font-bold tracking-tight">
            {step === "profile" ? "Create Your Account" : "Add Your Store"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "profile"
              ? "Just a few details to get you started"
              : "One last step. Tell us about your business location."}
          </p>
        </div>

        <OnboardingProgress step={step} />

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {step === "profile" ? (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <Label htmlFor="reg-name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </form>
          ) : (
            <form onSubmit={handleFinish} className="space-y-4">
              <div>
                <Label htmlFor="store-name">
                  Store Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="store-name"
                  placeholder="e.g. My Shop"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
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
                <textarea
                  id="store-address"
                  placeholder="Full store address (auto-filled from location or enter manually)"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use "Get Current Location" button above or enter address manually
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("profile")}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading || !storeName.trim() || !storeAddress.trim()}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Store & Finish
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}