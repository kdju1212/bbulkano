"use client";

// 구글시트 대시보드 — 로그인한 사용자만 사용 가능 (다른 페이지와 동일한 가드 패턴).

import { signIn, useSession } from "next-auth/react";
import { SheetsDashboard } from "@/components/sheets-dashboard";

export default function SheetsDashboardPage() {
  const { status } = useSession();

  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-lg font-bold">구글시트 대시보드</h1>
        <p className="text-sm text-zinc-500">
          {status === "loading" ? "로그인 상태를 확인하는 중..." : "로그인한 사용자만 사용할 수 있습니다."}
        </p>
        {status === "unauthenticated" && (
          <button
            onClick={() => signIn("google")}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Google 로그인
          </button>
        )}
      </div>
    );
  }

  return <SheetsDashboard />;
}
