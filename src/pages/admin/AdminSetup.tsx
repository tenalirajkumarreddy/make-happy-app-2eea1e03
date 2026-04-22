import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const conversionSchema = z.object({
  raw_material_id: z.string().uuid("Raw material is required"),
  from_unit: z.string().min(1, "From unit is required"),
  to_unit: z.string().min(1, "To unit is required"),
  conversion_rate: z.coerce.number().min(0.0001, "Rate must be greater than 0"),
});

type ConversionFormValues = z.infer<typeof conversionSchema>;

export default function AdminSetup() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("categories");
  
  // Category State
  const [catOpen, setCatOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Conversion State
  const [convOpen, setConvOpen] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);

  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ["raw_material_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_material_categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ["raw_materials_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("id, name, unit");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: conversions, isLoading: isLoadingConversions } = useQuery({
    queryKey: ["unit_conversions"],
    queryFn: async () => {
      // NOTE: We assume there is a relationship set up in supabase. If not, we map via raw_materials -> products.
      const { data, error } = await supabase
        .from("unit_conversions")
        .select(`
          *
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // CATEGORY FORM
  const catForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "" },
  });

  const saveCatMutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      if (editingCatId) {
        const { error } = await supabase.from("raw_material_categories").update(values).eq("id", editingCatId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("raw_material_categories").insert([values]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["raw_material_categories"] });
      toast.success(editingCatId ? "Category updated" : "Category added");
      setCatOpen(false);
      catForm.reset();
      setEditingCatId(null);
    },
  });

  const deleteCatMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("raw_material_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["raw_material_categories"] });
      toast.success("Category deleted");
    },
  });

  const handleEditCat = (cat: any) => {
    setEditingCatId(cat.id);
    catForm.reset({ name: cat.name, description: cat.description || "" });
    setCatOpen(true);
  };

  // CONVERSION FORM
  const convForm = useForm<ConversionFormValues>({
    resolver: zodResolver(conversionSchema),
    defaultValues: { raw_material_id: "", from_unit: "", to_unit: "", conversion_rate: 1 },
  });

  const saveConvMutation = useMutation({
    mutationFn: async (values: ConversionFormValues) => {
      if (editingConvId) {
        const { error } = await supabase.from("unit_conversions").update(values).eq("id", editingConvId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unit_conversions").insert([values]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unit_conversions"] });
      toast.success(editingConvId ? "Conversion updated" : "Conversion added");
      setConvOpen(false);
      convForm.reset();
      setEditingConvId(null);
    },
  });

  const deleteConvMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("unit_conversions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unit_conversions"] });
      toast.success("Conversion deleted");
    },
  });

  const handleEditConv = (conv: any) => {
    setEditingConvId(conv.id);
    convForm.reset({
      raw_material_id: conv.raw_material_id,
      from_unit: conv.from_unit,
      to_unit: conv.to_unit,
      conversion_rate: conv.conversion_rate,
    });
    setConvOpen(true);
  };

  // Resolving raw material names for UI manually if relationship join isn't perfect
  const getMaterialName = (id: string) => {
    return rawMaterials?.find((r: any) => r.id === id)?.name || "Unknown";
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">ERP Setup</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="categories">Raw Material Categories</TabsTrigger>
          <TabsTrigger value="conversions">Unit Conversions</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Categories</CardTitle>
              <Button size="sm" onClick={() => { setEditingCatId(null); catForm.reset({name:'', description:''}); setCatOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Category
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingCategories ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : categories && categories.length > 0 ? (
                <div className="rounded-md border">
                  <table className="min-w-full divide-y border-collapse">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Description</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-card">
                      {categories.map((cat: any) => (
                        <tr key={cat.id}>
                          <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{cat.description || "-"}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleEditCat(cat)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => confirm("Delete category?") && deleteCatMutation.mutate(cat.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No categories found. Create one to get started.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Unit Conversions</CardTitle>
              <Button size="sm" onClick={() => { setEditingConvId(null); convForm.reset(); setConvOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Conversion
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingConversions ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : conversions && conversions.length > 0 ? (
                <div className="rounded-md border">
                  <table className="min-w-full divide-y border-collapse">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Material</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">From Unit</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">To Unit</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Rate</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-card">
                      {conversions.map((conv: any) => (
                        <tr key={conv.id}>
                          <td className="px-4 py-3 text-sm font-medium">{getMaterialName(conv.raw_material_id)}</td>
                          <td className="px-4 py-3 text-sm">{conv.from_unit}</td>
                          <td className="px-4 py-3 text-sm">{conv.to_unit}</td>
                          <td className="px-4 py-3 text-sm">{conv.conversion_rate}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleEditConv(conv)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => confirm("Delete conversion?") && deleteConvMutation.mutate(conv.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No unit conversions found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCatId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <Form {...catForm}>
            <form onSubmit={catForm.handleSubmit((d) => saveCatMutation.mutate(d))} className="space-y-4">
              <FormField control={catForm.control} name="name" render={({field}) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <FormField control={catForm.control} name="description" render={({field}) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <Button type="submit" disabled={saveCatMutation.isPending}>Save</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Conversion Dialog */}
      <Dialog open={convOpen} onOpenChange={setConvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingConvId ? "Edit Conversion" : "Add Conversion"}</DialogTitle></DialogHeader>
          <Form {...convForm}>
            <form onSubmit={convForm.handleSubmit((d) => saveConvMutation.mutate(d))} className="space-y-4">
              <FormField control={convForm.control} name="raw_material_id" render={({field}) => (
                <FormItem>
                  <FormLabel>Raw Material</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {rawMaterials?.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({m.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={convForm.control} name="from_unit" render={({field}) => (
                  <FormItem><FormLabel>From Unit</FormLabel><FormControl><Input {...field} placeholder="e.g. Box" /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={convForm.control} name="to_unit" render={({field}) => (
                  <FormItem><FormLabel>To Unit</FormLabel><FormControl><Input {...field} placeholder="e.g. Kg" /></FormControl><FormMessage/></FormItem>
                )} />
              </div>
              <FormField control={convForm.control} name="conversion_rate" render={({field}) => (
                <FormItem><FormLabel>Conversion Rate</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <Button type="submit" disabled={saveConvMutation.isPending}>Save</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
