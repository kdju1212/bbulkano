// 상태창 — 한 광고 계정의 캠페인→그룹→소재/키워드 트리를 실시간 조회해 반환한다.
// GET /api/status-board/tree?platform=naver&account=1234567
// 저장하지 않고 매 요청마다 각 플랫폼 API를 호출한다 (DB 없음).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  googleConfigured,
  kakaoConfigured,
  listConfiguredAccounts,
  metaConfigured,
  naverConfigured,
} from "@/lib/status-board/config";
import { fetchGoogleTree } from "@/lib/status-board/google";
import { fetchKakaoTree } from "@/lib/status-board/kakao";
import { fetchMetaTree } from "@/lib/status-board/meta";
import { fetchNaverTree } from "@/lib/status-board/naver";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  const accountId = url.searchParams.get("account") ?? "";

  // 환경변수에 등록된 계정만 허용 (임의 계정 ID로 호출하는 것 차단)
  const registered = listConfiguredAccounts().find(
    (a) => a.platform === platform && a.accountId === accountId,
  );
  if (!registered) {
    return NextResponse.json({ error: "등록되지 않은 계정입니다." }, { status: 400 });
  }

  try {
    let tree;
    if (platform === "naver" && naverConfigured()) {
      tree = await fetchNaverTree(accountId, registered.label);
    } else if (platform === "google" && googleConfigured()) {
      tree = await fetchGoogleTree(accountId, registered.label);
    } else if (platform === "kakao" && kakaoConfigured()) {
      tree = await fetchKakaoTree(accountId, registered.label);
    } else if (platform === "meta" && metaConfigured()) {
      tree = await fetchMetaTree(accountId, registered.label);
    } else {
      return NextResponse.json({ error: `${platform} 플랫폼이 설정되지 않았습니다.` }, { status: 400 });
    }
    return NextResponse.json({ tree });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
