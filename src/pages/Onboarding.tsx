import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to BizManager</h1>
      <p className="text-muted-foreground mb-6">Get started by signing in to your account.</p>
      <Button onClick={() => navigate("/auth")}>
        Go to Sign In
      </Button>
    </div>
  );
}
