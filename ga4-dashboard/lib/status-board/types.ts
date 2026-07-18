// 상태창 — 네이버/구글/카카오/메타 광고 계층(계정→캠페인→그룹→소재/키워드)의
// 공통 데이터 모델과 순수 유틸(스케줄 불일치 판정, 집계).
// 플랫폼별 API 응답은 각 어댑터(naver.ts/google.ts/kakao.ts/meta.ts)가 이 모델로 정규화한다.

export type Platform = "naver" | "google" | "kakao" | "meta" | "demo";
export type Channel = "sa" | "da";

export const PLATFORM_LABEL: Record<Platform, string> = {
  naver: "네이버",
  google: "구글",
  kakao: "카카오",
  meta: "메타",
  demo: "데모",
};

/** 요일별 운영 시간 슬롯. day: 0=일요일 ~ 6=토요일 (JS getDay와 동일), 분 단위. */
export type ScheduleSlot = { day: number; startMinute: number; endMinute: number };

export type LeafItem = {
  id: string;
  name: string;
  enabled: boolean;
};

export type GroupNode = {
  id: string;
  name: string;
  enabled: boolean;
  dailyBudget: number | null;
  schedule: ScheduleSlot[] | null;
  /** 그룹의 하위 항목 종류 — SA면 키워드, DA면 소재 */
  leafKind: "keyword" | "creative";
  leaves: LeafItem[];
};

export type CampaignNode = {
  id: string;
  name: string;
  enabled: boolean;
  channel: Channel;
  dailyBudget: number | null;
  schedule: ScheduleSlot[] | null;
  groups: GroupNode[];
};

export type AccountTree = {
  platform: Platform;
  accountId: string;
  label: string;
  campaigns: CampaignNode[];
};

export type AccountInfo = {
  platform: Platform;
  accountId: string;
  label: string;
};

// ── 스케줄 유틸 ──────────────────────────────────────────

/** 현재 시각(Asia/Seoul 기준)이 스케줄 슬롯 안에 있는지 판정한다. */
export function isNowInSchedule(slots: ScheduleSlot[], now: Date = new Date()): boolean {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay();
  const minute = kst.getHours() * 60 + kst.getMinutes();
  return slots.some((s) => s.day === day && minute >= s.startMinute && minute < s.endMinute);
}

/** 스케줄상 지금 켜져 있어야 하는데 실제로는 꺼져있으면 true. */
export function isScheduleMismatch(
  enabled: boolean,
  schedule: ScheduleSlot[] | null,
  now: Date = new Date(),
): boolean {
  if (enabled || !schedule || schedule.length === 0) return false;
  return isNowInSchedule(schedule, now);
}

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 스케줄을 짧은 한국어 요약으로. 예: "월-금 09-21시", "매일 00-24시", "월,수 10-18시 외" */
export function formatSchedule(slots: ScheduleSlot[] | null): string {
  if (!slots || slots.length === 0) return "—";
  // 같은 시간대 슬롯끼리 요일을 묶는다
  const byRange = new Map<string, number[]>();
  for (const s of slots) {
    const key = `${s.startMinute}-${s.endMinute}`;
    if (!byRange.has(key)) byRange.set(key, []);
    byRange.get(key)!.push(s.day);
  }
  const fmtMin = (m: number) => String(Math.floor(m / 60)).padStart(2, "0");
  const parts: string[] = [];
  for (const [range, days] of byRange) {
    const [start, end] = range.split("-").map(Number);
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    let dayText: string;
    if (sorted.length === 7) dayText = "매일";
    else if (sorted.length === 5 && sorted.join(",") === "1,2,3,4,5") dayText = "월-금";
    else if (isConsecutive(sorted)) dayText = `${DAY_KO[sorted[0]]}-${DAY_KO[sorted[sorted.length - 1]]}`;
    else dayText = sorted.map((d) => DAY_KO[d]).join(",");
    parts.push(`${dayText} ${fmtMin(start)}-${fmtMin(end)}시`);
  }
  return parts.length > 2 ? `${parts.slice(0, 2).join(" · ")} 외` : parts.join(" · ");
}

function isConsecutive(days: number[]): boolean {
  for (let i = 1; i < days.length; i++) if (days[i] !== days[i - 1] + 1) return false;
  return days.length > 1;
}

export function formatBudget(budget: number | null): string {
  if (budget === null || budget === undefined || budget <= 0) return "—";
  return `${Math.round(budget).toLocaleString("ko-KR")}원/일`;
}

// ── 집계 유틸 ──────────────────────────────────────────

export type OnOffCount = { on: number; off: number };

export function countCampaigns(campaigns: CampaignNode[]): OnOffCount {
  const c = { on: 0, off: 0 };
  campaigns.forEach((cmp) => (cmp.enabled ? c.on++ : c.off++));
  return c;
}

export function countGroups(campaigns: CampaignNode[]): OnOffCount {
  const c = { on: 0, off: 0 };
  campaigns.forEach((cmp) => cmp.groups.forEach((g) => (g.enabled ? c.on++ : c.off++)));
  return c;
}

export function countLeaves(campaigns: CampaignNode[]): OnOffCount {
  const c = { on: 0, off: 0 };
  campaigns.forEach((cmp) =>
    cmp.groups.forEach((g) => g.leaves.forEach((l) => (l.enabled ? c.on++ : c.off++))),
  );
  return c;
}

export function countGroupLeaves(group: GroupNode): OnOffCount {
  const c = { on: 0, off: 0 };
  group.leaves.forEach((l) => (l.enabled ? c.on++ : c.off++));
  return c;
}

/** 트리 전체에서 스케줄 불일치 항목 수를 센다 (캠페인/그룹 레벨). */
export function countMismatches(campaigns: CampaignNode[], now: Date = new Date()): number {
  let n = 0;
  for (const cmp of campaigns) {
    if (isScheduleMismatch(cmp.enabled, cmp.schedule, now)) n++;
    for (const g of cmp.groups) {
      if (isScheduleMismatch(g.enabled, g.schedule, now)) n++;
    }
  }
  return n;
}
