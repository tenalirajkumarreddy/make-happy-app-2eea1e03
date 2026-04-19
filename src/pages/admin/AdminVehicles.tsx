import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const vehicleSchema = z.object({
  plate_number: z.string().min(1, "License plate is required"),
  capacity_kg: z.coerce.number().min(1, "Max weight must be greater than 0"),
  capacity_volume: z.coerce.number().min(0.1, "Max volume must be greater than 0"),
  mileage_kmpl: z.coerce.number().min(1, "Mileage must be greater than 0"),
  status: z.enum(["active", "maintenance", "retired"]),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

export default function AdminVehicles() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate_number: "",
      capacity_kg: 1000,
      capacity_volume: 10,
      mileage_kmpl: 10,
      status: "active",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      if (editingId) {
        const { error } = await supabase.from("vehicles").update(values as any).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert([values as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(editingId ? "Vehicle updated" : "Vehicle added");
      handleClose();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle deleted");
    },
    onError: (error) => {
      toast.error(`Error deleting vehicle: ${error.message}`);
    },
  });

  const onSubmit = (values: VehicleFormValues) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (vehicle: any) => {
    setEditingId(vehicle.id);
    form.reset({
      plate_number: vehicle.plate_number,
      capacity_kg: vehicle.capacity_kg,
      capacity_volume: vehicle.capacity_volume,
      mileage_kmpl: vehicle.mileage_kmpl || 10,
      status: vehicle.status,
    });
    setIsOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this vehicle?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingId(null);
    form.reset({
      plate_number: "",
      capacity_kg: 1000,
      capacity_volume: 10,
      status: "active",
    });
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Vehicle Management</h1>
        <Dialog open={isOpen} onOpenChange={(open) => !open ? handleClose() : setIsOpen(true)}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Vehicle</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="plate_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Plate</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. MH 12 AB 1234" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="capacity_kg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity (kg)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="capacity_volume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity Volume (m³)</FormLabel>
                        <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="mileage_kmpl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mileage (km/l)</FormLabel>
                        <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="retired">Retired</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Update Vehicle" : "Add Vehicle"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : vehicles && vehicles.length > 0 ? (
            <div className="rounded-md border">
              <table className="min-w-full divide-y border-collapse">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">License Plate</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Capacity (kg)</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Volume (m³)</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Mileage (km/l)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {vehicles.map((v: any) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3 text-sm font-medium">{v.plate_number}</td>
                      <td className="px-4 py-3 text-sm text-right">{v.capacity_kg}</td>
                      <td className="px-4 py-3 text-sm text-right">{v.capacity_volume}</td>
                      <td className="px-4 py-3 text-sm text-right">{v.mileage_kmpl || '-'}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        <Badge variant={v.status === 'active' ? 'default' : v.status === 'maintenance' ? 'secondary' : 'destructive'}>
                          {v.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No vehicles found. Add one to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
