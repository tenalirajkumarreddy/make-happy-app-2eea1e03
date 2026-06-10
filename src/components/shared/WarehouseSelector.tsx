import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useAuth } from "@/contexts/AuthContext";

export function WarehouseSelector() {
  const { currentWarehouse, allWarehouses, setActiveWarehouse } = useWarehouse();
  const { role } = useAuth();
  const canSwitch = role === "super_admin" && allWarehouses.length > 0;

  if (!currentWarehouse) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {canSwitch ? (
        <Select value={currentWarehouse.id} onValueChange={setActiveWarehouse}>
          <SelectTrigger className="h-auto min-w-0 border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0">
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            {allWarehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs font-medium truncate max-w-[160px]">{currentWarehouse.name}</span>
      )}
    </div>
  );
}
