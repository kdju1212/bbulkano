// GA4 데이터를 근거로 대화하는 챗봇. 매 요청마다 최신 GA4 데이터를 다시 조회해
// 컨텍스트로 붙이므로, 대화 중간에 답이 오래된 데이터를 참조하는 일이 없다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchChannels, fetchEvents, fetchOverview } from "@/lib/ga4";
import { buildContextText } from "@/lib/ai-context";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const MAX_HISTORY = 20;

const CHAT_SYSTEM_PROMPT = `당신은 광고대행사의 시니어 퍼포먼스 마케터이자 데이터 분석가입니다.
사용자가 제공하는 GA4 데이터 컨텍스트에 근거해서만 한국어로 답합니다.

규칙:
- 숫자를 인용할 때는 컨텍스트에 실제로 있는 값만 사용하세요. 데이터에 없는 내용은 추측하지 말고 "제공된 데이터에서는 확인할 수 없습니다"라고 답하세요.
- 답변은 간결하게, 필요하면 목록으로 정리하세요. 불필요하게 길게 쓰지 마세요.
- 사용자의 첫 메시지가 일반적인 요약 요청이면 핵심 변화를 3~5줄로 정리해서 시작하세요.
- 후속 질문에는 이전 답변과 이어지도록 자연스럽게 답하세요.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

type RequestBody = {
  propertyId: string;
  propertyName?: string;
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  messages: ChatMessage[];
};

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY가 설정되지 않았습니다. .env.local에 추가한 뒤 서버를 재시작하세요." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.propertyId?.startsWith("properties/")) {
    return NextResponse.json({ error: "propertyId가 올바르지 않습니다." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages가 비어있습니다." }, { status: 400 });
  }

  try {
    const token = session.accessToken;
    const [overview, channels, events] = await Promise.all([
      fetchOverview(token, body.propertyId, body),
      fetchChannels(token, body.propertyId, body),
      fetchEvents(token, body.propertyId, body),
    ]);

    const contextText = buildContextText(
      body.propertyName ?? body.propertyId,
      body,
      overview.totals,
      overview.prevTotals,
      overview.daily,
      channels,
      events,
    );

    const history = body.messages.slice(-MAX_HISTORY);

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          { role: "system", content: `## 데이터 컨텍스트\n${contextText}` },
          ...history,
        ],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });
    if (!groqRes.ok) {
      const text = await groqRes.text();
      return NextResponse.json(
        { error: `Groq API 오류 (${groqRes.status}): ${text.slice(0, 300)}` },
        { status: 500 },
      );
    }
    const data = await groqRes.json();
    const content: string = data.choices?.[0]?.message?.content ?? "(응답이 비어있습니다)";
    return NextResponse.json({ reply: content });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
