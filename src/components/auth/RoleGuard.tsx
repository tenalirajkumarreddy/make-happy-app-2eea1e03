import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { AppRole } from "@/types/roles";

interface RoleGuardProps {
  allowed: AppRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role || !allowed.includes(role as AppRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
