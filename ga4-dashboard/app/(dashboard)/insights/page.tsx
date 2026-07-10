"use client";

// AI 분석 — GA4 데이터를 근거로 대화하는 챗봇
// (비로그인 시에는 예시 응답만 보여주는 체험 모드)

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { resolveDates } from "@/lib/ga4-dates";
import { MOCK_AI_INSIGHT } from "@/lib/mock-data";

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_STARTS = [
  "최근 데이터를 요약해줘",
  "전환율이 왜 변했는지 분석해줘",
  "어떤 채널에 예산을 더 써야 할까?",
  "이상한 데이터 있어?",
];

export default function InsightsPage() {
  const { propertyId, rangeDays, properties, isRealProperties, range } = useDashboard();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const propertyName = properties.find((p) => p.id === propertyId)?.name ?? propertyId;

  // 속성/기간이 바뀌면 이전 대화는 맥락이 어긋나므로 초기화한다
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [propertyId, range.preset, range.startDate, range.endDate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setSending(true);

    if (!isRealProperties) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `_(비로그인 체험 모드 — 실제 데이터가 아닌 예시 응답입니다. Google 로그인 후 실제 대화가 가능합니다.)_\n\n${MOCK_AI_INSIGHT}`,
          },
        ]);
        setSending(false);
      }, 1000);
      return;
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          propertyName,
          ...resolveDates(range),
          messages: nextMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-190px)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">AI 분석</h1>
          <p className="text-sm text-zinc-500">
            {propertyName} · 최근 {rangeDays}일 데이터로 대화{" "}
            {isRealProperties ? "(Groq AI)" : "(비로그인 — 예시 응답)"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            대화 초기화
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-zinc-400">
              현재 선택된 Property와 기간의 GA4 데이터에 대해 자유롭게 질문하세요.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_STARTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm text-zinc-500 dark:bg-zinc-800">
              분석 중...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 지난주 대비 전환이 왜 떨어졌어?"
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
