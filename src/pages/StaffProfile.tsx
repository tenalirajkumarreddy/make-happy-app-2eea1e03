import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Loader2, User, Shield, MapPin, Store, Activity,
  IndianRupee, Phone, Mail, Calendar, Clock, Edit2, UserCog,
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  PERMISSION_KEYS,
  ROLE_DEFAULTS,
  type PermissionKey,
} from "@/components/access/UserPermissionsPanel";

const STAFF_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "pos", label: "POS" },
];

const PERM_META: { key: PermissionKey; label: string; description: string }[] = [
  { key: "price_override", label: "Price Override", description: "Can override product prices during sales" },
  { key: "record_behalf", label: "Record On Behalf", description: "Can record sales on behalf of other staff" },
  { key: "create_customers", label: "Create Customers", description: "Can create new customer accounts" },
  { key: "create_stores", label: "Create Stores", description: "Can create new store locations" },
  { key: "edit_balance", label: "Edit Balance", description: "Can manually edit customer balances" },
  { key: "opening_balance", label: "Opening Balance", description: "Can set opening balances for customers" },
  { key: "finalizer", label: "Finalizer", description: "Can finalize handover sessions" },
  { key: "see_handover_balance", label: "See Balances", description: "Can view handover balance summary" },
  { key: "submit_expenses", label: "Submit Expenses", description: "Can submit expense claims" },
  { key: "view_vendors", label: "View Vendors", description: "Can view vendor directory" },
  { key: "manage_vendors", label: "Manage Vendors", description: "Can add/edit vendor records" },
  { key: "view_purchases", label: "View Purchases", description: "Can view purchase orders" },
  { key: "manage_purchases", label: "Manage Purchases", description: "Can create/edit purchase orders" },
  { key: "view_vendor_payments", label: "View Payments", description: "Can view vendor payments" },
  { key: "manage_vendor_payments", label: "Manage Payments", description: "Can record vendor payments" },
  { key: "view_raw_materials", label: "View Raw Materials", description: "Can view raw material inventory" },
  { key: "manage_raw_materials", label: "Manage Raw Materials", description: "Can manage raw material stock" },
  { key: "view_attendance", label: "View Attendance", description: "Can view attendance records" },
  { key: "manage_attendance", label: "Manage Attendance", description: "Can manage attendance records" },
];

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  manager: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  agent: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  marketer: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  pos: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

export default function StaffProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { role: currentRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = currentRole === "super_admin";

  const [confirmBan, setConfirmBan] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // ─── Load staff profile ─────────────────────────────────────────
  const { data: staffUser, isLoading: profileLoading } = useQuery({
    queryKey: ["staff-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (error) throw error;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      return {
        ...(profile as any),
        _role: (roleData as any)?.role || "customer",
      };
    },
    enabled: !!userId,
  });

  // ─── Routes for access matrix ──────────────────────────────────
  const { data: routes } = useQuery({
    queryKey: ["routes-for-staff-profile"],
    queryFn: async (): Promise<Array<{ id: string; name: string; store_type_id: string; store_types: { name: string } | null }>> => {
      const { data } = await (supabase as any)
        .from("routes")
        .select("id, name, store_type_id, store_types(name)")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: routeAccess, refetch: refetchRouteAccess } = useQuery({
    queryKey: ["route-access-staff-profile", userId],
    queryFn: async (): Promise<Array<{ route_id: string; enabled: boolean }>> => {
      if (!userId) return [];
      const { data } = await (supabase as any)
        .from("agent_routes")
        .select("route_id, enabled")
        .eq("user_id", userId);
      return data || [];
    },
    enabled: !!userId,
  });

  // ─── Store types for access matrix ─────────────────────────────
  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-for-staff-profile"],
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data } = await (supabase as any)
        .from("store_types")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: storeTypeAccess, refetch: refetchStoreTypeAccess } = useQuery({
    queryKey: ["store-type-access-staff-profile", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await (supabase as any)
        .from("agent_store_types")
        .select("store_type_id, enabled")
        .eq("user_id", userId);
      return (data || []) as Array<{ store_type_id: string; enabled: boolean }>;
    },
    enabled: !!userId,
  });

  // ─── Permissions ───────────────────────────────────────────────
  const { data: userPerms, refetch: refetchPerms } = useQuery({
    queryKey: ["staff-profile-permissions", userId],
    queryFn: async (): Promise<Array<{ permission: string; enabled: boolean }>> => {
      if (!userId) return [];
      const { data } = await (supabase as any)
        .from("user_permissions")
        .select("*")
        .eq("user_id", userId);
      return data || [];
    },
    enabled: !!userId,
  });

  // ─── Activity log ──────────────────────────────────────────────
  const { data: activityLogs } = useQuery({
    queryKey: ["staff-profile-activity", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!userId,
  });

  // ─── Financial summary ────────────────────────────────────────
  const { data: financials } = useQuery({
    queryKey: ["staff-profile-financials", userId],
    queryFn: async () => {
      if (!userId) return { sales: 0, salesAmount: 0, collections: 0, collectionsAmount: 0 };

      const { data: salesData } = await supabase
        .from("sales")
        .select("id, total_amount")
        .eq("created_by", userId) as { data: any[] | null };

      const { data: txnData } = await supabase
        .from("transactions")
        .select("id, amount")
        .eq("created_by", userId) as { data: any[] | null };

      const salesCount = salesData?.length || 0;
      const salesAmount = salesData?.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0) || 0;
      const collectionsCount = txnData?.length || 0;
      const collectionsAmount = txnData?.reduce((sum: number, t: any) => sum + (t.amount || 0), 0) || 0;

      return { sales: salesCount, salesAmount, collections: collectionsCount, collectionsAmount };
    },
    enabled: !!userId,
  });

  // ─── Handlers ──────────────────────────────────────────────────

  const handleRoleChange = async (newRole: string) => {
    if (!userId) return;
    setSaving("role");
    const { error } = await (supabase as any)
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", userId);
    setSaving(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["staff-profile", userId] });
      qc.invalidateQueries({ queryKey: ["all-users"] });
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
    }
  };

  const handleToggleActive = async () => {
    if (!userId || !staffUser) return;
    const newActive = !staffUser.is_active;
    setSaving("active");
    const { error } = await (supabase as any).from("profiles").update({ is_active: newActive }).eq("user_id", userId);
    if (error) { toast.error(error.message); setSaving(null); return; }
    const { error: banError } = await supabase.functions.invoke("toggle-user-ban", {
      body: { user_id: userId, ban: !newActive },
    });
    setSaving(null);
    if (banError) toast.error("Profile updated but auth ban failed");
    else toast.success(`User ${newActive ? "enabled" : "disabled"}`);
    qc.invalidateQueries({ queryKey: ["staff-profile", userId] });
    qc.invalidateQueries({ queryKey: ["all-users"] });
    setConfirmBan(false);
  };

  const handleRouteToggle = async (routeId: string) => {
    if (!userId) return;
    const current = (routeAccess as any[] || []).find((r: any) => r.route_id === routeId);
    const currentlyEnabled = current?.enabled ?? false;
    setSaving(`route-${routeId}`);
    const { error } = await (supabase as any).from("agent_routes").upsert(
      { user_id: userId, route_id: routeId, enabled: !currentlyEnabled },
      { onConflict: "user_id,route_id" }
    );
    setSaving(null);
    if (error) toast.error(error.message);
    else {
      refetchRouteAccess();
      qc.invalidateQueries({ queryKey: ["route-access-matrix"] });
    }
  };

  const handleStoreTypeToggle = useCallback(async (storeTypeId: string) => {
    if (!userId) return;
    const hasAnyRows = (storeTypeAccess || []).length > 0;
    const current = (storeTypeAccess || []).find((r) => r.store_type_id === storeTypeId);
    const currentlyEnabled = hasAnyRows ? (current?.enabled ?? false) : true; // permissive default

    setSaving(`stype-${storeTypeId}`);

    if (!hasAnyRows) {
      // First toggle: seed all store types as enabled, then disable the toggled one
      const rows = ((storeTypes || []) as Array<{ id: string; name: string }>).map((st) => ({
        user_id: userId,
        store_type_id: st.id,
        enabled: st.id !== storeTypeId,
      }));
      const { error } = await (supabase as any)
        .from("agent_store_types")
        .upsert(rows, { onConflict: "user_id,store_type_id" });
      if (error) toast.error(error.message);
    } else {
      const { error } = await (supabase as any)
        .from("agent_store_types")
        .upsert(
          { user_id: userId, store_type_id: storeTypeId, enabled: !currentlyEnabled },
          { onConflict: "user_id,store_type_id" }
        );
      if (error) toast.error(error.message);
    }
    setSaving(null);
    refetchStoreTypeAccess();
    qc.invalidateQueries({ queryKey: ["store-type-access-matrix"] });
  }, [userId, storeTypeAccess, storeTypes, qc, refetchStoreTypeAccess]);

  const handlePermToggle = async (key: PermissionKey, currentEnabled: boolean) => {
    if (!userId) return;
    setSaving(`perm-${key}`);
    const { error } = await (supabase as any).from("user_permissions").upsert(
      { user_id: userId, permission: key, enabled: !currentEnabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id,permission" }
    );
    setSaving(null);
    if (error) toast.error(error.message);
    else refetchPerms();
  };

  // ─── Derived state ─────────────────────────────────────────────

  const isRouteEnabled = (routeId: string) =>
    (routeAccess as any[] || []).some((r: any) => r.route_id === routeId && r.enabled);

  const isStoreTypeEnabled = (storeTypeId: string) => {
    const hasRows = (storeTypeAccess || []).length > 0;
    if (!hasRows) return true; // permissive default
    return (storeTypeAccess || []).some((r) => r.store_type_id === storeTypeId && r.enabled);
  };

  const getPermEnabled = (key: PermissionKey) => {
    const dbPerm = (userPerms as any[] || []).find((p: any) => p.permission === key);
    const isDefault = ROLE_DEFAULTS[staffUser?._role || ""]?.includes(key) ?? false;
    return dbPerm ? dbPerm.enabled : isDefault;
  };

  const userRole = staffUser?._role || "customer";
  const isSA = userRole === "super_admin";
  const roleName = STAFF_ROLES.find((r) => r.value === userRole)?.label || userRole;

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!staffUser) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          Staff member not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate("/admin/staff")}>
        <ArrowLeft className="h-4 w-4" /> Staff Directory
      </Button>

      {/* ── Profile Header ────────────────────────────────────── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <div className="px-6 pb-6 -mt-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            {/* Avatar circle */}
            <div className="h-16 w-16 rounded-full bg-primary/10 border-4 border-background flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">{staffUser.full_name || "—"}</h1>
                <StatusBadge status={staffUser.is_active ? "active" : "inactive"} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {staffUser.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{staffUser.email}</span>
                )}
                {(staffUser as any).phone && (
                  <span className="flex items-center gap-1 font-mono"><Phone className="h-3.5 w-3.5" />{(staffUser as any).phone}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase border ${ROLE_BADGE[userRole] || ""}`}>
                <UserCog className="h-3 w-3" />
                {roleName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-xl font-bold">{financials?.sales || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(financials?.salesAmount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Collections</p>
            <p className="text-xl font-bold">{financials?.collections || 0}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(financials?.collectionsAmount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Routes</p>
            <p className="text-xl font-bold">{(routeAccess as any[] || []).filter((r: any) => r.enabled).length || "All"}</p>
            <p className="text-xs text-muted-foreground">of {routes?.length || 0} total</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Store Types</p>
            <p className="text-xl font-bold">
              {(storeTypeAccess || []).length === 0
                ? "All"
                : (storeTypeAccess || []).filter((r) => r.enabled).length}
            </p>
            <p className="text-xs text-muted-foreground">of {storeTypes?.length || 0} total</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="details" className="gap-1.5"><User className="h-3.5 w-3.5" />Details</TabsTrigger>
          <TabsTrigger value="routes" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Routes</TabsTrigger>
          <TabsTrigger value="store-types" className="gap-1.5"><Store className="h-3.5 w-3.5" />Store Types</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Permissions</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity</TabsTrigger>
          <TabsTrigger value="financials" className="gap-1.5"><IndianRupee className="h-3.5 w-3.5" />Financials</TabsTrigger>
        </TabsList>

        {/* ─── Details Tab ──────────────────────────────────── */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Full Name", value: staffUser.full_name || "—" },
                  { label: "Email", value: staffUser.email || "—" },
                  { label: "User ID", value: userId?.slice(0, 12) + "..." },
                  { label: "Joined", value: formatDate(staffUser.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Role & Status</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Role</label>
                  {isAdmin && !isSA ? (
                    <Select value={userRole} onValueChange={handleRoleChange} disabled={saving === "role"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.filter((r) => r.value !== "super_admin").map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="default" className="uppercase">{roleName}</Badge>
                  )}
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Status</label>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={staffUser.is_active ? "active" : "inactive"} />
                    {isAdmin && !isSA && (
                      <Button
                        variant={staffUser.is_active ? "destructive" : "default"}
                        size="sm"
                        className="h-7 text-xs"
                        disabled={saving === "active"}
                        onClick={() => staffUser.is_active ? setConfirmBan(true) : handleToggleActive()}
                      >
                        {saving === "active" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {staffUser.is_active ? "Disable Account" : "Enable Account"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Route Access Tab ─────────────────────────────── */}
        <TabsContent value="routes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Route Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Toggle routes this staff member can access. No toggles = unrestricted access to all routes.
              </p>
            </CardHeader>
            <CardContent>
              {!routes || routes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No routes created yet.</p>
              ) : (
                <div className="space-y-1">
                  {routes.map((route: any) => {
                    const enabled = isRouteEnabled(route.id);
                    const isBusy = saving === `route-${route.id}`;
                    return (
                      <label
                        key={route.id}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={() => handleRouteToggle(route.id)}
                            disabled={!isAdmin}
                            className="h-4 w-4"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{route.name}</p>
                          <p className="text-xs text-muted-foreground">{(route as any).store_types?.name || "—"}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{enabled ? "Granted" : "Denied"}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Store Type Access Tab ────────────────────────── */}
        <TabsContent value="store-types">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" />Store Type Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Toggle which store types this staff member can interact with. No toggles = unrestricted.
              </p>
            </CardHeader>
            <CardContent>
              {!storeTypes || storeTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No store types created yet.</p>
              ) : (
                <div className="space-y-1">
                  {((storeTypes || []) as Array<{ id: string; name: string }>).map((st) => {
                    const enabled = isStoreTypeEnabled(st.id);
                    const isBusy = saving === `stype-${st.id}`;
                    return (
                      <label
                        key={st.id}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={() => handleStoreTypeToggle(st.id)}
                            disabled={!isAdmin}
                            className="h-4 w-4"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{st.name}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{enabled ? "Granted" : "Denied"}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Permissions Tab ──────────────────────────────── */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Permissions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Fine-grained controls for this staff member. Some permissions are role defaults (shown pre-checked).
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {PERM_META.map(({ key, label, description }) => {
                  const enabled = getPermEnabled(key);
                  const isBusy = saving === `perm-${key}`;
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Checkbox
                          checked={enabled}
                          onCheckedChange={() => handlePermToggle(key, enabled)}
                          disabled={isSA || !isAdmin}
                          className="h-4 w-4"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <Badge variant={enabled ? "default" : "secondary"} className="text-[10px]">
                        {enabled ? "ON" : "OFF"}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Activity Tab ─────────────────────────────────── */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {!activityLogs || activityLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity recorded.</p>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{log.action || log.event_type || "Activity"}</p>
                        <p className="text-xs text-muted-foreground truncate">{log.details || log.description || log.metadata || ""}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(log.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Financials Tab ────────────────────────────────── */}
        <TabsContent value="financials">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Sales Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Sales Made</span>
                  <span className="font-bold text-lg">{financials?.sales || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Sales Amount</span>
                  <span className="font-bold text-lg text-blue-600">{formatCurrency(financials?.salesAmount || 0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Collections Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Collections</span>
                  <span className="font-bold text-lg">{financials?.collections || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Collected</span>
                  <span className="font-bold text-lg text-emerald-600">{formatCurrency(financials?.collectionsAmount || 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Disable Confirmation */}
      <AlertDialog open={confirmBan} onOpenChange={setConfirmBan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user account?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{staffUser.full_name}</strong> will be immediately signed out and unable to access the app until re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleToggleActive}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
