"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useDashboard } from "@/lib/dashboard-context";

const TABS = [
  { href: "/", label: "대시보드" },
  { href: "/raw-processor", label: "RAW 가공", requiresAuth: true },
  { href: "/utm-builder", label: "UTM 빌더" },
];

const DASHBOARD_SUB_PATHS = ["/", "/acquisition", "/events", "/insights"];

export function NavHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { propertyId, setPropertyId, properties, isRealProperties, propertiesError, range, setRange } =
    useDashboard();

  const visibleTabs = TABS.filter((tab) => !tab.requiresAuth || status === "authenticated");

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span className="mr-2 text-sm font-bold tracking-tight">
          GA4 <span className="text-blue-600">AI</span> 대시보드
        </span>

        <nav className="flex gap-1">
          {visibleTabs.map((tab) => {
            const active =
              tab.href === "/" ? DASHBOARD_SUB_PATHS.includes(pathname) : pathname.startsWith(tab.href);
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
            className="max-w-56 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="GA4 Property 선택"
            title={isRealProperties ? "실제 GA4 Property" : "목데이터 (로그인하면 실제 목록으로 교체)"}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {isRealProperties ? p.name : `${p.name} (목)`}
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

          {status === "authenticated" ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-zinc-500 sm:inline">{session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google")}
              disabled={status === "loading"}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Google 로그인
            </button>
          )}
        </div>
      </div>

      {propertiesError && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {propertiesError}
        </div>
      )}
    </header>
  );
}
