import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PageHeader } from "@/components/shared/PageHeader";
import { Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const bomItemSchema = z.object({
  id_prefix: z.string().min(1, "Please select an item"), // Will hold 'cat_UUID' or 'mat_UUID'
  quantity: z.number().min(0.001),
  quantity_unit: z.enum(['pieces', 'kg', 'g', 'liters', 'ml']),
});

const bomSchema = z.object({
  finished_product_id: z.string().uuid(),
  items: z.array(bomItemSchema).min(1, "Please add at least one raw material or category."),
});

type BomFormData = z.infer<typeof bomSchema>;

const BomDetailPage = () => {
  const { bomId } = useParams();
  const isNew = bomId === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();

  const { data: finishedProducts } = useQuery({
    queryKey: ['products', 'finished'],
    queryFn: async () => {
        const { data, error } = await supabase.from('products').select('id, name').order('name');
        if (error) throw error;
        return data;
    },
    enabled: true,
  });

  // Fetch Raw Material Categories
  const { data: categories } = useQuery({
    queryKey: ['raw_material_categories', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('raw_material_categories').select('id, name, base_unit').eq('warehouse_id', warehouse?.id);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  // Fetch Raw Materials
  const { data: rawMaterials } = useQuery({
    queryKey: ['raw_materials', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('raw_materials')
            .select('id, name, unit, unit_cost, piece_weight_grams, category_id')
            .eq('warehouse_id', warehouse?.id)
            .eq('is_active', true);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  const { data: bomData, isLoading } = useQuery({
    queryKey: ['bom_details', bomId],
    queryFn: async () => {
        const { data, error } = await supabase.from('bill_of_materials').select('*').eq('finished_product_id', bomId);
        if (error) throw error;
        return data;
    },
    enabled: !isNew,
  });

  const form = useForm<BomFormData>({
    resolver: zodResolver(bomSchema),
    defaultValues: {
        finished_product_id: isNew ? '' : bomId,
        items: [],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  React.useEffect(() => {
    if (bomData && !isNew) {
        form.reset({
            finished_product_id: bomId,
            items: bomData.map(item => ({ 
                id_prefix: item.raw_material_category_id ? `cat_${item.raw_material_category_id}` : `mat_${item.raw_material_id}`,
                quantity: item.quantity,
                quantity_unit: item.quantity_unit as any
            }))
        });
    }
  }, [bomData, bomId, form, isNew]);

  const watchedItems = form.watch("items");

  // Calculate WAC for categories based on current materials
  const categoryWac = useMemo(() => {
    if (!categories || !rawMaterials) return {};
    const wacMap: Record<string, number> = {};
    const avgPieceWeightMap: Record<string, number> = {};

    categories.forEach(cat => {
      const materials = rawMaterials.filter(rm => rm.category_id === cat.id);
      if (materials.length > 0) {
        const total = materials.reduce((sum, rm) => sum + (rm.unit_cost || 0), 0);
        wacMap[cat.id] = total / materials.length; // Blended avg
        
        const pieceWeights = materials.filter(rm => rm.piece_weight_grams > 0);
        if (pieceWeights.length > 0) {
           avgPieceWeightMap[cat.id] = pieceWeights.reduce((s, rm) => s + rm.piece_weight_grams, 0) / pieceWeights.length;
        }
      } else {
        wacMap[cat.id] = 0;
      }
    });
    return { wacMap, avgPieceWeightMap };
  }, [categories, rawMaterials]);

  // Helper for real-time cost calculation
  const getLineCost = (item: BomFormData['items'][0]) => {
    if (!item.id_prefix || !item.quantity) return { cost: 0, preview: null };
    
    const isCat = item.id_prefix.startsWith('cat_');
    const actualId = item.id_prefix.replace(/^(cat_|mat_)/, '');
    
    let unitCost = 0;
    let pieceWeight = 0;

    if (isCat) {
      unitCost = categoryWac.wacMap?.[actualId] || 0;
      pieceWeight = categoryWac.avgPieceWeightMap?.[actualId] || 0;
    } else {
      const rm = rawMaterials?.find(r => r.id === actualId);
      unitCost = rm?.unit_cost || 0;
      pieceWeight = rm?.piece_weight_grams || 0;
    }

    let calculatedCost = 0;
    let previewText = null;

    if (item.quantity_unit === 'pieces') {
      if (pieceWeight > 0) {
         const kgEquiv = (item.quantity * pieceWeight) / 1000;
         calculatedCost = kgEquiv * unitCost;
         previewText = `(~${kgEquiv.toFixed(3)} kg)`;
      } else {
         calculatedCost = item.quantity * unitCost;
      }
    } else {
      calculatedCost = item.quantity * unitCost;
    }

    return { 
      cost: calculatedCost, 
      preview: previewText,
      unitCost: unitCost 
    };
  };

  const totalCost = useMemo(() => {
    return watchedItems.reduce((sum, item) => sum + getLineCost(item).cost, 0);
  }, [watchedItems, rawMaterials, categoryWac]);

  const upsertBom = useMutation({
    mutationFn: async (formData: BomFormData) => {
        // Transform id_prefix back to separate fields
        const formattedItems = formData.items.map(item => {
            const isCat = item.id_prefix.startsWith('cat_');
            const actualId = item.id_prefix.replace(/^(cat_|mat_)/, '');
            return {
                raw_material_id: isCat ? null : actualId,
                raw_material_category_id: isCat ? actualId : null,
                quantity: item.quantity,
                quantity_unit: item.quantity_unit
            };
        });

        const { error } = await supabase.rpc('upsert_bom', {
            p_finished_product_id: formData.finished_product_id,
            p_items: formattedItems as any,
            p_warehouse_id: warehouse?.id,
        });
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Bill of Materials saved successfully!");
        queryClient.invalidateQueries({ queryKey: ['boms', warehouse?.id] });
        queryClient.invalidateQueries({ queryKey: ['bom_details'] });
        navigate('/inventory/boms');
    },
    onError: (error) => {
        toast.error("Failed to save BOM: " + error.message);
    }
  });

  const onSubmit = (data: BomFormData) => {
    upsertBom.mutate(data);
  };

  if (isLoading && !isNew) return <div>Loading BOM details...</div>;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader
          title={isNew ? "Create Bill of Materials" : "Edit Bill of Materials"}
          description="Define the raw materials or categories required to produce one unit of a finished product."
        />
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Estimated Total BOM Cost</p>
          <p className="text-3xl font-bold text-primary">₹ {totalCost.toFixed(2)}</p>
        </div>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Finished Product</CardTitle>
                </CardHeader>
                <CardContent>
                    <FormField
                        control={form.control}
                        name="finished_product_id"
                        render={({ field }) => (
                            <FormItem className="max-w-md">
                              <FormLabel>Select the product this BOM is for</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!isNew}>
                                  <FormControl>
                                  <SelectTrigger>
                                      <SelectValue placeholder="Select a finished product" />
                                  </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                  {finishedProducts?.map(p => (
                                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>BOM Items</CardTitle>
                    <CardDescription>
                      You can link interchangeable materials via a Category (e.g. "Preforms") or select a specific material.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fields.map((field, index) => {
                      const lineCalc = getLineCost(watchedItems[index]);
                      
                      return (
                        <div key={field.id} className="grid grid-cols-12 gap-4 p-4 border rounded-md items-start bg-slate-50 dark:bg-slate-900">
                            <div className="col-span-12 md:col-span-5">
                              <FormField
                                  control={form.control}
                                  name={`items.${index}.id_prefix`}
                                  render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Material or Category</FormLabel>
                                          <Select onValueChange={field.onChange} value={field.value}>
                                              <FormControl>
                                                <SelectTrigger className="bg-white dark:bg-slate-950">
                                                  <SelectValue placeholder="Select item" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent>
                                                  <SelectGroup>
                                                    <SelectLabel className="text-blue-600 font-bold">Categories (Interchangeable)</SelectLabel>
                                                    {categories?.map(c => (
                                                      <SelectItem key={`cat_${c.id}`} value={`cat_${c.id}`}>
                                                        📦 {c.name}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectGroup>
                                                  <SelectGroup>
                                                    <SelectLabel className="text-orange-600 font-bold mt-2">Specific Materials</SelectLabel>
                                                    {rawMaterials?.map(m => (
                                                      <SelectItem key={`mat_${m.id}`} value={`mat_${m.id}`}>
                                                        • {m.name}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectGroup>
                                              </SelectContent>
                                          </Select>
                                      </FormItem>
                                  )}
                              />
                            </div>
                            
                            <div className="col-span-6 md:col-span-2">
                              <FormField
                                  control={form.control}
                                  name={`items.${index}.quantity`}
                                  render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Quantitiy</FormLabel>
                                          <FormControl>
                                              <Input className="bg-white dark:bg-slate-950" type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                          </FormControl>
                                      </FormItem>
                                  )}
                              />
                            </div>

                            <div className="col-span-6 md:col-span-2">
                              <FormField
                                  control={form.control}
                                  name={`items.${index}.quantity_unit`}
                                  render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Unit</FormLabel>
                                          <Select onValueChange={field.onChange} value={field.value}>
                                              <FormControl>
                                                <SelectTrigger className="bg-white dark:bg-slate-950">
                                                  <SelectValue />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent>
                                                  <SelectItem value="pieces">Pieces</SelectItem>
                                                  <SelectItem value="kg">Kg</SelectItem>
                                                  <SelectItem value="g">Grams</SelectItem>
                                                  <SelectItem value="liters">Liters</SelectItem>
                                                  <SelectItem value="ml">mL</SelectItem>
                                              </SelectContent>
                                          </Select>
                                      </FormItem>
                                  )}
                              />
                            </div>

                            <div className="col-span-10 md:col-span-2 pt-8 text-right">
                                <div className="text-sm font-semibold">₹ {lineCalc.cost.toFixed(2)}</div>
                                {lineCalc.preview && (
                                  <div className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-1">
                                    <AlertCircle className="w-3 h-3" /> {lineCalc.preview}
                                  </div>
                                )}
                            </div>

                            <div className="col-span-2 md:col-span-1 pt-6 text-right">
                              <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                        </div>
                    )})}
                    {fields.length === 0 && (
                      <div className="text-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        No materials added to this BOM yet.
                      </div>
                    )}
                     <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-4"
                        onClick={() => append({ id_prefix: '', quantity: 1, quantity_unit: 'pieces' })}
                    >
                        + Add BOM Line
                    </Button>
                </CardContent>
            </Card>
            <div className="flex justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg border shadow-sm">
                <Button type="button" variant="secondary" onClick={() => navigate('/inventory/boms')}>Cancel</Button>
                <Button type="submit" disabled={upsertBom.isPending || fields.length === 0}>
                    {upsertBom.isPending ? 'Saving...' : 'Save Bill of Materials'}
                </Button>
            </div>
        </form>
      </Form>
    </div>
  );
};

export default BomDetailPage;
