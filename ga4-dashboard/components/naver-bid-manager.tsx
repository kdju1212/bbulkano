"use client";

// 네이버 관리 — 입찰가 대량관리 (키워드 매핑 & 성과 분석)
// 성과 CSV(날짜별 키워드/소재 성과) + TSV(캠페인/광고그룹/키워드/쇼핑검색 ID)를 조인해
// 기간 A(기준) vs B(비교) 성과를 비교한다. 입찰가를 자동으로 바꾸는 게 아니라
// "수정할 금액" 빈 열을 사람이 직접 채워 네이버 대량 편집기에 올리는 용도.
// 참고 원본: 자동화TF_솔루션/modules/네이버/대량입찰관리/네이버_입찰가_대량관리_v2.html

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv, readFileWithEncoding, splitCSVLines } from "@/lib/csv-utils";
import {
  type AdType,
  type ColFmt,
  type MappedPerfRow,
  PAGE_SIZE,
  type PerfColRole,
  PERF_COL_ROLES,
  type ResultRow,
  type TsvSlotType,
  TSV_SLOT_TYPES,
  addDays,
  autoMatchPerfColumn,
  buildColDefs,
  buildCommonColDefs,
  buildMappedPerfRows,
  buildResultRows,
  calcPctDelta,
  detectTsvType,
  diffDays,
  fmtInt,
  getCellValue,
  mergeTsvData,
  parseNumber,
} from "@/lib/naver-bid";
import { parseTSV } from "@/lib/naver-tsv";

const TSV_SLOT_ICON: Record<TsvSlotType, string> = { 캠페인: "📋", 광고그룹: "📋", 키워드: "📋", 쇼핑검색: "📋" };
const TSV_SLOT_REQUIRED: Record<TsvSlotType, string> = {
  캠페인: "필수",
  광고그룹: "필수",
  키워드: "파워링크용 · 선택",
  쇼핑검색: "쇼핑검색용 · 선택",
};

const TYPE_FILTERS: (AdType | "전체")[] = ["전체", "파워링크", "쇼핑검색", "브랜드검색"];

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function emptyPerfMapping(): Record<PerfColRole, string> {
  return { 날짜: "", 캠페인명: "", 광고그룹명: "", 소재명: "", 키워드: "", 노출수: "", 클릭수: "", 비용: "", 전환수: "", 매출액: "", 평균노출순위: "" };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function renderCell(value: string | number | null, fmt: ColFmt) {
  if (fmt === "empty") return "";
  if (value === null || value === undefined || value === "") return <span className="text-zinc-300">–</span>;
  switch (fmt) {
    case "id":
      return <span className="font-mono text-blue-500">{String(value)}</span>;
    case "int":
      return fmtInt(Number(value));
    case "pct":
      return `${fmtInt(Number(value))}%`;
    case "pct2":
      return `${Number(value).toFixed(2)}%`;
    case "rank":
      return String(value);
    default:
      return String(value);
  }
}

function StepCard({
  num,
  title,
  subtitle,
  done,
  open,
  onToggle,
  children,
}: {
  num: number;
  title: string;
  subtitle?: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-5 overflow-hidden rounded-xl border ${
        done ? "border-emerald-400" : open ? "border-blue-400" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex cursor-pointer select-none items-center gap-3 px-5 py-4" onClick={onToggle}>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : open
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-zinc-300 text-zinc-400 dark:border-zinc-700"
          }`}
        >
          {done ? "✓" : num}
        </div>
        <span className="text-sm font-semibold">{title}</span>
        {subtitle && <span className="ml-auto text-xs text-zinc-400">{subtitle}</span>}
        <span className={`text-xs text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}>▼</span>
      </div>
      {open && <div className="space-y-3 border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800/60">{children}</div>}
    </div>
  );
}

export function NaverBidManager() {
  const perfFileInputRef = useRef<HTMLInputElement>(null);
  const tsvFileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  const [open1, setOpen1] = useState(true);
  const [open2, setOpen2] = useState(true);
  const [open3, setOpen3] = useState(true);
  const [open4, setOpen4] = useState(true);

  // ── STEP 1: 성과 CSV ──
  const [perfAllRows, setPerfAllRows] = useState<string[][]>([]);
  const [perfFileName, setPerfFileName] = useState("");
  const [perfHeaderRowInput, setPerfHeaderRowInput] = useState("1");
  const [perfHeaderRow, setPerfHeaderRow] = useState(1);
  const [perfMapping, setPerfMapping] = useState<Record<PerfColRole, string>>(emptyPerfMapping());
  const [mappedRows, setMappedRows] = useState<MappedPerfRow[] | null>(null);
  const [perfStatus, setPerfStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  const perfHeaders = useMemo(
    () => (perfAllRows[perfHeaderRow - 1] ?? []).map((h) => h.trim()),
    [perfAllRows, perfHeaderRow],
  );
  const perfRawRowsObj = useMemo(() => {
    const dataLines = perfAllRows.slice(perfHeaderRow).filter((r) => r.some((c) => c.trim()));
    return dataLines.map((r) => {
      const obj: Record<string, string> = {};
      perfHeaders.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
  }, [perfAllRows, perfHeaderRow, perfHeaders]);

  const perfSignature = `${perfHeaders.join("|")}::${perfRawRowsObj.length}`;
  useEffect(() => {
    if (perfHeaders.length === 0) return;
    const next = emptyPerfMapping();
    PERF_COL_ROLES.forEach((role) => {
      next[role] = autoMatchPerfColumn(role, perfHeaders);
    });
    setPerfMapping(next);
    setPerfStatus(null);
    setMappedRows(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfSignature]);

  async function onPerfFileSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await readFileWithEncoding(file);
      const allRows = splitCSVLines(text);
      setPerfAllRows(allRows);
      setPerfFileName(file.name);
      setPerfHeaderRow(1);
      setPerfHeaderRowInput("1");
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

  function applyPerfMapping() {
    const dateCol = perfMapping["날짜"];
    const keywordCol = perfMapping["키워드"];
    const materialCol = perfMapping["소재명"];
    if (!dateCol) {
      setPerfStatus({ text: "날짜 컬럼은 필수입니다.", ok: false });
      return;
    }
    if (!keywordCol && !materialCol) {
      setPerfStatus({ text: "키워드 또는 소재명 중 최소 하나는 매핑해야 합니다.", ok: false });
      return;
    }
    const mapped = buildMappedPerfRows(perfRawRowsObj, perfMapping);
    setMappedRows(mapped);

    const sortedDates = mapped.map((r) => r.날짜).filter(Boolean).sort();
    const dMin = sortedDates[0] || "";
    const dMax = sortedDates[sortedDates.length - 1] || "";
    setDateMin(dMin);
    setDateMax(dMax);
    if (dMin) {
      setPeriodAStart(dMin);
      setPeriodAEnd(dMax);
      const spanDays = diffDays(dMin, dMax);
      const bEnd = addDays(dMin, -1);
      const bStart = addDays(bEnd, -spanDays);
      setPeriodBStart(bStart < dMin ? dMin : bStart);
      setPeriodBEnd(bEnd);
    }
    setPerfStatus({ text: `✅ ${mapped.length.toLocaleString()}행 매핑 완료 · 기간: ${dMin} ~ ${dMax}`, ok: true });
    showToast(`성과 매핑 완료 (${mapped.length.toLocaleString()}행)`);
    setOpen3(true);
  }

  // ── STEP 2: TSV ID 매핑 ──
  const [tsvSlots, setTsvSlots] = useState<Record<TsvSlotType, { file: File; rows: string[][] } | null>>({
    캠페인: null,
    광고그룹: null,
    키워드: null,
    쇼핑검색: null,
  });
  const [tsvFailures, setTsvFailures] = useState<string[]>([]);

  async function onTsvFilesSelected(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => /\.(tsv|txt|csv)$/i.test(f.name));
    if (!files.length) {
      showToast("TSV/CSV 파일만 지원됩니다.");
      return;
    }
    const newFailures: string[] = [];
    const updates: Partial<Record<TsvSlotType, { file: File; rows: string[][] }>> = {};
    for (const file of files) {
      try {
        const text = await readFileWithEncoding(file);
        const rows = parseTSV(text);
        const type = detectTsvType(rows);
        if (type) updates[type] = { file, rows };
        else newFailures.push(file.name);
      } catch {
        newFailures.push(file.name);
      }
    }
    setTsvSlots((prev) => ({ ...prev, ...updates }));
    setTsvFailures(newFailures);
  }

  function removeTsvSlot(type: TsvSlotType) {
    setTsvSlots((prev) => ({ ...prev, [type]: null }));
  }

  const mergeResult = useMemo(
    () =>
      mergeTsvData(
        tsvSlots.캠페인?.rows ?? null,
        tsvSlots.광고그룹?.rows ?? null,
        tsvSlots.키워드?.rows ?? null,
        tsvSlots.쇼핑검색?.rows ?? null,
      ),
    [tsvSlots],
  );
  const tsvMissingHint = !mergeResult
    ? !tsvSlots.캠페인 || !tsvSlots.광고그룹
      ? `아직 ${[!tsvSlots.캠페인 && "캠페인", !tsvSlots.광고그룹 && "광고그룹"].filter(Boolean).join(", ")} TSV가 필요합니다.`
      : "키워드 또는 쇼핑검색 TSV 중 최소 하나를 업로드하세요."
    : "";

  function downloadMappingCsv() {
    if (!mergeResult || mergeResult.mappingRows.length === 0) {
      showToast("다운로드할 매핑 데이터가 없습니다.");
      return;
    }
    const headers = [
      "캠페인명",
      "캠페인ID",
      "캠페인ON/OFF",
      "광고그룹명",
      "광고그룹ID",
      "그룹ON/OFF",
      "키워드",
      "키워드ID",
      "키워드ON/OFF",
      "입찰가",
    ];
    const rows = mergeResult.mappingRows.map((r) => [
      r.캠페인명,
      r.캠페인ID,
      r.캠페인ON_OFF,
      r.광고그룹명,
      r.광고그룹ID,
      r.그룹ON_OFF,
      r.키워드,
      r.키워드ID,
      r.키워드ON_OFF,
      String(r.입찰가),
    ]);
    downloadCsv(`네이버_TSV_매핑결과_${today()}.csv`, headers, rows);
  }

  // ── STEP 3: 기간 설정 ──
  const [periodAStart, setPeriodAStart] = useState("");
  const [periodAEnd, setPeriodAEnd] = useState("");
  const [periodBStart, setPeriodBStart] = useState("");
  const [periodBEnd, setPeriodBEnd] = useState("");

  function setPeriodFull() {
    setPeriodAStart(dateMin);
    setPeriodAEnd(dateMax);
    setPeriodBStart(dateMin);
    setPeriodBEnd(dateMax);
  }

  // ── STEP 4: 분석 결과 ──
  const [appliedPeriod, setAppliedPeriod] = useState<{ a0: string; a1: string; b0: string; b1: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState<AdType | "전체">("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  function runAnalysis() {
    if (!mappedRows || mappedRows.length === 0) {
      showToast("먼저 성과 CSV를 업로드하고 매핑을 적용하세요.");
      return;
    }
    if (!periodAStart || !periodAEnd) {
      showToast("A 기간을 설정하세요.");
      return;
    }
    setAppliedPeriod({ a0: periodAStart, a1: periodAEnd, b0: periodBStart, b1: periodBEnd });
    setTypeFilter("전체");
    setSortCol(null);
    setPage(1);
    setOpen4(true);
  }

  const resultData = useMemo(() => {
    if (!appliedPeriod || !mappedRows) return null;
    return buildResultRows(mappedRows, mergeResult?.bidMap ?? null, appliedPeriod.a0, appliedPeriod.a1, appliedPeriod.b0, appliedPeriod.b1);
  }, [appliedPeriod, mappedRows, mergeResult]);

  const typeFilteredRows = useMemo(() => {
    if (!resultData) return [];
    if (typeFilter === "전체") return resultData.results;
    return resultData.results.filter((r) => r.__adType === typeFilter);
  }, [resultData, typeFilter]);

  const searchFilteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return typeFilteredRows;
    return typeFilteredRows.filter((r) => {
      const fields = [r.키워드, r.소재명, r.소재ID, r.키워드ID, r.캠페인명, r.광고그룹명];
      return fields.some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [typeFilteredRows, searchQuery]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return searchFilteredRows;
    const copy = [...searchFilteredRows];
    copy.sort((a, b) => {
      const va = getCellValue(a, sortCol);
      const vb = getCellValue(b, sortCol);
      if (va === null && vb === null) return 0;
      if (va === null || va === undefined || va === "") return 1;
      if (vb === null || vb === undefined || vb === "") return -1;
      return sortAsc ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
    });
    return copy;
  }, [searchFilteredRows, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sortedRows.slice((clampedPage - 1) * PAGE_SIZE, (clampedPage - 1) * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, clampedPage],
  );

  function sortByCol(colKey: string) {
    if (sortCol === colKey) setSortAsc((v) => !v);
    else {
      setSortCol(colKey);
      setSortAsc(false);
    }
    setPage(1);
  }

  const colDefs = typeFilter === "전체" ? buildCommonColDefs() : buildColDefs(typeFilter as AdType);

  const summaryMetrics = useMemo(() => {
    const rows = typeFilteredRows;
    const sumA = { 노출수: 0, 클릭수: 0, 비용: 0, 전환수: 0, 매출액: 0 };
    const sumB = { 노출수: 0, 클릭수: 0, 비용: 0, 전환수: 0, 매출액: 0 };
    rows.forEach((r) => {
      sumA.노출수 += r.노출수_A || 0;
      sumB.노출수 += r.노출수_B || 0;
      sumA.클릭수 += r.클릭수_A || 0;
      sumB.클릭수 += r.클릭수_B || 0;
      sumA.비용 += r.광고비_A || 0;
      sumB.비용 += r.광고비_B || 0;
      sumA.전환수 += r.전환수_A || 0;
      sumB.전환수 += r.전환수_B || 0;
      sumA.매출액 += r.매출액_A || 0;
      sumB.매출액 += r.매출액_B || 0;
    });
    const roasA = sumA.비용 > 0 ? sumA.매출액 / sumA.비용 : 0;
    const roasB = sumB.비용 > 0 ? sumB.매출액 / sumB.비용 : 0;
    return [
      { label: "매출액 (A)", value: fmtInt(sumA.매출액), delta: calcPctDelta(sumA.매출액, sumB.매출액) },
      { label: "광고비 (A)", value: fmtInt(sumA.비용), delta: calcPctDelta(sumA.비용, sumB.비용) },
      { label: "ROAS (A)", value: sumA.비용 > 0 ? `${fmtInt(roasA * 100)}%` : "–", delta: calcPctDelta(roasA, roasB) },
      { label: "클릭수 (A)", value: fmtInt(sumA.클릭수), delta: calcPctDelta(sumA.클릭수, sumB.클릭수) },
      { label: "전환수 (A)", value: fmtInt(sumA.전환수), delta: calcPctDelta(sumA.전환수, sumB.전환수) },
    ];
  }, [typeFilteredRows]);

  function downloadResultCsv() {
    if (!resultData || resultData.results.length === 0) {
      showToast("다운로드할 분석 결과가 없습니다.");
      return;
    }
    const exportType = (type: AdType, label: string) => {
      const rows = resultData.results.filter((r) => r.__adType === type);
      if (rows.length === 0) return false;
      const cols = buildColDefs(type);
      const headers = cols.map((c) => c.key);
      const csvRows = rows.map((r) => cols.map((c) => (c.fmt === "empty" ? "" : String(getCellValue(r, c.key) ?? ""))));
      downloadCsv(`${label}_핵심지표.csv`, headers, csvRows);
      return true;
    };
    if (typeFilter === "파워링크" || typeFilter === "쇼핑검색" || typeFilter === "브랜드검색") {
      if (!exportType(typeFilter, typeFilter)) showToast(`${typeFilter} 데이터가 없습니다.`);
    } else {
      const okPl = exportType("파워링크", "파워링크");
      const okSs = exportType("쇼핑검색", "쇼핑검색");
      const okBr = exportType("브랜드검색", "브랜드검색");
      if (!okPl && !okSs && !okBr) showToast("다운로드할 데이터가 없습니다.");
    }
  }

  function resetAll() {
    if (!window.confirm("모든 업로드 데이터와 분석 결과를 초기화합니다.\n계속하시겠습니까?")) return;
    setPerfAllRows([]);
    setPerfFileName("");
    setPerfHeaderRowInput("1");
    setPerfHeaderRow(1);
    setPerfMapping(emptyPerfMapping());
    setMappedRows(null);
    setPerfStatus(null);
    setDateMin("");
    setDateMax("");
    setTsvSlots({ 캠페인: null, 광고그룹: null, 키워드: null, 쇼핑검색: null });
    setTsvFailures([]);
    setPeriodAStart("");
    setPeriodAEnd("");
    setPeriodBStart("");
    setPeriodBEnd("");
    setAppliedPeriod(null);
    setTypeFilter("전체");
    setSearchQuery("");
    setSortCol(null);
    setSortAsc(false);
    setPage(1);
    if (perfFileInputRef.current) perfFileInputRef.current.value = "";
    if (tsvFileInputRef.current) tsvFileInputRef.current.value = "";
    showToast("초기화 완료");
  }

  const unitLabel = typeFilter === "쇼핑검색" ? "소재" : typeFilter === "파워링크" || typeFilter === "브랜드검색" ? "키워드" : "항목";

  return (
    <div className="space-y-2">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">입찰가 대량관리 — 키워드 매핑 & 성과 분석</h1>
          <p className="text-sm text-zinc-500">
            성과 CSV와 TSV를 조인해 기간 A(기준) vs B(비교) 성과를 비교합니다. 입찰가를 자동으로 바꾸지는
            않고, &ldquo;수정할 금액&rdquo; 열을 직접 채운 CSV를 네이버 대량 편집기에 올리는 용도입니다.
          </p>
        </div>
        <button
          onClick={resetAll}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          🔄 전체 리셋
        </button>
      </div>

      {/* STEP 1 */}
      <StepCard
        num={1}
        title="성과 CSV 업로드 & 컬럼 매핑"
        subtitle={mappedRows ? `${mappedRows.length.toLocaleString()}행` : ""}
        done={!!mappedRows}
        open={open1}
        onToggle={() => setOpen1((v) => !v)}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">네이버 SA 보고서 CSV</p>
        <div
          className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900"
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
            <b className="text-blue-600">클릭</b> 또는 파일을 여기로 드래그
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">CSV · UTF-8 / EUC-KR 자동 감지</p>
          {perfFileName && <p className="mt-1.5 font-mono text-[11px] text-emerald-600">📄 {perfFileName}</p>}
        </div>

        {perfHeaders.length > 0 && (
          <>
            <hr className="border-zinc-100 dark:border-zinc-800" />
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              컬럼 역할 매핑 <span className="font-normal normal-case text-zinc-400">(자동 감지 — 필요 시 수정)</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PERF_COL_ROLES.map((role) => (
                <div key={role}>
                  <label className="mb-1 block text-[10px] text-zinc-500">
                    {role}
                    {role === "날짜" && <span className="text-red-500"> (필수)</span>}
                    {role === "키워드" && <span className="text-zinc-400"> (파워링크용)</span>}
                    {role === "소재명" && <span className="text-zinc-400"> (쇼핑검색용)</span>}
                  </label>
                  <select
                    value={perfMapping[role]}
                    onChange={(e) => setPerfMapping({ ...perfMapping, [role]: e.target.value })}
                    className={`${inputClass} w-full py-1 text-xs ${perfMapping[role] ? "border-emerald-400" : ""}`}
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

            <hr className="border-zinc-100 dark:border-zinc-800" />
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

            <button onClick={applyPerfMapping} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              ✅ 매핑 적용
            </button>
            {perfStatus && (
              <p className={`text-xs ${perfStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{perfStatus.text}</p>
            )}
          </>
        )}
      </StepCard>

      {/* STEP 2 */}
      <StepCard
        num={2}
        title="ID 매핑 (TSV 업로드)"
        subtitle={
          mergeResult
            ? [mergeResult.kwCount && `키워드 ${mergeResult.kwCount.toLocaleString()}개`, mergeResult.shopCount && `소재 ${mergeResult.shopCount.toLocaleString()}개`]
                .filter(Boolean)
                .join(" · ")
            : "필수"
        }
        done={!!mergeResult}
        open={open2}
        onToggle={() => setOpen2((v) => !v)}
      >
        <div
          className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900"
          onClick={() => tsvFileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onTsvFilesSelected(e.dataTransfer.files);
          }}
        >
          <input
            ref={tsvFileInputRef}
            type="file"
            accept=".tsv,.txt,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onTsvFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mb-1 text-sm font-medium">📂 TSV 파일을 여기에 드래그하거나 클릭해서 선택</p>
          <p className="text-xs text-zinc-400">캠페인·광고그룹·키워드·쇼핑검색 TSV를 한 번에 올려도 됩니다 — 자동 분류</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TSV_SLOT_TYPES.map((type) => {
            const slot = tsvSlots[type];
            return (
              <div
                key={type}
                className={`relative rounded-lg border p-3 text-center ${
                  slot
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {slot && (
                  <button
                    onClick={() => removeTsvSlot(type)}
                    className="absolute right-1.5 top-1.5 text-xs text-zinc-400 hover:text-red-500"
                    title="제거"
                  >
                    ✕
                  </button>
                )}
                <div className="mb-1 text-lg">{slot ? "✅" : TSV_SLOT_ICON[type]}</div>
                <div className="text-xs font-semibold text-zinc-500">{type} TSV</div>
                <div className="mt-0.5 truncate text-[10px] text-zinc-400" title={slot?.file.name}>
                  {slot ? slot.file.name : TSV_SLOT_REQUIRED[type]}
                </div>
              </div>
            );
          })}
        </div>

        {tsvFailures.length > 0 && (
          <div className="space-y-1">
            {tsvFailures.map((name, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                <span>❌</span>
                <span className="flex-1 truncate">{name}</span>
                <span className="whitespace-nowrap">인식 불가</span>
              </div>
            ))}
          </div>
        )}

        {mergeResult ? (
          <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              ✅ ID 매핑 준비 완료 —{" "}
              {[mergeResult.kwCount && `키워드 ${mergeResult.kwCount.toLocaleString()}개`, mergeResult.shopCount && `소재 ${mergeResult.shopCount.toLocaleString()}개`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <button onClick={downloadMappingCsv} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
              📥 매핑 CSV 다운로드
            </button>
            <span className="ml-2 text-xs text-zinc-400">캠페인·광고그룹·키워드 ID, 입찰가, ON/OFF 포함</span>
          </div>
        ) : (
          (tsvSlots.캠페인 || tsvSlots.광고그룹 || tsvSlots.키워드 || tsvSlots.쇼핑검색) && (
            <p className="text-xs text-zinc-400">{tsvMissingHint}</p>
          )
        )}
      </StepCard>

      {/* STEP 3 */}
      <StepCard num={3} title="기간 A / B 설정" subtitle={appliedPeriod ? `A: ${appliedPeriod.a0}~${appliedPeriod.a1} / B: ${appliedPeriod.b0}~${appliedPeriod.b1}` : ""} done={!!appliedPeriod} open={open3} onToggle={() => setOpen3((v) => !v)}>
        <p className="text-xs text-zinc-400">A = 기준기간 / B = 비교기간</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="mb-2 text-xs font-bold text-blue-600">A — 기준기간</p>
            <div className="mb-2 flex items-center gap-2">
              <label className="w-10 text-xs text-zinc-500">시작</label>
              <input type="date" value={periodAStart} min={dateMin || undefined} max={dateMax || undefined} onChange={(e) => setPeriodAStart(e.target.value)} className={`${inputClass} flex-1`} />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-zinc-500">종료</label>
              <input type="date" value={periodAEnd} min={dateMin || undefined} max={dateMax || undefined} onChange={(e) => setPeriodAEnd(e.target.value)} className={`${inputClass} flex-1`} />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="mb-2 text-xs font-bold text-purple-600">B — 비교기간</p>
            <div className="mb-2 flex items-center gap-2">
              <label className="w-10 text-xs text-zinc-500">시작</label>
              <input type="date" value={periodBStart} min={dateMin || undefined} max={dateMax || undefined} onChange={(e) => setPeriodBStart(e.target.value)} className={`${inputClass} flex-1`} />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-zinc-500">종료</label>
              <input type="date" value={periodBEnd} min={dateMin || undefined} max={dateMax || undefined} onChange={(e) => setPeriodBEnd(e.target.value)} className={`${inputClass} flex-1`} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runAnalysis} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            🔍 분석 실행
          </button>
          <button onClick={setPeriodFull} disabled={!dateMin} className="rounded-lg border border-zinc-300 px-4 py-2 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800">
            전체 기간으로 설정
          </button>
        </div>
      </StepCard>

      {/* STEP 4 */}
      {resultData && (
        <StepCard num={4} title="분석 결과" subtitle={`${sortedRows.length.toLocaleString()}개 ${unitLabel}`} done={false} open={open4} onToggle={() => setOpen4((v) => !v)}>
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTypeFilter(t);
                  setPage(1);
                  setSortCol(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  typeFilter === t ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {typeFilter === "전체" ? "전체" : typeFilter} 지표 비교 (A vs B)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {summaryMetrics.map((m) => {
                const isPositive = m.delta !== null && m.delta >= 0;
                return (
                  <div key={m.label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-400">{m.label}</div>
                    <div className="text-sm font-bold">{m.value}</div>
                    {m.delta !== null && (
                      <div className={`text-[11px] ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {isPositive ? "▲" : "▼"} {Math.abs(m.delta).toFixed(1)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{unitLabel}별 기간 비교</p>
            <div className="flex items-center gap-2">
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="검색..."
                className="w-44 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button onClick={downloadResultCsv} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                📥 핵심지표 CSV
              </button>
            </div>
          </div>

          {sortedRows.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 py-12 text-center text-sm text-zinc-400 dark:border-zinc-800">표시할 데이터가 없습니다</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full whitespace-nowrap text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                      {colDefs.map((col) => {
                        const active = sortCol === col.key;
                        return (
                          <th
                            key={col.key}
                            onClick={() => sortByCol(col.key)}
                            className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-zinc-700 dark:hover:text-zinc-300 ${
                              col.isLeft ? "text-left" : "text-right"
                            } ${active ? "text-zinc-800 dark:text-zinc-200" : ""}`}
                          >
                            {col.label}
                            <span className="ml-1 opacity-50">{active ? (sortAsc ? "▲" : "▼") : "⇅"}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                        {colDefs.map((col) => (
                          <td key={col.key} className={`px-3 py-1.5 ${col.isLeft ? "text-left" : "text-right"} ${col.fmt === "id" ? "font-mono" : ""}`}>
                            {renderCell(getCellValue(row, col.key), col.fmt)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  총 {sortedRows.length.toLocaleString()}개 {unitLabel}
                  {searchQuery ? " (필터 적용)" : ""}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1} className="rounded border border-zinc-300 px-2.5 py-1 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 dark:border-zinc-700">
                    ‹ 이전
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - clampedPage) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p} className="flex items-center">
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-zinc-300">…</span>}
                        <button
                          onClick={() => setPage(p)}
                          className={`rounded border px-2.5 py-1 ${
                            p === clampedPage ? "border-blue-600 bg-blue-600 font-bold text-white" : "border-zinc-300 hover:border-blue-400 hover:text-blue-500 dark:border-zinc-700"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage >= totalPages} className="rounded border border-zinc-300 px-2.5 py-1 hover:border-blue-400 hover:text-blue-500 disabled:opacity-30 dark:border-zinc-700">
                    다음 ›
                  </button>
                </div>
              </div>
            </>
          )}
        </StepCard>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-500 bg-white px-4 py-2.5 text-sm font-medium text-emerald-600 shadow-lg dark:bg-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}
