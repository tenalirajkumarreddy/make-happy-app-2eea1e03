"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export type Worker = {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role_id: string | null;
  role_name: string;
  is_active: boolean;
  joining_date: string | null;
};

export const workerColumns = (onEdit: (worker: Worker) => void): ColumnDef<Worker>[] => [
  {
    accessorKey: "display_id",
    header: "ID",
  },
  {
    accessorKey: "full_name",
    header: "Name",
  },
  {
    accessorKey: "role_name",
    header: "Role",
    cell: ({ row }) => <Badge>{row.original.role_name}</Badge>,
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
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <span className="flex items-center text-green-600"><CheckCircle className="mr-1 h-4 w-4" /> Active</span>
      ) : (
        <span className="flex items-center text-red-600"><XCircle className="mr-1 h-4 w-4" /> Inactive</span>
      ),
  },
  {
    accessorKey: "joining_date",
    header: "Joining Date",
    cell: ({ row }) => row.original.joining_date ? new Date(row.original.joining_date).toLocaleDateString() : 'N/A',
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const worker = row.original;
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
            <DropdownMenuItem onClick={() => onEdit(worker)}>
              Edit Worker
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
