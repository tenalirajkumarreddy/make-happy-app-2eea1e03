import { Phone, Mail, Building2, Clock, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { StaffInvitation } from "@/types/staff";

export interface InvitationCardProps {
  invitation: StaffInvitation;
  className?: string;
}

export function InvitationCard({ invitation, className }: InvitationCardProps) {
  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const invitedDate = new Date(invitation.created_at);
  const daysAgo = Math.floor((Date.now() - invitedDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={cn(
        "relative bg-white rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700",
        "opacity-80 hover:opacity-100 transition-opacity duration-200",
        "overflow-hidden",
        className
      )}
    >
      <div className="p-5">
        {/* Header: Avatar + Name + Pending badge */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-14 w-14 ring-2 ring-border/50 shrink-0 grayscale">
            <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-400 text-lg font-semibold">
              {getInitials(invitation.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-semibold text-base text-foreground truncate" title={invitation.full_name}>
              {invitation.full_name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-xs font-medium px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
              >
                <Clock className="h-3 w-3 mr-1 inline" />
                Invitation Pending
              </Badge>
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
              >
                {invitation.role}
              </Badge>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{invitation.phone || "—"}</span>
          </div>
          {invitation.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{invitation.email}</span>
            </div>
          )}
          {invitation.warehouse_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{invitation.warehouse_name}</span>
            </div>
          )}
        </div>

        {/* Invited date */}
        <div className="flex items-center gap-2 pt-3 border-t border-dashed border-border/50 text-xs text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" />
          <span>
            Invited {daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default InvitationCard;
