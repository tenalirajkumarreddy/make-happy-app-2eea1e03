/**
 * StaffProfile - Detailed staff profile page
 * Shows all staff details, permissions, stock, activity
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Edit,
  Phone,
  Building2,
  Package,
  Wallet,
  Activity,
  Users,
  Shield,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  Lock,
} from "lucide-react";

import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/lib/permissions";

// Permission icons by group
const PERMISSION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Sales & Pricing": Activity,
  "Payments": Wallet,
  "Handovers": Activity,
  "Orders": Package,
  "Invoices": Wallet,
  "Customers & Stores": Users,
  "Vendors & Purchases": Building2,
  "Attendance": Users,
  "Other": Shield,
};
// PERMISSION_CATEGORIES removed — now using canonical PERMISSION_GROUPS from @/lib/permissions

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  agent: "Agent",
  marketer: "Marketer",
  operator: "Operator",
};

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  manager: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  agent: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  marketer: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  operator: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

export function StaffProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canManagePermissions = usePermission("manage_users" as any).allowed;
  const isAdmin = role === "super_admin";

  // Fetch staff details
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-profile", userId],
    queryFn: async () => {
      if (!userId) return null;

      // Get user role
      const { data: userRole, error: roleError } = await supabase
        .from("user_roles")
        .select("role, warehouse_id, warehouses:warehouse_id(name)")
        .eq("user_id", userId)
        .single();

      if (roleError) throw roleError;

      // Get profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileError) throw profileError;

      // Get cash account
      const { data: cashAccount, error: cashError } = await supabase
        .from("staff_cash_accounts")
        .select("cash_amount, upi_amount, total_amount, last_reset_at, reset_amount")
        .eq("user_id", userId)
        .maybeSingle();

      // Get stock holding
      const { data: stockData, error: stockError } = await supabase
        .from("staff_stock")
        .select(`
          quantity,
          product:products(id, name, base_price, image_url)
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      // Get permissions
      const { data: permissions, error: permError } = await supabase
        .from("user_permissions")
        .select("permission, enabled")
        .eq("user_id", userId);

      // Get recent activity
      const { data: recentActivity, error: activityError } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Get today's stats
      const today = new Date().toISOString().split("T")[0];
      const { data: todaySales } = await supabase
        .from("sales")
        .select("id, total_amount")
        .eq("recorded_by", userId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      const { data: todayTx } = await supabase
        .from("transactions")
        .select("id, total_amount")
        .eq("recorded_by", userId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      return {
        profile,
        role: userRole.role,
        warehouse: userRole.warehouses,
        cashAccount: cashAccount || { cash_amount: 0, upi_amount: 0, total_amount: 0 },
        stock: (stockData || []) as any[],
        permissions: (permissions || []) as any[],
        activity: (recentActivity || []) as any[],
        stats: {
          todaySales: todaySales?.length || 0,
          todaySalesAmount: (todaySales as any[])?.reduce((s: any, x: any) => s + (x.total_amount || 0), 0) || 0,
          todayCollections: todayTx?.length || 0,
          todayCollectionsAmount: (todayTx as any[])?.reduce((s: any, x: any) => s + (x.total_amount || 0), 0) || 0,
        },
      };
    },
    enabled: !!userId,
  });

const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});

// Initialize permissions from data
useEffect(() => {
  if (staff?.permissions) {
    const perms: Record<string, boolean> = {};
    staff.permissions.forEach((p: any) => {
      perms[p.permission] = p.enabled;
    });
    setUserPermissions(perms);
  }
}, [staff?.permissions]);

  const handleTogglePermission = async (permissionKey: string, enabled: boolean) => {
    if (!canManagePermissions || !userId) return;

    try {
      const { error } = await (supabase as any).from("user_permissions").upsert({
        user_id: userId,
        permission: permissionKey,
        enabled,
        granted_by: user?.id,
      });

      if (error) throw error;

      setUserPermissions((prev) => ({ ...prev, [permissionKey]: enabled }));
      toast.success("Permission updated");
      queryClient.invalidateQueries({ queryKey: ["staff-profile", userId] });
    } catch (error) {
      toast.error("Failed to update permission");
    }
  };

  const handleToggleActive = async () => {
    if (!staff || !isAdmin) return;

    try {
      const p = staff as any;
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !p.profile.is_active })
        .eq("user_id", userId!);

      if (error) throw error;

      toast.success(`Staff ${p.profile.is_active ? "deactivated" : "activated"}`);
      queryClient.invalidateQueries({ queryKey: ["staff-profile", userId] });
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[400px] col-span-2" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold">Staff not found</h3>
        <Button onClick={() => navigate("/staff")} className="mt-4">
          Back to Directory
        </Button>
      </div>
    );
  }

  const s = staff as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/staff")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{s.profile.full_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={roleColors[s.role] || "bg-slate-100"}>
              {roleLabels[s.role] || s.role}
            </Badge>
            {s.profile.is_active ? (
              <Badge variant="outline" className="text-green-600 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-200">
                <XCircle className="h-3 w-3 mr-1" />
                Inactive
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              variant={s.profile.is_active ? "destructive" : "default"}
              onClick={handleToggleActive}
            >
              {s.profile.is_active ? "Deactivate" : "Activate"}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(`/staff/${userId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Wallet className="h-4 w-4" />
              <span className="text-sm">Cash Holding</span>
            </div>
            <p className="text-2xl font-bold">
              ₹{((s.cashAccount.cash_amount || 0) + (s.cashAccount.upi_amount || 0)).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">
              ₹{s.cashAccount.cash_amount?.toLocaleString("en-IN") || 0} Cash
              {s.cashAccount.upi_amount > 0 &&
                ` • ₹${s.cashAccount.upi_amount.toLocaleString("en-IN")} UPI`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Package className="h-4 w-4" />
              <span className="text-sm">Stock Holding</span>
            </div>
            <p className="text-2xl font-bold">{s.stock.length}</p>
            <p className="text-xs text-muted-foreground">
              {(s.stock as any[]).reduce((s: any, i: any) => s + (i.quantity || 0), 0)} units total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Today's Sales</span>
            </div>
            <p className="text-2xl font-bold">{s.stats.todaySales}</p>
            <p className="text-xs text-muted-foreground">
              ₹{s.stats.todaySalesAmount.toLocaleString("en-IN")} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Wallet className="h-4 w-4" />
              <span className="text-sm">Today's Collections</span>
            </div>
            <p className="text-2xl font-bold">{s.stats.todayCollections}</p>
            <p className="text-xs text-muted-foreground">
              ₹{s.stats.todayCollectionsAmount.toLocaleString("en-IN")} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Info */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-4">
                  <AvatarImage src={s.profile.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                    {s.profile.full_name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-semibold">{s.profile.full_name}</h3>
                <p className="text-muted-foreground">{s.profile.email}</p>
                {s.warehouse && (
                  <Badge variant="outline" className="mt-2">
                    <Building2 className="h-3 w-3 mr-1" />
                    {s.warehouse.name}
                  </Badge>
                )}
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{s.profile.phone || "Not set"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Joined</p>
                    <p className="text-sm text-muted-foreground">
                      {s.profile.created_at
                        ? format(new Date(s.profile.created_at), "MMM d, yyyy")
                        : "Unknown"}
                    </p>
                  </div>
                </div>
                {s.cashAccount.last_reset_at && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Cash Reset</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(s.cashAccount.last_reset_at), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-green-600">
                        ₹{s.cashAccount.reset_amount?.toLocaleString("en-IN")} recorded
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stock Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Stock Holding
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {s.stock.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No stock assigned
                </p>
              ) : (
                <div className="space-y-3">
                  {s.stock.slice(0, 5).map((item: any) => (
                    <div key={item.product?.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {item.product?.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center">
                            <Package className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{item.product?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} units
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-medium">
                        ₹{((item.product?.base_price || 0) * item.quantity).toLocaleString("en-IN")}
                      </p>
                    </div>
                  ))}
                  {s.stock.length > 5 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(`/staff/${userId}/stock`)}>
                      View all {s.stock.length} items
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="permissions">
            <TabsList className="w-full">
              <TabsTrigger value="permissions" className="flex-1">
                <Shield className="h-4 w-4 mr-2" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1">
                <Activity className="h-4 w-4 mr-2" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Permissions Tab */}
            <TabsContent value="permissions" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Permission Settings
                    </CardTitle>
                    {!canManagePermissions && (
                      <Badge variant="outline" className="text-amber-600">
                        <Lock className="h-3 w-3 mr-1" />
                        View Only
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(PERMISSION_GROUPS).map(([groupName, keys]) => {
                      const Icon = PERMISSION_ICONS[groupName] || Shield;
                      return (
                        <Card key={groupName} className="border">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Icon className="h-4 w-4 text-primary" />
                              {groupName}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              {keys.map((permKey) => {
                                const enabled = userPermissions[permKey] ?? false;
                                return (
                                  <div
                                    key={permKey}
                                    className="flex items-center justify-between py-1.5"
                                  >
                                    <span className="text-sm">{PERMISSION_LABELS[permKey] || permKey}</span>
                                    <Switch
                                      checked={enabled}
                                      disabled={!canManagePermissions}
                                      onCheckedChange={(checked) =>
                                        handleTogglePermission(permKey, checked)
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  {s.activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No recent activity
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {s.activity.map((log: any) => (
                        <div key={log.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <div className="w-px h-full bg-border" />
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{log.action}</p>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {log.details}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default StaffProfile;
