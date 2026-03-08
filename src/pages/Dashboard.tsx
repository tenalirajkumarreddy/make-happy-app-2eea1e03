import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  DollarSign,
  Users,
  Store,
  ShoppingCart,
  TrendingUp,
  Banknote,
  Smartphone,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const salesData = [
  { day: "Mon", sales: 12400 },
  { day: "Tue", sales: 18200 },
  { day: "Wed", sales: 15600 },
  { day: "Thu", sales: 22100 },
  { day: "Fri", sales: 19800 },
  { day: "Sat", sales: 24500 },
  { day: "Sun", sales: 8900 },
];

const revenueData = [
  { month: "Jan", revenue: 185000 },
  { month: "Feb", revenue: 210000 },
  { month: "Mar", revenue: 195000 },
  { month: "Apr", revenue: 240000 },
  { month: "May", revenue: 268000 },
  { month: "Jun", revenue: 295000 },
];

const storeTypeData = [
  { name: "Retail", value: 45, color: "hsl(217, 91%, 50%)" },
  { name: "Wholesale", value: 28, color: "hsl(142, 72%, 42%)" },
  { name: "Restaurant", value: 18, color: "hsl(38, 92%, 50%)" },
  { name: "POS", value: 9, color: "hsl(280, 65%, 60%)" },
];

const recentOrders = [
  { id: "ORD-012345", store: "Tea Stall - MG Road", amount: "₹1,200", status: "Pending" },
  { id: "ORD-012346", store: "Bakery - Jayanagar", amount: "₹3,450", status: "Delivered" },
  { id: "ORD-012347", store: "Restaurant - Koramangala", amount: "₹8,900", status: "Pending" },
  { id: "ORD-012348", store: "Shop - BTM Layout", amount: "₹2,100", status: "Cancelled" },
];

const Dashboard = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle="Welcome back! Here's your business overview." />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sales (Today)"
          value="₹1,21,500"
          change="+12.5% from yesterday"
          changeType="positive"
          icon={DollarSign}
          iconColor="bg-primary"
        />
        <StatCard
          title="Cash Collected"
          value="₹78,200"
          change="+8.3% from yesterday"
          changeType="positive"
          icon={Banknote}
          iconColor="bg-success"
        />
        <StatCard
          title="UPI Collected"
          value="₹43,300"
          change="+18.1% from yesterday"
          changeType="positive"
          icon={Smartphone}
          iconColor="bg-info"
        />
        <StatCard
          title="Pending Outstanding"
          value="₹4,52,000"
          change="23 stores overdue"
          changeType="negative"
          icon={Clock}
          iconColor="bg-warning"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Active Customers" value="342" icon={Users} />
        <StatCard title="Active Stores" value="487" icon={Store} />
        <StatCard title="Pending Orders" value="23" icon={ShoppingCart} />
        <StatCard title="Route Coverage" value="78%" icon={TrendingUp} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly Sales */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Weekly Sales</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0, 0%, 100%)",
                  border: "1px solid hsl(220, 13%, 91%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="sales" fill="hsl(217, 91%, 50%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Store Types */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Sales by Store Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={storeTypeData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {storeTypeData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {storeTypeData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Trend + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(217, 91%, 50%)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "hsl(217, 91%, 50%)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{order.store}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{order.amount}</p>
                  <p className={`text-xs font-medium ${
                    order.status === "Delivered" ? "text-success" :
                    order.status === "Cancelled" ? "text-destructive" :
                    "text-warning"
                  }`}>
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
