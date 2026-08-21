// 네이버 쇼핑검색(가격비교) 실시간 순위 체크 — 버튼 누를 때 키워드 1개 × 기기 1개씩 호출된다 (저장 없음).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkShoppingRank } from "@/lib/naver-shopping-check";
import type { Device } from "@/lib/naver-rank-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
  const device: Device = body?.device === "mobile" ? "mobile" : "pc";
  const storeName = typeof body?.storeName === "string" ? body.storeName.trim() : "";

  if (!keyword || !storeName) {
    return NextResponse.json({ error: "keyword와 storeName은 필수입니다." }, { status: 400 });
  }

  const result = await checkShoppingRank(keyword, device, storeName);
  return NextResponse.json({ keyword, device, result });
}
