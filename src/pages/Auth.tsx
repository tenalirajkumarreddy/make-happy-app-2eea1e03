import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, Lock, Loader2, ArrowLeft, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/firebaseAuth";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useQuery } from "@tanstack/react-query";

type Step = "phone" | "otp" | "register" | "add-store";

const Logo = () => (
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl mb-4">
    AP
  </div>
);

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // Phone / OTP
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");

  // New-customer registration
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [newCustomerId, setNewCustomerId] = useState<string | null>(null);

  // Store creation (step: add-store)
  const [storeName, setStoreName] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  // Staff login
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  const { data: storeTypes = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["store-types-auth"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return (data as { id: string; name: string }[]) || [];
    },
    enabled: step === "add-store",
  });

  // ── Handlers ──

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalized = await sendPhoneOtp(phoneNumber, "firebase-recaptcha-container");
      setVerifiedPhone(normalized);
      setStep("otp");
      toast.success(`OTP sent to ${normalized}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const idToken = await verifyPhoneOtp(phoneCode);

      const { data, error } = await supabase.functions.invoke("firebase-phone-exchange", { body: { idToken } });
      if (error || !data?.access_token) throw error || new Error("Phone login failed");

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) throw sessionError;

      const userId = (data.user?.id) as string | undefined;
      if (!userId) throw new Error("Could not determine user ID");

      // Check if a customer record was linked by the edge function
      const customer = await resolveCustomer(userId);
      if (customer) {
        toast.success("Logged in successfully");
        navigate("/");
      } else {
        // Brand-new customer — collect their details
        setStep("register");
        toast.success("Phone verified! Complete your profile to continue.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OTP verification failed");
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

      const displayId = `CUST${Math.floor(10000000 + Math.random() * 90000000)}`;

      const { data: cust, error } = await supabase
        .from("customers")
        .insert({
          user_id: user.id,
          display_id: displayId,
          name: regName.trim(),
          phone: verifiedPhone || null,
          email: regEmail.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewCustomerId(cust.id);
      setStep("add-store");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !storeTypeId) {
      toast.error("Store name and type are required");
      return;
    }
    setLoading(true);
    try {
      const displayId = `STR${Math.floor(10000000 + Math.random() * 90000000)}`;
      const { error } = await supabase.from("stores").insert({
        customer_id: newCustomerId,
        store_type_id: storeTypeId,
        display_id: displayId,
        name: storeName.trim(),
        address: storeAddress.trim() || null,
        phone: verifiedPhone || null,
      });
      if (error) throw error;
      toast.success("Account set up successfully! Welcome.");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create store");
    } finally {
      setLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: staffEmail, password: staffPassword });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Logged in successfully");
      navigate("/");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset link sent to your email!");
      setShowForgot(false);
    }
  };

  // ── FORGOT PASSWORD SCREEN ──
  if (showForgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <Label htmlFor="forgot-email">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="forgot-email" type="email" placeholder="you@example.com" value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)} className="pl-9" required />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForgot(false)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
              <div>
                <Label htmlFor="reg-email">
                  Email <span className="text-xs text-muted-foreground">(optional — for Google login later)</span>
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="reg-email" type="email" placeholder="you@example.com" value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)} className="pl-9" />
                </div>
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

  // ── ADD STORE STEP ──
  if (step === "add-store") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight">Add Your Store</h1>
            <p className="text-sm text-muted-foreground mt-1">Tell us about your business</p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form onSubmit={handleAddStore} className="space-y-4">
              <div>
                <Label htmlFor="store-name">Store Name <span className="text-destructive">*</span></Label>
                <Input id="store-name" placeholder="e.g. My Shop" value={storeName}
                  onChange={(e) => setStoreName(e.target.value)} className="mt-1" required />
              </div>
              <div>
                <Label>Store Type <span className="text-destructive">*</span></Label>
                <Select value={storeTypeId} onValueChange={setStoreTypeId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select store type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {storeTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="store-address">
                  Address <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input id="store-address" placeholder="Store address" value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)} className="mt-1" />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !storeTypeId || !storeName.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Store & Finish
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  toast.success("Account created! You can add a store later from your dashboard.");
                  navigate("/");
                }}
              >
                Skip for now
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
                options: { redirectTo: window.location.origin },
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
                  <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone-number"
                    type="tel"
                    placeholder="+91XXXXXXXXXX"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Include country code, e.g. +91…</p>
              </div>
              <div id="firebase-recaptcha-container" />
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

        {/* Staff / Admin login — collapsible */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowStaffLogin((v) => !v)}
          >
            <span>Staff / Admin Login</span>
            {showStaffLogin ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showStaffLogin && (
            <div className="px-4 pb-4 border-t">
              <form onSubmit={handleStaffLogin} className="space-y-3 pt-3">
                <div>
                  <Label htmlFor="staff-email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="staff-email" type="email" placeholder="you@example.com" value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)} className="pl-9" required />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="staff-password">Password</Label>
                    <button type="button" className="text-xs text-primary hover:underline"
                      onClick={() => setShowForgot(true)}>
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="staff-password" type="password" placeholder="••••••••" value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)} className="pl-9" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
