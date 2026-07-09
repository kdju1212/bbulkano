"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRID = "rgba(128,128,128,0.15)";
const AXIS = { fontSize: 11, fill: "#71717a" };

export function TrendChart({
  data,
  lines,
}: {
  data: Array<Record<string, string | number>>;
  lines: Array<{ key: string; label: string; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChannelBarChart({
  data,
  bars,
}: {
  data: Array<Record<string, string | number>>;
  bars: Array<{ key: string; label: string; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
