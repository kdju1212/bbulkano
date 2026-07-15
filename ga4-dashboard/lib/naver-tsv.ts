// 네이버 대량관리 "대용량 다운로드" TSV 파싱 · 자동 분류 · 소재 리스트 조인 로직.
// 캠페인/광고그룹/소재(단일형·반응형)/애셋/애셋링크 TSV를 업로드하면
// ID(cmp-/grp-/nad-/ast-)를 기준으로 조인해 평평한 소재 리스트를 만든다.

export type TsvType =
  | "campaign"
  | "group"
  | "single"
  | "responsive"
  | "asset"
  | "assetlink"
  | "keyword"
  | "unknown";

export type FileType = "campaign" | "group" | "single" | "responsive" | "asset" | "assetlink";

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  campaign: "캠페인 마스터",
  group: "광고그룹 마스터",
  single: "파워링크 단일형 소재 마스터",
  responsive: "파워링크 반응형 소재 마스터",
  asset: "파워링크 애셋 마스터",
  assetlink: "파워링크 반응형 소재연결 마스터",
};

export type CampaignInfo = { name: string; onoff: string; regDate: string };
export type GroupInfo = { name: string; cmpId: string; onoff: string; regDate: string };
export type AssetLinkInfo = { titles: string[]; descs: string[] };

export type AdRow = {
  type: "single" | "responsive";
  cmpName: string;
  cmpId: string;
  cmpOnoff: string;
  grpName: string;
  grpId: string;
  grpOnoff: string;
  nadId: string;
  adOnoff: string;
  titles: string[];
  descs: string[];
  pcUrlFull: string;
  pcUrlBase: string;
  pcUrlUtm: string;
  moUrlFull: string;
  moUrlBase: string;
  regDate: string;
};

export function parseTSV(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = clean.replace(/\r\n/g, "\n").trim();
  if (trimmed === "") return [];
  return trimmed.split("\n").map((l) => l.split("\t"));
}

/** 컬럼스펙 기반 분류: cmp-/grp-/nkw-/ast-/nad- 접두어 패턴으로 TSV 유형을 판별한다. */
export function classifyTSV(rows: string[][]): { type: TsvType; count: number } {
  const dataRows = rows.filter((r) => r.length > 2 && /^\d+$/.test((r[0] || "").trim()));
  if (dataRows.length === 0) return { type: "unknown", count: 0 };

  const sample = dataRows.slice(0, 20);
  const col = (r: string[], i: number) => (r[i] || "").trim();
  const mostlyStartsWith = (sampleRows: string[][], i: number, prefix: string) =>
    sampleRows.filter((r) => col(r, i).startsWith(prefix)).length >= sampleRows.length * 0.7;

  if (mostlyStartsWith(sample, 1, "cmp-")) return { type: "campaign", count: dataRows.length };
  if (mostlyStartsWith(sample, 1, "grp-") && mostlyStartsWith(sample, 2, "cmp-"))
    return { type: "group", count: dataRows.length };
  if (mostlyStartsWith(sample, 2, "nkw-")) return { type: "keyword", count: dataRows.length };
  if (mostlyStartsWith(sample, 2, "ast-") && mostlyStartsWith(sample, 3, "nad-"))
    return { type: "assetlink", count: dataRows.length };
  if (mostlyStartsWith(sample, 1, "ast-")) return { type: "asset", count: dataRows.length };
  if (mostlyStartsWith(sample, 2, "nad-")) {
    const avgCols = sample.reduce((s, r) => s + r.length, 0) / sample.length;
    return avgCols >= 10 ? { type: "single", count: dataRows.length } : { type: "responsive", count: dataRows.length };
  }
  return { type: "unknown", count: dataRows.length };
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function splitUrl(url: string | undefined): { base: string; utm: string } {
  if (!url) return { base: "", utm: "" };
  const q = url.indexOf("?");
  if (q === -1) return { base: url, utm: "" };
  const base = url.substring(0, q);
  const qs = url.substring(q + 1);
  const utmParts: string[] = [];
  const otherParts: string[] = [];
  qs.split("&").forEach((p) => {
    (UTM_KEYS.some((u) => p.startsWith(u)) ? utmParts : otherParts).push(p);
  });
  const cleanBase = otherParts.length ? `${base}?${otherParts.join("&")}` : base;
  return { base: cleanBase, utm: utmParts.join("&") };
}

export function appendUtm(url: string, utmStr: string): string {
  if (!utmStr) return url;
  return url.includes("?") ? `${url}&${utmStr}` : `${url}?${utmStr}`;
}

export function buildCampaignMap(rows: string[][]): Record<string, CampaignInfo> {
  const map: Record<string, CampaignInfo> = {};
  rows.forEach((r) => {
    if (r[1]?.startsWith("cmp-")) {
      map[r[1]] = { name: r[2] || r[1], onoff: r[10] === "0" ? "ON" : "OFF", regDate: fmtDate(r[8]) };
    }
  });
  return map;
}

export function buildGroupMap(rows: string[][]): Record<string, GroupInfo> {
  const map: Record<string, GroupInfo> = {};
  rows.forEach((r) => {
    if (r[1]?.startsWith("grp-")) {
      map[r[1]] = { name: r[3] || r[1], cmpId: r[2], onoff: r[5] === "0" ? "ON" : "OFF", regDate: fmtDate(r[12]) };
    }
  });
  return map;
}

export function buildAssetMap(rows: string[][]): Record<string, string> {
  const map: Record<string, string> = {};
  rows.forEach((r) => {
    if (r[1]?.startsWith("ast-")) {
      try {
        map[r[1]] = JSON.parse(r[4]).text || "";
      } catch {
        map[r[1]] = r[4] || "";
      }
    }
  });
  return map;
}

export function buildAssetLinkMap(rows: string[][], assetMap: Record<string, string>): Record<string, AssetLinkInfo> {
  const map: Record<string, AssetLinkInfo> = {};
  rows.forEach((r) => {
    const nadId = r[3];
    const astId = r[2];
    const linkType = parseInt(r[4], 10);
    if (!nadId || !astId) return;
    if (!map[nadId]) map[nadId] = { titles: [], descs: [] };
    const text = assetMap[astId];
    if (text !== undefined) {
      if (linkType === 1) map[nadId].titles.push(text);
      else map[nadId].descs.push(text);
    }
  });
  return map;
}

export function buildSingleRows(
  rows: string[][],
  campaignMap: Record<string, CampaignInfo>,
  groupMap: Record<string, GroupInfo>,
): AdRow[] {
  return rows
    .filter((r) => r[2]?.startsWith("nad-"))
    .map((r) => {
      const grpId = r[1];
      const nadId = r[2];
      const grp = groupMap[grpId] || { name: grpId, cmpId: "", onoff: "?", regDate: "" };
      const cmp = campaignMap[grp.cmpId] || { name: grp.cmpId, onoff: "?", regDate: "" };
      const pcSplit = splitUrl(r[6]);
      const moSplit = splitUrl(r[7]);
      return {
        type: "single" as const,
        cmpName: cmp.name,
        cmpId: grp.cmpId,
        cmpOnoff: cmp.onoff,
        grpName: grp.name,
        grpId,
        grpOnoff: grp.onoff,
        nadId,
        adOnoff: r[8] === "0" ? "ON" : "OFF",
        titles: r[4] ? [r[4]] : [],
        descs: r[5] ? [r[5]] : [],
        pcUrlFull: r[6] || "",
        pcUrlBase: pcSplit.base,
        pcUrlUtm: pcSplit.utm,
        moUrlFull: r[7] || "",
        moUrlBase: moSplit.base,
        regDate: fmtDate(r[9]),
      };
    });
}

export function buildResponsiveRows(
  rows: string[][],
  campaignMap: Record<string, CampaignInfo>,
  groupMap: Record<string, GroupInfo>,
  assetLinkMap: Record<string, AssetLinkInfo>,
): AdRow[] {
  return rows
    .filter((r) => r[2]?.startsWith("nad-"))
    .map((r) => {
      const grpId = r[1];
      const nadId = r[2];
      const grp = groupMap[grpId] || { name: grpId, cmpId: "", onoff: "?", regDate: "" };
      const cmp = campaignMap[grp.cmpId] || { name: grp.cmpId, onoff: "?", regDate: "" };
      const assets = assetLinkMap[nadId] || { titles: [], descs: [] };
      const pcSplit = splitUrl(r[4]);
      const moSplit = splitUrl(r[5]);
      return {
        type: "responsive" as const,
        cmpName: cmp.name,
        cmpId: grp.cmpId,
        cmpOnoff: cmp.onoff,
        grpName: grp.name,
        grpId,
        grpOnoff: grp.onoff,
        nadId,
        adOnoff: r[6] === "0" ? "ON" : "OFF",
        titles: assets.titles,
        descs: assets.descs,
        pcUrlFull: r[4] || "",
        pcUrlBase: pcSplit.base,
        pcUrlUtm: pcSplit.utm,
        moUrlFull: r[5] || "",
        moUrlBase: moSplit.base,
        regDate: fmtDate(r[7]),
      };
    });
}

// ── 성과 CSV 매핑 ──────────────────────────────────────────

export type PerfRaw = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  rankSum: number;
  rankCount: number;
};

export type PerfDerived = PerfRaw & { ctr: number; cpc: number; cvr: number; roas: number | null; rank: number | null };

export function calcPerfDerived(p: PerfRaw): PerfDerived {
  const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
  const cpc = p.clicks > 0 ? Math.round(p.cost / p.clicks) : 0;
  const cvr = p.clicks > 0 ? (p.conversions / p.clicks) * 100 : 0;
  const roas = p.cost > 0 ? (p.revenue / p.cost) * 100 : null;
  const rank = p.rankCount > 0 ? p.rankSum / p.rankCount : null;
  return { ...p, ctr, cpc, cvr, roas, rank };
}

export function fmtN(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return Math.round(v).toLocaleString("ko-KR");
}
