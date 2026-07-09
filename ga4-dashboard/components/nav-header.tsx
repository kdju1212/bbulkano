"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/lib/dashboard-context";
import { MOCK_PROPERTIES } from "@/lib/mock-data";

const TABS = [
  { href: "/", label: "대시보드" },
  { href: "/acquisition", label: "유입 분석" },
  { href: "/events", label: "이벤트 분석" },
  { href: "/insights", label: "AI 분석" },
];

export function NavHeader() {
  const pathname = usePathname();
  const { propertyId, setPropertyId, range, setRange } = useDashboard();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span className="mr-2 text-sm font-bold tracking-tight">
          GA4 <span className="text-blue-600">AI</span> 대시보드
        </span>

        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="GA4 Property 선택"
          >
            {MOCK_PROPERTIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="flex rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
            {(
              [
                ["7d", "7일"],
                ["30d", "30일"],
                ["custom", "직접"],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                onClick={() => setRange({ ...range, preset })}
                className={`px-3 py-1.5 first:rounded-l-md last:rounded-r-md ${
                  range.preset === preset
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {range.preset === "custom" && (
            <div className="flex items-center gap-1 text-sm">
              <input
                type="date"
                value={range.startDate}
                onChange={(e) => setRange({ ...range, startDate: e.target.value })}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span className="text-zinc-400">~</span>
              <input
                type="date"
                value={range.endDate}
                onChange={(e) => setRange({ ...range, endDate: e.target.value })}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
