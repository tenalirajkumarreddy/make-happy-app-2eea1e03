import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Box, Warehouse, Users, Edit, PackagePlus } from 'lucide-react';
import { Product } from '@/lib/types'; // Assuming a Product type definition exists

interface ProductCardProps {
  product: Product;
  onAdjustStock: () => void;
  onEdit: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAdjustStock, onEdit }) => {
  const warehouseStock = product.warehouse_quantity || 0;
  const staffStock = product.staff_holdings?.reduce((sum, holding) => sum + (holding.quantity || 0), 0) || 0;
  const totalStock = warehouseStock + staffStock;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{product.name}</CardTitle>
          <Badge variant={product.is_active ? 'default' : 'destructive'}>
            {product.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{product.sku}</p>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="mb-4">
          <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="rounded-md object-cover h-40 w-full" />
        </div>

        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
            <h4 className="font-semibold flex items-center mb-2">
                <Box className="mr-2 h-5 w-5" />
                Stock Breakdown
            </h4>
            <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Stock:</span>
                <span>{totalStock} {product.unit}</span>
            </div>
            <hr/>
            <div className="flex justify-between items-center text-sm">
                <span className="flex items-center"><Warehouse className="mr-2 h-4 w-4 text-muted-foreground"/> In Warehouse:</span>
                <span>{warehouseStock} {product.unit}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground"/> With Staff:</span>
                <span>{staffStock} {product.unit}</span>
            </div>

            {staffStock > 0 && product.staff_holdings && (
                <div className="pt-2 pl-4 border-l-2 ml-2 space-y-1">
                    {product.staff_holdings.map(holding => (
                        <div key={holding.user_id} className="text-xs text-muted-foreground flex justify-between">
                            <span>{holding.full_name} ({holding.role})</span>
                            <span>{holding.quantity}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
        <Button size="sm" onClick={onAdjustStock}>
          <PackagePlus className="mr-2 h-4 w-4" /> Adjust Stock
        </Button>
      </CardFooter>
    </Card>
  );
};
