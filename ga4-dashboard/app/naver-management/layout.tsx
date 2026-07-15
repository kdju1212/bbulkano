"use client";

// 네이버 관리 공통 레이아웃 — 네이버 대량관리 도구별 서브 탭.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/naver-management/creative-list", label: "소재 리스트화" },
  { href: "/naver-management/bid-manager", label: "입찰가 대량관리" },
];

export default function NaverManagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
