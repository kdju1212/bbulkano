// 선택된 기간(DateRange)을 GA4 Data API용 날짜 문자열로 변환

import type { DateRange } from "@/lib/dashboard-context";

export type ResolvedDates = {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  days: number;
};

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, diff: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  return d;
}

export function resolveDates(range: DateRange): ResolvedDates {
  let start: Date;
  let end: Date;
  if (range.preset === "custom" && range.startDate && range.endDate) {
    start = new Date(range.startDate);
    end = new Date(range.endDate);
  } else {
    const days = range.preset === "7d" ? 7 : 30;
    end = new Date();
    start = addDays(end, -(days - 1));
  }
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    startDate: fmt(start),
    endDate: fmt(end),
    prevStartDate: fmt(prevStart),
    prevEndDate: fmt(prevEnd),
    days,
  };
}
