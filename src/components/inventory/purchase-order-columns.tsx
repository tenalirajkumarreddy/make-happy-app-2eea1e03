import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Package, Eye, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import type { PurchaseOrderView } from "@/types/purchases";

// Status badge component with proper styling
const StatusBadge = ({ status }: { status: PurchaseOrderView['status'] }) => {
  const variants: Record<PurchaseOrderView['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', className: string }> = {
    completed: { variant: 'default', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
    cancelled: { variant: 'destructive', className: '' },
    pending: { variant: 'secondary', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  };

  const config = variants[status] || variants.pending;
  return (
    <Badge variant={config.variant} className={`capitalize ${config.className}`}>
      {status}
    </Badge>
  );
};

// Actions cell component with actual functionality
const ActionsCell = ({ po }: { po: PurchaseOrderView }) => {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'completed' | 'cancelled' }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(`Purchase order marked as ${variables.status}`);
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open actions menu">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/inventory/purchases/${po.id}`} className="cursor-pointer flex items-center">
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        {po.status === 'pending' && (
          <>
            <DropdownMenuItem
              onClick={() => updateStatus.mutate({ id: po.id, status: 'completed' })}
              disabled={updateStatus.isPending}
              className="cursor-pointer"
            >
              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
              Mark as Completed
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateStatus.mutate({ id: po.id, status: 'cancelled' })}
              disabled={updateStatus.isPending}
              className="cursor-pointer text-red-600 focus:text-red-600"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Order
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const purchaseOrderColumns: ColumnDef<PurchaseOrderView>[] = [
  {
    accessorKey: "display_id",
    header: "PO ID",
    cell: ({ row }) => {
      const displayId = row.original.display_id;
      return <span className="font-mono text-xs">{displayId}</span>;
    },
  },
  {
    accessorKey: "vendors.name",
    header: "Vendor",
    cell: ({ row }) => {
      const po = row.original;
      const vendorName = po.vendors?.name || 'Unknown Vendor';
      return (
        <Link
          to={`/inventory/vendors/${po.vendor_id}`}
          className="font-medium text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          {vendorName}
        </Link>
      );
    },
  },
  {
    accessorKey: "item_count",
    header: "Items",
    cell: ({ row }) => {
      const count = row.original.item_count;
      return (
        <div className="flex items-center gap-1">
          <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{count}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "total_amount",
    header: "Total Amount",
    cell: ({ row }) => {
      const amount = row.original.total_amount || 0;
      const formatted = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "order_date",
    header: "Order Date",
    cell: ({ row }) => {
      const date = row.original.order_date;
      try {
        return new Date(date).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return date;
      }
    },
  },
  {
    accessorKey: "expected_delivery",
    header: "Expected Delivery",
    cell: ({ row }) => {
      const date = row.original.expected_delivery;
      if (!date) return <span className="text-muted-foreground">-</span>;
      try {
        return new Date(date).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return date;
      }
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <ActionsCell po={row.original} />,
  },
];
