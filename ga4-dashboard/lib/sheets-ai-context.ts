// AI(Groq)에게 넘길 구글시트 광고 데이터 컨텍스트를 만드는 헬퍼. sheets-ai-chat 라우트가 사용한다.

import type { ChannelMetric, CreativeMetric, DailyMetric, DashboardFilters, DashboardSummary } from "@/lib/sheets-dashboard";

export function buildSheetsContextText(
  filters: DashboardFilters,
  summary: DashboardSummary,
  daily: DailyMetric[],
  byChannel: ChannelMetric[],
  byCreative: CreativeMetric[],
): string {
  return [
    `분석 대상: 구글시트 광고 성과 데이터`,
    `현재 적용된 필터: ${JSON.stringify(filters)}`,
    "",
    "## 요약 지표 (필터 적용 후)",
    JSON.stringify(summary),
    "",
    "## 날짜별 광고비·매출·ROAS",
    JSON.stringify(daily),
    "",
    "## 매체/타겟별 광고비·매출",
    JSON.stringify(byChannel),
    "",
    "## 소재별 성과 (광고비 상위 30)",
    JSON.stringify(byCreative.slice(0, 30)),
  ].join("\n");
}
