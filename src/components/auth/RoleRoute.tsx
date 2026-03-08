import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RoleRouteProps {
  staffElement: React.ReactNode;
  customerElement: React.ReactNode;
}

export function RoleRoute({ staffElement, customerElement }: RoleRouteProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === "customer") {
    return <>{customerElement}</>;
  }

  return <>{staffElement}</>;
}
