"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

// This type is based on the 'products' table, with an assumption
// that a boolean 'is_raw_material' distinguishes these items.
// We also need to join or calculate the current stock quantity.
export type RawMaterial = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
};

export const rawMaterialColumns: ColumnDef<RawMaterial>[] = [
  {
    accessorKey: "name",
    header: "Material Name",
    cell: ({ row }) => {
        return <span className="font-medium">{row.original.name}</span>
    }
  },
  {
    accessorKey: "sku",
    header: "SKU",
  },
  {
    accessorKey: "current_stock",
    header: "Current Stock",
    cell: ({ row }) => {
        const { current_stock, unit, reorder_level } = row.original;
        const isLowStock = reorder_level && current_stock < reorder_level;
        return (
            <div className="flex flex-col">
                <span>{`${current_stock} ${unit || ''}`}</span>
                {isLowStock && <Badge variant="destructive" className="w-fit">Low Stock</Badge>}
            </div>
        )
    }
  },
  {
    accessorKey: "reorder_level",
    header: "Re-order Level",
    cell: ({ row }) => {
        const { reorder_level, unit } = row.original;
        return <span>{`${reorder_level || 'N/A'} ${unit || ''}`}</span>
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const material = row.original;

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
            <DropdownMenuItem>Edit Material</DropdownMenuItem>
            <DropdownMenuItem>View Stock History</DropdownMenuItem>
            <DropdownMenuItem>Adjust Stock</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
