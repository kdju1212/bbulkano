// STEP 1 목데이터 — STEP 4에서 GA4 Data API 응답으로 교체된다.
// 시드 고정 의사난수로 매 렌더마다 동일한 값을 만들어 하이드레이션 불일치를 막는다.

export type DailyMetric = {
  date: string; // YYYY-MM-DD
  users: number;
  sessions: number;
  eventCount: number;
  conversions: number;
};

export type ChannelRow = {
  source: string;
  medium: string;
  campaign: string;
  users: number;
  sessions: number;
  conversions: number;
};

export type EventRow = {
  eventName: string;
  eventCount: number;
  users: number;
  prevEventCount: number;
};

export const MOCK_PROPERTIES = [
  { id: "properties/111111111", name: "광고주 A — 쇼핑몰" },
  { id: "properties/222222222", name: "광고주 B — 교육" },
  { id: "properties/333333333", name: "광고주 C — 금융" },
];

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const BASE_DATE = new Date("2026-07-06T00:00:00Z");

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 오늘 기준 과거 90일치 일별 지표 (프로퍼티별로 규모가 다르게). */
export function getDailySeries(propertyId: string): DailyMetric[] {
  const scale = 1 + (MOCK_PROPERTIES.findIndex((p) => p.id === propertyId) + 1) * 0.8;
  const rand = seededRandom(propertyId.length * 7919);
  const rows: DailyMetric[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(BASE_DATE);
    d.setUTCDate(d.getUTCDate() - i);
    const weekday = d.getUTCDay();
    const weekendDip = weekday === 0 || weekday === 6 ? 0.72 : 1;
    const trend = 1 + (89 - i) * 0.002; // 완만한 상승 추세
    const users = Math.round((800 + rand() * 400) * scale * weekendDip * trend);
    const sessions = Math.round(users * (1.25 + rand() * 0.2));
    const eventCount = Math.round(sessions * (6 + rand() * 3));
    const conversions = Math.round(sessions * (0.018 + rand() * 0.012));
    rows.push({ date: formatDate(d), users, sessions, eventCount, conversions });
  }
  return rows;
}

export function getChannelRows(propertyId: string): ChannelRow[] {
  const scale = 1 + (MOCK_PROPERTIES.findIndex((p) => p.id === propertyId) + 1) * 0.8;
  const rand = seededRandom(propertyId.length * 104729);
  const channels: Array<[string, string, string]> = [
    ["google", "cpc", "브랜드_검색"],
    ["google", "organic", "(not set)"],
    ["naver", "cpc", "파워링크_핵심"],
    ["kakao", "cpc", "카카오모먼트_리타겟"],
    ["(direct)", "(none)", "(not set)"],
    ["youtube.com", "referral", "(not set)"],
    ["instagram.com", "social", "릴스_캠페인"],
  ];
  return channels.map(([source, medium, campaign]) => {
    const users = Math.round((300 + rand() * 2200) * scale);
    const sessions = Math.round(users * (1.2 + rand() * 0.3));
    const conversions = Math.round(sessions * (0.008 + rand() * 0.035));
    return { source, medium, campaign, users, sessions, conversions };
  });
}

export function getEventRows(propertyId: string): EventRow[] {
  const scale = 1 + (MOCK_PROPERTIES.findIndex((p) => p.id === propertyId) + 1) * 0.8;
  const rand = seededRandom(propertyId.length * 1299709);
  const events = ["page_view", "view_item", "add_to_cart", "purchase", "sign_up"];
  return events.map((eventName, i) => {
    const base = Math.round((12000 / (i + 1)) * scale * (0.8 + rand() * 0.4));
    const prev = Math.round(base * (0.82 + rand() * 0.4));
    return {
      eventName,
      eventCount: base,
      users: Math.round(base * (0.55 + rand() * 0.2)),
      prevEventCount: prev,
    };
  });
}

export const MOCK_AI_INSIGHT = `## 주요 변화 요약
- 최근 30일 Users는 이전 기간 대비 +6.2% 증가했지만 purchase 이벤트는 18% 감소했습니다.
- add_to_cart는 유지되고 있어 결제 단계 이탈 가능성이 있습니다.

## 원인 분석
1. **결제 단계 이탈**: add_to_cart → purchase 전환율이 4.1% → 3.2%로 하락했습니다. 결제 페이지 오류 또는 프로모션 종료 영향을 확인하세요.
2. **채널 변화**: naver/cpc 세션이 22% 줄어든 반면 google/cpc는 유지 — 네이버 입찰 순위 하락이 의심됩니다.

## 성과 좋은 채널
- **google / cpc (브랜드_검색)**: 전환율 3.8%로 전체 평균(2.1%)의 1.8배입니다. 예산 증액을 검토하세요.

## 이상 데이터
- 6월 24일 sessions가 평소 대비 2.4배 급증했지만 전환 증가는 없었습니다. 봇 트래픽 또는 잘못된 태깅 가능성이 있습니다.

## 개선 제안
1. 결제 페이지 퍼널 점검 (모바일 우선)
2. naver/cpc 핵심 키워드 입찰가 재조정
3. 급증 트래픽의 소스 필터링 설정

*(STEP 6에서 실제 OpenAI 분석으로 교체됩니다 — 지금은 목데이터입니다)*`;
