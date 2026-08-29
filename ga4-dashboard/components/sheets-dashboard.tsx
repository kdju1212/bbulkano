"use client";

// 구글시트 광고 대시보드 — 비공개 구글 시트(날짜/매체/캠페인/광고비/클릭/구매/매출)를 읽기 전용으로 조회한다.
// 로그인한 사람 본인의 구글 계정 권한으로만 시트를 읽는다 (저장/캐시 없음, 매번 최신값).

import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { TrendChart, ChannelBarChart } from "@/components/charts";
import {
  applyFilters,
  dateRange,
  groupByChannel,
  groupByCreative,
  groupByDate,
  summarize,
  uniqueValues,
  type CreativeMetric,
  type SheetRow,
} from "@/lib/sheets-dashboard";

type CreativeSortKey = "cost" | "revenue" | "roas" | "clicks" | "purchases";

function sortCreatives(rows: CreativeMetric[], key: CreativeSortKey, dir: "asc" | "desc"): CreativeMetric[] {
  const withValue = rows.map((r) => r[key]);
  // null(ROAS 계산 불가 등)은 정렬 방향과 상관없이 항상 맨 뒤로 보낸다.
  const numeric = rows.filter((_, i) => withValue[i] !== null);
  const nulls = rows.filter((_, i) => withValue[i] === null);
  numeric.sort((a, b) => {
    const av = a[key] as number;
    const bv = b[key] as number;
    return dir === "asc" ? av - bv : bv - av;
  });
  return [...numeric, ...nulls];
}

const selectClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function SheetsDashboard() {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [channel, setChannel] = useState("");
  const [campaign, setCampaign] = useState("");
  const [adSet, setAdSet] = useState("");
  const [creative, setCreative] = useState("");
  const [productLine, setProductLine] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [creativeSortKey, setCreativeSortKey] = useState<CreativeSortKey>("cost");
  const [creativeSortDir, setCreativeSortDir] = useState<"asc" | "desc">("desc");

  function toggleCreativeSort(key: CreativeSortKey) {
    if (key === creativeSortKey) {
      setCreativeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCreativeSortKey(key);
      setCreativeSortDir("desc");
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets-dashboard", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `조회 실패 (HTTP ${res.status})`);
        setRows([]);
      } else {
        setRows(body.rows ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const bounds = useMemo(() => dateRange(rows), [rows]);

  // 시트 데이터가 (재)조회되면 날짜 필터를 실제 데이터의 시작~끝으로 맞춘다. 사용자가 직접 날짜를
  // 고른 뒤에는(dateTouched) 새로고침해도 그 선택을 덮어쓰지 않는다.
  useEffect(() => {
    if (bounds && !dateTouched) {
      setStartDate(bounds.min);
      setEndDate(bounds.max);
    }
  }, [bounds, dateTouched]);

  const filtered = useMemo(
    () =>
      applyFilters(rows, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        channels: channel ? [channel] : undefined,
        campaigns: campaign ? [campaign] : undefined,
        adSets: adSet ? [adSet] : undefined,
        creatives: creative ? [creative] : undefined,
        productLines: productLine ? [productLine] : undefined,
      }),
    [rows, startDate, endDate, channel, campaign, adSet, creative, productLine],
  );

  const summary = useMemo(() => summarize(filtered), [filtered]);
  const daily = useMemo(() => groupByDate(filtered), [filtered]);
  const byChannel = useMemo(() => groupByChannel(filtered), [filtered]);
  const byCreative = useMemo(() => groupByCreative(filtered), [filtered]);
  const sortedCreatives = useMemo(
    () => sortCreatives(byCreative, creativeSortKey, creativeSortDir),
    [byCreative, creativeSortKey, creativeSortDir],
  );
  const channels = useMemo(() => uniqueValues(rows, "channel"), [rows]);
  const campaigns = useMemo(() => uniqueValues(rows, "campaign"), [rows]);
  const adSets = useMemo(() => uniqueValues(rows, "adSet"), [rows]);
  const creatives = useMemo(() => uniqueValues(rows, "creative"), [rows]);
  const productLines = useMemo(() => uniqueValues(rows, "productLine"), [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">구글시트 광고 대시보드</h1>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {loading ? "새로고침 중..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {!error && rows.length === 0 && !loading && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          시트에서 조회된 데이터가 없습니다. 날짜 열이 채워진 행이 있는지, 시트 설정(SHEETS_SPREADSHEET_ID)이 맞는지
          확인해주세요.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">시작일</label>
              <input
                type="date"
                value={startDate}
                min={bounds?.min}
                max={bounds?.max}
                onChange={(e) => {
                  setDateTouched(true);
                  setStartDate(e.target.value);
                }}
                className={selectClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">종료일</label>
              <input
                type="date"
                value={endDate}
                min={bounds?.min}
                max={bounds?.max}
                onChange={(e) => {
                  setDateTouched(true);
                  setEndDate(e.target.value);
                }}
                className={selectClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">매체/타겟</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClass}>
                <option value="">전체</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">캠페인</label>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={selectClass}>
                <option value="">전체</option>
                {campaigns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {adSets.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">세트</label>
                <select value={adSet} onChange={(e) => setAdSet(e.target.value)} className={selectClass}>
                  <option value="">전체</option>
                  {adSets.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {creatives.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">소재</label>
                <select value={creative} onChange={(e) => setCreative(e.target.value)} className={selectClass}>
                  <option value="">전체</option>
                  {creatives.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {productLines.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">상품군</label>
                <select value={productLine} onChange={(e) => setProductLine(e.target.value)} className={selectClass}>
                  <option value="">전체</option>
                  {productLines.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(dateTouched || channel || campaign || adSet || creative || productLine) && (
              <button
                onClick={() => {
                  setDateTouched(false);
                  setChannel("");
                  setCampaign("");
                  setAdSet("");
                  setCreative("");
                  setProductLine("");
                }}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                필터 초기화
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="총 광고비" value={`${fmtInt(summary.totalCost)}원`} changePct={null} />
            <KpiCard label="총 매출" value={`${fmtInt(summary.totalRevenue)}원`} changePct={null} />
            <KpiCard label="ROAS" value={summary.roas !== null ? fmtPct(summary.roas) : "–"} changePct={null} />
            <KpiCard label="CPC" value={summary.cpc !== null ? `${fmtInt(summary.cpc)}원` : "–"} changePct={null} />
            <KpiCard label="CPA" value={summary.cpa !== null ? `${fmtInt(summary.cpa)}원` : "–"} changePct={null} />
            <KpiCard label="CTR" value={summary.ctr !== null ? fmtPct(summary.ctr) : "노출수 없음"} changePct={null} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-2 text-sm font-semibold">날짜별 광고비·매출</h2>
              <TrendChart
                data={daily}
                lines={[
                  { key: "cost", label: "광고비", color: "#3b82f6" },
                  { key: "revenue", label: "매출", color: "#10b981" },
                ]}
              />
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-2 text-sm font-semibold">날짜별 ROAS(%)</h2>
              <TrendChart data={daily} lines={[{ key: "roas", label: "ROAS", color: "#f59e0b" }]} />
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold">매체/타겟별 광고비·매출</h2>
              <ChannelBarChart
                data={byChannel.map((c) => ({ name: c.channel, cost: c.cost, revenue: c.revenue }))}
                bars={[
                  { key: "cost", label: "광고비", color: "#3b82f6" },
                  { key: "revenue", label: "매출", color: "#10b981" },
                ]}
              />
            </div>
          </div>

          {byCreative.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-2 text-sm font-semibold">소재별 성과</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                      <th className="py-2 pr-4 font-medium">소재</th>
                      {(
                        [
                          { key: "cost", label: "광고비" },
                          { key: "revenue", label: "매출" },
                          { key: "roas", label: "ROAS" },
                          { key: "clicks", label: "클릭" },
                          { key: "purchases", label: "구매" },
                        ] as const
                      ).map((col) => (
                        <th key={col.key} className="py-2 pr-4 font-medium">
                          <button
                            onClick={() => toggleCreativeSort(col.key)}
                            className="flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200"
                          >
                            {col.label}
                            {creativeSortKey === col.key && (
                              <span className="text-blue-600 dark:text-blue-400">
                                {creativeSortDir === "desc" ? "▼" : "▲"}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCreatives.map((c) => (
                      <tr key={c.creative} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                        <td className="py-2 pr-4">{c.creative}</td>
                        <td className="py-2 pr-4 tabular-nums">{fmtInt(c.cost)}원</td>
                        <td className="py-2 pr-4 tabular-nums">{fmtInt(c.revenue)}원</td>
                        <td className="py-2 pr-4 tabular-nums">{c.roas !== null ? fmtPct(c.roas) : "–"}</td>
                        <td className="py-2 pr-4 tabular-nums">{fmtInt(c.clicks)}</td>
                        <td className="py-2 pr-4 tabular-nums">{fmtInt(c.purchases)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
