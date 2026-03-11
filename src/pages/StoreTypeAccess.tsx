import { PageHeader } from "@/components/shared/PageHeader";
import { StoreTypeAccessMatrix } from "@/components/stores/StoreTypeAccessMatrix";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const StoreTypeAccess = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate("/store-types")}>
          <ArrowLeft className="h-4 w-4" />
          Store Types
        </Button>
      </div>

      <PageHeader
        title="Store Type Access"
        subtitle="Grant staff members access to specific routes within each store type"
      />

      <StoreTypeAccessMatrix />
    </div>
  );
};

export default StoreTypeAccess;
