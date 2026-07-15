// 네이버 관리 — 입찰가 대량관리(키워드 매핑 & 성과 분석)가 사용하는 순수 로직.
// 성과 CSV(날짜별 키워드/소재 성과) + TSV(캠페인/광고그룹/키워드/쇼핑검색 ID)를 조인해
// 기간 A(기준) vs B(비교) 성과를 비교하고, 사람이 입찰가를 직접 정하도록 결과 CSV를 만든다.

export type AdType = "파워링크" | "쇼핑검색" | "브랜드검색" | "기타";

export const SHOPPING_TSV_COL = { GROUP_ID: 1, MATERIAL_ID: 2, BID: 7, NAME: 14, PRICE: 18 };
export const KEYWORD_TSV_COL = { GROUP_ID: 1, KEYWORD_ID: 2, KEYWORD: 3, BID: 4, ONOFF: 7 };
export const GROUP_TSV_COL = { GROUP_ID: 1, CAMP_ID: 2, NAME: 3, ONOFF: 5, TYPE: 15 };
export const CAMP_TSV_COL = { CAMP_ID: 1, NAME: 2, TYPE: 3, ONOFF: 10 };
export const TSV_PREFIX = { CAMP: "cmp-", GROUP: "grp-", KEYWORD: "nkw-", SHOPPING: "nad-" };

export const PAGE_SIZE = 30;

export const PERF_COL_ROLES = [
  "날짜",
  "캠페인명",
  "광고그룹명",
  "소재명",
  "키워드",
  "노출수",
  "클릭수",
  "비용",
  "전환수",
  "매출액",
  "평균노출순위",
] as const;
export type PerfColRole = (typeof PERF_COL_ROLES)[number];

export const PERF_COL_HINTS: Record<PerfColRole, string[]> = {
  날짜: ["날짜", "일자", "date", "기준일", "일별"],
  캠페인명: ["캠페인명", "캠페인"],
  광고그룹명: ["광고그룹명", "광고그룹", "adgroup"],
  소재명: ["소재명", "소재", "광고소재", "상품명", "제목", "title", "ad_name", "소재제목"],
  키워드: ["키워드", "keyword", "검색어", "키워드텍스트"],
  노출수: ["노출수", "노출", "impression"],
  클릭수: ["클릭수", "클릭", "click"],
  비용: ["비용", "총비용", "cost", "소진", "광고비", "총소진액"],
  전환수: ["전환수", "전환", "conversion"],
  매출액: ["매출액", "매출", "revenue", "전환매출액"],
  평균노출순위: ["평균노출순위", "순위", "노출순위", "rank", "평균순위"],
};

export const PERF_NUMERIC_ROLES: PerfColRole[] = ["노출수", "클릭수", "비용", "전환수", "매출액", "평균노출순위"];

export function autoMatchPerfColumn(role: PerfColRole, headers: string[]): string {
  const hints = PERF_COL_HINTS[role] ?? [];
  for (const hint of hints) {
    for (const col of headers) {
      const nc = col.toLowerCase().replace(/\s/g, "");
      const nh = hint.toLowerCase().replace(/\s/g, "");
      if (role === "캠페인명") {
        if (nc === nh) return col;
      } else if (nc.includes(nh)) {
        return col;
      }
    }
  }
  return "";
}

export function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[./]/g, "-");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const digits = s.replace(/-/g, "");
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return null;
}

export function parseNumber(raw: string | number | undefined): number {
  if (raw === null || raw === undefined) return 0;
  return parseFloat(String(raw).replace(/,/g, "").trim()) || 0;
}

export function diffDays(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function calcPctDelta(a: number, b: number): number | null {
  if (!b) return null;
  return +(((a - b) / Math.abs(b)) * 100).toFixed(1);
}

const KEY_SEP = "|||";

export function buildAggKey(camp: string, group: string, ident: string): string {
  return `${camp}${KEY_SEP}${group}${KEY_SEP}${ident}`;
}

export function parseAggKey(key: string): [string, string, string] {
  const [c, g, i] = key.split(KEY_SEP);
  return [c ?? "", g ?? "", i ?? ""];
}

export type Agg = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  rankSum: number;
  rankCount: number;
};

export function createEmptyAgg(): Agg {
  return { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, rankSum: 0, rankCount: 0 };
}

export type MappedPerfRow = {
  날짜: string;
  캠페인명: string;
  광고그룹명: string;
  소재명: string;
  키워드: string;
  노출수: number;
  클릭수: number;
  비용: number;
  전환수: number;
  매출액: number;
  평균노출순위: number;
  CPC: number;
  CTR: number;
  CVR: number;
  ROAS: number;
};

/** 원본 CSV 행(헤더→값 객체) + 컬럼 역할 매핑 → 정규화된 성과 행. 날짜가 없는 행은 제외한다. */
export function buildMappedPerfRows(
  rawRows: Record<string, string>[],
  mapping: Record<PerfColRole, string>,
): MappedPerfRow[] {
  const mapped: MappedPerfRow[] = [];
  for (const raw of rawRows) {
    const row: Record<string, string | number> = {};
    PERF_COL_ROLES.forEach((role) => {
      const srcCol = mapping[role];
      if (!srcCol) return;
      let value: string | number = raw[srcCol] ?? "";
      if (PERF_NUMERIC_ROLES.includes(role) && value === "") value = 0;
      row[role] = value;
    });
    const date = normalizeDate(row["날짜"] as string);
    if (!date) continue;
    row["날짜"] = date;
    PERF_NUMERIC_ROLES.forEach((role) => {
      if (role in row) row[role] = parseNumber(row[role]);
    });
    const cost = (row["비용"] as number) || 0;
    const clicks = (row["클릭수"] as number) || 0;
    const impressions = (row["노출수"] as number) || 0;
    const conversions = (row["전환수"] as number) || 0;
    const revenue = (row["매출액"] as number) || 0;
    row["CPC"] = clicks > 0 ? Math.round(cost / clicks) : 0;
    row["CTR"] = impressions > 0 ? +(((clicks / impressions) * 100).toFixed(2)) : 0;
    row["CVR"] = clicks > 0 ? +(((conversions / clicks) * 100).toFixed(2)) : 0;
    row["ROAS"] = cost > 0 ? +(((revenue / cost) * 100).toFixed(1)) : 0;
    mapped.push(row as unknown as MappedPerfRow);
  }
  return mapped;
}

// ── TSV ID 매핑 ──────────────────────────────────────────

export type TsvSlotType = "캠페인" | "광고그룹" | "키워드" | "쇼핑검색";
export const TSV_SLOT_TYPES: TsvSlotType[] = ["캠페인", "광고그룹", "키워드", "쇼핑검색"];

/** 두 번째 행부터 ID 접두사(cmp-/grp-/nkw-/nad-)로 TSV 종류를 판별한다. */
export function detectTsvType(rows: string[][]): TsvSlotType | null {
  if (!rows || rows.length < 2) return null;
  for (let i = 1; i < Math.min(rows.length, 6); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const col1 = String(row[1] || "");
    const col2 = String(row[2] || "");
    if (col1.startsWith(TSV_PREFIX.CAMP)) return "캠페인";
    if (col1.startsWith(TSV_PREFIX.GROUP)) {
      if (col2.startsWith(TSV_PREFIX.CAMP)) return "광고그룹";
      if (col2.startsWith(TSV_PREFIX.KEYWORD)) return "키워드";
      if (col2.startsWith(TSV_PREFIX.SHOPPING)) return "쇼핑검색";
    }
  }
  return null;
}

/** 광고그룹 TSV의 TYPE(index 15): 1=파워링크, 2=쇼핑검색, 5=브랜드검색, 그 외=기타 */
export function classifyByGroupType(rawType: string | undefined): AdType {
  const t = parseInt(String(rawType), 10);
  if (t === 1) return "파워링크";
  if (t === 2) return "쇼핑검색";
  if (t === 5) return "브랜드검색";
  return "기타";
}

export type BidMapEntry = { id: string; bid: number; price: number | null; productName: string; adType: AdType };

export type MappingRow = {
  캠페인명: string;
  캠페인ID: string;
  캠페인ON_OFF: string;
  광고그룹명: string;
  광고그룹ID: string;
  그룹ON_OFF: string;
  키워드: string;
  키워드ID: string;
  키워드ON_OFF: string;
  입찰가: number;
};

/** 캠페인·광고그룹은 필수, 키워드·쇼핑검색은 있는 것만 결합해 bidMap과 매핑 CSV용 행을 만든다. */
export function mergeTsvData(
  campRows: string[][] | null,
  groupRows: string[][] | null,
  kwRows: string[][] | null,
  shopRows: string[][] | null,
): { bidMap: Record<string, BidMapEntry>; mappingRows: MappingRow[]; kwCount: number; shopCount: number } | null {
  if (!campRows || !groupRows) return null;
  if (!kwRows && !shopRows) return null;

  const campNameByCampId: Record<string, string> = {};
  campRows.forEach((row) => {
    const campId = row[CAMP_TSV_COL.CAMP_ID] || "";
    if (campId.startsWith(TSV_PREFIX.CAMP)) campNameByCampId[campId] = row[CAMP_TSV_COL.NAME] || "";
  });

  const groupInfoByGroupId: Record<string, { groupName: string; campId: string; adType: AdType }> = {};
  groupRows.forEach((row) => {
    const groupId = row[GROUP_TSV_COL.GROUP_ID] || "";
    if (groupId.startsWith(TSV_PREFIX.GROUP)) {
      groupInfoByGroupId[groupId] = {
        groupName: row[GROUP_TSV_COL.NAME] || "",
        campId: row[GROUP_TSV_COL.CAMP_ID] || "",
        adType: classifyByGroupType(row[GROUP_TSV_COL.TYPE]),
      };
    }
  });
  const emptyGroupInfo = { groupName: "", campId: "", adType: "기타" as AdType };

  const bidMap: Record<string, BidMapEntry> = {};
  let kwCount = 0;
  let shopCount = 0;

  if (kwRows) {
    kwRows.forEach((row) => {
      const groupId = row[KEYWORD_TSV_COL.GROUP_ID] || "";
      const keywordId = row[KEYWORD_TSV_COL.KEYWORD_ID] || "";
      const keyword = row[KEYWORD_TSV_COL.KEYWORD] || "";
      const bid = parseInt(row[KEYWORD_TSV_COL.BID], 10) || 0;
      if (!keywordId.startsWith(TSV_PREFIX.KEYWORD)) return;
      const groupInfo = groupInfoByGroupId[groupId] || emptyGroupInfo;
      const campName = campNameByCampId[groupInfo.campId] || "";
      const aggKey = buildAggKey(campName, groupInfo.groupName, keyword);
      bidMap[aggKey] = { id: keywordId, bid, price: null, productName: "", adType: groupInfo.adType || "파워링크" };
      kwCount++;
    });
  }

  if (shopRows) {
    shopRows.forEach((row) => {
      const groupId = row[SHOPPING_TSV_COL.GROUP_ID] || "";
      const materialId = row[SHOPPING_TSV_COL.MATERIAL_ID] || "";
      const bid = parseInt(row[SHOPPING_TSV_COL.BID], 10) || 0;
      const productName = row[SHOPPING_TSV_COL.NAME] || "";
      const price = parseInt(row[SHOPPING_TSV_COL.PRICE], 10) || 0;
      if (!materialId.startsWith(TSV_PREFIX.SHOPPING)) return;
      const groupInfo = groupInfoByGroupId[groupId] || emptyGroupInfo;
      const campName = campNameByCampId[groupInfo.campId] || "";
      const aggKey = buildAggKey(campName, groupInfo.groupName, materialId);
      bidMap[aggKey] = { id: materialId, bid, price, productName, adType: groupInfo.adType || "쇼핑검색" };
      shopCount++;
    });
  }

  const onOff = (val: string | undefined) => (String(val) === "0" ? "ON" : String(val) === "1" ? "OFF" : "");
  const campOnOff: Record<string, string> = {};
  campRows.forEach((row) => {
    const id = row[CAMP_TSV_COL.CAMP_ID] || "";
    if (id.startsWith(TSV_PREFIX.CAMP)) campOnOff[id] = onOff(row[CAMP_TSV_COL.ONOFF]);
  });
  const groupOnOff: Record<string, string> = {};
  groupRows.forEach((row) => {
    const id = row[GROUP_TSV_COL.GROUP_ID] || "";
    if (id.startsWith(TSV_PREFIX.GROUP)) groupOnOff[id] = onOff(row[GROUP_TSV_COL.ONOFF]);
  });

  const mappingRows: MappingRow[] = [];
  if (kwRows) {
    kwRows.forEach((row) => {
      const groupId = row[KEYWORD_TSV_COL.GROUP_ID] || "";
      const keywordId = row[KEYWORD_TSV_COL.KEYWORD_ID] || "";
      const keyword = row[KEYWORD_TSV_COL.KEYWORD] || "";
      const bid = parseInt(row[KEYWORD_TSV_COL.BID], 10) || 0;
      const kwOnOff = onOff(row[KEYWORD_TSV_COL.ONOFF]);
      if (!keywordId.startsWith(TSV_PREFIX.KEYWORD)) return;
      const groupInfo = groupInfoByGroupId[groupId] || emptyGroupInfo;
      const campId = groupInfo.campId;
      mappingRows.push({
        캠페인명: campNameByCampId[campId] || "",
        캠페인ID: campId,
        캠페인ON_OFF: campOnOff[campId] || "",
        광고그룹명: groupInfo.groupName,
        광고그룹ID: groupId,
        그룹ON_OFF: groupOnOff[groupId] || "",
        키워드: keyword,
        키워드ID: keywordId,
        키워드ON_OFF: kwOnOff,
        입찰가: bid,
      });
    });
  }
  if (shopRows) {
    shopRows.forEach((row) => {
      const groupId = row[SHOPPING_TSV_COL.GROUP_ID] || "";
      const materialId = row[SHOPPING_TSV_COL.MATERIAL_ID] || "";
      const bid = parseInt(row[SHOPPING_TSV_COL.BID], 10) || 0;
      const shopOnOff = onOff(row[4]);
      if (!materialId.startsWith(TSV_PREFIX.SHOPPING)) return;
      const groupInfo = groupInfoByGroupId[groupId] || emptyGroupInfo;
      const campId = groupInfo.campId;
      mappingRows.push({
        캠페인명: campNameByCampId[campId] || "",
        캠페인ID: campId,
        캠페인ON_OFF: campOnOff[campId] || "",
        광고그룹명: groupInfo.groupName,
        광고그룹ID: groupId,
        그룹ON_OFF: groupOnOff[groupId] || "",
        키워드: row[SHOPPING_TSV_COL.NAME] || "",
        키워드ID: materialId,
        키워드ON_OFF: shopOnOff,
        입찰가: bid,
      });
    });
  }

  return { bidMap, mappingRows, kwCount, shopCount };
}

// ── 기간 집계 & 분석 ──────────────────────────────────────

export type DerivedMetrics = {
  imp: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpc: number;
  ctr: number;
  cvr: number;
  avgRank: number | null;
};

export function calcDerivedMetrics(agg: Agg): DerivedMetrics {
  const { impressions: imp, clicks, cost, conversions, revenue, rankSum, rankCount } = agg;
  return {
    imp,
    clicks,
    cost,
    conversions,
    revenue,
    roas: cost > 0 ? +(((revenue / cost) * 100).toFixed(1)) : 0,
    cpc: clicks > 0 ? Math.round(cost / clicks) : 0,
    ctr: imp > 0 ? +(((clicks / imp) * 100).toFixed(2)) : 0,
    cvr: clicks > 0 ? +(((conversions / clicks) * 100).toFixed(2)) : 0,
    avgRank: rankSum > 0 && rankCount > 0 ? +((rankSum / rankCount).toFixed(1)) : null,
  };
}

type IdentRole = "키워드" | "소재명";

/** 키워드/소재명 값을 각각 별개 항목으로 집계 (확장검색 "-" 접두 키워드는 제외). */
export function aggregateRows(rows: MappedPerfRow[]): Record<string, Agg & { __identRole: IdentRole }> {
  const aggByKey: Record<string, Agg & { __identRole: IdentRole }> = {};
  const accumulate = (row: MappedPerfRow, identifier: string, identRole: IdentRole) => {
    const key = buildAggKey(row.캠페인명 || "", row.광고그룹명 || "", identifier);
    if (!aggByKey[key]) aggByKey[key] = { ...createEmptyAgg(), __identRole: identRole };
    const agg = aggByKey[key];
    agg.impressions += row.노출수 || 0;
    agg.clicks += row.클릭수 || 0;
    agg.cost += row.비용 || 0;
    agg.conversions += row.전환수 || 0;
    agg.revenue += row.매출액 || 0;
    const rank = row.평균노출순위 || 0;
    if (rank > 0) {
      agg.rankSum += rank;
      agg.rankCount++;
    }
  };
  rows.forEach((row) => {
    const keyword = String(row.키워드 || "");
    if (keyword && !keyword.startsWith("-")) accumulate(row, keyword, "키워드");
    const material = String(row.소재명 || "");
    if (material) accumulate(row, material, "소재명");
  });
  return aggByKey;
}

export type ResultRow = {
  __adType: AdType;
  __ident: IdentRole;
  캠페인명: string;
  광고그룹명: string;
  소재명?: string;
  상품가격?: number | null;
  소재ID?: string;
  키워드ID?: string;
  키워드?: string;
  "수정할 금액": string;
  현재입찰금액: number;
  CPC_A: number;
  CPC_B: number;
  순위_A: number | null;
  순위_B: number | null;
  매출액_A: number;
  광고비_A: number;
  ROAS_A: number;
  매출액_B: number;
  광고비_B: number;
  ROAS_B: number;
  노출수_A: number;
  클릭수_A: number;
  전환수_A: number;
  CTR_A: number;
  CVR_A: number;
  노출수_B: number;
  클릭수_B: number;
  전환수_B: number;
  CTR_B: number;
  CVR_B: number;
};

export function buildResultRows(
  mappedRows: MappedPerfRow[],
  bidMap: Record<string, BidMapEntry> | null,
  periodAStart: string,
  periodAEnd: string,
  periodBStart: string,
  periodBEnd: string,
): { results: ResultRow[]; rowsA: MappedPerfRow[]; rowsB: MappedPerfRow[] } {
  const rowsA = mappedRows.filter((r) => r.날짜 >= periodAStart && r.날짜 <= periodAEnd);
  const rowsB =
    periodBStart && periodBEnd ? mappedRows.filter((r) => r.날짜 >= periodBStart && r.날짜 <= periodBEnd) : [];
  const aggA = aggregateRows(rowsA);
  const aggB = aggregateRows(rowsB);
  const allKeys = new Set([...Object.keys(aggA), ...Object.keys(aggB)]);
  const results: ResultRow[] = [];

  allKeys.forEach((key) => {
    const [campName, groupName, identifier] = parseAggKey(key);
    const aggItemA = aggA[key];
    const aggItemB = aggB[key];
    const metA = calcDerivedMetrics(aggItemA || createEmptyAgg());
    const metB = calcDerivedMetrics(aggItemB || createEmptyAgg());
    const identRole: IdentRole = aggItemA?.__identRole || aggItemB?.__identRole || "키워드";
    const isShoppingItem = identRole === "소재명";

    let adId = "";
    let bid = 0;
    let productPrice: number | null = null;
    let productName = "";
    let adType: AdType = "기타";
    if (bidMap && bidMap[key]) {
      const match = bidMap[key];
      adId = match.id;
      bid = match.bid;
      productPrice = match.price;
      productName = match.productName || "";
      adType = match.adType || "기타";
    }

    const row: ResultRow = {
      __adType: adType,
      __ident: identRole,
      캠페인명: campName,
      광고그룹명: groupName,
      "수정할 금액": "",
      현재입찰금액: bid,
      CPC_A: metA.cpc,
      CPC_B: metB.cpc,
      순위_A: metA.avgRank,
      순위_B: metB.avgRank,
      매출액_A: metA.revenue,
      광고비_A: metA.cost,
      ROAS_A: metA.roas,
      매출액_B: metB.revenue,
      광고비_B: metB.cost,
      ROAS_B: metB.roas,
      노출수_A: metA.imp,
      클릭수_A: metA.clicks,
      전환수_A: metA.conversions,
      CTR_A: metA.ctr,
      CVR_A: metA.cvr,
      노출수_B: metB.imp,
      클릭수_B: metB.clicks,
      전환수_B: metB.conversions,
      CTR_B: metB.ctr,
      CVR_B: metB.cvr,
    };
    if (isShoppingItem) {
      row.소재명 = productName || identifier;
      row.상품가격 = productPrice;
      row.소재ID = adId || identifier;
    } else {
      row.키워드ID = adId;
      row.키워드 = identifier;
    }
    results.push(row);
  });

  results.sort((a, b) => (b.매출액_A || 0) - (a.매출액_A || 0));
  return { results, rowsA, rowsB };
}

// ── 결과 테이블 컬럼 정의 ──────────────────────────────────

export type ColFmt = "str" | "id" | "int" | "pct" | "pct2" | "rank" | "empty";
export type ColDef = { key: string; label: string; isLeft: boolean; fmt: ColFmt };

/** 파워링크·브랜드검색: 키워드 기반 열 / 쇼핑검색: 소재 기반 열. */
export function buildColDefs(adType: AdType): ColDef[] {
  const isShopping = adType === "쇼핑검색";
  const cols: ColDef[] = [
    { key: "캠페인명", label: "캠페인명", isLeft: true, fmt: "str" },
    { key: "광고그룹명", label: "광고그룹명", isLeft: true, fmt: "str" },
  ];
  if (isShopping) {
    cols.push(
      { key: "소재명", label: "소재명", isLeft: true, fmt: "str" },
      { key: "상품가격", label: "상품가격", isLeft: false, fmt: "int" },
      { key: "소재ID", label: "소재ID", isLeft: true, fmt: "id" },
      { key: "수정할 금액", label: "수정할 금액", isLeft: false, fmt: "empty" },
      { key: "현재입찰금액", label: "현재입찰", isLeft: false, fmt: "int" },
    );
  } else {
    cols.push(
      { key: "키워드ID", label: "키워드ID", isLeft: true, fmt: "id" },
      { key: "키워드", label: "키워드", isLeft: true, fmt: "str" },
      { key: "수정할 금액", label: "수정할 금액", isLeft: false, fmt: "empty" },
      { key: "현재입찰금액", label: "현재입찰", isLeft: false, fmt: "int" },
    );
  }
  cols.push(
    { key: "CPC_A", label: "CPC_A", isLeft: false, fmt: "int" },
    { key: "순위_A", label: "순위_A", isLeft: false, fmt: "rank" },
    { key: "CPC_B", label: "CPC_B", isLeft: false, fmt: "int" },
    { key: "순위_B", label: "순위_B", isLeft: false, fmt: "rank" },
    { key: "매출액_A", label: "매출액_A", isLeft: false, fmt: "int" },
    { key: "광고비_A", label: "광고비_A", isLeft: false, fmt: "int" },
    { key: "ROAS_A", label: "ROAS_A", isLeft: false, fmt: "pct" },
    { key: "매출액_B", label: "매출액_B", isLeft: false, fmt: "int" },
    { key: "광고비_B", label: "광고비_B", isLeft: false, fmt: "int" },
    { key: "ROAS_B", label: "ROAS_B", isLeft: false, fmt: "pct" },
    { key: "노출수_A", label: "노출수_A", isLeft: false, fmt: "int" },
    { key: "클릭수_A", label: "클릭수_A", isLeft: false, fmt: "int" },
    { key: "전환수_A", label: "전환수_A", isLeft: false, fmt: "int" },
    { key: "CTR_A", label: "CTR_A", isLeft: false, fmt: "pct2" },
    { key: "CVR_A", label: "CVR_A", isLeft: false, fmt: "pct2" },
    { key: "노출수_B", label: "노출수_B", isLeft: false, fmt: "int" },
    { key: "클릭수_B", label: "클릭수_B", isLeft: false, fmt: "int" },
    { key: "전환수_B", label: "전환수_B", isLeft: false, fmt: "int" },
    { key: "CTR_B", label: "CTR_B", isLeft: false, fmt: "pct2" },
    { key: "CVR_B", label: "CVR_B", isLeft: false, fmt: "pct2" },
  );
  return cols;
}

/** '전체' 필터 — 파워링크/쇼핑검색 열 구성이 달라 한 테이블에 섞을 수 없으므로 공통 지표만. */
export function buildCommonColDefs(): ColDef[] {
  return [
    { key: "__adTypeLabel", label: "유형", isLeft: true, fmt: "str" },
    { key: "캠페인명", label: "캠페인명", isLeft: true, fmt: "str" },
    { key: "광고그룹명", label: "광고그룹명", isLeft: true, fmt: "str" },
    { key: "__identValue", label: "키워드/소재", isLeft: true, fmt: "str" },
    { key: "현재입찰금액", label: "현재입찰", isLeft: false, fmt: "int" },
    { key: "CPC_A", label: "CPC_A", isLeft: false, fmt: "int" },
    { key: "CPC_B", label: "CPC_B", isLeft: false, fmt: "int" },
    { key: "매출액_A", label: "매출액_A", isLeft: false, fmt: "int" },
    { key: "광고비_A", label: "광고비_A", isLeft: false, fmt: "int" },
    { key: "ROAS_A", label: "ROAS_A", isLeft: false, fmt: "pct" },
    { key: "매출액_B", label: "매출액_B", isLeft: false, fmt: "int" },
    { key: "광고비_B", label: "광고비_B", isLeft: false, fmt: "int" },
    { key: "ROAS_B", label: "ROAS_B", isLeft: false, fmt: "pct" },
  ];
}

export function getCellValue(row: ResultRow, colKey: string): string | number | null {
  if (colKey === "__adTypeLabel") return row.__adType;
  if (colKey === "__identValue") return row.키워드 || row.소재명 || "";
  return (row as unknown as Record<string, string | number | null>)[colKey] ?? null;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return Math.round(v).toLocaleString("ko-KR");
}
