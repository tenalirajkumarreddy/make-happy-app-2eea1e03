import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RoleRouteProps {
  staffElement: React.ReactNode;
  customerElement: React.ReactNode;
  agentElement?: React.ReactNode;
  marketerElement?: React.ReactNode;
  posElement?: React.ReactNode;
}

export function RoleRoute({ staffElement, customerElement, agentElement, marketerElement, posElement }: RoleRouteProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === "customer") return <>{customerElement}</>;
  if (role === "agent" && agentElement) return <>{agentElement}</>;
  if (role === "marketer" && marketerElement) return <>{marketerElement}</>;
  if (role === "pos" && posElement) return <>{posElement}</>;
  if (role === "super_admin" || role === "manager") return <>{staffElement}</>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      <h2 className="text-2xl font-bold tracking-tight mb-2">Access Pending</h2>
      <p className="text-muted-foreground w-full max-w-sm">
        Your account role has not been assigned yet. Please contact an administrator to complete your setup.
      </p>
    </div>
  );
}
