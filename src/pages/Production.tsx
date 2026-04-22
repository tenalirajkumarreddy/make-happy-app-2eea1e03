import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FeasibilityResult, FeasibilityResultData } from '@/components/production/FeasibilityResult';

const ProductionPage = () => {
  const { warehouse } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [feasibilityData, setFeasibilityData] = useState<FeasibilityResultData | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const { data: finishedProducts } = useQuery({
    queryKey: ['products', 'finished'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  const handleCheckFeasibility = async () => {
    if (!selectedProduct || !quantity) return;
    setIsChecking(true);
    setFeasibilityData(null);
    try {
      const { data, error } = await supabase.rpc('calculate_feasibility', {
        p_warehouse_id: warehouse.id,
        p_finished_product_id: selectedProduct,
        p_quantity_to_produce: quantity,
      });
      if (error) throw error;
      setFeasibilityData({
        productName: finishedProducts?.find(p => p.id === selectedProduct)?.name || 'Product',
        quantityToProduce: quantity,
        requirements: data,
      });
    } catch (error) {
      console.error('Feasibility check failed:', error);
      // Handle error display
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Production Feasibility Calculator"
        description="Check if you have enough raw materials to produce a batch of finished goods."
      />
      <Card>
        <CardHeader>
          <CardTitle>Production Query</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Finished Product</label>
            <Select onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {finishedProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 w-full">
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Produce</label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value, 10) || 1)}
              min="1"
            />
          </div>
          <Button onClick={handleCheckFeasibility} disabled={!selectedProduct || !quantity || isChecking}>
            {isChecking ? 'Checking...' : 'Check Availability'}
          </Button>
        </CardContent>
      </Card>

      {isChecking && <div className="text-center p-4">Calculating requirements...</div>}
      
      {feasibilityData && (
        <FeasibilityResult data={feasibilityData} />
      )}
    </div>
  );
};

export default ProductionPage;
