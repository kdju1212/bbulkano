"use client";

// 대시보드 — KPI 카드 + 기간별 추이 (로그인 시 실제 GA4 데이터, 비로그인 시 목데이터)

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { getDailySeries } from "@/lib/mock-data";
import { useGa4Report } from "@/lib/use-ga4";
import type { DailyRow, Totals } from "@/lib/ga4";
import { KpiCard } from "@/components/kpi-card";
import { TrendChart } from "@/components/charts";

type Overview = { daily: DailyRow[]; totals: Totals; prevTotals: Totals };

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

function buildKpis(totals: Totals, prev: Totals) {
  const curCvr = totals.sessions ? (totals.conversions / totals.sessions) * 100 : 0;
  const prevCvr = prev.sessions ? (prev.conversions / prev.sessions) * 100 : 0;
  return [
    { label: "Users", value: formatNumber(totals.users), changePct: pctChange(totals.users, prev.users) },
    { label: "Sessions", value: formatNumber(totals.sessions), changePct: pctChange(totals.sessions, prev.sessions) },
    { label: "Event Count", value: formatNumber(totals.eventCount), changePct: pctChange(totals.eventCount, prev.eventCount) },
    { label: "Conversions", value: formatNumber(totals.conversions), changePct: pctChange(totals.conversions, prev.conversions) },
    { label: "Conversion Rate", value: `${curCvr.toFixed(2)}%`, changePct: pctChange(curCvr, prevCvr) },
  ];
}

export default function DashboardPage() {
  const { propertyId, rangeDays } = useDashboard();
  const { data, loading, error, isReal } = useGa4Report<Overview>("overview");

  const { kpis, chartData } = useMemo(() => {
    if (data) {
      return {
        kpis: buildKpis(data.totals, data.prevTotals),
        chartData: data.daily.map((d) => ({ ...d, date: d.date.slice(5) })),
      };
    }
    // 목데이터 폴백
    const series = getDailySeries(propertyId);
    const current = series.slice(-rangeDays);
    const previous = series.slice(-rangeDays * 2, -rangeDays);
    const totals: Totals = {
      users: sum(current, "users"),
      sessions: sum(current, "sessions"),
      eventCount: sum(current, "eventCount"),
      conversions: sum(current, "conversions"),
    };
    const prevTotals: Totals = {
      users: sum(previous, "users"),
      sessions: sum(previous, "sessions"),
      eventCount: sum(previous, "eventCount"),
      conversions: sum(previous, "conversions"),
    };
    return {
      kpis: buildKpis(totals, prevTotals),
      chartData: current.map((d) => ({ ...d, date: d.date.slice(5) })),
    };
  }, [data, propertyId, rangeDays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">대시보드</h1>
        <p className="text-sm text-zinc-500">
          최근 {rangeDays}일 · 이전 기간 대비 {isReal ? "(실제 GA4 데이터)" : "(목데이터 — 로그인하면 실데이터)"}
          {loading && " · 불러오는 중..."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

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
