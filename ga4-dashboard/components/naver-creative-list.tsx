"use client";

// 네이버 관리 — 소재 리스트화
// 네이버 광고관리시스템 "대용량 다운로드"로 받은 캠페인/광고그룹/소재(단일형·반응형)/애셋/애셋링크
// TSV를 업로드하면 자동 분류·조인해 평평한 소재 리스트를 만들고, 성과 CSV를 얹어 CTR/CPC/CVR/ROAS까지
// 계산해준다. 참고 원본: 자동화TF_솔루션/modules/네이버/소재관리/네이버_소재_리스트화_fix.html

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv, readFileWithEncoding, splitCSVLines } from "@/lib/csv-utils";
import {
  type AdRow,
  type CampaignInfo,
  type FileType,
  FILE_TYPE_LABEL,
  type GroupInfo,
  type PerfRaw,
  type TsvType,
  appendUtm,
  buildAssetLinkMap,
  buildAssetMap,
  buildCampaignMap,
  buildGroupMap,
  buildResponsiveRows,
  buildSingleRows,
  calcPerfDerived,
  classifyTSV,
  fmtN,
  parseTSV,
} from "@/lib/naver-tsv";

type LoadedFile = { file: File; rows: string[][]; count: number };
type LoadedFiles = Record<FileType, LoadedFile | null>;
type OnOffFilter = "all" | "on" | "off";

const FILE_TYPES: FileType[] = ["campaign", "group", "single", "responsive", "asset", "assetlink"];
const FILE_ICON: Record<FileType, string> = {
  campaign: "🗂",
  group: "📁",
  single: "📄",
  responsive: "📑",
  asset: "🧩",
  assetlink: "🔗",
};

const PERF_ROLES = ["소재ID", "노출수", "클릭수", "비용", "전환수", "매출액", "평균노출순위"] as const;
type PerfRole = (typeof PERF_ROLES)[number];
const PERF_ROLE_LABEL: Record<PerfRole, string> = {
  소재ID: "소재 ID (nad-)",
  노출수: "노출수",
  클릭수: "클릭수",
  비용: "비용",
  전환수: "전환수(구매)",
  매출액: "매출액",
  평균노출순위: "평균노출순위",
};
const PERF_HINTS: Record<PerfRole, string[]> = {
  소재ID: ["소재id", "nad-", "소재_id", "adid", "광고id", "소재", "ad_id"],
  노출수: ["노출수", "노출", "impression"],
  클릭수: ["클릭수", "클릭", "click"],
  비용: ["비용", "총비용", "cost", "소진", "광고비", "총소진액"],
  전환수: ["전환수", "전환", "conversion", "구매수"],
  매출액: ["매출액", "매출", "revenue", "전환매출액"],
  평균노출순위: ["평균노출순위", "순위", "노출순위", "rank", "평균순위"],
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function emptyPerfMapping(): Record<PerfRole, string> {
  return { 소재ID: "", 노출수: "", 클릭수: "", 비용: "", 전환수: "", 매출액: "", 평균노출순위: "" };
}

function autoMatchPerfCol(role: PerfRole, headers: string[], rawRows: string[][]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  for (const hint of PERF_HINTS[role]) {
    const nh = norm(hint);
    for (const col of headers) {
      const nc = norm(col);
      if (role === "소재ID") {
        if (nc.includes(nh) || nc === nh) {
          const colIdx = headers.indexOf(col);
          if (rawRows.slice(0, 30).some((r) => (r[colIdx] || "").includes("nad-"))) return col;
        }
      } else if (nc.includes(nh)) {
        return col;
      }
    }
  }
  if (role === "소재ID") {
    for (let ci = 0; ci < headers.length; ci++) {
      if (rawRows.slice(0, 30).some((r) => (r[ci] || "").includes("nad-"))) return headers[ci];
    }
  }
  return "";
}

export function NaverCreativeList() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const perfFileInputRef = useRef<HTMLInputElement>(null);

  const [loadedFiles, setLoadedFiles] = useState<LoadedFiles>({
    campaign: null,
    group: null,
    single: null,
    responsive: null,
    asset: null,
    assetlink: null,
  });
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hasRun, setHasRun] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "responsive">("single");
  const [showUtm, setShowUtm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCmp, setFilterCmp] = useState<OnOffFilter>("all");
  const [filterGrp, setFilterGrp] = useState<OnOffFilter>("all");
  const [filterAd, setFilterAd] = useState<OnOffFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<keyof AdRow | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // 성과 CSV 상태
  const [perfAllRows, setPerfAllRows] = useState<string[][]>([]);
  const [perfFileName, setPerfFileName] = useState("");
  const [perfHeaderRowInput, setPerfHeaderRowInput] = useState("1");
  const [perfHeaderRow, setPerfHeaderRow] = useState(1);
  const [perfMapping, setPerfMapping] = useState<Record<PerfRole, string>>(emptyPerfMapping());
  const [perfMap, setPerfMap] = useState<Record<string, PerfRaw> | null>(null);
  const [perfStatus, setPerfStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [perfBodyOpen, setPerfBodyOpen] = useState(true);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  // ── 조인 ──
  const campaignMap = useMemo(() => buildCampaignMap(loadedFiles.campaign?.rows ?? []), [loadedFiles.campaign]);
  const groupMap = useMemo(() => buildGroupMap(loadedFiles.group?.rows ?? []), [loadedFiles.group]);
  const assetMap = useMemo(() => buildAssetMap(loadedFiles.asset?.rows ?? []), [loadedFiles.asset]);
  const assetLinkMap = useMemo(
    () => buildAssetLinkMap(loadedFiles.assetlink?.rows ?? [], assetMap),
    [loadedFiles.assetlink, assetMap],
  );
  const singleRows = useMemo(
    () => buildSingleRows(loadedFiles.single?.rows ?? [], campaignMap, groupMap),
    [loadedFiles.single, campaignMap, groupMap],
  );
  const respRows = useMemo(
    () => buildResponsiveRows(loadedFiles.responsive?.rows ?? [], campaignMap, groupMap, assetLinkMap),
    [loadedFiles.responsive, campaignMap, groupMap, assetLinkMap],
  );

  const loaded: Record<FileType, boolean> = {
    campaign: !!loadedFiles.campaign,
    group: !!loadedFiles.group,
    single: !!loadedFiles.single,
    responsive: !!loadedFiles.responsive,
    asset: !!loadedFiles.asset,
    assetlink: !!loadedFiles.assetlink,
  };
  const singleSet = loaded.campaign && loaded.group && loaded.single;
  const respSet = loaded.campaign && loaded.group && loaded.responsive && loaded.asset && loaded.assetlink;
  const canRun = singleSet || respSet;
  const runHint = !canRun
    ? loaded.campaign && loaded.group
      ? `필요: ${[
          !loaded.single && "단일형",
          !(loaded.responsive && loaded.asset && loaded.assetlink) && "반응형(반응형+애셋+애셋링크)",
        ]
          .filter(Boolean)
          .join(" 또는 ")}`
      : "캠페인 · 광고그룹 파일이 필요합니다"
    : "";

  async function onFilesSelected(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => /\.(tsv|txt|csv)$/i.test(f.name));
    if (!files.length) {
      showToast("TSV/CSV 파일만 지원됩니다.");
      return;
    }
    const results = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ type: TsvType; file: File; rows: string[][]; count: number }>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const rows = parseTSV(String(e.target?.result ?? ""));
              const { type, count } = classifyTSV(rows);
              resolve({ type, file, rows, count });
            };
            reader.onerror = () => resolve({ type: "unknown", file, rows: [], count: 0 });
            reader.readAsText(file, "utf-8");
          }),
      ),
    );

    const byType: Partial<Record<TsvType, typeof results>> = {};
    results.forEach((r) => {
      (byType[r.type] ??= []).push(r);
    });

    const newFailures: { name: string; reason: string }[] = [];
    const updates: Partial<LoadedFiles> = {};

    Object.entries(byType).forEach(([type, items]) => {
      if (!items) return;
      if (type === "unknown") {
        items.forEach((i) => newFailures.push({ name: i.file.name, reason: "구조 인식 불가" }));
        return;
      }
      if (type === "keyword") {
        items.forEach((i) => newFailures.push({ name: i.file.name, reason: "키워드 파일 (미사용)" }));
        return;
      }
      let chosen = items[0];
      if (items.length > 1) {
        const sorted = [...items].sort((a, b) => b.count - a.count);
        chosen = sorted[0];
        showToast(
          `⚠️ ${FILE_TYPE_LABEL[type as FileType]} 파일 ${items.length}개 — 행 수 많은 "${chosen.file.name}" 선택`,
        );
      }
      updates[type as FileType] = { file: chosen.file, rows: chosen.rows, count: chosen.count };
    });

    setLoadedFiles((prev) => ({ ...prev, ...updates }));
    setFailures(newFailures);
  }

  function removeFile(type: FileType) {
    setLoadedFiles((prev) => ({ ...prev, [type]: null }));
  }

  function clearPerfData() {
    setPerfAllRows([]);
    setPerfFileName("");
    setPerfHeaderRowInput("1");
    setPerfHeaderRow(1);
    setPerfMapping(emptyPerfMapping());
    setPerfMap(null);
    setPerfStatus(null);
    if (perfFileInputRef.current) perfFileInputRef.current.value = "";
  }

  function resetAll() {
    setLoadedFiles({ campaign: null, group: null, single: null, responsive: null, asset: null, assetlink: null });
    setFailures([]);
    setHasRun(false);
    setActiveTab("single");
    setShowUtm(false);
    setSearchQuery("");
    setFilterCmp("all");
    setFilterGrp("all");
    setFilterAd("all");
    setPageSize(10);
    setPage(1);
    setSortCol(null);
    setSortDir(1);
    clearPerfData();
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("초기화 완료");
  }

  const rows = activeTab === "single" ? singleRows : respRows;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterCmp === "on" && r.cmpOnoff !== "ON") return false;
      if (filterCmp === "off" && r.cmpOnoff !== "OFF") return false;
      if (filterGrp === "on" && r.grpOnoff !== "ON") return false;
      if (filterGrp === "off" && r.grpOnoff !== "OFF") return false;
      if (filterAd === "on" && r.adOnoff !== "ON") return false;
      if (filterAd === "off" && r.adOnoff !== "OFF") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hit =
          r.cmpName.toLowerCase().includes(q) ||
          r.grpName.toLowerCase().includes(q) ||
          r.nadId.toLowerCase().includes(q) ||
          r.cmpId.toLowerCase().includes(q) ||
          r.grpId.toLowerCase().includes(q) ||
          r.titles.some((t) => t.toLowerCase().includes(q)) ||
          r.descs.some((d) => d.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, filterCmp, filterGrp, filterAd, searchQuery]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    const copy = [...filteredRows];
    copy.sort((a, b) => String(a[sortCol] || "").localeCompare(String(b[sortCol] || "")) * sortDir);
    return copy;
  }, [filteredRows, sortCol, sortDir]);

  const effectivePageSize = pageSize === 500 ? Math.max(sortedRows.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / effectivePageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (clampedPage - 1) * effectivePageSize;
    return sortedRows.slice(start, start + effectivePageSize);
  }, [sortedRows, clampedPage, effectivePageSize]);

  function sortBy(col: keyof AdRow) {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortCol(col);
      setSortDir(1);
    }
    setPage(1);
  }

  function switchTab(tab: "single" | "responsive") {
    setActiveTab(tab);
    setPage(1);
  }

  async function copyText(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      showToast(`복사됨: ${t.slice(0, 50)}${t.length > 50 ? "…" : ""}`);
    } catch {
      showToast("클립보드 복사에 실패했습니다.");
    }
  }

  // ── 성과 CSV ──
  async function onPerfFileSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await readFileWithEncoding(file);
      const allRows = splitCSVLines(text);
      setPerfAllRows(allRows);
      setPerfFileName(file.name);
      let headerIdx = 0;
      for (let i = 0; i < Math.min(allRows.length, 5); i++) {
        if (allRows[i].some((c) => c.trim())) {
          headerIdx = i;
          break;
        }
      }
      setPerfHeaderRow(headerIdx + 1);
      setPerfHeaderRowInput(String(headerIdx + 1));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "성과 CSV 읽기 오류");
    }
  }

  function reParsePerf() {
    if (!perfAllRows.length) {
      showToast("먼저 성과 CSV를 업로드해주세요.");
      return;
    }
    setPerfHeaderRow(Math.max(1, parseInt(perfHeaderRowInput, 10) || 1));
  }

  const perfHeaders = useMemo(
    () => (perfAllRows[perfHeaderRow - 1] ?? []).map((h) => h.trim()),
    [perfAllRows, perfHeaderRow],
  );
  const perfRawRows = useMemo(
    () => perfAllRows.slice(perfHeaderRow).filter((r) => r.some((c) => c.trim())),
    [perfAllRows, perfHeaderRow],
  );

  // 새 파일 업로드/재파싱으로 헤더 구조가 바뀌면 컬럼 매핑을 다시 자동 감지한다.
  const perfSignature = `${perfHeaders.join("|")}::${perfRawRows.length}`;
  useEffect(() => {
    if (perfHeaders.length === 0) return;
    const next = emptyPerfMapping();
    PERF_ROLES.forEach((role) => {
      next[role] = autoMatchPerfCol(role, perfHeaders, perfRawRows);
    });
    setPerfMapping(next);
    setPerfStatus(null);
    setPerfMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfSignature]);

  function applyPerfMapping() {
    const idCol = perfMapping["소재ID"];
    if (!idCol) {
      setPerfStatus({ text: "❌ 소재 ID 컬럼을 선택해주세요.", ok: false });
      return;
    }
    const idIdx = perfHeaders.indexOf(idCol);
    const colIdx: Record<PerfRole, number> = {
      소재ID: idIdx,
      노출수: -1,
      클릭수: -1,
      비용: -1,
      전환수: -1,
      매출액: -1,
      평균노출순위: -1,
    };
    PERF_ROLES.forEach((role) => {
      const col = perfMapping[role];
      colIdx[role] = col ? perfHeaders.indexOf(col) : -1;
    });

    const map: Record<string, PerfRaw> = {};
    let matchCount = 0;
    perfRawRows.forEach((row) => {
      const nadIdRaw = (row[idIdx] || "").trim();
      const match = nadIdRaw.match(/nad-[A-Za-z0-9_-]+/);
      if (!match) return;
      const key = match[0];
      const parseN = (idx: number) => {
        if (idx < 0) return 0;
        const v = (row[idx] || "").replace(/,/g, "").trim();
        return parseFloat(v) || 0;
      };
      if (!map[key]) {
        map[key] = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, rankSum: 0, rankCount: 0 };
        matchCount++;
      }
      map[key].impressions += parseN(colIdx["노출수"]);
      map[key].clicks += parseN(colIdx["클릭수"]);
      map[key].cost += parseN(colIdx["비용"]);
      map[key].conversions += parseN(colIdx["전환수"]);
      map[key].revenue += parseN(colIdx["매출액"]);
      const rank = parseN(colIdx["평균노출순위"]);
      if (rank > 0) {
        map[key].rankSum += rank;
        map[key].rankCount++;
      }
    });

    setPerfMap(map);
    setPerfStatus({ text: `✅ ${matchCount.toLocaleString()}개 소재 ID 성과 매핑 완료`, ok: true });
    showToast(`성과 매핑 완료 (${matchCount}개 소재) — 테이블에 반영됐습니다`);
  }

  // ── CSV 다운로드 ──
  function downloadListCsv(withPerf: boolean) {
    const rowsToExport = sortedRows;
    if (!rowsToExport.length) {
      showToast("다운로드할 데이터가 없습니다.");
      return;
    }
    if (withPerf && !perfMap) {
      showToast("성과 데이터가 없습니다. 먼저 성과 CSV를 매핑해주세요.");
      return;
    }
    const isSingle = activeTab === "single";
    const perfH = withPerf
      ? ["노출수", "클릭수", "CTR(%)", "비용", "CPC", "전환수", "CVR(%)", "매출액", "평균노출순위", "ROAS(%)"]
      : [];
    const urlH = ["PC URL", "MO URL", "UTM", "PC+UTM", "MO+UTM"];
    const urlV = (r: AdRow) => {
      const utm = r.pcUrlUtm || "";
      const moBase = r.moUrlBase || "";
      return [
        r.pcUrlBase,
        moBase,
        utm,
        utm ? appendUtm(r.pcUrlBase, utm) : r.pcUrlBase,
        moBase ? (utm ? appendUtm(moBase, utm) : moBase) : "",
      ];
    };
    const perfV = (r: AdRow): string[] => {
      if (!withPerf) return [];
      const raw = perfMap?.[r.nadId] ?? null;
      const p = calcPerfDerived(
        raw ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, rankSum: 0, rankCount: 0 },
      );
      return [
        String(p.impressions),
        String(p.clicks),
        `${p.ctr.toFixed(2)}%`,
        String(p.cost),
        String(p.cpc),
        String(p.conversions),
        `${p.cvr.toFixed(2)}%`,
        String(p.revenue),
        p.rank !== null && p.rank > 0 ? p.rank.toFixed(1) : "-",
        p.roas !== null && p.roas > 0 ? `${Math.round(p.roas)}%` : "-",
      ];
    };

    let headers: string[];
    let rowArrs: string[][];
    if (isSingle) {
      headers = [
        "캠페인",
        "캠페인ID",
        "광고그룹",
        "광고그룹ID",
        "소재ID",
        "캠페인ON/OFF",
        "광고그룹ON/OFF",
        "소재ON/OFF",
        "광고제목",
        "광고설명",
        ...urlH,
        "등록일",
        ...perfH,
      ];
      rowArrs = rowsToExport.map((r) => [
        r.cmpName,
        r.cmpId,
        r.grpName,
        r.grpId,
        r.nadId,
        r.cmpOnoff,
        r.grpOnoff,
        r.adOnoff,
        r.titles[0] || "",
        r.descs[0] || "",
        ...urlV(r),
        r.regDate,
        ...perfV(r),
      ]);
    } else {
      let maxT = 0;
      let maxD = 0;
      rowsToExport.forEach((r) => {
        maxT = Math.max(maxT, r.titles.length);
        maxD = Math.max(maxD, r.descs.length);
      });
      maxT = Math.max(maxT, 1);
      maxD = Math.max(maxD, 1);
      const tH = Array.from({ length: maxT }, (_, i) => `제목${i + 1}${i < 3 ? "(필수)" : "(선택)"}`);
      const dH = Array.from({ length: maxD }, (_, i) => `설명${i + 1}${i < 2 ? "(필수)" : "(선택)"}`);
      headers = [
        "캠페인",
        "캠페인ID",
        "광고그룹",
        "광고그룹ID",
        "소재ID",
        "캠페인ON/OFF",
        "광고그룹ON/OFF",
        "소재ON/OFF",
        ...tH,
        ...dH,
        ...urlH,
        "등록일",
        ...perfH,
      ];
      rowArrs = rowsToExport.map((r) => {
        const t = Array.from({ length: maxT }, (_, i) => r.titles[i] || "");
        const d = Array.from({ length: maxD }, (_, i) => r.descs[i] || "");
        return [
          r.cmpName,
          r.cmpId,
          r.grpName,
          r.grpId,
          r.nadId,
          r.cmpOnoff,
          r.grpOnoff,
          r.adOnoff,
          ...t,
          ...d,
          ...urlV(r),
          r.regDate,
          ...perfV(r),
        ];
      });
    }
    const suffix = withPerf ? "_성과포함" : "";
    downloadCsv(`네이버_소재리스트_${isSingle ? "단일형" : "반응형"}${suffix}_${today()}.csv`, headers, rowArrs);
    showToast(`CSV 다운로드 완료 (${rowsToExport.length.toLocaleString()}건${withPerf ? " · 성과 포함" : ""})`);
  }

  function downloadGroupSummaryCsv() {
    const grpIds = Object.keys(groupMap);
    if (!grpIds.length) {
      showToast("광고그룹 데이터가 없습니다.");
      return;
    }
    const allRows = [...singleRows, ...respRows];
    type Summary = {
      cmpName: string;
      cmpId: string;
      cmpOnoff: string;
      grpName: string;
      grpId: string;
      grpOnoff: string;
      total: number;
      onCount: number;
      offCount: number;
      singleCount: number;
      respCount: number;
    };
    const summary: Record<string, Summary> = {};
    grpIds.forEach((grpId) => {
      const grp = groupMap[grpId];
      const cmp: CampaignInfo = campaignMap[grp.cmpId] || { name: grp.cmpId, onoff: "?", regDate: "" };
      summary[grpId] = {
        cmpName: cmp.name,
        cmpId: grp.cmpId,
        cmpOnoff: cmp.onoff,
        grpName: grp.name,
        grpId,
        grpOnoff: grp.onoff,
        total: 0,
        onCount: 0,
        offCount: 0,
        singleCount: 0,
        respCount: 0,
      };
    });
    allRows.forEach((r) => {
      const s = summary[r.grpId];
      if (!s) return;
      s.total++;
      if (r.adOnoff === "ON") s.onCount++;
      else s.offCount++;
      if (r.type === "single") s.singleCount++;
      else s.respCount++;
    });
    const flagOf = (s: Summary) => (s.total === 0 ? "⚠ 소재없음" : s.onCount === 0 ? "⚠ 전체OFF" : "정상");
    const flagPriority = (f: string) => (f === "⚠ 소재없음" ? 0 : f === "⚠ 전체OFF" ? 1 : 2);
    const rowsOut = Object.values(summary)
      .map((s) => ({ ...s, flag: flagOf(s) }))
      .sort(
        (a, b) =>
          flagPriority(a.flag) - flagPriority(b.flag) ||
          a.cmpName.localeCompare(b.cmpName) ||
          a.grpName.localeCompare(b.grpName),
      );
    const headers = [
      "위험도",
      "캠페인",
      "캠페인ID",
      "캠페인ON/OFF",
      "광고그룹",
      "광고그룹ID",
      "광고그룹ON/OFF",
      "전체소재개수",
      "ON소재개수",
      "OFF소재개수",
      "단일형개수",
      "반응형개수",
    ];
    const rowArrs = rowsOut.map((s) => [
      s.flag,
      s.cmpName,
      s.cmpId,
      s.cmpOnoff,
      s.grpName,
      s.grpId,
      s.grpOnoff,
      String(s.total),
      String(s.onCount),
      String(s.offCount),
      String(s.singleCount),
      String(s.respCount),
    ]);
    downloadCsv(`네이버_광고그룹별_소재현황_${today()}.csv`, headers, rowArrs);
    const noAd = rowsOut.filter((s) => s.total === 0).length;
    const allOff = rowsOut.filter((s) => s.total > 0 && s.onCount === 0).length;
    showToast(`그룹별 소재 현황 CSV 다운로드 완료 (소재없음 ${noAd}건 · 전체OFF ${allOff}건)`);
  }

  const hasAnyFile = FILE_TYPES.some((t) => loaded[t]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">소재 리스트화</h1>
          <p className="text-sm text-zinc-500">
            네이버 대량관리 → 광고 정보 일괄 다운로드 TSV를 업로드하면 캠페인·광고그룹·소재를 조인해 리스트로
            만들어줍니다.
          </p>
        </div>
        {hasRun && (
          <button
            onClick={resetAll}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ↺ 초기화
          </button>
        )}
      </div>

      {!hasRun && (
        <section className="space-y-4">
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center transition-colors hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFilesSelected(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.txt,.csv"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mb-1 text-sm font-medium">📂 TSV 파일을 여기에 드래그하거나 클릭하여 선택</p>
            <p className="text-xs text-zinc-400">여러 파일 동시 선택 가능 · 파일 종류 자동 분류</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {FILE_TYPES.map((type) => {
              const lf = loadedFiles[type];
              return (
                <div
                  key={type}
                  className={`relative rounded-lg border p-3 text-center ${
                    lf
                      ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {lf && (
                    <button
                      onClick={() => removeFile(type)}
                      className="absolute right-1.5 top-1.5 text-xs text-zinc-400 hover:text-red-500"
                      title="제거"
                    >
                      ✕
                    </button>
                  )}
                  <div className="mb-1 text-lg">{FILE_ICON[type]}</div>
                  <div className="text-xs font-semibold text-zinc-500">{FILE_TYPE_LABEL[type]}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {lf ? `${lf.count.toLocaleString()}행` : "미등록"}
                  </div>
                  {lf && (
                    <div className="mt-1 truncate text-[10px] text-emerald-600 dark:text-emerald-400" title={lf.file.name}>
                      {lf.file.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {failures.length > 0 && (
            <div className="space-y-1">
              {failures.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                >
                  <span>⚠️</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="whitespace-nowrap">{f.reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setHasRun(true);
                setPage(1);
              }}
              disabled={!canRun}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              ▶ 소재 리스트 생성
            </button>
            {!canRun && hasAnyFile && <span className="text-xs text-zinc-400">{runHint}</span>}
          </div>
        </section>
      )}

      {hasRun && (
        <>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <span>
              단일형 <b className="text-zinc-800 dark:text-zinc-200">{singleRows.length.toLocaleString()}</b>건
            </span>
            <span>
              반응형 <b className="text-zinc-800 dark:text-zinc-200">{respRows.length.toLocaleString()}</b>건
            </span>
          </div>

          {/* 툴바 */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
              {(
                [
                  ["single", `단일형 ${singleRows.length}`],
                  ["responsive", `반응형 ${respRows.length}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => switchTab(value)}
                  className={`px-3 py-1.5 first:rounded-l-md last:rounded-r-md ${
                    activeTab === value
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-400">캠페인</span>
              <select value={filterCmp} onChange={(e) => setFilterCmp(e.target.value as OnOffFilter)} className="rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                <option value="all">전체</option>
                <option value="on">ON만</option>
                <option value="off">OFF만</option>
              </select>
              <span className="text-zinc-400">그룹</span>
              <select value={filterGrp} onChange={(e) => setFilterGrp(e.target.value as OnOffFilter)} className="rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                <option value="all">전체</option>
                <option value="on">ON만</option>
                <option value="off">OFF만</option>
              </select>
              <span className="text-zinc-400">소재</span>
              <select value={filterAd} onChange={(e) => setFilterAd(e.target.value as OnOffFilter)} className="rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                <option value="all">전체</option>
                <option value="on">ON만</option>
                <option value="off">OFF만</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={showUtm} onChange={(e) => setShowUtm(e.target.checked)} className="h-3.5 w-3.5" />
              UTM 포함 표시
            </label>

            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="캠페인/그룹/소재 검색..."
              className="w-44 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={() => downloadListCsv(false)} className="rounded-md border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950">
                ⬇ 소재 리스트
              </button>
              {perfMap && (
                <button onClick={() => downloadListCsv(true)} className="rounded-md border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
                  📊 성과 포함 CSV
                </button>
              )}
              <button onClick={downloadGroupSummaryCsv} className="rounded-md border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950">
                ⚠ 그룹별 소재 현황
              </button>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value={10}>10개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
                <option value={200}>200개씩</option>
                <option value={500}>모두</option>
              </select>
            </div>
          </div>

          {/* 성과 CSV 업로드 */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div
              className="flex cursor-pointer items-center gap-2 p-3"
              onClick={() => setPerfBodyOpen((v) => !v)}
            >
              <span>📊</span>
              <span className="flex-1 text-sm font-semibold">성과 CSV 업로드</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:bg-zinc-800">선택사항</span>
              {perfMap && !perfBodyOpen && <span className="text-xs text-emerald-600">✅ 성과 적용 중</span>}
              <span className="text-xs text-zinc-400">{perfBodyOpen ? "▲ 접기" : "▼ 펼치기"}</span>
            </div>
            {perfBodyOpen && (
              <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  네이버 SA 다차원 보고서(소재 포함)를 업로드하면, 소재 ID 기준으로 성과 지표가 매핑됩니다. 성과
                  CSV가 없으면 소재 리스트만 다운로드됩니다.
                </p>
                <div
                  className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 bg-white p-5 text-center dark:border-zinc-700 dark:bg-zinc-900"
                  onClick={() => perfFileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f && !/\.csv$/i.test(f.name)) {
                      showToast("CSV 파일만 지원됩니다.");
                      return;
                    }
                    onPerfFileSelected(f ?? null);
                  }}
                >
                  <input
                    ref={perfFileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      onPerfFileSelected(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  <p className="text-sm">
                    <b className="text-blue-600">클릭</b> 또는 성과 CSV를 드래그
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">UTF-8 / EUC-KR 자동 감지</p>
                  {perfFileName && <p className="mt-1.5 font-mono text-[11px] text-emerald-600">📄 {perfFileName}</p>}
                </div>

                {perfHeaders.length > 0 && (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        컬럼 역할 매핑 <span className="font-normal normal-case text-zinc-400">(자동 감지 — 필요 시 수정)</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {PERF_ROLES.map((role) => (
                          <div key={role}>
                            <label className="mb-1 block text-[10px] text-zinc-500">
                              {PERF_ROLE_LABEL[role]}
                              {role === "소재ID" && <span className="text-red-500"> ★</span>}
                            </label>
                            <select
                              value={perfMapping[role]}
                              onChange={(e) => setPerfMapping({ ...perfMapping, [role]: e.target.value })}
                              className={`${inputClass} py-1 text-xs ${perfMapping[role] ? "border-emerald-400" : ""}`}
                            >
                              <option value="">(없음)</option>
                              {perfHeaders.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">헤더 시작 행</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={perfHeaderRowInput}
                        onChange={(e) => setPerfHeaderRowInput(e.target.value)}
                        className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-center font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <button onClick={reParsePerf} className="rounded border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                        재파싱
                      </button>
                      <span className="text-[11px] text-zinc-400">CSV 첫 행이 실제 헤더면 1, 두 번째 행이면 2</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={applyPerfMapping} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                        ✅ 매핑 적용
                      </button>
                      {perfMap && (
                        <button onClick={clearPerfData} className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                          ✕ 초기화
                        </button>
                      )}
                      {perfStatus && (
                        <span className={`text-xs ${perfStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{perfStatus.text}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 테이블 */}
          {sortedRows.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-800">
              🔍 검색 결과가 없습니다. 다른 검색어나 필터를 시도해보세요.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                      <SortableTh label="캠페인" col="cmpName" sortCol={sortCol} sortDir={sortDir} onSort={sortBy} />
                      <SortableTh label="광고그룹" col="grpName" sortCol={sortCol} sortDir={sortDir} onSort={sortBy} />
                      <SortableTh label="소재 ID" col="nadId" sortCol={sortCol} sortDir={sortDir} onSort={sortBy} />
                      <th className="px-3 py-2 font-medium">ON/OFF</th>
                      <th className="px-3 py-2 font-medium">{activeTab === "single" ? "광고제목/설명" : "제목 애셋"}</th>
                      {activeTab === "responsive" && <th className="px-3 py-2 font-medium">설명 애셋</th>}
                      <th className="px-3 py-2 font-medium">PC URL</th>
                      <th className="px-3 py-2 font-medium">MO URL</th>
                      <SortableTh label="등록일" col="regDate" sortCol={sortCol} sortDir={sortDir} onSort={sortBy} />
                      {perfMap && (
                        <>
                          <th className="border-l border-blue-200 px-3 py-2 font-medium text-blue-600 dark:border-blue-900">노출수</th>
                          <th className="px-3 py-2 font-medium text-blue-600">클릭수</th>
                          <th className="px-3 py-2 font-medium text-blue-600">CTR</th>
                          <th className="px-3 py-2 font-medium text-blue-600">비용</th>
                          <th className="px-3 py-2 font-medium text-blue-600">CPC</th>
                          <th className="px-3 py-2 font-medium text-blue-600">전환수</th>
                          <th className="px-3 py-2 font-medium text-blue-600">CVR</th>
                          <th className="px-3 py-2 font-medium text-blue-600">매출액</th>
                          <th className="px-3 py-2 font-medium text-blue-600">평균순위</th>
                          <th className="px-3 py-2 font-medium text-blue-600">ROAS</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => {
                      const pcUrl = showUtm ? r.pcUrlFull : r.pcUrlBase;
                      const moBase = r.moUrlBase || "";
                      const moUrl = showUtm && r.pcUrlUtm && moBase ? appendUtm(moBase, r.pcUrlUtm) : moBase;
                      const perf = perfMap ? perfMap[r.nadId] ?? null : null;
                      const p = perfMap
                        ? calcPerfDerived(
                            perf ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, rankSum: 0, rankCount: 0 },
                          )
                        : null;
                      const noData = !!perfMap && !perf;
                      return (
                        <tr key={`${r.nadId}-${i}`} className="border-b border-zinc-100 font-mono last:border-0 dark:border-zinc-800/60">
                          <td className="px-3 py-1.5">
                            <div className="max-w-[130px] truncate font-sans font-medium text-zinc-800 dark:text-zinc-200">{r.cmpName}</div>
                            <button onClick={() => copyText(r.cmpId)} className="max-w-[130px] truncate text-[10px] text-zinc-400 hover:text-blue-500" title={r.cmpId}>
                              {r.cmpId}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="max-w-[130px] truncate font-sans font-medium text-zinc-800 dark:text-zinc-200">{r.grpName}</div>
                            <button onClick={() => copyText(r.grpId)} className="max-w-[130px] truncate text-[10px] text-zinc-400 hover:text-blue-500" title={r.grpId}>
                              {r.grpId}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => copyText(r.nadId)} className="max-w-[150px] truncate text-orange-500 hover:text-orange-600" title={r.nadId}>
                              {r.nadId}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-sans leading-loose">
                            <OnOffBadge v={r.cmpOnoff} />
                            <br />
                            <OnOffBadge v={r.grpOnoff} />
                            <br />
                            <OnOffBadge v={r.adOnoff} />
                          </td>
                          <td className="max-w-[200px] px-3 py-1.5 font-sans">
                            {activeTab === "single" ? (
                              <>
                                <div className="font-medium text-zinc-800 dark:text-zinc-200">{r.titles[0] || ""}</div>
                                <div className="mt-0.5 text-zinc-500">{r.descs[0] || ""}</div>
                              </>
                            ) : (
                              r.titles.map((t, ti) => (
                                <span key={ti} className="mr-1 mb-1 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600 dark:border-blue-900 dark:bg-blue-950">
                                  {t}
                                </span>
                              ))
                            )}
                          </td>
                          {activeTab === "responsive" && (
                            <td className="max-w-[180px] px-3 py-1.5 font-sans">
                              {r.descs.map((d, di) => (
                                <span key={di} className="mr-1 mb-1 inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950">
                                  {d}
                                </span>
                              ))}
                            </td>
                          )}
                          <td className="max-w-[200px] px-3 py-1.5">
                            <div className="truncate text-blue-600 dark:text-blue-400" title={r.pcUrlFull}>
                              {pcUrl}
                            </div>
                            {!showUtm && r.pcUrlUtm && <div className="text-[9px] font-sans font-bold uppercase text-zinc-400">+UTM</div>}
                          </td>
                          <td className="max-w-[180px] px-3 py-1.5">
                            {moBase ? (
                              <>
                                <div className="truncate text-emerald-600 dark:text-emerald-400" title={r.moUrlFull}>
                                  {moUrl}
                                </div>
                                {!showUtm && r.pcUrlUtm && <div className="text-[9px] font-sans font-bold uppercase text-zinc-400">+UTM</div>}
                              </>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-zinc-400">{r.regDate}</td>
                          {p && (
                            <>
                              <td className={`border-l border-blue-100 px-3 py-1.5 text-right dark:border-blue-900/50 ${noData ? "text-zinc-300" : ""}`}>{fmtN(p.impressions)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{fmtN(p.clicks)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{p.ctr.toFixed(2)}%</td>
                              <td className={`px-3 py-1.5 text-right font-semibold ${noData ? "text-zinc-300" : "text-emerald-600"}`}>{fmtN(p.cost)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{fmtN(p.cpc)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{fmtN(p.conversions)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{p.cvr.toFixed(2)}%</td>
                              <td className={`px-3 py-1.5 text-right font-semibold ${noData ? "text-zinc-300" : "text-emerald-600"}`}>{fmtN(p.revenue)}</td>
                              <td className={`px-3 py-1.5 text-right ${noData ? "text-zinc-300" : ""}`}>{p.rank !== null && p.rank > 0 ? p.rank.toFixed(1) : "–"}</td>
                              <td className={`px-3 py-1.5 text-right font-semibold ${noData ? "text-zinc-300" : "text-emerald-600"}`}>
                                {p.roas !== null && p.roas > 0 ? `${Math.round(p.roas).toLocaleString("ko-KR")}%` : "–"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {(clampedPage - 1) * effectivePageSize + 1}–{Math.min(clampedPage * effectivePageSize, sortedRows.length)} / 총{" "}
                  {sortedRows.length.toLocaleString()}건
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={clampedPage <= 1}
                    className="rounded border border-zinc-300 px-2.5 py-1 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 dark:border-zinc-700"
                  >
                    ◀
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - clampedPage) <= 2)
                    .map((p, idx, arr) => (
                      <span key={p} className="flex items-center">
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-zinc-300">…</span>}
                        <button
                          onClick={() => setPage(p)}
                          className={`rounded border px-2.5 py-1 ${
                            p === clampedPage
                              ? "border-blue-600 bg-blue-600 font-bold text-white"
                              : "border-zinc-300 hover:border-blue-400 hover:text-blue-500 dark:border-zinc-700"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={clampedPage >= totalPages}
                    className="rounded border border-zinc-300 px-2.5 py-1 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 dark:border-zinc-700"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-500 bg-white px-4 py-2.5 text-sm font-medium text-emerald-600 shadow-lg dark:bg-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}

function OnOffBadge({ v }: { v: string }) {
  if (v === "ON") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ON
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" /> OFF
    </span>
  );
}

function SortableTh({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
}: {
  label: string;
  col: keyof AdRow;
  sortCol: keyof AdRow | null;
  sortDir: 1 | -1;
  onSort: (col: keyof AdRow) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-zinc-700 dark:hover:text-zinc-300 ${
        active ? "text-zinc-800 dark:text-zinc-200" : ""
      }`}
    >
      {label}
      {active && <span className="ml-1">{sortDir === 1 ? "▲" : "▼"}</span>}
    </th>
  );
}
