"use client";

// AI 분석 — 조회된 GA4 데이터를 Groq LLM으로 분석
// (비로그인 시에는 예시 목응답을 보여준다)

import { useState } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { resolveDates } from "@/lib/ga4-dates";
import { MOCK_AI_INSIGHT } from "@/lib/mock-data";

export default function InsightsPage() {
  const { propertyId, rangeDays, properties, isRealProperties, range } = useDashboard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const propertyName = properties.find((p) => p.id === propertyId)?.name ?? propertyId;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    if (!isRealProperties) {
      // 비로그인: 예시 응답
      setTimeout(() => {
        setResult(MOCK_AI_INSIGHT);
        setLoading(false);
      }, 1200);
      return;
    }

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, propertyName, ...resolveDates(range) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `분석 실패 (${res.status})`);
      setResult(data.insight as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">AI 분석</h1>
        <p className="text-sm text-zinc-500">
          {propertyName} · 최근 {rangeDays}일 데이터 기반 인사이트{" "}
          {isRealProperties ? "(Groq AI)" : "(비로그인 — 예시 응답)"}
        </p>
      </div>

      <button
        onClick={runAnalysis}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "분석 중..." : "AI 분석"}
      </button>

      {loading && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          GA4 데이터를 수집하고 AI가 분석하고 있습니다... (10~30초)
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <article className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-6 text-sm leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          {result}
        </article>
      )}

      {!loading && !result && !error && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400 dark:border-zinc-700">
          &quot;AI 분석&quot; 버튼을 누르면 현재 선택된 Property와 기간의 데이터를 기반으로
          <br />
          주요 변화 요약 · 원인 분석 · 채널 발견 · 이상 탐지 · 개선 제안을 생성합니다.
        </div>
      )}
    </div>
  );
}
