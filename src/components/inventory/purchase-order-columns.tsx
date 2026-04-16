"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
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

// This is a type definition for the purchase order data
// based on the new 'purchase_orders' table in the migration.
export type PurchaseOrder = {
  id: string;
  vendor_id: string;
  product_id: string;
  quantity: number;
  price: number;
  status: 'pending' | 'completed' | 'cancelled';
  order_date: string;
  vendors: { name: string }; // Assuming we join to get vendor name
  products: { name: string }; // Assuming we join to get product name
};

export const purchaseOrderColumns: ColumnDef<PurchaseOrder>[] = [
  {
    accessorKey: "id",
    header: "PO ID",
    cell: ({ row }) => {
        const id = row.original.id;
        return <span className="font-mono text-xs">{id.substring(0, 8)}...</span>
    }
  },
  {
    accessorKey: "vendors.name",
    header: "Vendor",
    cell: ({ row }) => {
      const po = row.original;
      return (
        <Link to={`/inventory/vendors/${po.vendor_id}`} className="font-medium text-blue-600 hover:underline">
          {po.vendors.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "products.name",
    header: "Product",
    cell: ({ row }) => {
        const po = row.original;
        return (
          <Link to={`/products?id=${po.product_id}`} className="font-medium">
            {po.products.name}
          </Link>
        );
      },
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
  },
  {
    accessorKey: "price",
    header: "Price",
    cell: ({ row }) => {
        const amount = parseFloat(row.getValue("price"));
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
      const status = row.getValue("status") as string;
      const variant = status === 'completed' ? 'success' : status === 'cancelled' ? 'destructive' : 'secondary';
      return <Badge variant={variant} className="capitalize">{status}</Badge>;
    },
  },
  {
    accessorKey: "order_date",
    header: "Order Date",
    cell: ({ row }) => new Date(row.original.order_date).toLocaleDateString(),
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
            {po.status === 'pending' && <DropdownMenuItem>Mark as Completed</DropdownMenuItem>}
            {po.status === 'pending' && <DropdownMenuItem>Cancel Order</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
