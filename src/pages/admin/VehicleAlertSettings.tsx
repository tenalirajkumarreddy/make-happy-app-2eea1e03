import { useEffect } from "react";
import { useAlertThresholds, useUpdateAlertThreshold } from "@/hooks/useVehicleAlerts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";

interface FormValues {
  fuel_pct: number;
  adblue_pct: number;
  warehouse_radius_m: number;
  store_radius_m: number;
}

export default function VehicleAlertSettings() {
  useEffect(() => {
    document.title = "Alert Settings";
  }, []);

  const { data: thresholds, isLoading } = useAlertThresholds();
  const updateMutation = useUpdateAlertThreshold();

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    values: {
      fuel_pct: thresholds?.find((t) => t.metric === "fuel_pct")?.value ?? 15,
      adblue_pct: thresholds?.find((t) => t.metric === "adblue_pct")?.value ?? 15,
      warehouse_radius_m: thresholds?.find((t) => t.metric === "warehouse_radius_m")?.value ?? 500,
      store_radius_m: thresholds?.find((t) => t.metric === "store_radius_m")?.value ?? 200,
    },
  });

  const onSubmit = async (values: FormValues) => {
    for (const [metric, value] of Object.entries(values)) {
      await updateMutation.mutateAsync({ metric, value });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-4">Alert Threshold Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Thresholds</CardTitle>
          <CardDescription>
            Set global alert limits for all tracked vehicles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="fuel_pct">Low Fuel Warning (%)</Label>
              <Input
                id="fuel_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                {...register("fuel_pct", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Alert when fuel drops below this percentage.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adblue_pct">Low AdBlue Warning (%)</Label>
              <Input
                id="adblue_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                {...register("adblue_pct", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Alert when AdBlue drops below this percentage.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warehouse_radius_m">
                Warehouse Geofence Radius (m)
              </Label>
              <Input
                id="warehouse_radius_m"
                type="number"
                min={50}
                max={5000}
                step={50}
                {...register("warehouse_radius_m", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Radius around warehouse used for session start/end detection.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store_radius_m">Store Geofence Radius (m)</Label>
              <Input
                id="store_radius_m"
                type="number"
                min={20}
                max={1000}
                step={10}
                {...register("store_radius_m", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Radius around stores used for delivery detection.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Thresholds
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
