// 상태창 — Google Ads API 어댑터 (SA/DA 모두, 서버 전용).
//
// 인증: OAuth 리프레시 토큰으로 액세스 토큰 발급 → REST searchStream 호출.
// MCC(관리자 계정) 구조면 GOOGLE_ADS_LOGIN_CUSTOMER_ID에 MCC ID를 넣고
// GOOGLE_ADS_CUSTOMERS에 하위 광고주 계정들을 나열하면 인증 한 번으로 전부 조회된다.
//
// API 버전이 주기적으로 만료되므로(대략 1년) 실패 시 GOOGLE_ADS_API_VERSION으로 조정 가능.

import type { AccountTree, CampaignNode, GroupNode, ScheduleSlot } from "./types";

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v18";

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`구글 OAuth 토큰 발급 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

type GaqlRow = Record<string, Record<string, unknown>>;

async function searchStream(accessToken: string, customerId: string, query: string): Promise<GaqlRow[]> {
  const cid = customerId.replace(/-/g, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
  };
  const loginCid = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (loginCid) headers["login-customer-id"] = loginCid;

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`구글 Ads API 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  const chunks = (await res.json()) as Array<{ results?: GaqlRow[] }>;
  return chunks.flatMap((c) => c.results ?? []);
}

const GOOGLE_DAY: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export async function fetchGoogleTree(accountId: string, label: string): Promise<AccountTree> {
  const token = await getAccessToken();

  const [campaignRows, groupRows, keywordRows, adRows, scheduleRows] = await Promise.all([
    searchStream(
      token,
      accountId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`,
    ),
    searchStream(
      token,
      accountId,
      `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id FROM ad_group WHERE ad_group.status != 'REMOVED'`,
    ),
    searchStream(
      token,
      accountId,
      `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.status, ad_group.id FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED'`,
    ).catch(() => [] as GaqlRow[]),
    searchStream(
      token,
      accountId,
      `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.id FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'`,
    ).catch(() => [] as GaqlRow[]),
    searchStream(
      token,
      accountId,
      `SELECT campaign.id, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour FROM campaign_criterion WHERE campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED'`,
    ).catch(() => [] as GaqlRow[]),
  ]);

  // 캠페인별 광고 노출 스케줄
  const scheduleByCampaign = new Map<string, ScheduleSlot[]>();
  for (const row of scheduleRows) {
    const cmpId = String((row.campaign as { id?: unknown })?.id ?? "");
    const sched = (row.campaignCriterion as { adSchedule?: { dayOfWeek?: string; startHour?: number; endHour?: number } })
      ?.adSchedule;
    if (!cmpId || !sched?.dayOfWeek) continue;
    const day = GOOGLE_DAY[sched.dayOfWeek];
    if (day === undefined) continue;
    if (!scheduleByCampaign.has(cmpId)) scheduleByCampaign.set(cmpId, []);
    scheduleByCampaign.get(cmpId)!.push({
      day,
      startMinute: (sched.startHour ?? 0) * 60,
      endMinute: (sched.endHour ?? 24) * 60,
    });
  }

  // 그룹별 키워드/광고
  const keywordsByGroup = new Map<string, { id: string; name: string; enabled: boolean }[]>();
  for (const row of keywordRows) {
    const grpId = String((row.adGroup as { id?: unknown })?.id ?? "");
    const crit = row.adGroupCriterion as {
      criterionId?: unknown;
      keyword?: { text?: string };
      status?: string;
    };
    if (!grpId || !crit?.keyword?.text) continue;
    if (!keywordsByGroup.has(grpId)) keywordsByGroup.set(grpId, []);
    keywordsByGroup.get(grpId)!.push({
      id: String(crit.criterionId ?? ""),
      name: crit.keyword.text,
      enabled: crit.status === "ENABLED",
    });
  }
  const adsByGroup = new Map<string, { id: string; name: string; enabled: boolean }[]>();
  for (const row of adRows) {
    const grpId = String((row.adGroup as { id?: unknown })?.id ?? "");
    const aga = row.adGroupAd as { ad?: { id?: unknown; name?: string }; status?: string };
    if (!grpId || !aga?.ad) continue;
    if (!adsByGroup.has(grpId)) adsByGroup.set(grpId, []);
    adsByGroup.get(grpId)!.push({
      id: String(aga.ad.id ?? ""),
      name: aga.ad.name || `광고 ${aga.ad.id}`,
      enabled: aga.status === "ENABLED",
    });
  }

  // 캠페인별 그룹
  const groupsByCampaign = new Map<string, GroupNode[]>();
  const campaignChannel = new Map<string, "sa" | "da">();
  for (const row of campaignRows) {
    const cmp = row.campaign as { id?: unknown; advertisingChannelType?: string };
    campaignChannel.set(
      String(cmp?.id ?? ""),
      cmp?.advertisingChannelType === "SEARCH" ? "sa" : "da",
    );
  }
  for (const row of groupRows) {
    const cmpId = String((row.campaign as { id?: unknown })?.id ?? "");
    const grp = row.adGroup as { id?: unknown; name?: string; status?: string };
    if (!cmpId || !grp) continue;
    const grpId = String(grp.id ?? "");
    const channel = campaignChannel.get(cmpId) ?? "da";
    const keywords = keywordsByGroup.get(grpId) ?? [];
    const ads = adsByGroup.get(grpId) ?? [];
    const useKeywords = channel === "sa" && keywords.length > 0;
    if (!groupsByCampaign.has(cmpId)) groupsByCampaign.set(cmpId, []);
    groupsByCampaign.get(cmpId)!.push({
      id: grpId,
      name: grp.name || grpId,
      enabled: grp.status === "ENABLED",
      dailyBudget: null, // 구글 예산은 캠페인 단위
      schedule: null,
      leafKind: useKeywords ? "keyword" : "creative",
      leaves: useKeywords ? keywords : ads,
    });
  }

  const campaigns: CampaignNode[] = campaignRows.map((row) => {
    const cmp = row.campaign as {
      id?: unknown;
      name?: string;
      status?: string;
      advertisingChannelType?: string;
    };
    const budget = row.campaignBudget as { amountMicros?: unknown } | undefined;
    const cmpId = String(cmp?.id ?? "");
    const micros = Number(budget?.amountMicros ?? 0);
    return {
      id: cmpId,
      name: cmp?.name || cmpId,
      enabled: cmp?.status === "ENABLED",
      channel: cmp?.advertisingChannelType === "SEARCH" ? "sa" : "da",
      dailyBudget: micros > 0 ? micros / 1_000_000 : null,
      schedule: scheduleByCampaign.get(cmpId) ?? null,
      groups: groupsByCampaign.get(cmpId) ?? [],
    };
  });

  return { platform: "google", accountId, label, campaigns };
}
