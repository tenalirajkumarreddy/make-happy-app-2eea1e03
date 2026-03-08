import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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

  const { allPermissions, isLoading: permsLoading, saving: permSaving, getPermissionsForUser, handleToggle } = useUserPermissions();

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
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: inviteEmail,
      password: Math.random().toString(36).slice(-12) + "A1!",
      options: { data: { full_name: inviteName } },
    });
    if (signUpError) { toast.error(signUpError.message); setSavingInvite(false); return; }
    if (signUpData.user) {
      const { error: roleError } = await supabase.from("user_roles")
        .update({ role: inviteRole as any })
        .eq("user_id", signUpData.user.id);
      if (roleError) toast.error("Account created but role assignment failed: " + roleError.message);
    }
    toast.success(`Staff account created for ${inviteName}.`);
    setSavingInvite(false);
    setShowInvite(false);
    setInviteEmail(""); setInviteName(""); setInviteRole("agent");
    qc.invalidateQueries({ queryKey: ["all-users"] });
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: !currentlyActive }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success(`User ${currentlyActive ? "disabled" : "enabled"}`); qc.invalidateQueries({ queryKey: ["all-users"] }); }
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
                                onClick={() => handleToggleActive(row.user_id, row.is_active)}
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
              const userRole = (row.user_roles as any)?.[0]?.role || "—";
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
                      <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
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
                        <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
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
                    <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
                      {row.is_active ? "Disable" : "Enable"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
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
            <p className="text-xs text-muted-foreground">A temporary password will be generated. The user should reset it on first login.</p>
            <Button type="submit" className="w-full" disabled={savingInvite}>
              {savingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Staff Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccessControl;
