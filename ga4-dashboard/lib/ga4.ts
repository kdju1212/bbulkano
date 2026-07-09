// GA4 Data API v1beta 서버 사이드 호출 유틸.
// "conversions" 지표는 최신 API에서 "keyEvents"로 대체되었으므로
// keyEvents를 먼저 시도하고 실패하면 conversions로 재시도한다.

export type Totals = {
  users: number;
  sessions: number;
  eventCount: number;
  conversions: number;
};

export type DailyRow = Totals & { date: string };

export type ChannelRow = {
  source: string;
  medium: string;
  campaign: string;
  users: number;
  sessions: number;
  conversions: number;
};

export type EventRow = {
  eventName: string;
  eventCount: number;
  users: number;
  prevEventCount: number;
};

export const TRACKED_EVENTS = ["page_view", "view_item", "add_to_cart", "purchase", "sign_up"];

type ApiRow = {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
};

type ReportBody = Record<string, unknown>;

let keyEventMetric: "keyEvents" | "conversions" = "keyEvents";

async function runReport(accessToken: string, propertyId: string, body: ReportBody): Promise<ApiRow[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return (data.rows ?? []) as ApiRow[];
}

/** keyEvents → conversions 폴백을 적용해 runReport를 실행한다. */
async function runReportWithFallback(
  accessToken: string,
  propertyId: string,
  makeBody: (conversionMetric: string) => ReportBody,
): Promise<ApiRow[]> {
  try {
    return await runReport(accessToken, propertyId, makeBody(keyEventMetric));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (keyEventMetric === "keyEvents" && message.includes("keyEvents")) {
      keyEventMetric = "conversions";
      return runReport(accessToken, propertyId, makeBody(keyEventMetric));
    }
    throw error;
  }
}

function num(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const BASE_METRICS = ["totalUsers", "sessions", "eventCount"];

function parseTotals(row: ApiRow | undefined): Totals {
  const m = row?.metricValues ?? [];
  return {
    users: num(m[0]?.value),
    sessions: num(m[1]?.value),
    eventCount: num(m[2]?.value),
    conversions: num(m[3]?.value),
  };
}

export async function fetchOverview(
  accessToken: string,
  propertyId: string,
  dates: { startDate: string; endDate: string; prevStartDate: string; prevEndDate: string },
): Promise<{ daily: DailyRow[]; totals: Totals; prevTotals: Totals }> {
  // 1) 일별 추이 (현재 기간)
  const dailyRows = await runReportWithFallback(accessToken, propertyId, (cv) => ({
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "date" }],
    metrics: [...BASE_METRICS, cv].map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 400,
  }));
  const daily: DailyRow[] = dailyRows.map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
    return {
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      ...parseTotals(row),
    };
  });

  // 2) 현재/이전 기간 합계 (dateRange 2개 → 마지막 차원이 date_range_N)
  const totalRows = await runReportWithFallback(accessToken, propertyId, (cv) => ({
    dateRanges: [
      { startDate: dates.startDate, endDate: dates.endDate, name: "current" },
      { startDate: dates.prevStartDate, endDate: dates.prevEndDate, name: "previous" },
    ],
    metrics: [...BASE_METRICS, cv].map((name) => ({ name })),
  }));
  let totals: Totals = { users: 0, sessions: 0, eventCount: 0, conversions: 0 };
  let prevTotals: Totals = { users: 0, sessions: 0, eventCount: 0, conversions: 0 };
  for (const row of totalRows) {
    const tag = row.dimensionValues?.[0]?.value ?? "";
    if (tag === "previous") prevTotals = parseTotals(row);
    else totals = parseTotals(row);
  }
  return { daily, totals, prevTotals };
}

export async function fetchChannels(
  accessToken: string,
  propertyId: string,
  dates: { startDate: string; endDate: string },
): Promise<ChannelRow[]> {
  const rows = await runReportWithFallback(accessToken, propertyId, (cv) => ({
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: ["totalUsers", "sessions", cv].map((name) => ({ name })),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
  }));
  return rows.map((row) => {
    const d = row.dimensionValues ?? [];
    const m = row.metricValues ?? [];
    return {
      source: d[0]?.value ?? "",
      medium: d[1]?.value ?? "",
      campaign: d[2]?.value ?? "",
      users: num(m[0]?.value),
      sessions: num(m[1]?.value),
      conversions: num(m[2]?.value),
    };
  });
}

export async function fetchEvents(
  accessToken: string,
  propertyId: string,
  dates: { startDate: string; endDate: string; prevStartDate: string; prevEndDate: string },
): Promise<EventRow[]> {
  const rows = await runReport(accessToken, propertyId, {
    dateRanges: [
      { startDate: dates.startDate, endDate: dates.endDate, name: "current" },
      { startDate: dates.prevStartDate, endDate: dates.prevEndDate, name: "previous" },
    ],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: TRACKED_EVENTS },
      },
    },
  });
  const byEvent = new Map<string, EventRow>();
  for (const name of TRACKED_EVENTS) {
    byEvent.set(name, { eventName: name, eventCount: 0, users: 0, prevEventCount: 0 });
  }
  for (const row of rows) {
    const d = row.dimensionValues ?? [];
    const eventName = d[0]?.value ?? "";
    const tag = d[1]?.value ?? "";
    const entry = byEvent.get(eventName);
    if (!entry) continue;
    const m = row.metricValues ?? [];
    if (tag === "previous") {
      entry.prevEventCount = num(m[0]?.value);
    } else {
      entry.eventCount = num(m[0]?.value);
      entry.users = num(m[1]?.value);
    }
  }
  return [...byEvent.values()];
}
