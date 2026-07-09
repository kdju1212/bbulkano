// 조회된 GA4 데이터를 Groq LLM에 전달해 마케팅 인사이트를 생성한다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchChannels, fetchEvents, fetchOverview } from "@/lib/ga4";

export const runtime = "nodejs";
export const maxDuration = 120;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

type RequestBody = {
  propertyId: string;
  propertyName?: string;
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
};

const SYSTEM_PROMPT = `당신은 광고대행사의 시니어 퍼포먼스 마케터입니다.
GA4 데이터를 분석해 실무자가 바로 활용할 수 있는 인사이트를 한국어로 작성합니다.
반드시 아래 형식(마크다운)으로, 데이터에 근거한 구체적 수치를 인용하며 작성하세요:

## 주요 변화 요약
## 전환 상승/하락 원인 분석
## 성과 좋은 채널
## 이상 데이터 탐지
## 개선 방향 제안

과장하지 말고, 데이터가 부족한 부분은 부족하다고 명시하세요.`;

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

  try {
    const token = session.accessToken;
    const [overview, channels, events] = await Promise.all([
      fetchOverview(token, body.propertyId, body),
      fetchChannels(token, body.propertyId, body),
      fetchEvents(token, body.propertyId, body),
    ]);

    const userPrompt = [
      `분석 대상: ${body.propertyName ?? body.propertyId}`,
      `기간: ${body.startDate} ~ ${body.endDate} (비교 기간: ${body.prevStartDate} ~ ${body.prevEndDate})`,
      "",
      "## KPI 합계 (현재 기간 vs 이전 기간)",
      JSON.stringify({ current: overview.totals, previous: overview.prevTotals }),
      "",
      "## 일별 추이",
      JSON.stringify(overview.daily),
      "",
      "## 채널별 성과 (sessions 상위 20)",
      JSON.stringify(channels.slice(0, 20)),
      "",
      "## 핵심 이벤트 (현재 vs 이전 기간)",
      JSON.stringify(events),
    ].join("\n");

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
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
    return NextResponse.json({ insight: content, model: GROQ_MODEL });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
