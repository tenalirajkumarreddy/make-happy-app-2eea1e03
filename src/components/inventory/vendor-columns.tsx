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
import { Link } from "react-router-dom";

// This is a type definition for the vendor data
// based on the new 'vendors' table in the migration.
export type Vendor = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export const columns: ColumnDef<Vendor>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const vendor = row.original;
      return (
        <Link to={`/inventory/vendors/${vendor.id}`} className="font-medium text-blue-600 hover:underline">
          {vendor.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "contact_person",
    header: "Contact Person",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "created_at",
    header: "Created On",
    cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const vendor = row.original;

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
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(vendor.id)}
            >
              Copy vendor ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/inventory/vendors/${vendor.id}`}>View Details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Edit Vendor</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
