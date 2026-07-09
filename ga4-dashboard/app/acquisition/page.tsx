"use client";

// 유입 분석 — Source/Medium/Campaign별 성과 (로그인 시 실제 GA4 데이터)

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { getChannelRows, getDailySeries } from "@/lib/mock-data";
import { useGa4Report } from "@/lib/use-ga4";
import type { ChannelRow, DailyRow, Totals } from "@/lib/ga4";
import { ChannelBarChart, TrendChart } from "@/components/charts";

type Overview = { daily: DailyRow[]; totals: Totals; prevTotals: Totals };

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function AcquisitionPage() {
  const { propertyId, rangeDays } = useDashboard();
  const channels = useGa4Report<ChannelRow[]>("channels");
  const overview = useGa4Report<Overview>("overview");

  const { rows, barData, trendData } = useMemo(() => {
    const channelRows: ChannelRow[] = (channels.data ?? getChannelRows(propertyId))
      .slice()
      .sort((a, b) => b.sessions - a.sessions);
    const daily = overview.data
      ? overview.data.daily
      : getDailySeries(propertyId).slice(-rangeDays);
    return {
      rows: channelRows,
      barData: channelRows.slice(0, 10).map((r) => ({
        name: `${r.source}/${r.medium}`,
        sessions: r.sessions,
        conversions: r.conversions,
      })),
      trendData: daily.map((d) => ({ ...d, date: d.date.slice(5) })),
    };
  }, [channels.data, overview.data, propertyId, rangeDays]);

  const loading = channels.loading || overview.loading;
  const error = channels.error ?? overview.error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">유입 분석</h1>
        <p className="text-sm text-zinc-500">
          Source / Medium / Campaign · 최근 {rangeDays}일{" "}
          {channels.isReal ? "(실제 GA4 데이터)" : "(목데이터 — 로그인하면 실데이터)"}
          {loading && " · 불러오는 중..."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">채널별 성과 (상위 10)</h2>
        <ChannelBarChart
          data={barData}
          bars={[
            { key: "sessions", label: "Sessions", color: "#2563eb" },
            { key: "conversions", label: "Conversions", color: "#059669" },
          ]}
        />
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-3 font-medium">Source / Medium</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 text-right font-medium">Users</th>
              <th className="px-4 py-3 text-right font-medium">Sessions</th>
              <th className="px-4 py-3 text-right font-medium">Conversions</th>
              <th className="px-4 py-3 text-right font-medium">CVR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cvr = r.sessions ? ((r.conversions / r.sessions) * 100).toFixed(2) : "0.00";
              return (
                <tr
                  key={`${r.source}/${r.medium}/${r.campaign}/${i}`}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {r.source} <span className="text-zinc-400">/</span> {r.medium}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{r.campaign}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.users)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.sessions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.conversions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cvr}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">기간별 추이 (Sessions)</h2>
        <TrendChart
          data={trendData}
          lines={[{ key: "sessions", label: "Sessions", color: "#2563eb" }]}
        />
      </section>
    </div>
  );
}
