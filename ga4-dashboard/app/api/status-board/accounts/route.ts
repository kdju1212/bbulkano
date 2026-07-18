// 상태창 — 환경변수에 설정된 광고 계정 목록을 반환한다 (비밀값 없음, 라벨/ID만).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listConfiguredAccounts } from "@/lib/status-board/config";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return NextResponse.json({ accounts: listConfiguredAccounts() });
}
