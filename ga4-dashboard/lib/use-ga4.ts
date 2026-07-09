"use client";

// 로그인 + 실제 Property 선택 상태에서 GA4 리포트를 가져오는 공용 훅.
// 비로그인(목데이터 모드)에서는 data가 null이므로 페이지가 목데이터로 폴백한다.

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { resolveDates } from "@/lib/ga4-dates";

export function useGa4Report<T>(report: "overview" | "channels" | "events"): {
  data: T | null;
  loading: boolean;
  error: string | null;
  isReal: boolean;
} {
  const { propertyId, isRealProperties, range } = useDashboard();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = resolveDates(range);
  const dateKey = `${dates.startDate}~${dates.endDate}`;

  useEffect(() => {
    if (!isRealProperties) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/ga4/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, propertyId, ...resolveDates(range) }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `조회 실패 (${res.status})`);
        return json as T;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, propertyId, isRealProperties, dateKey]);

  return { data, loading, error, isReal: isRealProperties };
}
