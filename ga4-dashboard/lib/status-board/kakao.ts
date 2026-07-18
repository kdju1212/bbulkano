// 상태창 — 카카오모먼트 오픈API 어댑터 (DA, 서버 전용).
//
// 인증: 비즈니스 액세스 토큰(Bearer) + adAccountId 헤더.
// 카카오모먼트 API는 카카오 광고 공식대행사만 권한 신청 가능 — 권한이 없으면
// 401/403이 나며, 이는 코드 문제가 아니라 권한 문제다.
// 참고: https://developers.kakao.com/docs/latest/ko/kakaomoment/reference
//
// 카카오 키워드광고(SA) API는 별도 스펙이라 추후 지원.

import type { AccountTree, CampaignNode, GroupNode } from "./types";

const BASE_URL = "https://apis.moment.kakao.com/openapi/v4";

async function kakaoGet<T>(adAccountId: string, path: string, query?: Record<string, string>): Promise<T> {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    headers: {
      Authorization: `Bearer ${process.env.KAKAO_MOMENT_ACCESS_TOKEN}`,
      adAccountId,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`카카오모먼트 API ${path} 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// 페이지네이션 응답({content:[...]})과 배열 응답 둘 다 방어적으로 처리
function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { content?: unknown }).content)) {
    return (data as { content: T[] }).content;
  }
  return [];
}

type KakaoCampaign = { id: number; name: string; config?: string; dailyBudgetAmount?: number };
type KakaoAdGroup = { id: number; name: string; config?: string; dailyBudgetAmount?: number; campaignId?: number };
type KakaoCreative = { id: number; name?: string; config?: string; adGroupId?: number };

const isOn = (config?: string) => config === "ON";

export async function fetchKakaoTree(accountId: string, label: string): Promise<AccountTree> {
  const campaignsRaw = await kakaoGet<unknown>(accountId, "/campaigns");
  const campaigns = toArray<KakaoCampaign>(campaignsRaw);

  const campaignNodes: CampaignNode[] = [];
  for (const cmp of campaigns) {
    const adGroupsRaw = await kakaoGet<unknown>(accountId, "/adGroups", { campaignId: String(cmp.id) });
    const adGroups = toArray<KakaoAdGroup>(adGroupsRaw);

    const groups: GroupNode[] = [];
    for (const grp of adGroups) {
      const creativesRaw = await kakaoGet<unknown>(accountId, "/creatives", {
        adGroupId: String(grp.id),
      }).catch(() => null);
      const creatives = toArray<KakaoCreative>(creativesRaw);
      groups.push({
        id: String(grp.id),
        name: grp.name,
        enabled: isOn(grp.config),
        dailyBudget: grp.dailyBudgetAmount ?? null,
        schedule: null,
        leafKind: "creative",
        leaves: creatives.map((c) => ({
          id: String(c.id),
          name: c.name || `소재 ${c.id}`,
          enabled: isOn(c.config),
        })),
      });
    }

    campaignNodes.push({
      id: String(cmp.id),
      name: cmp.name,
      enabled: isOn(cmp.config),
      channel: "da",
      dailyBudget: cmp.dailyBudgetAmount ?? null,
      schedule: null,
      groups,
    });
  }

  return { platform: "kakao", accountId, label, campaigns: campaignNodes };
}
