"use client";

// 네이버 관리 — 파워링크 실시간 순위 체크
// 버튼을 누른 순간에만 네이버 검색결과를 그때그때 가져와 우리 광고 순위를 확인한다 (저장/이력 없음).
// 키워드 최대 25개 × PC/모바일 = 최대 50회 요청을 클라이언트가 순차적으로, 무작위 지연(1~3초)을 두고 호출한다.
// (한 번에 몰아치지 않고 사람이 누르는 속도에 가깝게 흉내내기 위함 — 프록시·캡차 우회 등은 다루지 않는다.)

import { useState } from "react";
import type { RankResult } from "@/lib/naver-rank-check";
import { RANK_STATUS_LABEL } from "@/lib/naver-rank-check";

const MAX_KEYWORDS = 25;

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
    return <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">{result.rank}위</span>;
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

export function NaverRankCheck() {
  const [advertiser, setAdvertiser] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const keywords = keywordText
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);

  const overLimit = keywordText.split("\n").map((k) => k.trim()).filter(Boolean).length > MAX_KEYWORDS;

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
        <h2 className="mb-1 text-sm font-bold">파워링크 실시간 순위 체크</h2>
        <p className="mb-4 text-xs text-zinc-500">
          버튼을 누르는 순간 네이버 검색결과를 그때그때 확인합니다. 이력은 저장하지 않습니다. 키워드는 최대{" "}
          {MAX_KEYWORDS}개, PC·모바일 합쳐 최대 {MAX_KEYWORDS * 2}회 요청이 순차적으로(무작위 지연 포함) 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              우리 업체명 (검색결과에 뜨는 이름 그대로, 예: 도시락eSIM)
            </label>
            <input
              className={inputClass}
              value={advertiser}
              onChange={(e) => setAdvertiser(e.target.value)}
              placeholder="도시락eSIM"
            />
            <span className="text-xs text-zinc-400">도메인(dosirakesim.com)으로 입력해도 인식됩니다</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              키워드 (줄바꿈으로 구분, 최대 {MAX_KEYWORDS}개)
            </label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={"해외유심\n일본 esim\n미국 esim"}
            />
            <span className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-400"}`}>
              {keywords.length}/{MAX_KEYWORDS}개 인식됨{overLimit ? ` — ${MAX_KEYWORDS}개까지만 확인합니다` : ""}
            </span>
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
