import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, UserX, ShieldAlert, CheckCircle2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

type RiskCategory = "exceeds_limit" | "dormant_with_balance" | "dormant" | "healthy";

interface RiskReportRow {
  customer_id: string;
  customer_name: string;
  phone: string;
  total_outstanding: number;
  calculated_credit_limit: number;
  days_since_last_order: number;
  risk_category: RiskCategory;
}

const getCategoryDetails = (category: RiskCategory) => {
  switch (category) {
    case "exceeds_limit":
      return { label: "Credit Exceeded", color: "bg-red-500", icon: ShieldAlert };
    case "dormant_with_balance":
      return { label: "Debt & Dormant", color: "bg-amber-500", icon: AlertTriangle };
    case "dormant":
      return { label: "Dormant", color: "bg-slate-400", icon: UserX };
    case "healthy":
      return { label: "Healthy", color: "bg-green-500", icon: CheckCircle2 };
  }
};

const CustomerRiskReport = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<RiskCategory | "all">("all");

  const { data: riskData, isLoading, error } = useQuery({
    queryKey: ["customer-risk-report"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_risk_report");
      if (error) throw error;
      return (data || []) as RiskReportRow[];
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-destructive p-4 text-center">Failed to load risk report data.</div>;
  }

  const d = riskData || [];

  const filteredData = d.filter(row => {
    const matchesSearch = row.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          row.phone?.includes(searchTerm);
    const matchesCategory = filterCategory === "all" || row.risk_category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const totals = {
    exceeds_limit: d.filter(r => r.risk_category === "exceeds_limit").length,
    dormant_with_balance: d.filter(r => r.risk_category === "dormant_with_balance").length,
    dormant: d.filter(r => r.risk_category === "dormant").length,
    healthy: d.filter(r => r.risk_category === "healthy").length,
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <Card className="bg-red-50/50 border-red-100 cursor-pointer hover:bg-red-100/50 transition-colors" onClick={() => setFilterCategory("exceeds_limit")}>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <ShieldAlert className="h-8 w-8 text-red-500 mb-2" />
                <div className="text-2xl font-bold text-red-700">{totals.exceeds_limit}</div>
                <div className="text-xs font-medium text-red-600 uppercase tracking-widest mt-1">Exceeds Limit</div>
            </CardContent>
         </Card>
         <Card className="bg-amber-50/50 border-amber-100 cursor-pointer hover:bg-amber-100/50 transition-colors" onClick={() => setFilterCategory("dormant_with_balance")}>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
                <div className="text-2xl font-bold text-amber-700">{totals.dormant_with_balance}</div>
                <div className="text-xs font-medium text-amber-600 uppercase tracking-widest mt-1">Debt & Dormant</div>
            </CardContent>
         </Card>
         <Card className="bg-slate-50/50 border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setFilterCategory("dormant")}>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <UserX className="h-8 w-8 text-slate-500 mb-2" />
                <div className="text-2xl font-bold text-slate-700">{totals.dormant}</div>
                <div className="text-xs font-medium text-slate-600 uppercase tracking-widest mt-1">Dormant</div>
            </CardContent>
         </Card>
         <Card className="bg-green-50/50 border-green-100 cursor-pointer hover:bg-green-100/50 transition-colors" onClick={() => setFilterCategory("healthy")}>
            <CardContent className="p-4 flex flex-col items-center text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                <div className="text-2xl font-bold text-green-700">{totals.healthy}</div>
                <div className="text-xs font-medium text-green-600 uppercase tracking-widest mt-1">Healthy</div>
            </CardContent>
         </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle>Customer Risk Engine</CardTitle>
              <CardDescription>Analyze customer financial health and ordering habits.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-[200px]"
              />
              {filterCategory !== "all" && (
                <Button variant="outline" size="sm" onClick={() => setFilterCategory("all")}>
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Allowed Limit</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Risk Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row) => {
                    const status = getCategoryDetails(row.risk_category);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={row.customer_id}>
                        <TableCell className="font-medium">{row.customer_name}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{row.phone || "—"}</TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={row.total_outstanding > 0 ? "text-red-600" : ""}>
                            ₹{Number(row.total_outstanding).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                           ₹{Number(row.calculated_credit_limit).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                           {row.days_since_last_order > 3650 ? "Never" : `${row.days_since_last_order} days ago`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${status.color} text-white border-0 flex items-center gap-1 w-fit`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerRiskReport;
