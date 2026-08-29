// 구글시트 광고 대시보드 — 비공개 구글 시트를 읽기 전용으로 조회한다.
// 로그인한 사람의 OAuth 액세스 토큰(spreadsheets.readonly 스코프)으로 매 요청마다 그때그때 값을 가져온다.
// 저장/캐시 없음 — 시트가 바뀌면 다음 조회에 바로 반영된다. 서버는 어떤 쓰기 API도 호출하지 않는다.

export type SheetRow = {
  date: string; // "YYYY-MM-DD"로 정규화. 파싱 실패 시 원본 문자열 그대로.
  channel: string;
  campaign: string;
  cost: number;
  clicks: number;
  purchases: number;
  revenue: number;
  impressions: number | null; // 노출수 열이 있으면 채워짐 (CTR 계산용, 없으면 null)
};

export type SheetsFetchResult =
  | { status: "ok"; rows: SheetRow[] }
  | { status: "no_access"; message: string } // 이 계정은 시트 접근 권한이 없음 (구글이 막음)
  | { status: "not_configured"; message: string } // SHEETS_SPREADSHEET_ID 등 환경변수 미설정
  | { status: "error"; message: string };

const HEADER_ALIASES: Record<keyof Omit<SheetRow, "date" | "impressions"> | "date" | "impressions", string[]> = {
  date: ["날짜", "date", "일자"],
  channel: ["매체", "채널", "channel", "medium", "source"],
  campaign: ["캠페인", "campaign"],
  cost: ["광고비", "비용", "cost", "spend", "ad cost", "광고비용"],
  clicks: ["클릭", "클릭수", "click", "clicks"],
  purchases: ["구매", "전환", "구매수", "purchase", "conversion", "conversions"],
  revenue: ["매출", "매출액", "revenue", "sales"],
  impressions: ["노출", "노출수", "impression", "impressions"],
};

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function matchColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);
  return normalized.findIndex((h) => normalizedAliases.some((a) => h === a || h.includes(a)));
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,₩원\s]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// 시트 셀에 표시되는 날짜 형식은 사용자마다 달라서(2024-01-15 / 2024.1.15 / 2024/1/15 등)
// 최대한 관대하게 파싱하고, 못 알아보면 원본 문자열을 그대로 둔다 (정렬/그룹핑만 부정확해질 뿐 값은 안 잃는다).
function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return trimmed;
}

export function parseSheetValues(values: string[][]): SheetRow[] {
  if (values.length === 0) return [];
  const headers = values[0];
  const col = {
    date: matchColumn(headers, HEADER_ALIASES.date),
    channel: matchColumn(headers, HEADER_ALIASES.channel),
    campaign: matchColumn(headers, HEADER_ALIASES.campaign),
    cost: matchColumn(headers, HEADER_ALIASES.cost),
    clicks: matchColumn(headers, HEADER_ALIASES.clicks),
    purchases: matchColumn(headers, HEADER_ALIASES.purchases),
    revenue: matchColumn(headers, HEADER_ALIASES.revenue),
    impressions: matchColumn(headers, HEADER_ALIASES.impressions),
  };

  const rows: SheetRow[] = [];
  for (const line of values.slice(1)) {
    if (line.every((c) => !c || !c.trim())) continue; // 빈 줄 건너뜀
    const rawDate = col.date >= 0 ? (line[col.date] ?? "") : "";
    if (!rawDate.trim()) continue;
    rows.push({
      date: normalizeDate(rawDate),
      channel: col.channel >= 0 ? (line[col.channel] ?? "").trim() : "",
      campaign: col.campaign >= 0 ? (line[col.campaign] ?? "").trim() : "",
      cost: parseNumber(col.cost >= 0 ? line[col.cost] : undefined),
      clicks: parseNumber(col.clicks >= 0 ? line[col.clicks] : undefined),
      purchases: parseNumber(col.purchases >= 0 ? line[col.purchases] : undefined),
      revenue: parseNumber(col.revenue >= 0 ? line[col.revenue] : undefined),
      impressions: col.impressions >= 0 ? parseNumber(line[col.impressions]) : null,
    });
  }
  return rows;
}

export async function fetchSheetRows(accessToken: string): Promise<SheetsFetchResult> {
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return { status: "not_configured", message: "SHEETS_SPREADSHEET_ID 환경변수가 설정되지 않았습니다." };
  }
  const range = process.env.SHEETS_RANGE || "A:Z";

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 403 || res.status === 404) {
    return {
      status: "no_access",
      message: "이 구글 계정은 해당 시트에 접근 권한이 없습니다. (시트 소유자에게 공유 요청 필요)",
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { status: "error", message: `Sheets API 오류 (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }

  const data = await res.json();
  const values: string[][] = data.values ?? [];
  return { status: "ok", rows: parseSheetValues(values) };
}

export type DashboardFilters = {
  startDate?: string;
  endDate?: string;
  channels?: string[];
  campaigns?: string[];
};

export function applyFilters(rows: SheetRow[], filters: DashboardFilters): SheetRow[] {
  return rows.filter((r) => {
    if (filters.startDate && r.date < filters.startDate) return false;
    if (filters.endDate && r.date > filters.endDate) return false;
    if (filters.channels?.length && !filters.channels.includes(r.channel)) return false;
    if (filters.campaigns?.length && !filters.campaigns.includes(r.campaign)) return false;
    return true;
  });
}

export type DashboardSummary = {
  totalCost: number;
  totalRevenue: number;
  totalClicks: number;
  totalPurchases: number;
  totalImpressions: number | null;
  roas: number | null; // 매출 / 광고비 (%)
  cpc: number | null; // 광고비 / 클릭
  cpa: number | null; // 광고비 / 구매
  ctr: number | null; // 클릭 / 노출 (%) — 노출수 열이 없으면 null
};

export function summarize(rows: SheetRow[]): DashboardSummary {
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalPurchases = rows.reduce((s, r) => s + r.purchases, 0);
  const hasImpressions = rows.some((r) => r.impressions !== null);
  const totalImpressions = hasImpressions ? rows.reduce((s, r) => s + (r.impressions ?? 0), 0) : null;

  return {
    totalCost,
    totalRevenue,
    totalClicks,
    totalPurchases,
    totalImpressions,
    roas: totalCost > 0 ? (totalRevenue / totalCost) * 100 : null,
    cpc: totalClicks > 0 ? totalCost / totalClicks : null,
    cpa: totalPurchases > 0 ? totalCost / totalPurchases : null,
    ctr: totalImpressions && totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
  };
}

export type DailyMetric = { date: string; cost: number; revenue: number; roas: number };

export function groupByDate(rows: SheetRow[]): DailyMetric[] {
  const byDate = new Map<string, { cost: number; revenue: number }>();
  for (const r of rows) {
    const cur = byDate.get(r.date) ?? { cost: 0, revenue: 0 };
    cur.cost += r.cost;
    cur.revenue += r.revenue;
    byDate.set(r.date, cur);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, cost: v.cost, revenue: v.revenue, roas: v.cost > 0 ? (v.revenue / v.cost) * 100 : 0 }));
}

export type ChannelMetric = { channel: string; cost: number; revenue: number };

export function groupByChannel(rows: SheetRow[]): ChannelMetric[] {
  const byChannel = new Map<string, { cost: number; revenue: number }>();
  for (const r of rows) {
    const key = r.channel || "(미지정)";
    const cur = byChannel.get(key) ?? { cost: 0, revenue: 0 };
    cur.cost += r.cost;
    cur.revenue += r.revenue;
    byChannel.set(key, cur);
  }
  return [...byChannel.entries()]
    .sort(([, a], [, b]) => b.cost - a.cost)
    .map(([channel, v]) => ({ channel, cost: v.cost, revenue: v.revenue }));
}

export function uniqueValues(rows: SheetRow[], key: "channel" | "campaign"): string[] {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
}
