"use client";

// UTM 빌더 — 캠페인·그룹 모드
// 이미 다운로드해둔 캠페인/광고그룹 리포트 CSV를 업로드하면, 캠페인ID/광고그룹ID를
// utm_campaign/utm_content로 자동 치환해 PC·모바일 URL에 UTM을 결합해준다.

import { useMemo, useRef, useState } from "react";
import { autoMatchColumn, downloadCsv, parseCSVText } from "@/lib/csv-utils";
import { appendQuery, encodeUtmValue, stripUtmParams } from "@/lib/utm-utils";

const ROLES = ["캠페인ID", "광고그룹ID", "PC URL", "MO URL"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = {
  캠페인ID: "캠페인 ID",
  광고그룹ID: "광고그룹 ID",
  "PC URL": "PC URL",
  "MO URL": "MO URL",
};
const REQUIRED_ROLES: Role[] = ["캠페인ID", "광고그룹ID", "PC URL"];
const HINTS: Record<Role, string[]> = {
  캠페인ID: ["캠페인ID", "캠페인 ID", "campaign_id", "campaignid", "cmpid"],
  광고그룹ID: ["광고그룹ID", "광고그룹 ID", "group_id", "adgroupid", "grpid"],
  "PC URL": ["PC URL", "PCURL", "pc_url", "pcurl"],
  "MO URL": ["MO URL", "MOURL", "mo_url", "mourl", "모바일 URL", "모바일URL"],
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type ResultTable = { headers: string[]; rows: string[][] };

function today(): string {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function CampaignUtmMode() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<Role, string>>({
    캠페인ID: "",
    광고그룹ID: "",
    "PC URL": "",
    "MO URL": "",
  });

  const [source, setSource] = useState("naver_sa");
  const [medium, setMedium] = useState("cpc");
  const [term, setTerm] = useState("");
  const [stripExisting, setStripExisting] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultTable | null>(null);

  const missingRequired = REQUIRED_ROLES.filter((role) => !mapping[role]);

  const onSelectFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      const table = parseCSVText(text);
      if (table.length < 2) {
        setError("CSV에서 데이터를 찾지 못했습니다.");
        return;
      }
      const hdrs = table[0].map((h) => h.trim());
      setHeaders(hdrs);
      setRows(table.slice(1));
      setFileName(file.name);
      const next: Record<Role, string> = { 캠페인ID: "", 광고그룹ID: "", "PC URL": "", "MO URL": "" };
      ROLES.forEach((role) => {
        next[role] = autoMatchColumn(hdrs, HINTS[role]);
      });
      setMapping(next);
    };
    reader.readAsText(file, "utf-8");
  };

  function buildUtmQuery(campaignId: string, groupId: string): string {
    const parts: string[] = [];
    if (source.trim()) parts.push(`utm_source=${encodeUtmValue(source.trim())}`);
    if (medium.trim()) parts.push(`utm_medium=${encodeUtmValue(medium.trim())}`);
    if (campaignId) parts.push(`utm_campaign=${encodeUtmValue(campaignId)}`);
    if (groupId) parts.push(`utm_content=${encodeUtmValue(groupId)}`);
    if (term.trim()) parts.push(`utm_term=${encodeUtmValue(term.trim())}`);
    return parts.join("&");
  }

  function applyUtm(url: string, campaignId: string, groupId: string): string {
    if (!url.trim()) return "";
    const base = stripExisting ? stripUtmParams(url) : url.trim();
    return appendQuery(base, buildUtmQuery(campaignId, groupId));
  }

  function extractRow(row: string[]) {
    const iCmp = headers.indexOf(mapping["캠페인ID"]);
    const iGrp = headers.indexOf(mapping["광고그룹ID"]);
    const iPc = headers.indexOf(mapping["PC URL"]);
    const iMo = headers.indexOf(mapping["MO URL"]);
    const cmp = (row[iCmp] ?? "").trim();
    const grp = (row[iGrp] ?? "").trim();
    const pc = (row[iPc] ?? "").trim();
    const moRaw = iMo >= 0 ? (row[iMo] ?? "").trim() : "";
    const mo = moRaw || pc;
    return { cmp, grp, pc, mo };
  }

  const previewRows = useMemo(() => {
    if (missingRequired.length > 0 || rows.length === 0) return [];
    return rows.slice(0, 10).map((r) => {
      const { cmp, grp, pc, mo } = extractRow(r);
      return { cmp, grp, pcUrl: applyUtm(pc, cmp, grp), moUrl: applyUtm(mo, cmp, grp) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mapping, source, medium, term, stripExisting]);

  const run = () => {
    setError(null);
    if (missingRequired.length > 0) {
      setError(`다음 열을 매핑해주세요: ${missingRequired.join(", ")}`);
      return;
    }
    const outRows = rows.map((r) => {
      const { cmp, grp, pc, mo } = extractRow(r);
      return [...r, applyUtm(pc, cmp, grp), applyUtm(mo, cmp, grp)];
    });
    setResult({ headers: [...headers, "PC URL(UTM)", "MO URL(UTM)"], rows: outRows });
  };

  const downloadFull = () => {
    if (!result) return;
    downloadCsv(`캠페인그룹UTM_전체_${today()}.csv`, result.headers, result.rows);
  };

  const downloadCore = () => {
    if (!result) return;
    const iCmp = headers.indexOf(mapping["캠페인ID"]);
    const iGrp = headers.indexOf(mapping["광고그룹ID"]);
    const coreRows = result.rows.map((r) => [r[iCmp], r[iGrp], r[r.length - 2], r[r.length - 1]]);
    downloadCsv(
      `캠페인그룹UTM_핵심_${today()}.csv`,
      ["캠페인ID", "광고그룹ID", "PC URL(UTM)", "MO URL(UTM)"],
      coreRows,
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 왼쪽: CSV 업로드 + 열 매핑 */}
        <section className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              캠페인/그룹 리포트 CSV <span className="text-red-500">*</span>
            </label>
            <div
              className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center transition-colors hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onSelectFile(e.dataTransfer.files[0] ?? null);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              />
              {fileName ? (
                <p className="font-mono text-[13px] text-emerald-600">
                  ✓ {fileName} ({rows.length.toLocaleString()}행)
                </p>
              ) : (
                <p className="text-sm text-zinc-400">
                  캠페인ID·광고그룹ID·PC URL이 담긴 CSV를 클릭하거나 끌어다 놓으세요
                </p>
              )}
            </div>
          </div>

          {headers.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                열 매핑 <span className="text-xs font-normal text-zinc-400">(자동 인식됨, 다르면 직접 변경)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <div key={role}>
                    <label className="mb-1 block text-xs text-zinc-500">
                      {ROLE_LABEL[role]}
                      {REQUIRED_ROLES.includes(role) ? (
                        <span className="text-red-500"> *</span>
                      ) : (
                        <span className="text-zinc-400"> (선택)</span>
                      )}
                    </label>
                    <select
                      value={mapping[role]}
                      onChange={(e) => {
                        setMapping({ ...mapping, [role]: e.target.value });
                        setResult(null);
                      }}
                      className={`${inputClass} ${mapping[role] ? "border-emerald-400" : ""}`}
                    >
                      <option value="">(없음)</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 오른쪽: UTM 설정 */}
        <section className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">utm_source</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">utm_medium</label>
            <input value={medium} onChange={(e) => setMedium(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              utm_campaign · utm_content{" "}
              <span className="text-xs font-normal text-zinc-400">(캠페인ID·광고그룹ID로 자동 치환)</span>
            </label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
              ID 자동 치환
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              utm_term <span className="text-xs font-normal text-zinc-400">(선택)</span>
            </label>
            <input value={term} onChange={(e) => setTerm(e.target.value)} className={inputClass} />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <input
              type="checkbox"
              id="stripExisting"
              checked={stripExisting}
              onChange={(e) => setStripExisting(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="stripExisting" className="text-sm">
              기존 URL의 UTM 제거 후 결합
              <span className="ml-1 text-xs text-zinc-400">(URL에 이미 utm_ 파라미터가 있으면 지우고 새로 붙임)</span>
            </label>
          </div>
        </section>
      </div>

      {previewRows.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-medium">매핑 확인 (상위 10행)</p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-3 py-2 font-medium">캠페인ID</th>
                  <th className="px-3 py-2 font-medium">광고그룹ID</th>
                  <th className="px-3 py-2 font-medium">PC URL(UTM)</th>
                  <th className="px-3 py-2 font-medium">MO URL(UTM)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-100 font-mono last:border-0 dark:border-zinc-800/60">
                    <td className="max-w-[140px] truncate px-3 py-1.5">{r.cmp}</td>
                    <td className="max-w-[140px] truncate px-3 py-1.5">{r.grp}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5 text-blue-600 dark:text-blue-400">{r.pcUrl}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5 text-blue-600 dark:text-blue-400">{r.moUrl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={rows.length === 0}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          ⚡ UTM 결합 실행 ({rows.length.toLocaleString()}행)
        </button>

        {result && (
          <>
            <button
              onClick={downloadFull}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              ⬇ 전체 열 다운로드
            </button>
            <button
              onClick={downloadCore}
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              📋 핵심 열 다운로드
            </button>
          </>
        )}
      </div>
    </div>
  );
}
