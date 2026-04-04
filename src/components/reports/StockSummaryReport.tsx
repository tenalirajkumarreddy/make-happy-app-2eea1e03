import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, AlertTriangle, TrendingDown, Archive, Search, Download } from "lucide-react";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface StockItem {
  id: string;
  name: string;
  display_id: string;
  hsn_code: string | null;
  mrp: number;
  gst_rate: number;
  category: string | null;
  total_stock: number;
  warehouses: { id: string; name: string; quantity: number }[];
  status: "in_stock" | "low_stock" | "out_of_stock";
  stock_value: number;
}

export default function StockSummaryReport() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");

  // Fetch products with stock
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["stock-summary-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, display_id, hsn_code, mrp, gst_rate, is_active, product_categories(name)")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Fetch stock by product and warehouse
  const { data: stockData = [], isLoading: stockLoading } = useQuery({
    queryKey: ["stock-summary-stock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_stock")
        .select("product_id, warehouse_id, quantity, warehouses(id, name)");
      return data || [];
    },
  });

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["stock-summary-warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const isLoading = productsLoading || stockLoading;

  // Combine data
  const stockItems = useMemo(() => {
    const LOW_STOCK_THRESHOLD = 10;

    return products.map((p: any): StockItem => {
      const productStock = stockData.filter((s: any) => s.product_id === p.id);
      const totalStock = productStock.reduce((sum, s: any) => sum + Number(s.quantity || 0), 0);
      
      const warehouseStock = productStock.map((s: any) => ({
        id: s.warehouse_id,
        name: s.warehouses?.name || "Unknown",
        quantity: Number(s.quantity || 0),
      }));

      let status: "in_stock" | "low_stock" | "out_of_stock" = "in_stock";
      if (totalStock === 0) status = "out_of_stock";
      else if (totalStock <= LOW_STOCK_THRESHOLD) status = "low_stock";

      return {
        id: p.id,
        name: p.name,
        display_id: p.display_id || "",
        hsn_code: p.hsn_code,
        mrp: Number(p.mrp || 0),
        gst_rate: Number(p.gst_rate || 0),
        category: p.product_categories?.name || null,
        total_stock: totalStock,
        warehouses: warehouseStock,
        status,
        stock_value: totalStock * Number(p.mrp || 0),
      };
    });
  }, [products, stockData]);

  // Filter items
  const filteredItems = useMemo(() => {
    return stockItems.filter((item) => {
      const matchesSearch = !search || 
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.display_id.toLowerCase().includes(search.toLowerCase()) ||
        (item.hsn_code && item.hsn_code.includes(search));
      
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [stockItems, search, statusFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalProducts = stockItems.length;
    const inStock = stockItems.filter(i => i.status === "in_stock").length;
    const lowStock = stockItems.filter(i => i.status === "low_stock").length;
    const outOfStock = stockItems.filter(i => i.status === "out_of_stock").length;
    const totalUnits = stockItems.reduce((sum, i) => sum + i.total_stock, 0);
    const totalValue = stockItems.reduce((sum, i) => sum + i.stock_value, 0);
    
    return { totalProducts, inStock, lowStock, outOfStock, totalUnits, totalValue };
  }, [stockItems]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_stock":
        return <Badge variant="default" className="bg-green-100 text-green-800">In Stock</Badge>;
      case "low_stock":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Low Stock</Badge>;
      case "out_of_stock":
        return <Badge variant="destructive">Out of Stock</Badge>;
      default:
        return null;
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Stock Summary Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Total Stock Value: ₹${totals.totalValue.toLocaleString()}`, 14, 35);

    const headers = ["Product", "ID", "HSN", "Category", "MRP", "Stock", "Value", "Status"];
    if (warehouses.length > 1) {
      warehouses.forEach((wh: any) => headers.push(wh.name));
    }

    autoTable(doc, {
      startY: 42,
      head: [headers],
      body: filteredItems.map((item) => {
        const row = [
          item.name,
          item.display_id,
          item.hsn_code || "—",
          item.category || "—",
          `₹${item.mrp.toLocaleString()}`,
          item.total_stock.toString(),
          `₹${item.stock_value.toLocaleString()}`,
          item.status.replace("_", " ").toUpperCase(),
        ];
        if (warehouses.length > 1) {
          warehouses.forEach((wh: any) => {
            const whStock = item.warehouses.find(w => w.id === wh.id);
            row.push(whStock?.quantity?.toString() || "0");
          });
        }
        return row;
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`stock-summary-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportExcel = () => {
    const data = filteredItems.map((item) => {
      const row: any = {
        "Product Name": item.name,
        "Product ID": item.display_id,
        "HSN Code": item.hsn_code || "",
        "Category": item.category || "",
        "MRP": item.mrp,
        "Total Stock": item.total_stock,
        "Stock Value": item.stock_value,
        "Status": item.status.replace("_", " "),
      };
      warehouses.forEach((wh: any) => {
        const whStock = item.warehouses.find(w => w.id === wh.id);
        row[wh.name] = whStock?.quantity || 0;
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Summary");
    XLSX.writeFile(wb, `stock-summary-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const summaryCards = [
    { label: "Total Products", value: totals.totalProducts, icon: Package, iconColor: "blue" },
    { label: "In Stock", value: totals.inStock, icon: Package, iconColor: "green" },
    { label: "Low Stock", value: totals.lowStock, icon: AlertTriangle, iconColor: "yellow" },
    { label: "Out of Stock", value: totals.outOfStock, icon: TrendingDown, iconColor: "red" },
    { label: "Total Units", value: totals.totalUnits.toLocaleString(), icon: Archive, iconColor: "purple" },
    { label: "Stock Value", value: `₹${totals.totalValue.toLocaleString()}`, icon: Package, iconColor: "indigo" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Stock Summary</h2>
          <p className="text-sm text-muted-foreground">Current inventory levels across all warehouses</p>
        </div>
        <ReportExportBar onExportPDF={exportPDF} onExportExcel={exportExcel} showCSV={false} showPrint={false} />
      </div>

      <ReportSummaryCards cards={summaryCards} columns={6} />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All
            </Button>
            <Button
              variant={statusFilter === "in_stock" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("in_stock")}
              className={statusFilter === "in_stock" ? "bg-green-600" : ""}
            >
              In Stock ({totals.inStock})
            </Button>
            <Button
              variant={statusFilter === "low_stock" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("low_stock")}
              className={statusFilter === "low_stock" ? "bg-yellow-600" : ""}
            >
              Low Stock ({totals.lowStock})
            </Button>
            <Button
              variant={statusFilter === "out_of_stock" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("out_of_stock")}
              className={statusFilter === "out_of_stock" ? "bg-red-600" : ""}
            >
              Out of Stock ({totals.outOfStock})
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No products found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left text-sm">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">HSN</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">MRP</th>
                    <th className="px-4 py-3 font-medium text-right">Stock</th>
                    {warehouses.length > 1 && warehouses.map((wh: any) => (
                      <th key={wh.id} className="px-4 py-3 font-medium text-right">{wh.name}</th>
                    ))}
                    <th className="px-4 py-3 font-medium text-right">Value</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.display_id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.hsn_code || "—"}</td>
                      <td className="px-4 py-3 text-sm">{item.category || "—"}</td>
                      <td className="px-4 py-3 text-sm text-right">₹{item.mrp.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${item.status === "out_of_stock" ? "text-red-600" : item.status === "low_stock" ? "text-yellow-600" : ""}`}>
                          {item.total_stock}
                        </span>
                      </td>
                      {warehouses.length > 1 && warehouses.map((wh: any) => {
                        const whStock = item.warehouses.find(w => w.id === wh.id);
                        return (
                          <td key={wh.id} className="px-4 py-3 text-sm text-right text-muted-foreground">
                            {whStock?.quantity || 0}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-medium">₹{item.stock_value.toLocaleString()}</td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/70 font-semibold">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right">TOTAL</td>
                    <td className="px-4 py-3 text-right">{totals.totalUnits.toLocaleString()}</td>
                    {warehouses.length > 1 && warehouses.map((wh: any) => {
                      const whTotal = stockItems.reduce((sum, item) => {
                        const whStock = item.warehouses.find(w => w.id === wh.id);
                        return sum + (whStock?.quantity || 0);
                      }, 0);
                      return <td key={wh.id} className="px-4 py-3 text-right">{whTotal.toLocaleString()}</td>;
                    })}
                    <td className="px-4 py-3 text-right">₹{totals.totalValue.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
