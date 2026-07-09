"use client";

// 유입 분석 — Source/Medium/Campaign별 성과 (STEP 1: 목데이터)

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { getChannelRows, getDailySeries } from "@/lib/mock-data";
import { ChannelBarChart, TrendChart } from "@/components/charts";

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function AcquisitionPage() {
  const { propertyId, rangeDays } = useDashboard();

  const { rows, barData, trendData } = useMemo(() => {
    const channelRows = getChannelRows(propertyId)
      .slice()
      .sort((a, b) => b.sessions - a.sessions);
    return {
      rows: channelRows,
      barData: channelRows.map((r) => ({
        name: `${r.source}/${r.medium}`,
        sessions: r.sessions,
        conversions: r.conversions,
      })),
      trendData: getDailySeries(propertyId)
        .slice(-rangeDays)
        .map((d) => ({ ...d, date: d.date.slice(5) })),
    };
  }, [propertyId, rangeDays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">유입 분석</h1>
        <p className="text-sm text-zinc-500">
          Source / Medium / Campaign · 최근 {rangeDays}일 (목데이터)
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">채널별 성과</h2>
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
            {rows.map((r) => {
              const cvr = r.sessions ? ((r.conversions / r.sessions) * 100).toFixed(2) : "0.00";
              return (
                <tr
                  key={`${r.source}/${r.medium}/${r.campaign}`}
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
