// 로그인한 계정이 접근 가능한 GA4 Property 목록 (Analytics Admin API accountSummaries)

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

type PropertySummary = { property: string; displayName: string };
type AccountSummary = { displayName: string; propertySummaries?: PropertySummary[] };

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (session.tokenError) {
    return NextResponse.json({ error: "토큰이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
  }

  const properties: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  try {
    do {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text();
        return NextResponse.json(
          { error: `GA4 Property 조회 실패 (${res.status}): ${body.slice(0, 300)}` },
          { status: res.status },
        );
      }
      const data: { accountSummaries?: AccountSummary[]; nextPageToken?: string } = await res.json();
      for (const account of data.accountSummaries ?? []) {
        for (const prop of account.propertySummaries ?? []) {
          properties.push({
            id: prop.property, // 예: "properties/123456789"
            name: `${prop.displayName} — ${account.displayName}`,
          });
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  properties.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json(properties);
}
