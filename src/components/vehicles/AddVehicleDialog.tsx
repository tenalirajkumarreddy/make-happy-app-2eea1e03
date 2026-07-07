import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddVehicleDialog({ open, onOpenChange }: Props) {
  const [plate, setPlate] = useState("");
  const [isTracked, setIsTracked] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: vehicle, error: ve } = await supabase
        .from("vehicles")
        .insert({
          plate_number: plate.toUpperCase(),
          capacity_kg: 0,
          status: "active",
        })
        .select("id")
        .single();

      if (ve) throw ve;

      const { error: ie } = await supabase
        .from("vehicle_integrations")
        .insert({
          vehicle_id: vehicle.id,
          is_tracked: isTracked,
          intangles_v_id: null,
        });

      if (ie) throw ie;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle added");
      setPlate("");
      setIsTracked(false);
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
          <DialogDescription>
            Add a tracked or manual vehicle to the fleet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="plate">Plate Number</Label>
            <Input
              id="plate"
              placeholder="e.g. AP 39 UV 1983"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="tracked">GPS Tracked</Label>
              <p className="text-xs text-muted-foreground">
                Tracked vehicles connect to Intangles API
              </p>
            </div>
            <Switch
              id="tracked"
              checked={isTracked}
              onCheckedChange={setIsTracked}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!plate.trim() || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Vehicle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
