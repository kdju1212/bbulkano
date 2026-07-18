// 상태창 — 네이버 검색광고 API 어댑터 (SA 전용, 서버 전용).
//
// 인증: HMAC-SHA256 시그니처 방식 (OAuth 아님).
//   메시지 = "{timestamp}.{HTTP메서드}.{경로}"  (쿼리스트링 제외)
//   X-Timestamp / X-API-KEY / X-Customer / X-Signature(Base64) 헤더로 전달.
// 참고: https://github.com/naver/searchad-apidoc
//
// 계정별 권한: 대행사 계정의 키로 권한위임된 광고주 계정을 조회하려면
// X-Customer에 해당 광고주의 customerId를 넣는다.

import { createHmac } from "crypto";
import type { AccountTree, CampaignNode, GroupNode, LeafItem } from "./types";

const BASE_URL = "https://api.searchad.naver.com";

type NaverAuth = { apiKey: string; apiSecret: string; customerId: string };

function buildHeaders(auth: NaverAuth, method: string, path: string): Record<string, string> {
  const timestamp = String(Date.now());
  const message = `${timestamp}.${method}.${path}`;
  const signature = createHmac("sha256", auth.apiSecret).update(message).digest("base64");
  return {
    "X-Timestamp": timestamp,
    "X-API-KEY": auth.apiKey,
    "X-Customer": auth.customerId,
    "X-Signature": signature,
    "Content-Type": "application/json",
  };
}

async function naverGet<T>(auth: NaverAuth, path: string, query?: Record<string, string>): Promise<T> {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    method: "GET",
    headers: buildHeaders(auth, "GET", path),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 API ${path} 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// 네이버 응답 필드 중 실제로 쓰는 것만 정의. userLock: true = 사용자가 OFF해둔 상태.
type NaverCampaign = {
  nccCampaignId: string;
  name: string;
  userLock: boolean;
  dailyBudget?: number;
  useDailyBudget?: boolean;
};
type NaverAdgroup = {
  nccAdgroupId: string;
  name: string;
  userLock: boolean;
  dailyBudget?: number;
  useDailyBudget?: boolean;
};
type NaverKeyword = { nccKeywordId: string; keyword: string; userLock: boolean };
type NaverAd = { nccAdId: string; userLock: boolean; ad?: { headline?: string; description?: string } };

export async function fetchNaverTree(accountId: string, label: string): Promise<AccountTree> {
  const auth: NaverAuth = {
    apiKey: process.env.NAVER_SEARCHAD_API_KEY!,
    apiSecret: process.env.NAVER_SEARCHAD_API_SECRET!,
    customerId: accountId,
  };

  const campaigns = await naverGet<NaverCampaign[]>(auth, "/ncc/campaigns");

  const campaignNodes: CampaignNode[] = [];
  for (const cmp of campaigns) {
    const adgroups = await naverGet<NaverAdgroup[]>(auth, "/ncc/adgroups", {
      nccCampaignId: cmp.nccCampaignId,
    });

    const groups: GroupNode[] = [];
    for (const grp of adgroups) {
      // 키워드와 소재를 모두 가져와서 키워드가 있으면 키워드를, 없으면 소재를 하위 항목으로 쓴다
      const [keywords, ads] = await Promise.all([
        naverGet<NaverKeyword[]>(auth, "/ncc/keywords", { nccAdgroupId: grp.nccAdgroupId }).catch(
          () => [] as NaverKeyword[],
        ),
        naverGet<NaverAd[]>(auth, "/ncc/ads", { nccAdgroupId: grp.nccAdgroupId }).catch(
          () => [] as NaverAd[],
        ),
      ]);

      let leaves: LeafItem[];
      let leafKind: "keyword" | "creative";
      if (keywords.length > 0) {
        leafKind = "keyword";
        leaves = keywords.map((k) => ({ id: k.nccKeywordId, name: k.keyword, enabled: !k.userLock }));
      } else {
        leafKind = "creative";
        leaves = ads.map((a) => ({
          id: a.nccAdId,
          name: a.ad?.headline || a.nccAdId,
          enabled: !a.userLock,
        }));
      }

      groups.push({
        id: grp.nccAdgroupId,
        name: grp.name,
        enabled: !grp.userLock,
        dailyBudget: grp.useDailyBudget && grp.dailyBudget ? grp.dailyBudget : null,
        schedule: null, // 네이버 요일/시간 타겟은 별도 targets API — 추후 지원
        leafKind,
        leaves,
      });
    }

    campaignNodes.push({
      id: cmp.nccCampaignId,
      name: cmp.name,
      enabled: !cmp.userLock,
      channel: "sa",
      dailyBudget: cmp.useDailyBudget && cmp.dailyBudget ? cmp.dailyBudget : null,
      schedule: null,
      groups,
    });
  }

  return { platform: "naver", accountId, label, campaigns: campaignNodes };
}
