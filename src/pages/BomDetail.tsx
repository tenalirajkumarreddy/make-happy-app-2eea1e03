import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PageHeader } from '@/components/layout/PageHeader';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const bomItemSchema = z.object({
  raw_material_id: z.string().uuid(),
  quantity: z.number().min(0.001),
});

const bomSchema = z.object({
  finished_product_id: z.string().uuid(),
  items: z.array(bomItemSchema).min(1, "Please add at least one raw material."),
});

type BomFormData = z.infer<typeof bomSchema>;

const BomDetailPage = () => {
  const { bomId } = useParams();
  const isNew = bomId === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { warehouse } = useAuth();

  const { data: finishedProducts } = useQuery({
    queryKey: ['products', warehouse?.id, 'finished'],
    queryFn: async () => {
        const { data, error } = await supabase.from('products').select('id, name').eq('warehouse_id', warehouse?.id).eq('is_raw_material', false);
        if (error) throw error;
        return data;
    },
    enabled: !!warehouse?.id,
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ['raw_materials', warehouse?.id],
    queryFn: async () => {
        const { data, error } = await supabase.from('products').select('id, name, unit').eq('warehouse_id', warehouse?.id).eq('is_raw_material', true);
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
        finished_product_id: bomId,
        items: [],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  React.useEffect(() => {
    if (bomData) {
        form.reset({
            finished_product_id: bomId,
            items: bomData.map(item => ({ raw_material_id: item.raw_material_id, quantity: item.quantity }))
        });
    }
  }, [bomData, bomId, form]);

  const upsertBom = useMutation({
    mutationFn: async (formData: BomFormData) => {
        // This requires an RPC function to handle the upsert logic transactionally
        const { error } = await supabase.rpc('upsert_bom', {
            p_finished_product_id: formData.finished_product_id,
            p_items: formData.items,
            p_warehouse_id: warehouse.id,
        });
        if (error) throw error;
    },
    onSuccess: (_, variables) => {
        toast.success("Bill of Materials saved successfully!");
        queryClient.invalidateQueries({ queryKey: ['boms', warehouse?.id] });
        queryClient.invalidateQueries({ queryKey: ['bom_details', variables.finished_product_id] });
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
    <div className="space-y-4">
      <PageHeader
        title={isNew ? "Create Bill of Materials" : "Edit Bill of Materials"}
        description="Define the raw materials required to produce one unit of a finished product."
      />
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
                            <FormItem>
                            <FormLabel>Select the product this BOM is for</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isNew}>
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
                    <CardTitle>Raw Materials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fields.map((field, index) => (
                        <div key={field.id} className="flex items-end gap-4 p-2 border rounded-md">
                            <FormField
                                control={form.control}
                                name={`items.${index}.raw_material_id`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Material</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {rawMaterials?.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name={`items.${index}.quantity`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Quantity</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                     <Button
                        type="button"
                        variant="outline"
                        onClick={() => append({ raw_material_id: '', quantity: 1 })}
                    >
                        Add Material
                    </Button>
                </CardContent>
            </Card>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => navigate('/inventory/boms')}>Cancel</Button>
                <Button type="submit" disabled={upsertBom.isPending}>
                    {upsertBom.isPending ? 'Saving...' : 'Save BOM'}
                </Button>
            </div>
        </form>
      </Form>
    </div>
  );
};

export default BomDetailPage;
