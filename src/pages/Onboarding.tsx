import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { generateDisplayId } from "@/lib/displayId";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/firebaseAuth";

export default function Onboarding() {
  const { user, role, customer, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"details" | "verify" | "stores">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  // Existing customer found match
  const [foundCustomer, setFoundCustomer] = useState<any>(null);
  
  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    if (authLoading) return;
    
    // If user is already set up or not a customer role, go home/dashboard
    if (customer) {
      navigate("/", { replace: true });
      return;
    }
    
    if (role && role !== "customer") {
       navigate("/", { replace: true });
       return;
    }

    if (profile) {
      setName(profile.full_name || "");
      if (profile.email) setEmail(profile.email);
      // Wait, profile.phone might be empty if google login
      if (user?.phone) setPhone(user.phone.replace(/^\+91/, ""));
    }
  }, [authLoading, customer, role, profile, navigate, user]);

  const checkExistingCustomer = async () => {
    if (!phone || phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);
    try {
      // Check if phone matches any customer
      // Note: We search for raw phone or normalized phone? usually stored as raw 10 digits or sometimes +91
      // Based on existing code, it seems to store raw digits in some places, so let's try exact match first
      const { data: existing, error } = await supabase
        .from("customers")
        .select("*, stores(*)")
        .eq("phone", phone)
        .maybeSingle();

      if (error) throw error;

      if (existing) {
        if (existing.user_id) {
           // Already linked to someone else?
           if (existing.user_id === user?.id) {
             // Should have been caught by auth context, but just in case
             toast.success("Account synced!");
             navigate("/", { replace: true });
             return;
           }
           toast.error("This phone number is already linked to another user account.");
           return;
        }
        
        // Found unlinked customer
        setFoundCustomer(existing);
        setStep("verify");
      } else {
        // New customer
        await createNewCustomer();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startVerification = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      // If user logged in via Phone auth and the number matches, we can skip verification?
      // user.phone usually has +91 prefix
      const userPhoneNorm = user?.phone?.replace(/^\+91/, ""); // simplistic removal
      
      if (userPhoneNorm === phone) {
        // Used phone login matching this number -> Auto verify
        await linkCustomer(foundCustomer.id);
        return;
      }

      // Otherwise (Google login -> claiming Phone profile), verify via OTP
      const fullPhone = `+91${phone}`;
      await sendPhoneOtp(fullPhone, "onboarding-recaptcha");
      
      setOtpSent(true);
      toast.success(`OTP sent to ${fullPhone}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    try {
      await verifyPhoneOtp(otpCode);
      // OTP verified successfully
      await linkCustomer(foundCustomer.id);
    } catch (err: any) {
      toast.error("Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const linkCustomer = async (customerId: string) => {
    const { error } = await supabase
      .from("customers")
      .update({ user_id: user?.id })
      .eq("id", customerId);

    if (error) throw error;

    toast.success("Profile linked successfully!");
    // Force reload or just navigate? Navigation might leave stale context
    // We can rely on realtime subscription in AuthContext? Or just reload window
    window.location.href = "/";
  };

  const createNewCustomer = async () => {
    // Determine info
    const displayId = generateDisplayId("CUST");
    
    // Ensure we have name
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    const { error } = await supabase.from("customers").insert({
      display_id: displayId,
      name: name,
      phone: phone, // Assuming 10 digits
      email: email || user?.email,
      user_id: user?.id,
      is_active: true
      // add other default fields if needed
    });

    if (error) throw error;

    toast.success("Welcome to Aqua Prime!");
    window.location.href = "/";
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
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="10-digit number"
                maxLength={10}
                // If logged in via phone, lock it?
                disabled={!!user?.phone} 
              />
              {user?.phone && <p className="text-xs text-muted-foreground mt-1">Verified via login</p>}
            </div>
            <div>
              <Label>Email (Optional)</Label>
              <Input 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={!!user?.email}
              />
            </div>

            <Button onClick={checkExistingCustomer} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </div>
        )}

        {step === "verify" && foundCustomer && (
          <div className="space-y-6">
             <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                   <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                   <div>
                     <h3 className="font-medium text-blue-900">Account Found</h3>
                     <p className="text-sm text-blue-700 mt-1">
                       We found an existing customer record for <strong>{foundCustomer.name}</strong> with phone <strong>{foundCustomer.phone}</strong>.
                     </p>
                     {foundCustomer.stores && foundCustomer.stores.length > 0 && (
                        <p className="text-xs text-blue-600 mt-2">
                          Linked Stores: {foundCustomer.stores.map((s:any) => s.name).join(", ")}
                        </p>
                     )}
                   </div>
                </div>
             </div>

             <div className="space-y-4">
               {!otpSent ? (
                 <div className="text-center space-y-4">
                    <p className="text-sm text-gray-600">
                      To claim this account, we need to verify your phone number.
                    </p>
                    <div id="onboarding-recaptcha"></div>
                    <Button onClick={startVerification} disabled={loading} className="w-full">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify & Link Account
                    </Button>
                    <Button variant="ghost" onClick={() => setStep("details")} className="w-full mt-2">
                       Not You? Go Back
                    </Button>
                 </div>
               ) : (
                 <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Enter OTP</Label>
                      <Input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        className="text-center text-lg tracking-widest"
                      />
                    </div>
                    <Button onClick={handleVerify} disabled={loading} className="w-full">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify & Link
                    </Button>
                 </div>
               )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

