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
import type { NavigateFunction } from 'react-router-dom';

export type Payroll = {
  id: string;
  display_id: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'processing' | 'completed' | 'paid';
  total_amount: number;
  notes: string | null;
};

interface PayrollColumnsProps {
  onEdit: (payroll: Payroll) => void;
  navigate: NavigateFunction;
}

export const payrollColumns = ({ onEdit, navigate }: PayrollColumnsProps): ColumnDef<Payroll>[] => {

  return [
    {
      accessorKey: "display_id",
        header: ({ column }: { column: any }) => (
            <div className="text-right">
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Total Amount
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            </div>
        ),
        cell: ({ row }: { row: any }) => {
            const amount = parseFloat(row.getValue("total_amount") || "0");
            const formatted = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
            }).format(amount);
            return <div className="text-right font-medium">{formatted}</div>;
        },
    },
    {
      id: "actions",
      cell: ({ row }: { row: any }) => {
        const payroll = row.original;

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
                <DropdownMenuItem onClick={() => navigate(`/hr/payrolls/${payroll.id}`)}>
                  View Details
                </DropdownMenuItem>
                {payroll.status === 'draft' && (
                    <DropdownMenuItem onClick={() => onEdit(payroll)}>
                        Edit Run
                    </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
};
