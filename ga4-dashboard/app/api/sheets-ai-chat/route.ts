// 구글시트 광고 데이터를 근거로 대화하는 챗봇. 매 요청마다 로그인한 사용자 본인의 토큰으로
// 시트를 다시 읽어(fetchSheetRows) 최신 데이터를 컨텍스트로 붙인다 — 서버에 시트 데이터를 저장하지 않는다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { applyFilters, fetchSheetRows, groupByChannel, groupByCreative, groupByDate, summarize } from "@/lib/sheets-dashboard";
import { buildSheetsContextText } from "@/lib/sheets-ai-context";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const MAX_HISTORY = 20;

const CHAT_SYSTEM_PROMPT = `당신은 광고대행사의 시니어 퍼포먼스 마케터이자 데이터 분석가입니다.
사용자가 제공하는 구글시트 광고 성과 데이터 컨텍스트에 근거해서만 한국어로 답합니다.

규칙:
- 숫자를 인용할 때는 컨텍스트에 실제로 있는 값만 사용하세요. 데이터에 없는 내용은 추측하지 말고 "제공된 데이터에서는 확인할 수 없습니다"라고 답하세요.
- 답변은 간결하게, 필요하면 목록으로 정리하세요. 불필요하게 길게 쓰지 마세요.
- 사용자의 첫 메시지가 일반적인 요약 요청이면 핵심 지표(광고비/매출/ROAS)와 눈에 띄는 소재를 3~5줄로 정리해서 시작하세요.
- 후속 질문에는 이전 답변과 이어지도록 자연스럽게 답하세요.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

type RequestBody = {
  messages: ChatMessage[];
  startDate?: string;
  endDate?: string;
  channel?: string;
  campaign?: string;
  adSet?: string;
  creative?: string;
  productLine?: string;
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
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages가 비어있습니다." }, { status: 400 });
  }

  try {
    const result = await fetchSheetRows(session.accessToken);
    if (result.status !== "ok") {
      const statusCode = result.status === "no_access" ? 403 : result.status === "not_configured" ? 400 : 502;
      return NextResponse.json({ error: result.message }, { status: statusCode });
    }

    const filters = {
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
      channels: body.channel ? [body.channel] : undefined,
      campaigns: body.campaign ? [body.campaign] : undefined,
      adSets: body.adSet ? [body.adSet] : undefined,
      creatives: body.creative ? [body.creative] : undefined,
      productLines: body.productLine ? [body.productLine] : undefined,
    };
    const filtered = applyFilters(result.rows, filters);
    const summary = summarize(filtered);
    const daily = groupByDate(filtered);
    const byChannel = groupByChannel(filtered);
    const byCreative = groupByCreative(filtered);

    const contextText = buildSheetsContextText(filters, summary, daily, byChannel, byCreative);
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
      if (groqRes.status === 429) {
        const retryAfterHeader = groqRes.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader ? Math.max(1, Math.ceil(Number(retryAfterHeader))) : 20;
        return NextResponse.json(
          {
            error: `Groq 무료 요청 한도에 걸렸습니다. ${retryAfterSeconds}초 후 다시 시도해주세요.`,
            rateLimited: true,
            retryAfterSeconds,
          },
          { status: 429 },
        );
      }
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
