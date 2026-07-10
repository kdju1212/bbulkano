// AI(Groq)에게 넘길 GA4 데이터 컨텍스트를 만드는 공용 헬퍼.
// 요약(analyze)과 챗봇(chat) 라우트가 함께 사용한다.

import type { ChannelRow, DailyRow, EventRow, Totals } from "@/lib/ga4";

export type ContextDates = {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
};

export function buildContextText(
  propertyName: string,
  dates: ContextDates,
  totals: Totals,
  prevTotals: Totals,
  daily: DailyRow[],
  channels: ChannelRow[],
  events: EventRow[],
): string {
  return [
    `분석 대상: ${propertyName}`,
    `기간: ${dates.startDate} ~ ${dates.endDate} (비교 기간: ${dates.prevStartDate} ~ ${dates.prevEndDate})`,
    "",
    "## KPI 합계 (현재 기간 vs 이전 기간)",
    JSON.stringify({ current: totals, previous: prevTotals }),
    "",
    "## 일별 추이",
    JSON.stringify(daily),
    "",
    "## 채널별 성과 (sessions 상위 20)",
    JSON.stringify(channels.slice(0, 20)),
    "",
    "## 핵심 이벤트 (현재 vs 이전 기간)",
    JSON.stringify(events),
  ].join("\n");
}
