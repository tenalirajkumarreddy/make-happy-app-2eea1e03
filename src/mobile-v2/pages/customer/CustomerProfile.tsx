import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  FileText,
  Camera,
  Edit2,
  Save,
  X,
  Shield,
  Bell,
  LogOut,
  ChevronRight,
  Moon,
  Sun
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, ListItem } from "../../components/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function CustomerProfile() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => 
    document.documentElement.classList.contains("dark")
  );
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    business_name: profile?.business_name || "",
    phone: profile?.phone || "",
    email: profile?.email || "",
    address: profile?.address || "",
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          business_name: data.business_name,
          phone: data.phone,
          address: data.address,
        })
        .eq("id", profile?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
      toast.success("Profile updated successfully");
    },
    onError: () => {
      toast.error("Failed to update profile");
    },
  });

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    document.documentElement.classList.toggle("dark", newMode);
    localStorage.setItem("theme", newMode ? "dark" : "light");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/auth");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({
      full_name: profile?.full_name || "",
      business_name: profile?.business_name || "",
      phone: profile?.phone || "",
      email: profile?.email || "",
      address: profile?.address || "",
    });
    setIsEditing(false);
  };

  return (
    <div className="mv2-page">
      {/* Profile Header */}
      <div className="relative mb-6">
        <div className="h-24 bg-gradient-to-r from-primary to-primary/70 rounded-xl" />
        <div className="absolute -bottom-12 left-4 flex items-end gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-card border-4 border-background flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <User className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="absolute top-3 right-3">
          {isEditing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="w-4 h-4" />
              </Button>
              <Button 
                size="sm" 
                onClick={handleSave}
                disabled={updateProfileMutation.isPending}
              >
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
            </div>
          ) : (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Profile Info */}
      <div className="mt-14 mb-6">
        <h1 className="text-xl font-bold text-foreground">
          {profile?.full_name || "Customer"}
        </h1>
        {profile?.business_name && (
          <p className="text-muted-foreground">{profile.business_name}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Customer ID: {profile?.display_id || profile?.id?.slice(0, 8)}
        </p>
      </div>

      {/* Personal Information */}
      <Section title="Personal Information" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          {isEditing ? (
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Full Name
                </label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="mv2-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Business Name
                </label>
                <Input
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="mv2-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Phone
                </label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mv2-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Address
                </label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mv2-input"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <>
              <ListItem
                icon={User}
                title="Full Name"
                subtitle={profile?.full_name || "Not set"}
              />
              <ListItem
                icon={Building2}
                title="Business Name"
                subtitle={profile?.business_name || "Not set"}
              />
              <ListItem
                icon={Phone}
                title="Phone"
                subtitle={profile?.phone || "Not set"}
              />
              <ListItem
                icon={Mail}
                title="Email"
                subtitle={profile?.email || "Not set"}
              />
              <ListItem
                icon={MapPin}
                title="Address"
                subtitle={profile?.address || "Not set"}
              />
            </>
          )}
        </Card>
      </Section>

      {/* KYC Status */}
      <Section title="Verification" className="mb-6">
        <Card 
          variant="outline" 
          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate("/customer/kyc")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                profile?.kyc_status === "verified" 
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}>
                <Shield className={`w-5 h-5 ${
                  profile?.kyc_status === "verified" 
                    ? "text-green-600" 
                    : "text-amber-600"
                }`} />
              </div>
              <div>
                <p className="font-medium text-foreground">KYC Verification</p>
                <p className="text-sm text-muted-foreground capitalize">
                  Status: {profile?.kyc_status || "Not submitted"}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </Card>
      </Section>

      {/* Settings */}
      <Section title="Settings" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sun className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  {isDarkMode ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>
            <Switch checked={isDarkMode} onCheckedChange={toggleDarkMode} />
          </div>
          <ListItem
            icon={Bell}
            title="Notifications"
            subtitle="Manage notification preferences"
            trailing={<ChevronRight className="w-5 h-5 text-muted-foreground" />}
          />
        </Card>
      </Section>

      {/* Sign Out */}
      <Button 
        variant="outline" 
        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
