import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  User, 
  Phone, 
  Mail,
  Edit2,
  Save,
  X,
  Shield,
  Bell,
  LogOut,
  Moon,
  Sun,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, ListItem, Badge } from "../../components/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function AdminProfile() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => 
    document.documentElement.classList.contains("dark")
  );
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          phone: data.phone,
        })
        .eq("id", profile?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
      toast.success("Profile updated");
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

  return (
    <div className="mv2-page">
      {/* Profile Header */}
      <div className="relative mb-6">
        <div className="h-24 bg-gradient-to-r from-primary to-primary/70 rounded-xl" />
        <div className="absolute -bottom-12 left-4 flex items-end gap-4">
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
        </div>
        <div className="absolute top-3 right-3">
          {isEditing ? (
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => {
                  setFormData({
                    full_name: profile?.full_name || "",
                    phone: profile?.phone || "",
                  });
                  setIsEditing(false);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button 
                size="sm" 
                onClick={() => updateProfileMutation.mutate(formData)}
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
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">
            {profile?.full_name || "Administrator"}
          </h1>
          <Badge variant="danger">
            <Shield className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {profile?.email}
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
                  Phone
                </label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mv2-input"
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
                icon={Mail}
                title="Email"
                subtitle={profile?.email || "Not set"}
              />
              <ListItem
                icon={Phone}
                title="Phone"
                subtitle={profile?.phone || "Not set"}
              />
            </>
          )}
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
          <ListItem
            icon={Shield}
            title="Security"
            subtitle="Password and authentication"
            trailing={<ChevronRight className="w-5 h-5 text-muted-foreground" />}
          />
        </Card>
      </Section>

      {/* Admin Actions */}
      <Section title="Administration" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          <ListItem
            icon={Shield}
            title="App Settings"
            subtitle="Configure application settings"
            href="/admin/settings"
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
