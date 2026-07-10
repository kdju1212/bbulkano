"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUB_TABS = [
  { href: "/", label: "개요" },
  { href: "/acquisition", label: "유입 분석" },
  { href: "/events", label: "이벤트 분석" },
  { href: "/insights", label: "AI 분석" },
];

export function DashboardSubnav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {SUB_TABS.map((tab) => {
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
  );
}
