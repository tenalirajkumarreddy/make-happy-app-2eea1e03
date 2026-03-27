import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getOAuthRedirectUrl } from "@/lib/capacitorUtils";

export const GoogleAccountLink = () => {
  const { user } = useAuth();
  const [linking, setLinking] = useState(false);

  const { data: liveAuthUser, refetch: refetchLiveAuthUser } = useQuery({
    queryKey: ["auth-user-live", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    enabled: !!user,
  });

  const googleIdentity = liveAuthUser?.identities?.find((identity) => identity.provider === "google");
  const isGoogleLinked = !!googleIdentity;

  // Get company settings to check if Google linking is enabled
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
          toast.error(
            "Manual account linking is disabled in the system settings. Please contact support to enable this feature.",
            { duration: 5000 }
          );
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Google account linking initiated. Please complete the OAuth flow.");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Account</CardTitle>
        <CardDescription>
          {isGoogleLinked
            ? "Your account is linked to Google. You can sign in with Google or your phone number."
            : "Link your Google account for easy sign-in"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isGoogleLinked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <Button
              variant="outline"
              onClick={handleUnlinkGoogle}
              disabled={linking || !googleLinkingEnabled}
            >
              {linking ? "Unlinking..." : "Unlink Google Account"}
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleLinkGoogle}
            disabled={linking || !googleLinkingEnabled}
            className="w-full"
          >
            {linking ? (
              "Linking..."
            ) : (
              <span className="flex items-center gap-2">
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
              </span>
            )}
          </Button>
        )}
        {!googleLinkingEnabled && (
          <p className="text-xs text-muted-foreground">
            Google account linking is currently disabled by the administrator.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
