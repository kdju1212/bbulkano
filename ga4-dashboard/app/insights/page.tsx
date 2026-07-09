"use client";

// AI 분석 — 조회된 GA4 데이터를 AI로 분석 (STEP 1: 목 응답, STEP 6에서 OpenAI 연결)

import { useState } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { MOCK_AI_INSIGHT, MOCK_PROPERTIES } from "@/lib/mock-data";

export default function InsightsPage() {
  const { propertyId, rangeDays } = useDashboard();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const propertyName = MOCK_PROPERTIES.find((p) => p.id === propertyId)?.name ?? propertyId;

  const runAnalysis = () => {
    setLoading(true);
    setResult(null);
    // STEP 6에서 /api/ai/analyze 호출로 교체
    setTimeout(() => {
      setResult(MOCK_AI_INSIGHT);
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">AI 분석</h1>
        <p className="text-sm text-zinc-500">
          {propertyName} · 최근 {rangeDays}일 데이터 기반 인사이트
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
          GA4 데이터를 분석하고 있습니다...
        </div>
      )}

      {result && (
        <article className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-6 text-sm leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          {result}
        </article>
      )}

      {!loading && !result && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400 dark:border-zinc-700">
          &quot;AI 분석&quot; 버튼을 누르면 현재 선택된 Property와 기간의 데이터를 기반으로
          <br />
          주요 변화 요약 · 원인 분석 · 채널 발견 · 이상 탐지 · 개선 제안을 생성합니다.
        </div>
      )}
    </div>
  );
}
