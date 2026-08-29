// 구글시트 광고 대시보드 데이터 조회 — 로그인한 사람 본인의 OAuth 토큰으로만 시트를 읽는다.
// 이 계정이 시트 접근 권한이 없으면 구글 API 자체가 막아준다 (다른 사람이 로그인해도 안전).
// 저장/캐시 없음 — 매 요청마다 시트를 새로 읽어온다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchSheetRows } from "@/lib/sheets-dashboard";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const result = await fetchSheetRows(session.accessToken);

  if (result.status === "ok") {
    return NextResponse.json({ rows: result.rows });
  }
  if (result.status === "not_configured") {
    return NextResponse.json({ error: result.message, code: "not_configured" }, { status: 400 });
  }
  if (result.status === "no_access") {
    return NextResponse.json({ error: result.message, code: "no_access" }, { status: 403 });
  }
  return NextResponse.json({ error: result.message, code: "error" }, { status: 502 });
}
