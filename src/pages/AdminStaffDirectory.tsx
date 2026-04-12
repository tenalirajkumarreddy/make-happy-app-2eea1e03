import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, UserPlus, Trash2, Edit2, Phone, Mail, UserCheck, Clock } from "lucide-react";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NoticeBox } from "@/components/shared/NoticeBox";
import { toast } from "sonner";

const STAFF_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "pos", label: "POS" },
];

interface StaffMember {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export function AdminStaffDirectory() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin";

  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  
  // Invitation states
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteNotes, setInviteNotes] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);

  // Edit form states
  const [formRole, setFormRole] = useState("agent");
  const [formActive, setFormActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_directory" as any)
        .select("*")
        .not("user_id", "is", null) // Only show staff who have joined (have user_id)
        .order("full_name");
      if (error) throw error;
      return (data || []) as unknown as StaffMember[];
    },
  });
  
  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ["staff-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invitations")
        .select("*")
        .eq("status", "pending") // Only show pending invitations
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const resetInviteForm = () => {
    setInvitePhone("");
    setInviteEmail("");
    setInviteName("");
    setInviteRole("agent");
    setInviteNotes("");
  };

  const handleEditClick = (s: StaffMember) => {
    setFormRole(s.role);
    setFormActive(s.is_active);
    setEditingStaff(s);
  };

  const handleSave = async () => {
    if (!editingStaff) return;

    setFormSaving(true);
    try {
      // Update existing staff directory entry (role and active status only)
      const { error } = await supabase
        .from("staff_directory" as any)
        .update({
          role: formRole as any,
          is_active: formActive,
        })
        .eq("id", editingStaff.id);

      if (error) throw error;
      toast.success("Staff updated");

      qc.invalidateQueries({ queryKey: ["staff-directory"] });
      setEditingStaff(null);
    } catch (err: any) {
      toast.error(err.message || "Error updating staff");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from("staff_directory" as any)
        .delete()
        .eq("id", deleteConfirm.id);

      if (error) throw error;
      toast.success("Staff deleted");
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err.message || "Error deleting staff");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invitePhone && !inviteEmail) {
      toast.error("Please provide either phone number or email");
      return;
    }

    setInviteSaving(true);
    try {
      // Normalize phone number
      let normalizedPhone = invitePhone.trim();
      if (normalizedPhone && !normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : normalizedPhone;
      }

      const { error } = await supabase.from("staff_invitations").insert({
        phone: normalizedPhone || null,
        email: inviteEmail.trim().toLowerCase() || "",
        full_name: inviteName.trim() || "",
        role: inviteRole as any,
        notes: inviteNotes.trim() || null,
        invited_by: user!.id,
      } as any);

      if (error) throw error;
      
      toast.success("Staff invitation sent! They'll be assigned this role when they sign up.");
      qc.invalidateQueries({ queryKey: ["staff-invitations"] });
      setShowInvite(false);
      resetInviteForm();
    } catch (err: any) {
      toast.error(err.message || "Error sending invitation");
    } finally {
      setInviteSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Staff Directory"
        subtitle="Manage staff members and invitations"
        primaryAction={
          isAdmin ? { label: "Invite Staff", icon: UserCheck, onClick: () => { resetInviteForm(); setShowInvite(true); } } : undefined
        }
      />

      {!isAdmin && (
        <NoticeBox
          variant="error"
          message="Only super admins can manage the staff directory."
        />
      )}

      <Tabs defaultValue="directory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="directory">Staff Directory</TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations
            {invitations && invitations.filter((i: any) => i.status === 'pending').length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {invitations.filter((i: any) => i.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Avatar</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff && staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      No staff members have joined yet. Send invitations from the "Invitations" tab.
                    </TableCell>
                  </TableRow>
                ) : (
                  staff?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.phone || "—"}</TableCell>
                      <TableCell className="text-sm">{s.email || "—"}</TableCell>
                      <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {s.role}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">
                        {s.avatar_url ? (
                          <a href={s.avatar_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={s.is_active ? "active" : "inactive"} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(s)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm({ id: s.id, name: s.full_name || s.email || s.phone || "Staff" })}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact Info</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!invitations || invitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No pending invitations. Click "Invite Staff" to send an invitation.
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          {inv.phone && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono">{inv.phone}</span>
                            </div>
                          )}
                          {inv.email && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{inv.email}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{inv.full_name || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
                          {inv.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge 
                          status={inv.status === 'pending' ? 'pending' : inv.status === 'accepted' ? 'completed' : 'inactive'} 
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(inv.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.status === 'pending' && isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!confirm('Cancel this invitation?')) return;
                              const { error } = await supabase
                                .from('staff_invitations')
                                .update({ status: 'cancelled' })
                                .eq('id', inv.id);
                              if (error) {
                                toast.error(error.message);
                              } else {
                                toast.success('Invitation cancelled');
                                qc.invalidateQueries({ queryKey: ['staff-invitations'] });
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editingStaff} onOpenChange={(open) => { if (!open) setEditingStaff(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">{editingStaff?.full_name}</p>
              <p className="text-xs text-muted-foreground">{editingStaff?.email || editingStaff?.phone}</p>
            </div>

            <div>
              <Label htmlFor="role">Role *</Label>
              <Select value={formRole} onValueChange={setFormRole} disabled={formSaving}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={formActive}
                onCheckedChange={(checked) => setFormActive(checked as boolean)}
                disabled={formSaving}
              />
              <Label htmlFor="active" className="font-normal cursor-pointer">
                Active
              </Label>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingStaff(null)}
                disabled={formSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={formSaving}
              >
                {formSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Update Staff
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Staff Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Staff Member</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            <NoticeBox
              variant="premium"
              title="Pre-register staff"
              message="When they sign up with this phone/email, they'll automatically get the assigned role and skip customer onboarding."
            />

            <div>
              <Label htmlFor="invite-phone">Phone Number</Label>
              <Input
                id="invite-phone"
                placeholder="e.g. 9876543210 or +919876543210"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                disabled={inviteSaving}
              />
              <p className="text-xs text-muted-foreground mt-1">10-digit number or with +91 prefix</p>
            </div>

            <div>
              <Label htmlFor="invite-email">Email <span className="text-xs text-muted-foreground">(for Google login)</span></Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="staff@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteSaving}
              />
            </div>

            <div>
              <Label htmlFor="invite-name">Full Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="invite-name"
                placeholder="John Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={inviteSaving}
              />
            </div>

            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole} disabled={inviteSaving}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="invite-notes">Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="invite-notes"
                placeholder="Internal notes about this invitation"
                value={inviteNotes}
                onChange={(e) => setInviteNotes(e.target.value)}
                disabled={inviteSaving}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)} disabled={inviteSaving} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={inviteSaving} className="flex-1">
                {inviteSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Invitation"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
