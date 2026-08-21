"use client";

// 네이버 관리 — 쇼핑검색(네이버 가격비교) 실시간 순위 체크
// 파워링크와 같은 방식(버튼 누른 순간에만 조회, 저장/이력 없음, 순차 호출 + 무작위 지연)이지만
// 대상이 쇼핑검색(가격비교) 영역이다. 순위 숫자가 따로 없어 문서 등장 순서를 순위로 쓰고,
// 판매처 도메인이 평문으로 안 보여서 판매처 표시 이름으로만 매칭한다 — 파워링크보다 오탐 가능성이 높다.

import { useState } from "react";
import type { ShoppingRankResult } from "@/lib/naver-shopping-check";
import { SHOPPING_STATUS_LABEL } from "@/lib/naver-shopping-check";

type RowResult = {
  keyword: string;
  pc?: ShoppingRankResult;
  mobile?: ShoppingRankResult;
};

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function randomDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 2000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOne(keyword: string, device: "pc" | "mobile", storeName: string): Promise<ShoppingRankResult> {
  const res = await fetch("/api/naver-shopping-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, device, storeName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: "error", message: body?.error ?? `HTTP ${res.status}` };
  }
  const body = await res.json();
  return body.result as ShoppingRankResult;
}

function ResultCell({ result }: { result: ShoppingRankResult | undefined }) {
  if (!result) return <span className="text-zinc-300">–</span>;
  if (result.status === "found") {
    return (
      <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">
        {result.rank}위{!result.isAd && <span className="ml-1 text-xs font-normal text-zinc-400">(비광고)</span>}
      </span>
    );
  }

  const color = result.status === "blocked" || result.status === "error" ? "text-red-500" : "text-zinc-400";
  const label = result.status === "error" ? result.message : SHOPPING_STATUS_LABEL[result.status];

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

  if (result.status === "not_found" && result.debug) {
    const { items } = result.debug;
    return (
      <details className="text-xs">
        <summary className={`cursor-pointer ${color}`}>{label}</summary>
        <div className="mt-1 max-w-xs rounded bg-zinc-100 p-2 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">
          <div>추출된 상품 {items.length}개</div>
          {items.length === 0 ? (
            <div className="mt-1">(가격비교 영역은 있지만 상품을 하나도 못 뽑음 — 패턴이 안 맞을 수 있음)</div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {items.map((it, i) => (
                <li key={i} className="break-all">
                  {it.rank}. {it.storeName || "(이름 없음)"} {it.isAd ? "" : "(비광고)"}
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

export function NaverShoppingCheck() {
  const [storeName, setStoreName] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const keywords = keywordText
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);

  async function run() {
    if (!storeName.trim() || keywords.length === 0 || running) return;
    setRunning(true);
    const initial = keywords.map((keyword) => ({ keyword }));
    setRows(initial);
    setProgress({ done: 0, total: keywords.length * 2 });

    let done = 0;
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];

      const pc = await checkOne(keyword, "pc", storeName.trim());
      done += 1;
      setProgress({ done, total: keywords.length * 2 });
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, pc } : r)));
      await sleep(randomDelayMs());

      const mobile = await checkOne(keyword, "mobile", storeName.trim());
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
        <h2 className="mb-1 text-sm font-bold">쇼핑검색(가격비교) 실시간 순위 체크</h2>
        <p className="mb-4 text-xs text-zinc-500">
          실험적 기능입니다 — 판매처 도메인이 평문으로 없어서 판매처 이름으로만 매칭하고, 페이지 구조가 파워링크보다
          자주 바뀔 수 있어 오탐 가능성이 더 높습니다. 이력은 저장하지 않습니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              우리 판매처 이름 (콤마로 여러 개 입력 가능)
            </label>
            <input
              className={inputClass}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="도시락이심"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">키워드 (줄바꿈으로 구분)</label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={"중국유심\n일본 esim"}
            />
            <span className="text-xs text-zinc-400">{keywords.length}개 인식됨</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={run}
            disabled={running || !storeName.trim() || keywords.length === 0}
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
