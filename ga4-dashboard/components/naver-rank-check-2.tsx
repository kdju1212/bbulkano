"use client";

// 네이버 관리 — 파워링크 실시간 순위 체크 2
// 기존 "파워링크 순위 체크"와 같은 API/저장 방식(저장·이력 없음, 버튼 누른 순간에만 조회)을 쓰되,
// 순위를 네이버가 준 r= 숫자 하나만 믿지 않고, 광고가 문서에 등장한 순서(positionRank)와
// 교차검증해서 둘이 다르면 화면에 경고로 표시한다. 우리 업체명 자동입력 버튼도 추가.

import { useState } from "react";
import type { RankResult } from "@/lib/naver-rank-check";
import { RANK_STATUS_LABEL } from "@/lib/naver-rank-check";

const QUICK_ADVERTISERS = ["도시락eSIM", "와이파이도시락"];

type RowResult = {
  keyword: string;
  pc?: RankResult;
  mobile?: RankResult;
};

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function randomDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 2000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOne(keyword: string, device: "pc" | "mobile", advertiser: string): Promise<RankResult> {
  const res = await fetch("/api/naver-rank-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, device, advertiser }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: "error", message: body?.error ?? `HTTP ${res.status}` };
  }
  const body = await res.json();
  return body.result as RankResult;
}

function ResultCell({ result }: { result: RankResult | undefined }) {
  if (!result) return <span className="text-zinc-300">–</span>;

  if (result.status === "found") {
    const mismatch = result.rank !== result.positionRank;
    if (!mismatch) {
      return <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">{result.rank}위</span>;
    }
    return (
      <details className="text-xs">
        <summary className="cursor-pointer font-mono text-base font-bold text-amber-600 dark:text-amber-400">
          {result.rank}위 ⚠️
        </summary>
        <div className="mt-1 max-w-xs rounded bg-amber-50 p-2 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          r= 숫자는 {result.rank}위인데, 문서 등장 순서로 세면 {result.positionRank}위라 서로 다릅니다 — 확인이
          필요할 수 있어요.
        </div>
      </details>
    );
  }

  const color =
    result.status === "blocked" || result.status === "error"
      ? "text-red-500"
      : result.status === "not_found_has_more"
        ? "text-amber-500"
        : "text-zinc-400";
  const label = result.status === "error" ? result.message : RANK_STATUS_LABEL[result.status];

  if (result.status === "blocked" && result.debug) {
    const { httpStatus, length, snippet } = result.debug;
    return (
      <details className="text-xs">
        <summary className={`cursor-pointer ${color}`}>{label}</summary>
        <div className="mt-1 max-w-xs rounded bg-zinc-100 p-2 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">
          <div>HTTP {httpStatus} · {length.toLocaleString()}자</div>
          <div className="mt-1 break-all">{snippet || "(응답 본문 없음)"}</div>
        </div>
      </details>
    );
  }

  if ((result.status === "not_found_has_more" || result.status === "not_found_no_more") && result.debug) {
    const { ads, rawSnippet } = result.debug;
    return (
      <details className="text-xs">
        <summary className={`cursor-pointer ${color}`}>{label}</summary>
        <div className="mt-1 max-w-xs rounded bg-zinc-100 p-2 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">
          <div>추출된 광고 {ads.length}개</div>
          {ads.length === 0 ? (
            <>
              <div className="mt-1">(파워링크 영역은 있지만 광고를 하나도 못 뽑음 — 패턴이 안 맞을 수 있음)</div>
              {rawSnippet && <div className="mt-1 max-h-40 overflow-y-auto break-all whitespace-pre-wrap">{rawSnippet}</div>}
            </>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {ads.map((ad) => (
                <li key={ad.rank} className="break-all">
                  {ad.rank}. {ad.name || "(이름 없음)"} — {ad.domain}
                  {ad.rank !== ad.positionRank && (
                    <span className="text-amber-600 dark:text-amber-400"> (등장순서 {ad.positionRank}위 ⚠️)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    );
  }

  return <span className={`text-xs ${color}`}>{label}</span>;
}

export function NaverRankCheck2() {
  const [advertiser, setAdvertiser] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const keywords = keywordText
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);

  async function run() {
    if (!advertiser.trim() || keywords.length === 0 || running) return;
    setRunning(true);
    const initial = keywords.map((keyword) => ({ keyword }));
    setRows(initial);
    setProgress({ done: 0, total: keywords.length * 2 });

    let done = 0;
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];

      const pc = await checkOne(keyword, "pc", advertiser.trim());
      done += 1;
      setProgress({ done, total: keywords.length * 2 });
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, pc } : r)));
      await sleep(randomDelayMs());

      const mobile = await checkOne(keyword, "mobile", advertiser.trim());
      done += 1;
      setProgress({ done, total: keywords.length * 2 });
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, mobile } : r)));
      if (i < keywords.length - 1) await sleep(randomDelayMs());
    }
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-bold">파워링크 실시간 순위 체크 2</h2>
        <p className="mb-4 text-xs text-zinc-500">
          버튼을 누르는 순간 네이버 검색결과를 그때그때 확인합니다. 이력은 저장하지 않습니다. 네이버가 준 순위
          숫자(r=)와 광고가 문서에 등장한 순서를 서로 비교해서, 둘이 다르면 ⚠️로 표시합니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              우리 업체명 (검색결과에 뜨는 이름 그대로)
            </label>
            <div className="flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                value={advertiser}
                onChange={(e) => setAdvertiser(e.target.value)}
                placeholder="도시락eSIM"
              />
              {QUICK_ADVERTISERS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setAdvertiser(name)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {name}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-400">도메인으로 입력해도 인식됩니다</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">키워드 (줄바꿈으로 구분)</label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={"해외유심\n일본 esim\n미국 esim"}
            />
            <span className="text-xs text-zinc-400">{keywords.length}개 인식됨</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={run}
            disabled={running || !advertiser.trim() || keywords.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {running ? `확인 중... (${progress.done}/${progress.total})` : "순위 확인 시작"}
          </button>
          {running && (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                <th className="px-4 py-2.5 font-medium">키워드</th>
                <th className="px-4 py-2.5 font-medium">PC</th>
                <th className="px-4 py-2.5 font-medium">모바일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.keyword} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5">{row.keyword}</td>
                  <td className="px-4 py-2.5">
                    <ResultCell result={row.pc} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ResultCell result={row.mobile} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
