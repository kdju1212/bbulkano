// 상태창 — 메타(Meta) Marketing API 어댑터 (DA, 서버 전용).
//
// 인증: 액세스 토큰 (시스템 사용자 토큰 권장 — 무기한. 일반 토큰은 60일마다 만료).
// 비즈니스 관리자에 연결된 광고 계정(act_XXXX)들을 토큰 하나로 조회한다.
// 광고세트의 adset_schedule(요일/시간 타겟)로 스케줄 불일치 판정을 지원한다.
//
// API 버전은 주기적으로 만료되므로 실패 시 META_API_VERSION으로 조정 가능.

import type { AccountTree, CampaignNode, GroupNode, ScheduleSlot } from "./types";

const API_VERSION = process.env.META_API_VERSION || "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

async function metaGetAll<T>(path: string, fields: string): Promise<T[]> {
  const results: T[] = [];
  let url = `${BASE_URL}${path}?fields=${encodeURIComponent(fields)}&limit=200&access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN!)}`;
  // 페이지네이션 안전장치: 최대 20페이지 (4천 개)
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`메타 API ${path} 실패 (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { data?: T[]; paging?: { next?: string } };
    results.push(...(data.data ?? []));
    url = data.paging?.next ?? "";
  }
  return results;
}

type MetaCampaign = { id: string; name: string; effective_status?: string; daily_budget?: string };
type MetaAdSet = {
  id: string;
  name: string;
  effective_status?: string;
  daily_budget?: string;
  campaign_id?: string;
  adset_schedule?: Array<{ days?: number[]; start_minute?: number; end_minute?: number }>;
};
type MetaAd = { id: string; name: string; effective_status?: string; adset_id?: string };

const isActive = (status?: string) => status === "ACTIVE";

// 메타 daily_budget: KRW는 최소 단위가 1원이라 값 그대로 원 단위
const parseBudget = (raw?: string): number | null => {
  const n = Number(raw ?? 0);
  return n > 0 ? n : null;
};

function parseSchedule(raw?: MetaAdSet["adset_schedule"]): ScheduleSlot[] | null {
  if (!raw || raw.length === 0) return null;
  const slots: ScheduleSlot[] = [];
  for (const entry of raw) {
    for (const day of entry.days ?? []) {
      // 메타 days: 0=일요일 ~ 6=토요일 (JS getDay와 동일)
      slots.push({
        day,
        startMinute: entry.start_minute ?? 0,
        endMinute: entry.end_minute ?? 1440,
      });
    }
  }
  return slots.length > 0 ? slots : null;
}

export async function fetchMetaTree(accountId: string, label: string): Promise<AccountTree> {
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const [campaigns, adsets, ads] = await Promise.all([
    metaGetAll<MetaCampaign>(`/${act}/campaigns`, "id,name,effective_status,daily_budget"),
    metaGetAll<MetaAdSet>(
      `/${act}/adsets`,
      "id,name,effective_status,daily_budget,campaign_id,adset_schedule",
    ),
    metaGetAll<MetaAd>(`/${act}/ads`, "id,name,effective_status,adset_id"),
  ]);

  const adsByAdset = new Map<string, MetaAd[]>();
  for (const ad of ads) {
    if (!ad.adset_id) continue;
    if (!adsByAdset.has(ad.adset_id)) adsByAdset.set(ad.adset_id, []);
    adsByAdset.get(ad.adset_id)!.push(ad);
  }

  const groupsByCampaign = new Map<string, GroupNode[]>();
  for (const adset of adsets) {
    if (!adset.campaign_id) continue;
    if (!groupsByCampaign.has(adset.campaign_id)) groupsByCampaign.set(adset.campaign_id, []);
    groupsByCampaign.get(adset.campaign_id)!.push({
      id: adset.id,
      name: adset.name,
      enabled: isActive(adset.effective_status),
      dailyBudget: parseBudget(adset.daily_budget),
      schedule: parseSchedule(adset.adset_schedule),
      leafKind: "creative",
      leaves: (adsByAdset.get(adset.id) ?? []).map((ad) => ({
        id: ad.id,
        name: ad.name,
        enabled: isActive(ad.effective_status),
      })),
    });
  }

  const campaignNodes: CampaignNode[] = campaigns.map((cmp) => ({
    id: cmp.id,
    name: cmp.name,
    enabled: isActive(cmp.effective_status),
    channel: "da",
    dailyBudget: parseBudget(cmp.daily_budget),
    schedule: null,
    groups: groupsByCampaign.get(cmp.id) ?? [],
  }));

  return { platform: "meta", accountId, label, campaigns: campaignNodes };
}
