import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { GoogleAccountLink } from "@/components/shared/GoogleAccountLink";

const UserProfile = () => {
  const { user, profile, role } = useAuth();

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Format role for display
  const roleName = role ? role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User";

  // Extract phone from auth user
  const phoneNumber = user.phone || user.user_metadata?.phone || "—";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Account" subtitle="Manage your profile and account settings" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{profile.full_name || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium">{roleName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span>{phoneNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="text-xs">{user.email || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs">{user.id.slice(0, 8)}...</span>
            </div>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Account Created</span>
              <span className="font-medium">
                {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Last Sign In</span>
              <span className="font-medium">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Auth Providers</span>
              <span className="font-medium capitalize">
                {user.app_metadata?.providers?.join(", ") || "Phone"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Google Account Link */}
      <GoogleAccountLink />
    </div>
  );
};

export default UserProfile;
