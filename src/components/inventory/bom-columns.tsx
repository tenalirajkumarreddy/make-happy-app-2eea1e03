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
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export type BomSummary = {
  finished_product_id: string;
  finished_product_name: string;
  raw_material_count: number;
  last_updated: string;
};

export const bomColumns: ColumnDef<BomSummary>[] = [
  {
    accessorKey: "finished_product_name",
    header: "Finished Product",
    cell: ({ row }) => {
      const bom = row.original;
      return (
        <Link to={`/inventory/boms/${bom.finished_product_id}`} className="font-medium text-blue-600 hover:underline">
          {bom.finished_product_name}
        </Link>
      );
    },
  },
  {
    accessorKey: "raw_material_count",
    header: "No. of Raw Materials",
    cell: ({ row }) => <Badge variant="secondary">{row.original.raw_material_count}</Badge>
  },
  {
    accessorKey: "last_updated",
    header: "Last Updated",
    cell: ({ row }) => new Date(row.original.last_updated).toLocaleDateString(),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const bom = row.original;
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
            <DropdownMenuItem asChild>
              <Link to={`/inventory/boms/${bom.finished_product_id}`}>View/Edit</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
