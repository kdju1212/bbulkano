"use client";

// 페이지 간 공유되는 전역 선택 상태: GA4 Property + 조회 기간.
// 로그인하면 실제 GA4 Property 목록을 불러오고, 비로그인 시 목데이터를 사용한다.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { MOCK_PROPERTIES } from "@/lib/mock-data";

export type RangePreset = "7d" | "30d" | "custom";

export type DateRange = {
  preset: RangePreset;
  /** preset이 custom일 때만 사용 (YYYY-MM-DD) */
  startDate: string;
  endDate: string;
};

export type PropertyOption = { id: string; name: string };

type DashboardState = {
  propertyId: string;
  setPropertyId: (id: string) => void;
  properties: PropertyOption[];
  /** true면 실제 GA4 Property 목록 (로그인 완료) */
  isRealProperties: boolean;
  propertiesError: string | null;
  range: DateRange;
  setRange: (r: DateRange) => void;
  /** 선택된 기간의 일수 (KPI 비교 기간 계산에 사용) */
  rangeDays: number;
};

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [properties, setProperties] = useState<PropertyOption[]>(MOCK_PROPERTIES);
  const [isRealProperties, setIsRealProperties] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState(MOCK_PROPERTIES[0].id);
  const [range, setRange] = useState<DateRange>({
    preset: "30d",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    if (status !== "authenticated") {
      setProperties(MOCK_PROPERTIES);
      setPropertyId(MOCK_PROPERTIES[0].id);
      setIsRealProperties(false);
      setPropertiesError(null);
      return;
    }
    let cancelled = false;
    fetch("/api/ga4/properties")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Property 조회 실패 (${res.status})`);
        return data as PropertyOption[];
      })
      .then((list) => {
        if (cancelled) return;
        if (list.length === 0) {
          setPropertiesError("이 계정으로 접근 가능한 GA4 Property가 없습니다.");
          return;
        }
        setProperties(list);
        setPropertyId(list[0].id);
        setIsRealProperties(true);
        setPropertiesError(null);
      })
      .catch((e) => {
        if (!cancelled) setPropertiesError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

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
    <DashboardContext.Provider
      value={{
        propertyId,
        setPropertyId,
        properties,
        isRealProperties,
        propertiesError,
        range,
        setRange,
        rangeDays,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard는 DashboardProvider 안에서만 사용할 수 있습니다");
  return ctx;
}
