"use client";

// 이벤트 분석 — 핵심 이벤트별 발생 수와 변화율 (로그인 시 실제 GA4 데이터)

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { getEventRows } from "@/lib/mock-data";
import { useGa4Report } from "@/lib/use-ga4";
import type { EventRow } from "@/lib/ga4";
import { ChannelBarChart } from "@/components/charts";

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function EventsPage() {
  const { propertyId, rangeDays } = useDashboard();
  const { data, loading, error, isReal } = useGa4Report<EventRow[]>("events");

  const { rows, barData } = useMemo(() => {
    const eventRows: EventRow[] = data ?? getEventRows(propertyId);
    return {
      rows: eventRows,
      barData: eventRows.map((r) => ({
        name: r.eventName,
        eventCount: r.eventCount,
        users: r.users,
      })),
    };
  }, [data, propertyId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">이벤트 분석</h1>
        <p className="text-sm text-zinc-500">
          핵심 이벤트 · 최근 {rangeDays}일 · 이전 기간 대비{" "}
          {isReal ? "(실제 GA4 데이터)" : "(목데이터 — 로그인하면 실데이터)"}
          {loading && " · 불러오는 중..."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold">이벤트별 발생 수</h2>
        <ChannelBarChart
          data={barData}
          bars={[
            { key: "eventCount", label: "Event Count", color: "#2563eb" },
            { key: "users", label: "Users", color: "#f59e0b" },
          ]}
        />
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-3 font-medium">Event Name</th>
              <th className="px-4 py-3 text-right font-medium">Event Count</th>
              <th className="px-4 py-3 text-right font-medium">Users</th>
              <th className="px-4 py-3 text-right font-medium">변화율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const change = r.prevEventCount
                ? ((r.eventCount - r.prevEventCount) / r.prevEventCount) * 100
                : null;
              const positive = change !== null && change >= 0;
              return (
                <tr
                  key={r.eventName}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] font-medium">{r.eventName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.eventCount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.users)}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      change === null ? "text-zinc-400" : positive ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {change === null ? "-" : `${positive ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
