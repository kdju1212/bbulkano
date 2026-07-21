"use client";

// 네이버 관리 공통 레이아웃 — 로그인 확인 + 네이버 대량관리 도구별 서브 탭.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

const TABS = [
  { href: "/naver-management/creative-list", label: "소재 리스트화" },
  { href: "/naver-management/bid-manager", label: "입찰가 대량관리" },
  { href: "/naver-management/rank-check", label: "파워링크 순위 체크" },
];

export default function NaverManagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();

  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-lg font-bold">네이버 관리</h1>
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

  return (
    <div>
      <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-blue-600 font-medium text-blue-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
