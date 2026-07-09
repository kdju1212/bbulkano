// 대시보드/유입/이벤트 페이지가 쓰는 GA4 리포트 프록시

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchChannels, fetchEvents, fetchOverview } from "@/lib/ga4";

export const runtime = "nodejs";

type RequestBody = {
  report: "overview" | "channels" | "events";
  propertyId: string;
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
    if (body.report === "overview") {
      return NextResponse.json(await fetchOverview(session.accessToken, body.propertyId, body));
    }
    if (body.report === "channels") {
      return NextResponse.json(await fetchChannels(session.accessToken, body.propertyId, body));
    }
    if (body.report === "events") {
      return NextResponse.json(await fetchEvents(session.accessToken, body.propertyId, body));
    }
    return NextResponse.json({ error: "지원하지 않는 report 유형입니다." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
