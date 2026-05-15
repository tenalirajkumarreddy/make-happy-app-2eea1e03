import * as fs from 'fs';
import * as path from 'path';

const sidebarPath = path.join(process.cwd(), 'src', 'components', 'layout', 'AppSidebar.tsx');
let content = fs.readFileSync(sidebarPath, 'utf8');

// 1. Update interface NavChild
content = content.replace(
  interface NavChild {
  label: string;
  path: string;
},
  interface NavChild {
  label: string;
  path: string;
  isHeader?: boolean;
}
);

// 2. Replace REPORT_CHILDREN array
const newChildrenStr = const REPORT_CHILDREN: NavChild[] = [
  { label: "Overview", path: "header-1", isHeader: true },
  { label: "Smart Insights", path: "/reports/smart" },
  { label: "Daily Reports", path: "/reports/daily" },
  { label: "Day Book", path: "/reports/daybook" },

  { label: "Sales & Revenue", path: "header-2", isHeader: true },
  { label: "Sales Reports", path: "/reports/sales" },
  { label: "Order Reports", path: "/reports/orders" },
  { label: "Sales Returns", path: "/reports/sales-returns" },
  { label: "Collections", path: "/reports/payment" },
  { label: "Outstanding", path: "/reports/outstanding" },
  { label: "Risk Engine", path: "/reports/risk-engine" },
  { label: "Customer Analysis", path: "/reports/customers" },

  { label: "Purchases", path: "header-3", isHeader: true },
  { label: "Purchase Reports", path: "/reports/purchase" },
  { label: "Purchase Returns", path: "/reports/purchase-returns" },
  { label: "Vendor Analysis", path: "/reports/vendors" },

  { label: "Inventory", path: "header-4", isHeader: true },
  { label: "Product Reports", path: "/reports/product" },
  { label: "Stock Summary", path: "/reports/stock" },
  { label: "Stock Timeline", path: "/reports/inventory-timeline" },
  { label: "Price Changes", path: "/reports/price-changes" },

  { label: "Financial", path: "header-5", isHeader: true },
  { label: "Profit & Loss", path: "/reports/pnl" },
  { label: "Item-wise P&L", path: "/reports/item-pnl" },
  { label: "Cash Flow", path: "/reports/cashflow" },

  { label: "Operations", path: "header-6", isHeader: true },
  { label: "Agent Performance", path: "/reports/agent" },
];;

content = content.replace(/const REPORT_CHILDREN: NavChild\[\] = \[([\s\S]*?)\];/, newChildrenStr);

// 3. Update the item.children!.map((child) => {
const oldMap = {item.children!.map((child) => {
                  const childActive = location.pathname === child.path;;
const newMap = {item.children!.map((child) => {
                  if (child.isHeader) {
                    return (
                      <div key={child.label} className="mt-3 mb-1 px-3 text-[9px] font-bold uppercase tracking-wider text-sidebar-muted">
                        {child.label}
                      </div>
                    );
                  }
                  const childActive = location.pathname === child.path;;

content = content.replace(oldMap, newMap);

fs.writeFileSync(sidebarPath, content);
console.log("AppSidebar.tsx updated dynamically.");
