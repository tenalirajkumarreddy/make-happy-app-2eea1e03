import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardBarChartProps {
  data: Record<string, unknown>[];
  /** Horizontal (default) or vertical layout */
  layout?: "horizontal" | "vertical";
  /** Height in pixels */
  height?: number;
  /** Key for the value axis (default: "sales") */
  valueKey?: string;
  /** Key for the category axis (default: "day" or "name" based on layout) */
  categoryKey?: string;
  /** Radius for the bar corners [topLeft, topRight, bottomLeft, bottomRight] */
  radius?: [number, number, number, number];
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function DashboardBarChart({
  data,
  layout = "horizontal",
  height = 260,
  valueKey = "sales",
  categoryKey,
  radius = layout === "vertical" ? [0, 6, 6, 0] : [6, 6, 0, 0],
}: DashboardBarChartProps) {
  const isVertical = layout === "vertical";
  const catKey = categoryKey || (isVertical ? "name" : "day");

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={isVertical ? "vertical" : undefined}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        {isVertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis dataKey={catKey} type="category" tick={{ fontSize: 11 }} width={80} stroke="hsl(var(--muted-foreground))" />
          </>
        ) : (
          <>
            <XAxis dataKey={catKey} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={radius} />
      </BarChart>
    </ResponsiveContainer>
  );
}
