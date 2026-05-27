import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Link } from "react-router-dom";

type UserHoverCardProps = {
  userId: string | null;
  profileMap: Record<string, { name: string; avatar: string | null }>;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

export function UserHoverCard({ userId, profileMap, children, size = "sm" }: UserHoverCardProps) {
  const p = userId ? profileMap?.[userId] : undefined;
  const name = p?.name || "Unknown";
  const avatar = p?.avatar || null;

  if (!userId) return <span>{children || name}</span>;

  const cls = size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-7 w-7";
  const textCls = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[10px]";

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {children ? (
          <span className="cursor-pointer hover:underline">{children}</span>
        ) : (
          <Avatar className={`${cls} ring-2 ring-background cursor-pointer hover:ring-primary/30 transition-all`}>
            <AvatarImage src={avatar || undefined} alt={name} />
            <AvatarFallback className={`bg-primary/10 text-primary font-semibold ${textCls}`}>
              {getInitials(name) || <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-56 p-0" align="start">
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-10 w-10">
              <AvatarImage src={avatar || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{name}</p>
              <p className="text-xs text-muted-foreground">Staff Member</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full text-xs" asChild>
            <Link to={`/staff/${userId}`}>View Profile</Link>
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
