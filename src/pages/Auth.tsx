import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { OTPInput } from "@/components/auth/OTPInput";
import { useAuth } from "@/contexts/AuthContext";

const OTP_RESEND_INTERVAL = 60; // seconds

const Logo = () => (
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl mb-4">
    AP
  </div>
);

const Auth = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [otpError, setOtpError] = useState(false);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Clear error when user types
  const clearErrors = useCallback(() => {
    setErrorMessage("");
    setOtpError(false);
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow digits, max 10 characters
    const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(digitsOnly);
    clearErrors();
  };

  const handleOtpChange = (value: string) => {
    setOtpCode(value);
    clearErrors();
  };

  const getErrorMessage = (error: any): string => {
    if (!error) return "Something went wrong. Please try again.";
    
    const message = error.message || error.error || String(error);
    
    // Map specific error messages
    if (message.includes("Invalid OTP") || message.includes("verify") || message.includes("expired")) {
      return "Wrong OTP. Please check the code and try again.";
    }
    if (message.includes("rate limit") || message.includes("Too many")) {
      return "Too many attempts. Please wait a moment before trying again.";
    }
    if (message.includes("not configured") || message.includes("env")) {
      return "Service temporarily unavailable. Please try again later.";
    }
    if (message.includes("phone") || message.includes("required")) {
      return "Please enter a valid phone number.";
    }
    if (message.includes("network") || message.includes("fetch")) {
      return "Network issue. Please check your connection and try again.";
    }
    
    return message;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length !== 10) {
      setErrorMessage("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const fullPhone = `+91${phoneNumber}`;
      
      const { data, error } = await supabase.functions.invoke('send-otp-httpsms', {
        body: { phone: fullPhone }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setSessionToken(data.session_token);
      setOtpSent(true);
      setCountdown(OTP_RESEND_INTERVAL);
      setOtpCode("");
      toast.success("OTP sent to your phone!");
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setOtpError(true);
      setErrorMessage("Please enter all 6 digits of the OTP");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setOtpError(false);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp-httpsms', {
        body: { 
          session_token: sessionToken,
          otp_code: otpCode 
        }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      // Set the Supabase session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) throw sessionError;

      toast.success("Phone verified! Welcome.");
      
      // AuthContext will handle the redirect based on needsOnboarding
      // If needsOnboarding, it will redirect to the onboarding page
      // If not, it will redirect to the dashboard
      
    } catch (error: any) {
      const message = getErrorMessage(error);
      setOtpError(true);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    
    setLoading(true);
    setErrorMessage("");
    setOtpError(false);
    try {
      const fullPhone = `+91${phoneNumber}`;
      
      const { data, error } = await supabase.functions.invoke('send-otp-httpsms', {
        body: { phone: fullPhone }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setSessionToken(data.session_token);
      setCountdown(OTP_RESEND_INTERVAL);
      setOtpCode("");
      toast.success("OTP resent!");
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Loading guard: prevent login form flash for logged-in users
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo />
          <h1 className="text-2xl font-bold tracking-tight">Aqua Prime</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {otpSent 
              ? `Enter the OTP sent to +91 ${phoneNumber}`
              : "Sign in with your mobile number"
            }
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          {!otpSent ? (
            /* Step 1: Phone Input */
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <Label htmlFor="phone">Mobile Number</Label>
                <div className="flex items-center mt-1 gap-2 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <span className="text-sm font-medium text-muted-foreground select-none">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit number"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    className="border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                    maxLength={10}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll send a 6-digit OTP to verify your number
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {errorMessage}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || phoneNumber.length !== 10}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Send OTP
              </Button>
            </form>
          ) : (
            /* Step 2: OTP Verification */
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-3">
                <Label>Enter OTP</Label>
                <OTPInput
                  value={otpCode}
                  onChange={handleOtpChange}
                  disabled={loading}
                  error={otpError}
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Sent to +91 {phoneNumber}
                  </span>
                  {countdown > 0 ? (
                    <span className="text-muted-foreground">
                      Resend in {countdown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="flex items-center text-primary hover:text-primary/80 hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {errorMessage}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || otpCode.length !== 6}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Verify OTP
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setErrorMessage("");
                  setOtpError(false);
                }}
                disabled={loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Change Phone Number
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;