import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Shield, UserPlus, Settings2 } from "lucide-react";
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
import { toast } from "sonner";
import { UserPermissionsPanel } from "@/components/access/UserPermissionsPanel";

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "pos", label: "POS" },
];

const AccessControl = () => {
  const { role: currentRole } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [permUser, setPermUser] = useState<any>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const staffUsers = users?.filter((u) => {
    const role = (u.user_roles as any)?.[0]?.role;
    return role && role !== "customer";
  }) || [];

  const customerUsers = users?.filter((u) => {
    const role = (u.user_roles as any)?.[0]?.role;
    return role === "customer";
  }) || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: inviteEmail,
      password: Math.random().toString(36).slice(-12) + "A1!",
      options: { data: { full_name: inviteName } },
    });

    if (signUpError) { toast.error(signUpError.message); setSaving(false); return; }

    if (signUpData.user) {
      const { error: roleError } = await supabase.from("user_roles")
        .update({ role: inviteRole as any })
        .eq("user_id", signUpData.user.id);
      if (roleError) toast.error("Account created but role assignment failed: " + roleError.message);
    }

    toast.success(`Staff account created for ${inviteName}. They should reset their password via login.`);
    setSaving(false);
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

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "default";
      case "manager": return "secondary";
      default: return "outline";
    }
  };

  const staffColumns = [
    { header: "Name", accessor: "full_name" as const, className: "font-medium" },
    { header: "Email", accessor: (row: any) => row.email || "—", className: "text-muted-foreground text-sm", hideOnMobile: true },
    { header: "Role", accessor: (row: any) => {
      const role = (row.user_roles as any)?.[0]?.role || "—";
      return <Badge variant={getRoleBadgeVariant(role) as any}>{role.replace("_", " ")}</Badge>;
    }},
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    { header: "Actions", accessor: (row: any) => {
      const userRole = (row.user_roles as any)?.[0]?.role;
      if (userRole === "super_admin" || currentRole !== "super_admin") return null;
      return (
        <div className="flex gap-1.5 flex-wrap">
          <Select value={userRole} onValueChange={(v) => handleChangeRole(row.user_id, v)}>
            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STAFF_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setPermUser(row)}>
            <Settings2 className="h-3 w-3 mr-1" /> Permissions
          </Button>
          <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
            {row.is_active ? "Disable" : "Enable"}
          </Button>
        </div>
      );
    }},
  ];

  const customerColumns = [
    { header: "Name", accessor: "full_name" as const, className: "font-medium" },
    { header: "Email", accessor: (row: any) => row.email || "—", className: "text-muted-foreground text-sm", hideOnMobile: true },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    { header: "Actions", accessor: (row: any) => currentRole === "super_admin" ? (
      <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
        {row.is_active ? "Disable" : "Enable"}
      </Button>
    ) : null},
  ];

  const renderStaffMobileCard = (row: any) => {
    const userRole = (row.user_roles as any)?.[0]?.role || "—";
    const isSuperAdmin = userRole === "super_admin";
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{row.full_name}</h3>
            <p className="text-xs text-muted-foreground truncate">{row.email}</p>
          </div>
          <StatusBadge status={row.is_active ? "active" : "inactive"} />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant={getRoleBadgeVariant(userRole) as any}>{userRole.replace("_", " ")}</Badge>
          {!isSuperAdmin && currentRole === "super_admin" && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setPermUser(row)}>
                <Settings2 className="h-3 w-3" />
              </Button>
              <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
                {row.is_active ? "Disable" : "Enable"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCustomerMobileCard = (row: any) => (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{row.full_name}</h3>
          <p className="text-xs text-muted-foreground truncate">{row.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={row.is_active ? "active" : "inactive"} />
          {currentRole === "super_admin" && (
            <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => handleToggleActive(row.user_id, row.is_active)}>
              {row.is_active ? "Disable" : "Enable"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Access Control"
        subtitle="Manage user roles, permissions, and access"
        primaryAction={{ label: "Invite Staff", onClick: () => setShowInvite(true) }}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Staff</p>
          <p className="text-xl font-bold">{staffUsers.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Customers</p>
          <p className="text-xl font-bold">{customerUsers.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-xl font-bold">{users?.filter((u) => u.is_active).length || 0}</p>
        </div>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff ({staffUsers.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customerUsers.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="staff" className="mt-4">
          <DataTable columns={staffColumns} data={staffUsers} searchKey="full_name" searchPlaceholder="Search staff..." renderMobileCard={renderStaffMobileCard} />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <DataTable columns={customerColumns} data={customerUsers} searchKey="full_name" searchPlaceholder="Search customers..." renderMobileCard={renderCustomerMobileCard} />
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
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Staff Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permUser} onOpenChange={(open) => !open && setPermUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Permissions</DialogTitle></DialogHeader>
          {permUser && (
            <UserPermissionsPanel
              userId={permUser.user_id}
              userName={permUser.full_name}
              userRole={(permUser.user_roles as any)?.[0]?.role || ""}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccessControl;
