"use client";

// UTM 빌더
// - 키워드 모드: 키워드ID/키워드 목록 + URL·UTM → 네이버 검색광고 '키워드 URL 일괄수정' CSV
// - 캠페인·그룹 모드: 캠페인/광고그룹 리포트 CSV 업로드 → ID를 utm_campaign/utm_content로 자동 치환해 결합
// - DA 모드: URL + UTM만 입력해서 완성된 URL 하나를 복사

import { useMemo, useState } from "react";
import { CampaignUtmMode } from "@/components/campaign-utm-mode";

type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
};

type Mode = "keyword" | "campaign" | "da";

const UTM_FIELDS: Array<{ key: keyof UtmParams; label: string; placeholder: string }> = [
  { key: "source", label: "utm_source", placeholder: "naver" },
  { key: "medium", label: "utm_medium", placeholder: "cpc" },
  { key: "campaign", label: "utm_campaign", placeholder: "브랜드_검색" },
  { key: "term", label: "utm_term", placeholder: "{키워드} 입력 시 각 행의 키워드로 치환" },
  { key: "content", label: "utm_content", placeholder: "" },
];

// encodeURIComponent는 한글을 %EC%95... 식으로 퍼센트 인코딩해서 사람이 못 읽게 만든다.
// UTM 값은 쿼리스트링 구조를 깨는 문자(공백, &, =, #, +, %)만 최소한으로 escape하고
// 한글을 포함한 나머지 문자는 그대로 둔다 (대부분의 광고/분석 플랫폼이 원문 그대로 잘 처리함).
function encodeUtmValue(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\+/g, "%2B")
    .replace(/ /g, "+");
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** keyword가 null이면 {키워드} 치환 없이 UTM 값을 그대로 사용한다 (DA 모드용). */
function buildUrl(base: string, utm: UtmParams, keyword: string | null): string {
  const entries = UTM_FIELDS.map(({ key, label }) => [label, utm[key].trim()] as const).filter(
    ([, value]) => value !== "",
  );
  if (base.trim() === "" || entries.length === 0) return base.trim();
  const query = entries
    .map(([name, value]) => {
      const substituted =
        keyword === null ? value : value.replaceAll("{키워드}", keyword).replaceAll("{keyword}", keyword);
      return `${name}=${encodeUtmValue(substituted)}`;
    })
    .join("&");
  return base.trim() + (base.includes("?") ? "&" : "?") + query;
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default function UtmBuilderPage() {
  const [mode, setMode] = useState<Mode>("keyword");

  // 키워드 모드 상태
  const [keywordIdsText, setKeywordIdsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [pcUrl, setPcUrl] = useState("");
  const [mobileUrl, setMobileUrl] = useState("");
  const [downloading, setDownloading] = useState(false);

  // DA 모드 상태
  const [daUrl, setDaUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // 두 모드가 공유하는 UTM 파라미터
  const [utm, setUtm] = useState<UtmParams>({
    source: "",
    medium: "",
    campaign: "",
    term: "",
    content: "",
  });

  const [error, setError] = useState<string | null>(null);

  const keywordIds = useMemo(() => splitLines(keywordIdsText), [keywordIdsText]);
  const keywords = useMemo(() => splitLines(keywordsText), [keywordsText]);

  const countMismatch =
    keywords.length > 0 && keywordIds.length > 0 && keywords.length !== keywordIds.length;

  const previewPc = buildUrl(pcUrl || "https://example.com", utm, keywords[0] ?? "키워드");
  const daCompletedUrl = buildUrl(daUrl, utm, null);

  const download = async () => {
    setError(null);
    if (keywordIds.length === 0) {
      setError("키워드ID를 1개 이상 입력해주세요.");
      return;
    }
    if (pcUrl.trim() === "") {
      setError("PC URL을 입력해주세요.");
      return;
    }
    setDownloading(true);
    try {
      const effectiveMobile = mobileUrl.trim() === "" ? pcUrl : mobileUrl;
      const rows = keywordIds.map((keywordId, i) => {
        const keyword = keywords[i] ?? "";
        return {
          keywordId,
          keyword,
          pcUrl: buildUrl(pcUrl, utm, keyword),
          mobileUrl: buildUrl(effectiveMobile, utm, keyword),
        };
      });
      const res = await fetch("/api/utm-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `생성 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const today = new Date();
      const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `키워드URL_UTM_${yymmdd}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  const copyDaUrl = async () => {
    setError(null);
    if (daUrl.trim() === "") {
      setError("URL을 입력해주세요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(daCompletedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">UTM 빌더</h1>
          <p className="text-sm text-zinc-500">
            {mode === "keyword"
              ? "키워드ID·키워드 목록과 UTM 값을 입력하면 네이버 검색광고 '키워드 URL 일괄수정' 업로드용 CSV를 만들어줍니다."
              : mode === "campaign"
                ? "캠페인/광고그룹 리포트 CSV를 업로드하면 캠페인ID·광고그룹ID를 utm_campaign·utm_content로 자동 치환해 UTM을 결합해줍니다."
                : "URL과 UTM 값을 입력하면 완성된 URL을 바로 복사할 수 있습니다."}
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
          {(
            [
              ["keyword", "키워드"],
              ["campaign", "캠페인·그룹"],
              ["da", "DA"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`px-4 py-1.5 first:rounded-l-md last:rounded-r-md ${
                mode === value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "keyword" ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 왼쪽: 키워드ID / 키워드 */}
            <section className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  키워드ID <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs font-normal text-zinc-400">{keywordIds.length}개</span>
                </label>
                <textarea
                  value={keywordIdsText}
                  onChange={(e) => setKeywordIdsText(e.target.value)}
                  placeholder={"nkw-a001-01-000000001\nnkw-a001-01-000000002\nnkw-a001-01-000000003"}
                  className={`${inputClass} h-80 resize-y font-mono text-[13px]`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  키워드
                  <span className="ml-2 text-xs font-normal text-zinc-400">{keywords.length}개</span>
                </label>
                <textarea
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder={"마늘\n갈릭\n마늘빵\n마늘보쌈"}
                  className={`${inputClass} h-80 resize-y text-[13px]`}
                />
              </div>
              {countMismatch && (
                <p className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  키워드ID {keywordIds.length}개 / 키워드 {keywords.length}개 — 개수가 다릅니다. 행은
                  키워드ID 기준으로 만들어지고, 키워드가 모자라면 빈칸으로 들어갑니다.
                </p>
              )}
            </section>

            {/* 오른쪽: URL + UTM */}
            <section className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  PC URL <span className="text-red-500">*</span>
                </label>
                <input
                  value={pcUrl}
                  onChange={(e) => setPcUrl(e.target.value)}
                  placeholder="https://example.com/event"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  모바일 URL{" "}
                  <span className="text-xs font-normal text-zinc-400">(선택 — 비우면 PC URL 사용)</span>
                </label>
                <input
                  value={mobileUrl}
                  onChange={(e) => setMobileUrl(e.target.value)}
                  placeholder="https://m.example.com/event"
                  className={inputClass}
                />
              </div>

              {UTM_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium">{label}</label>
                  <input
                    value={utm[key]}
                    onChange={(e) => setUtm({ ...utm, [key]: e.target.value })}
                    placeholder={placeholder}
                    className={inputClass}
                  />
                </div>
              ))}

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-1 font-medium text-zinc-500">완성 URL 미리보기 (첫 번째 행 기준)</p>
                <p className="break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {previewPc}
                </p>
                <p className="mt-2 text-zinc-400">
                  팁: utm 값에 <code className="font-mono">{"{키워드}"}</code>를 쓰면 각 행의 키워드로
                  자동 치환됩니다.
                </p>
              </div>
            </section>
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={download}
            disabled={downloading}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? "생성 중..." : `CSV 다운로드 (${keywordIds.length}행)`}
          </button>
        </>
      ) : mode === "campaign" ? (
        <CampaignUtmMode />
      ) : (
        <div className="max-w-xl space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              URL <span className="text-red-500">*</span>
            </label>
            <input
              value={daUrl}
              onChange={(e) => setDaUrl(e.target.value)}
              placeholder="https://example.com/event"
              className={inputClass}
            />
          </div>

          {UTM_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium">{label}</label>
              <input
                value={utm[key]}
                onChange={(e) => setUtm({ ...utm, [key]: e.target.value })}
                placeholder={key === "term" ? "" : placeholder}
                className={inputClass}
              />
            </div>
          ))}

          <div>
            <p className="mb-1 text-sm font-medium">완성 URL</p>
            <p className="break-all rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {daCompletedUrl || "URL을 입력하면 여기에 표시됩니다."}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={copyDaUrl}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
              copied ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {copied ? "복사됨!" : "복사하기"}
          </button>
        </div>
      )}
    </div>
  );
}
