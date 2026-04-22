import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, UserPlus, MapPin } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  InlinePermissionCheckbox,
  useUserPermissions,
  PERMISSION_KEYS,
  ROLE_DEFAULTS,
  type PermissionKey,
} from "@/components/access/UserPermissionsPanel";
import { Fragment } from "react";

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "pos", label: "POS" },
];

const PERM_HEADERS: { key: PermissionKey; label: string }[] = [
  { key: "price_override", label: "Price Override" },
  { key: "record_behalf", label: "Record On Behalf" },
  { key: "create_customers", label: "Create Customers" },
  { key: "create_stores", label: "Create Stores" },
  { key: "edit_balance", label: "Edit Balance" },
  { key: "opening_balance", label: "Opening Balance" },
  { key: "finalizer", label: "Finalizer" },
  { key: "see_handover_balance", label: "See Balances" },
  { key: "submit_expenses", label: "Submit Expenses" },
  { key: "view_vendors", label: "View Vendors" },
  { key: "manage_vendors", label: "Manage Vendors" },
  { key: "view_purchases", label: "View Purchases" },
  { key: "manage_purchases", label: "Manage Purchases" },
  { key: "view_vendor_payments", label: "View Payments" },
  { key: "manage_vendor_payments", label: "Manage Payments" },
  { key: "view_raw_materials", label: "View Raw Materials" },
  { key: "manage_raw_materials", label: "Manage Raw Materials" },
];

const AccessControl = () => {
  const { role: currentRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = currentRole === "super_admin";
  const [showInvite, setShowInvite] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [confirmBan, setConfirmBan] = useState<{ userId: string; name: string } | null>(null);

  const { allPermissions, isLoading: permsLoading, saving: permSaving, getPermissionsForUser, handleToggle } = useUserPermissions();

  const { data: agentRoutes, refetch: refetchAgentRoutes } = useQuery({
    queryKey: ["agent-routes"],
    queryFn: async () => {
      const { data } = await supabase.from("agent_routes").select("user_id, route_id, enabled");
      return data || [];
    },
  });

  const { data: routesWithTypes } = useQuery({
    queryKey: ["routes-for-access"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name, store_type_id, store_types(name)").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const isRouteEnabled = (userId: string, routeId: string) =>
    (agentRoutes || []).some((r) => r.user_id === userId && r.route_id === routeId && r.enabled);

  const handleRouteToggle = async (userId: string, routeId: string) => {
    const current = isRouteEnabled(userId, routeId);
    const { error } = await supabase.from("agent_routes").upsert(
      { user_id: userId, route_id: routeId, enabled: !current },
      { onConflict: "user_id,route_id" }
    );
    if (error) toast.error(error.message);
    else refetchAgentRoutes();
  };

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);
      return (profiles || []).map((p) => ({
        ...p,
        _role: roleMap.get(p.user_id) || "customer",
      }));
    },
  });

  const staffUsers = users?.filter((u) => {
    const role = u._role;
    return role && role !== "customer";
  }) || [];

  const customerUsers = users?.filter((u) => {
    return u._role === "customer";
  }) || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInvite(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", {
      body: { email: inviteEmail, full_name: inviteName, role: inviteRole },
    });
    setSavingInvite(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to invite staff");
      return;
    }
    toast.success(`Staff account created for ${inviteName}. A password reset email will be sent.`);
    setShowInvite(false);
    setInviteEmail(""); setInviteName(""); setInviteRole("agent");
    qc.invalidateQueries({ queryKey: ["all-users"] });
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    const newActive = !currentlyActive;
    // Update profile
    const { error } = await supabase.from("profiles").update({ is_active: newActive }).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }

    // Ban/unban via edge function
    const { error: banError } = await supabase.functions.invoke("toggle-user-ban", {
      body: { user_id: userId, ban: !newActive },
    });
    if (banError) {
      toast.error("Profile updated but auth ban failed: " + banError.message);
    } else {
      toast.success(`User ${currentlyActive ? "disabled" : "enabled"}`);
    }
    qc.invalidateQueries({ queryKey: ["all-users"] });
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["all-users"] }); }
  };

  if (isLoading || permsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Access Control"
        subtitle="Manage users, roles, and permissions"
        primaryAction={isAdmin ? { label: "Invite Staff", icon: UserPlus, onClick: () => setShowInvite(true) } : undefined}
      />

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff ({staffUsers.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customerUsers.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="routes"><MapPin className="h-3.5 w-3.5 mr-1" />Route Access</TabsTrigger>}
        </TabsList>

        {/* ── Staff Tab ── */}
        <TabsContent value="staff" className="mt-4">
          {/* Desktop: scrollable table with inline permissions */}
          <ScrollArea className="w-full hidden md:block">
            <div className="rounded-xl border bg-card min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="min-w-[160px]">Staff Member</TableHead>
                    <TableHead className="min-w-[120px]">Role</TableHead>
                    <TableHead className="min-w-[80px]">Status</TableHead>
                    {PERM_HEADERS.map((p) => (
                      <TableHead key={p.key} className="text-center min-w-[90px] text-xs">{p.label}</TableHead>
                    ))}
                    {isAdmin && <TableHead className="min-w-[80px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map((row) => {
                    const userRole = row._role || "—";
                    const userPerms = getPermissionsForUser(row.user_id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{row.full_name}</p>
                            <p className="text-xs text-muted-foreground">{row.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isAdmin && userRole !== "super_admin" ? (
                            <Select value={userRole} onValueChange={(v) => handleChangeRole(row.user_id, v)}>
                              <SelectTrigger className="h-8 w-28 text-xs font-medium uppercase">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STAFF_ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="default" className="uppercase text-[10px]">{userRole.replace("_", " ")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.is_active ? "active" : "inactive"} />
                        </TableCell>
                        {PERM_HEADERS.map((p) => (
                          <TableCell key={p.key}>
                            <InlinePermissionCheckbox
                              userId={row.user_id}
                              userRole={userRole}
                              permissionKey={p.key}
                              permissions={userPerms}
                              onToggle={handleToggle}
                              saving={permSaving}
                            />
                          </TableCell>
                        ))}
                        {isAdmin && (
                          <TableCell>
                            {userRole !== "super_admin" && (
                              <Button
                                variant={row.is_active ? "destructive" : "default"}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => row.is_active ? setConfirmBan({ userId: row.user_id, name: row.full_name }) : handleToggleActive(row.user_id, row.is_active)}
                              >
                                {row.is_active ? "Disable" : "Enable"}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Mobile: card view */}
          <div className="md:hidden space-y-3">
            {staffUsers.map((row) => {
              const userRole = row._role || "—";
              const userPerms = getPermissionsForUser(row.user_id);
              const isSA = userRole === "super_admin";
              return (
                <div key={row.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate">{row.full_name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                    </div>
                    <StatusBadge status={row.is_active ? "active" : "inactive"} />
                  </div>
                  <div className="flex items-center justify-between">
                    {isAdmin && !isSA ? (
                      <Select value={userRole} onValueChange={(v) => handleChangeRole(row.user_id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs uppercase font-medium"><SelectValue /></SelectTrigger>
                        <SelectContent>{STAFF_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="default" className="uppercase text-[10px]">{userRole.replace("_", " ")}</Badge>
                    )}
                    {isAdmin && !isSA && (
                      <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => row.is_active ? setConfirmBan({ userId: row.user_id, name: row.full_name }) : handleToggleActive(row.user_id, row.is_active)}>
                        {row.is_active ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </div>
                  {/* Permissions grid */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    {PERM_HEADERS.map((p) => {
                      const dbPerm = userPerms.find((up: any) => up.permission === p.key);
                      const isDefault = ROLE_DEFAULTS[userRole]?.includes(p.key) ?? false;
                      const isEnabled = dbPerm ? dbPerm.enabled : isDefault;
                      const isSaving = permSaving === `${row.user_id}-${p.key}`;
                      return (
                        <label key={p.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Checkbox
                              checked={isEnabled}
                              onCheckedChange={() => handleToggle(row.user_id, p.key, isEnabled)}
                              disabled={isSA}
                              className="h-3.5 w-3.5"
                            />
                          )}
                          <span className="truncate">{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Customers Tab ── */}
        <TabsContent value="customers" className="mt-4">
          <div className="rounded-xl border bg-card hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No customer accounts</TableCell></TableRow>
                ) : customerUsers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.email || "—"}</TableCell>
                    <TableCell><StatusBadge status={row.is_active ? "active" : "inactive"} /></TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => row.is_active ? setConfirmBan({ userId: row.user_id, name: row.full_name }) : handleToggleActive(row.user_id, row.is_active)}>
                          {row.is_active ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {customerUsers.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">No customer accounts</div>
            ) : customerUsers.map((row) => (
              <div key={row.id} className="rounded-xl border bg-card p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{row.full_name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                  {isAdmin && (
                    <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => row.is_active ? setConfirmBan({ userId: row.user_id, name: row.full_name }) : handleToggleActive(row.user_id, row.is_active)}>
                      {row.is_active ? "Disable" : "Enable"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Route Access Tab ── */}
        {isAdmin && (
          <TabsContent value="routes" className="mt-4">
            {(() => {
              const agents = staffUsers.filter((u) => u._role === "agent" || u._role === "marketer");
              if (!routesWithTypes || routesWithTypes.length === 0) {
                return <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">No routes created yet. Create routes first.</div>;
              }
              if (agents.length === 0) {
                return <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">No agents or marketers found.</div>;
              }

              // Group routes by store type
              const byType: Record<string, { typeName: string; routes: typeof routesWithTypes }> = {};
              routesWithTypes.forEach((r: any) => {
                const tid = r.store_type_id;
                if (!byType[tid]) byType[tid] = { typeName: r.store_types?.name || "Other", routes: [] };
                byType[tid].routes.push(r);
              });

              return (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Check a box to grant an agent access to that route. Changes take effect immediately.</p>
                  <ScrollArea className="w-full">
                    <div className="rounded-xl border bg-card min-w-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="min-w-[180px]">Route</TableHead>
                            {agents.map((a) => (
                              <TableHead key={a.user_id} className="text-center min-w-[100px] text-xs">
                                <div className="font-medium truncate max-w-[96px]">{a.full_name}</div>
                                <div className="text-[10px] font-normal text-muted-foreground uppercase">{a._role}</div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(byType).map(([tid, group]) => (
                            <Fragment key={tid}>
                              <TableRow key={`type-${tid}`} className="bg-accent/30 hover:bg-accent/30">
                                <TableCell colSpan={agents.length + 1} className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-1.5 pl-4">
                                  {group.typeName}
                                </TableCell>
                              </TableRow>
                              {group.routes.map((route: any) => (
                                <TableRow key={route.id}>
                                  <TableCell className="font-medium text-sm pl-6">
                                    <div className="flex items-center gap-2">
                                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                      {route.name}
                                    </div>
                                  </TableCell>
                                  {agents.map((agent) => (
                                    <TableCell key={agent.user_id} className="text-center">
                                      <Checkbox
                                        checked={isRouteEnabled(agent.user_id, route.id)}
                                        onCheckedChange={() => handleRouteToggle(agent.user_id, route.id)}
                                        className="h-4 w-4"
                                      />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              );
            })()}
          </TabsContent>
        )}
      </Tabs>

      {/* Invite Staff Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Staff Member</DialogTitle></DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div><Label>Full Name</Label><Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required className="mt-1" /></div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{STAFF_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">The staff member will receive a password reset email to set their own password.</p>
            <Button type="submit" className="w-full" disabled={savingInvite}>
              {savingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Staff Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmBan} onOpenChange={(v) => { if (!v) setConfirmBan(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user account?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmBan?.name}</strong> will be immediately signed out and unable to access the app until re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmBan(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (confirmBan) { handleToggleActive(confirmBan.userId, true); setConfirmBan(null); } }}>Disable</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccessControl;
