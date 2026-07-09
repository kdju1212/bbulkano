"use client";

// 대시보드 — KPI 카드 + 기간별 추이 (STEP 1: 목데이터)

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { getDailySeries } from "@/lib/mock-data";
import { KpiCard } from "@/components/kpi-card";
import { TrendChart } from "@/components/charts";

function sum(rows: Array<Record<string, number | string>>, key: string): number {
  return rows.reduce((acc, r) => acc + (r[key] as number), 0);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function DashboardPage() {
  const { propertyId, rangeDays } = useDashboard();

  const { kpis, chartData } = useMemo(() => {
    const series = getDailySeries(propertyId);
    const current = series.slice(-rangeDays);
    const previous = series.slice(-rangeDays * 2, -rangeDays);

    const cur = {
      users: sum(current, "users"),
      sessions: sum(current, "sessions"),
      eventCount: sum(current, "eventCount"),
      conversions: sum(current, "conversions"),
    };
    const prev = {
      users: sum(previous, "users"),
      sessions: sum(previous, "sessions"),
      eventCount: sum(previous, "eventCount"),
      conversions: sum(previous, "conversions"),
    };
    const curCvr = cur.sessions ? (cur.conversions / cur.sessions) * 100 : 0;
    const prevCvr = prev.sessions ? (prev.conversions / prev.sessions) * 100 : 0;

    return {
      kpis: [
        { label: "Users", value: formatNumber(cur.users), changePct: pctChange(cur.users, prev.users) },
        { label: "Sessions", value: formatNumber(cur.sessions), changePct: pctChange(cur.sessions, prev.sessions) },
        { label: "Event Count", value: formatNumber(cur.eventCount), changePct: pctChange(cur.eventCount, prev.eventCount) },
        { label: "Conversions", value: formatNumber(cur.conversions), changePct: pctChange(cur.conversions, prev.conversions) },
        { label: "Conversion Rate", value: `${curCvr.toFixed(2)}%`, changePct: pctChange(curCvr, prevCvr) },
      ],
      chartData: current.map((d) => ({ ...d, date: d.date.slice(5) })),
    };
  }, [propertyId, rangeDays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">대시보드</h1>
        <p className="text-sm text-zinc-500">최근 {rangeDays}일 · 이전 기간 대비 (목데이터)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">Users · Sessions 추이</h2>
        <TrendChart
          data={chartData}
          lines={[
            { key: "users", label: "Users", color: "#2563eb" },
            { key: "sessions", label: "Sessions", color: "#a855f7" },
          ]}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">Conversions 추이</h2>
        <TrendChart
          data={chartData}
          lines={[{ key: "conversions", label: "Conversions", color: "#059669" }]}
        />
      </section>
    </div>
  );
}
