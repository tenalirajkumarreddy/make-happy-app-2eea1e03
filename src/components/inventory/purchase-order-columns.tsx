"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Package } from "lucide-react";
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

export type PurchaseOrderView = {
  id: string;
  display_id: string;
  vendor_id: string;
  warehouse_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  total_amount: number;
  order_date: string;
  expected_delivery?: string;
  notes?: string;
  vendors: { name: string } | null;
  item_count: number;
};

export const purchaseOrderColumns: ColumnDef<PurchaseOrderView>[] = [
  {
    accessorKey: "display_id",
    header: "PO ID",
    cell: ({ row }) => {
      const displayId = row.original.display_id;
      return <span className="font-mono text-xs">{displayId}</span>
    }
  },
  {
    accessorKey: "vendors.name",
    header: "Vendor",
    cell: ({ row }) => {
      const po = row.original;
      const vendorName = po.vendors?.name || 'Unknown Vendor';
      return (
        <Link to={`/inventory/vendors/${po.vendor_id}`} className="font-medium text-blue-600 hover:underline">
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
          <Package className="h-4 w-4 text-muted-foreground" />
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
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
      
      if (status === 'completed') variant = 'default';
      else if (status === 'cancelled') variant = 'destructive';
      else if (status === 'pending') variant = 'secondary';
      
      return <Badge variant={variant} className="capitalize">{status}</Badge>;
    },
  },
  {
    accessorKey: "order_date",
    header: "Order Date",
    cell: ({ row }) => new Date(row.original.order_date).toLocaleDateString(),
  },
  {
    accessorKey: "expected_delivery",
    header: "Expected Delivery",
    cell: ({ row }) => {
      const date = row.original.expected_delivery;
      return date ? new Date(date).toLocaleDateString() : '-';
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const po = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem>View Details</DropdownMenuItem>
            {po.status === 'pending' && (
              <>
                <DropdownMenuItem>Mark as Completed</DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">Cancel Order</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
