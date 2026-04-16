"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export type PayrollItem = {
  id: string;
  payroll_id: string;
  worker_id: string;
  item_type: 'salary' | 'bonus' | 'deduction';
  amount: number;
  notes: string | null;
  worker_name?: string;
  worker_role?: string;
};

interface PayrollItemColumnsProps {
  onEdit: (item: PayrollItem) => void;
}

export const payrollItemColumns = ({ onEdit }: PayrollItemColumnsProps): ColumnDef<PayrollItem>[] => {
  return [
    {
      accessorKey: "worker_name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Worker
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
            <div className="font-medium">{row.original.worker_name}</div>
            <div className="text-sm text-muted-foreground">{row.original.worker_role}</div>
        </div>
      ),
    },
    {
      accessorKey: "item_type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("item_type") as string;
        const variant: "default" | "secondary" | "destructive" = 
          type === 'salary' ? 'default' :
          type === 'bonus' ? 'secondary' : 'destructive';
        return <Badge variant={variant}>{type}</Badge>;
      },
    },
    {
        accessorKey: "amount",
        header: ({ column }) => (
            <div className="text-right">
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Amount
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            </div>
        ),
        cell: ({ row }) => {
            const amount = parseFloat(row.getValue("amount") || "0");
            const isDeduction = row.original.item_type === 'deduction';
            const formatted = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
            }).format(amount);
            return <div className={`text-right font-medium ${isDeduction ? 'text-red-500' : 'text-green-500'}`}>{isDeduction ? '-' : ''}{formatted}</div>;
        },
    },
    {
        accessorKey: "notes",
        header: "Notes",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;

        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onEdit(item)}>
                  Edit Item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
};
