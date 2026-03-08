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

  return <>{staffElement}</>;
}
