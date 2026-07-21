// 파워링크 실시간 순위 체크 — 버튼 누를 때 키워드 1개 × 기기 1개씩 호출된다 (저장 없음).
// 클라이언트가 최대 50회(키워드 25개 × PC/모바일)를 순차적으로, 무작위 지연을 두고 호출한다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkPowerlinkRank, type Device } from "@/lib/naver-rank-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
  const device: Device = body?.device === "mobile" ? "mobile" : "pc";
  const advertiser = typeof body?.advertiser === "string" ? body.advertiser.trim() : "";

  if (!keyword || !advertiser) {
    return NextResponse.json({ error: "keyword와 advertiser는 필수입니다." }, { status: 400 });
  }

  const result = await checkPowerlinkRank(keyword, device, advertiser);
  return NextResponse.json({ keyword, device, result });
}
