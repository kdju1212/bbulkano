"use client";

// 페이지 간 공유되는 전역 선택 상태: GA4 Property + 조회 기간.
// 네비게이션 헤더에서 바꾸면 모든 페이지가 같은 선택을 따른다.

import { createContext, useContext, useMemo, useState } from "react";
import { MOCK_PROPERTIES } from "@/lib/mock-data";

export type RangePreset = "7d" | "30d" | "custom";

export type DateRange = {
  preset: RangePreset;
  /** preset이 custom일 때만 사용 (YYYY-MM-DD) */
  startDate: string;
  endDate: string;
};

type DashboardState = {
  propertyId: string;
  setPropertyId: (id: string) => void;
  range: DateRange;
  setRange: (r: DateRange) => void;
  /** 선택된 기간의 일수 (KPI 비교 기간 계산에 사용) */
  rangeDays: number;
};

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [propertyId, setPropertyId] = useState(MOCK_PROPERTIES[0].id);
  const [range, setRange] = useState<DateRange>({
    preset: "30d",
    startDate: "",
    endDate: "",
  });

  const rangeDays = useMemo(() => {
    if (range.preset === "7d") return 7;
    if (range.preset === "30d") return 30;
    if (range.startDate && range.endDate) {
      const ms = new Date(range.endDate).getTime() - new Date(range.startDate).getTime();
      return Math.max(1, Math.round(ms / 86400000) + 1);
    }
    return 30;
  }, [range]);

  return (
    <DashboardContext.Provider value={{ propertyId, setPropertyId, range, setRange, rangeDays }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard는 DashboardProvider 안에서만 사용할 수 있습니다");
  return ctx;
}
