import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

type Requirement = {
  raw_material_name: string;
  required_quantity: number;
  available_quantity: number;
  unit: string;
  sufficient: boolean;
};

export type FeasibilityResultData = {
  productName: string;
  quantityToProduce: number;
  requirements: Requirement[];
};

interface FeasibilityResultProps {
  data: FeasibilityResultData;
}

export const FeasibilityResult: React.FC<FeasibilityResultProps> = ({ data }) => {
  const isFeasible = data.requirements.every(r => r.sufficient);

  const OverallStatus = () => {
    if (isFeasible) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Feasible: You have enough stock to produce this batch.</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-red-600">
        <XCircle className="h-5 w-5" />
        <span className="font-semibold">Not Feasible: Insufficient stock for some raw materials.</span>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feasibility Report</CardTitle>
        <CardDescription>
          Production plan for <strong>{data.quantityToProduce} units</strong> of <strong>{data.productName}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 rounded-lg bg-muted">
            <OverallStatus />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raw Material</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.requirements.map((req, index) => (
              <TableRow key={index}>
                <TableCell>{req.raw_material_name}</TableCell>
                <TableCell className="text-right">{req.required_quantity.toFixed(2)} {req.unit}</TableCell>
                <TableCell className="text-right">{req.available_quantity.toFixed(2)} {req.unit}</TableCell>
                <TableCell className="text-right">
                  {req.sufficient ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">Sufficient</Badge>
                  ) : (
                    <Badge variant="destructive">
                      Short by {(req.required_quantity - req.available_quantity).toFixed(2)}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isFeasible && (
            <div className="mt-4 p-3 border border-yellow-300 bg-yellow-50 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <p className="text-sm text-yellow-800">
                    You need to purchase the materials marked in red to proceed with production.
                </p>
            </div>
        )}
      </CardContent>
    </Card>
  );
};
