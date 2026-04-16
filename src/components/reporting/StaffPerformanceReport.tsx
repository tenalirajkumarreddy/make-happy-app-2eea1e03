import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

const StaffPerformanceReport: React.FC = () => {
  const { profile } = useAuth();
  const warehouseId = profile?.default_warehouse_id;

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['staff-performance-logs', warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [];
      const { data, error } = await supabase.rpc('get_staff_performance_logs', { p_warehouse_id: warehouseId });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!warehouseId,
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Difference</TableHead>
              <TableHead>Reviewer</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (error) {
      return <div className="text-red-500">Error loading staff performance logs: {error.message}</div>;
    }

    if (!logs || logs.length === 0) {
      return <div className="text-center text-muted-foreground py-8">No performance logs found.</div>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            <TableHead>Reviewer</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}</TableCell>
              <TableCell>{log.staff_name}</TableCell>
              <TableCell>{log.product_name}</TableCell>
              <TableCell>
                <Badge variant={log.log_type === 'stock_discrepancy' ? 'destructive' : 'secondary'}>
                  {log.log_type.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{log.expected_quantity}</TableCell>
              <TableCell className="text-right">{log.actual_quantity}</TableCell>
              <TableCell className={`text-right font-bold ${log.difference !== 0 ? 'text-red-500' : ''}`}>
                {log.difference}
              </TableCell>
              <TableCell>{log.reviewer_name}</TableCell>
              <TableCell className="max-w-[250px] truncate">{log.notes}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Performance Logs</CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default StaffPerformanceReport;
