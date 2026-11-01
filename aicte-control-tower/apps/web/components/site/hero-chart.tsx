"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type HeroChartPoint = { label: string; count: number };

export function HeroChart({ data }: { data: HeroChartPoint[] }) {
  return (
    <div className="h-[84px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-600)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--brand-600)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tick={{ fontSize: 12, fill: "var(--muted)" }}
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--primary-200)", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--line)",
              boxShadow: "0 8px 24px rgba(42, 26, 110, 0.08)",
              fontSize: 12,
              color: "var(--ink)",
            }}
            labelStyle={{ color: "var(--muted)", fontSize: 12 }}
            formatter={(value) => [`${String(value ?? 0)} stages entered`, "Week"]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--brand-600)"
            strokeWidth={2.5}
            fill="url(#hero-area)"
            activeDot={{ r: 3, fill: "var(--brand-600)", stroke: "var(--surface)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
