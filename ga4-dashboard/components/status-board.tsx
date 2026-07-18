"use client";

// 상태창 — 네이버/구글/카카오/메타 광고 계정의 캠페인·그룹·소재/키워드 ON/OFF,
// 일예산, 운영시간을 한 표에서 확인한다. SA/DA 탭, 계정·소재 2단 접기/펼치기,
// 칼럼별 ON/OFF 필터, 스케줄 불일치 배너를 지원한다.
// 데이터는 매번 실시간 조회 (DB 없음). 기획: docs/ad-account-monitoring-dashboard-plan.txt

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_TREES } from "@/lib/status-board/demo";
import {
  type AccountInfo,
  type AccountTree,
  type CampaignNode,
  type Channel,
  type GroupNode,
  PLATFORM_LABEL,
  countCampaigns,
  countGroups,
  countLeaves,
  countMismatches,
  formatBudget,
  formatSchedule,
  isScheduleMismatch,
} from "@/lib/status-board/types";

type OnOffFilter = "all" | "on" | "off";
type AccountState =
  | { status: "loading"; info: AccountInfo }
  | { status: "error"; info: AccountInfo; message: string }
  | { status: "ready"; info: AccountInfo; tree: AccountTree };

const filterOptions: Array<[OnOffFilter, string]> = [
  ["all", "전체"],
  ["on", "ON만"],
  ["off", "OFF만"],
];

function matchFilter(enabled: boolean, filter: OnOffFilter): boolean {
  if (filter === "on") return enabled;
  if (filter === "off") return !enabled;
  return true;
}

function OnOffBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ON
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> OFF
    </span>
  );
}

function CountBadge({ on, off }: { on: number; off: number }) {
  if (on === 0 && off === 0) return <span className="text-xs text-zinc-300">—</span>;
  return (
    <span className="text-xs">
      <span className="text-emerald-600">켜짐 {on}</span>
      <span className="mx-1 text-zinc-300">·</span>
      <span className={off > 0 ? "font-semibold text-red-500" : "text-zinc-400"}>꺼짐 {off}</span>
    </span>
  );
}

function MismatchLabel() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950">
      ⚠ 스케줄 불일치
    </span>
  );
}

export function StatusBoard() {
  const [channel, setChannel] = useState<Channel>("sa");
  const [accounts, setAccounts] = useState<AccountState[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // 접기/펼치기 — 기본값: 계정 펼침, 소재 접힘. 상태는 기억하지 않는다(새로고침 시 초기화).
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const [expandedLeaves, setExpandedLeaves] = useState<Set<string>>(new Set());

  const [filterCampaign, setFilterCampaign] = useState<OnOffFilter>("all");
  const [filterGroup, setFilterGroup] = useState<OnOffFilter>("all");
  const [filterLeaf, setFilterLeaf] = useState<OnOffFilter>("all");

  const loadAll = useCallback(async () => {
    setAccountsLoaded(false);
    setDemoMode(false);
    setCollapsedAccounts(new Set());
    setExpandedLeaves(new Set());
    try {
      const res = await fetch("/api/status-board/accounts");
      const data = (await res.json()) as { accounts?: AccountInfo[]; error?: string };
      const infos = data.accounts ?? [];
      setAccounts(infos.map((info) => ({ status: "loading", info })));
      setAccountsLoaded(true);
      infos.forEach(async (info) => {
        const key = `${info.platform}:${info.accountId}`;
        try {
          const r = await fetch(
            `/api/status-board/tree?platform=${encodeURIComponent(info.platform)}&account=${encodeURIComponent(info.accountId)}`,
          );
          const d = (await r.json()) as { tree?: AccountTree; error?: string };
          setAccounts((prev) =>
            prev.map((a) =>
              `${a.info.platform}:${a.info.accountId}` === key
                ? d.tree
                  ? { status: "ready", info, tree: d.tree }
                  : { status: "error", info, message: d.error ?? "조회 실패" }
                : a,
            ),
          );
        } catch (e) {
          setAccounts((prev) =>
            prev.map((a) =>
              `${a.info.platform}:${a.info.accountId}` === key
                ? { status: "error", info, message: e instanceof Error ? e.message : String(e) }
                : a,
            ),
          );
        }
      });
    } catch {
      setAccounts([]);
      setAccountsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadDemo = () => {
    setDemoMode(true);
    setAccountsLoaded(true);
    setCollapsedAccounts(new Set());
    setExpandedLeaves(new Set());
    setAccounts(
      DEMO_TREES.map((tree) => ({
        status: "ready",
        info: { platform: tree.platform, accountId: tree.accountId, label: tree.label },
        tree,
      })),
    );
  };

  // 현재 탭(SA/DA)에 해당하는 캠페인만 남긴 계정 목록
  const visibleAccounts = useMemo(() => {
    return accounts
      .map((a) => {
        if (a.status !== "ready") return { state: a, campaigns: [] as CampaignNode[] };
        return { state: a, campaigns: a.tree.campaigns.filter((c) => c.channel === channel) };
      })
      .filter((entry) => entry.state.status !== "ready" || entry.campaigns.length > 0);
  }, [accounts, channel]);

  const mismatchCount = useMemo(() => {
    let n = 0;
    for (const entry of visibleAccounts) {
      if (entry.state.status === "ready") n += countMismatches(entry.campaigns);
    }
    return n;
  }, [visibleAccounts]);

  const expandMismatchedAccounts = () => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev);
      for (const entry of visibleAccounts) {
        if (entry.state.status === "ready" && countMismatches(entry.campaigns) > 0) {
          next.delete(`${entry.state.info.platform}:${entry.state.info.accountId}`);
        }
      }
      return next;
    });
  };

  const toggleAccount = (key: string) => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleLeaves = (key: string) => {
    setExpandedLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasAnyAccount = accounts.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">상태창</h1>
          <p className="text-sm text-zinc-500">
            광고계정 → 캠페인 → 그룹 → 소재/키워드의 ON/OFF·일예산·운영시간을 실시간으로 확인합니다.
            {demoMode && <span className="ml-2 font-semibold text-amber-600">(데모 데이터)</span>}
          </p>
        </div>
        <button
          onClick={loadAll}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 스케줄 불일치 배너 */}
      {mismatchCount > 0 && (
        <button
          onClick={expandMismatchedAccounts}
          className="block w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          ⚠ 스케줄 불일치 {mismatchCount}건 — 클릭하면 해당 계정을 펼칩니다
        </button>
      )}

      {/* SA / DA 탭 */}
      <div className="flex rounded-md border border-zinc-300 text-sm dark:border-zinc-700" style={{ width: "fit-content" }}>
        {(
          [
            ["sa", "SA (검색광고)"],
            ["da", "DA (디스플레이)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setChannel(value)}
            className={`px-4 py-1.5 first:rounded-l-md last:rounded-r-md ${
              channel === value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!accountsLoaded ? (
        <div className="rounded-xl border border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-800">
          설정된 계정을 확인하는 중...
        </div>
      ) : !hasAnyAccount ? (
        <SetupGuide onDemo={loadDemo} />
      ) : visibleAccounts.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-800">
          {channel === "sa" ? "SA" : "DA"} 캠페인이 있는 계정이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="w-[180px] px-3 py-2 font-medium">광고계정</th>
                <FilterTh label="캠페인" filter={filterCampaign} onChange={setFilterCampaign} />
                <FilterTh label="그룹" filter={filterGroup} onChange={setFilterGroup} />
                <FilterTh label="소재/키워드" filter={filterLeaf} onChange={setFilterLeaf} />
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((entry) => (
                <AccountRows
                  key={`${entry.state.info.platform}:${entry.state.info.accountId}`}
                  state={entry.state}
                  campaigns={entry.campaigns}
                  collapsed={collapsedAccounts.has(
                    `${entry.state.info.platform}:${entry.state.info.accountId}`,
                  )}
                  onToggle={() =>
                    toggleAccount(`${entry.state.info.platform}:${entry.state.info.accountId}`)
                  }
                  expandedLeaves={expandedLeaves}
                  onToggleLeaves={toggleLeaves}
                  filterCampaign={filterCampaign}
                  filterGroup={filterGroup}
                  filterLeaf={filterLeaf}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTh({
  label,
  filter,
  onChange,
}: {
  label: string;
  filter: OnOffFilter;
  onChange: (f: OnOffFilter) => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <span className="mr-2">{label}</span>
      <select
        value={filter}
        onChange={(e) => onChange(e.target.value as OnOffFilter)}
        className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[11px] font-normal dark:border-zinc-700 dark:bg-zinc-900"
      >
        {filterOptions.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </th>
  );
}

function AccountRows({
  state,
  campaigns,
  collapsed,
  onToggle,
  expandedLeaves,
  onToggleLeaves,
  filterCampaign,
  filterGroup,
  filterLeaf,
}: {
  state: AccountState;
  campaigns: CampaignNode[];
  collapsed: boolean;
  onToggle: () => void;
  expandedLeaves: Set<string>;
  onToggleLeaves: (key: string) => void;
  filterCampaign: OnOffFilter;
  filterGroup: OnOffFilter;
  filterLeaf: OnOffFilter;
}) {
  const { info } = state;
  const accountLabel = (
    <button onClick={onToggle} className="flex items-center gap-1.5 text-left font-sans hover:text-blue-600">
      <span className="text-zinc-400">{collapsed ? "▶" : "▼"}</span>
      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{info.label}</span>
      <span className="text-[10px] text-zinc-400">({PLATFORM_LABEL[info.platform]})</span>
    </button>
  );

  if (state.status === "loading") {
    return (
      <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
        <td className="px-3 py-2.5">{accountLabel}</td>
        <td colSpan={3} className="px-3 py-2.5 text-zinc-400">
          불러오는 중...
        </td>
      </tr>
    );
  }
  if (state.status === "error") {
    return (
      <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
        <td className="px-3 py-2.5 align-top">{accountLabel}</td>
        <td colSpan={3} className="px-3 py-2.5 text-red-500">
          조회 실패: {state.message}
        </td>
      </tr>
    );
  }

  // 접힌 계정: 캠페인/그룹/소재 각 칼럼에 그 레벨의 켜짐/꺼짐 집계를 표시
  if (collapsed) {
    const c = countCampaigns(campaigns);
    const g = countGroups(campaigns);
    const l = countLeaves(campaigns);
    const mismatches = countMismatches(campaigns);
    return (
      <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
        <td className="px-3 py-2.5">
          {accountLabel}
          {mismatches > 0 && <MismatchLabel />}
        </td>
        <td className="px-3 py-2.5">
          <CountBadge on={c.on} off={c.off} />
        </td>
        <td className="px-3 py-2.5">
          <CountBadge on={g.on} off={g.off} />
        </td>
        <td className="px-3 py-2.5">
          <CountBadge on={l.on} off={l.off} />
        </td>
      </tr>
    );
  }

  // 펼친 계정: 캠페인 × 그룹 행으로 전개 (rowSpan으로 계정/캠페인 칸 병합)
  const filteredCampaigns = campaigns.filter((cmp) => matchFilter(cmp.enabled, filterCampaign));
  const rows: React.ReactNode[] = [];

  type FlatRow = { campaign: CampaignNode; group: GroupNode | null; cmpFirst: boolean; cmpSpan: number };
  const flat: FlatRow[] = [];
  for (const cmp of filteredCampaigns) {
    const groups = cmp.groups.filter((g) => matchFilter(g.enabled, filterGroup));
    if (groups.length === 0) {
      flat.push({ campaign: cmp, group: null, cmpFirst: true, cmpSpan: 1 });
    } else {
      groups.forEach((g, i) =>
        flat.push({ campaign: cmp, group: g, cmpFirst: i === 0, cmpSpan: groups.length }),
      );
    }
  }

  if (flat.length === 0) {
    return (
      <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
        <td className="px-3 py-2.5 align-top">{accountLabel}</td>
        <td colSpan={3} className="px-3 py-2.5 text-zinc-400">
          필터 조건에 맞는 캠페인이 없습니다.
        </td>
      </tr>
    );
  }

  flat.forEach((row, idx) => {
    const cmp = row.campaign;
    const cmpMismatch = isScheduleMismatch(cmp.enabled, cmp.schedule);
    const cells: React.ReactNode[] = [];

    if (idx === 0) {
      cells.push(
        <td key="account" rowSpan={flat.length} className="border-r border-zinc-100 px-3 py-2.5 align-top dark:border-zinc-800/60">
          {accountLabel}
        </td>,
      );
    }

    if (row.cmpFirst) {
      cells.push(
        <td key="campaign" rowSpan={row.cmpSpan} className="border-r border-zinc-100 px-3 py-2.5 align-top dark:border-zinc-800/60">
          <div className="font-sans font-medium text-zinc-800 dark:text-zinc-200">{cmp.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <OnOffBadge enabled={cmp.enabled} />
            {cmpMismatch && <MismatchLabel />}
            <span className="text-[11px] text-zinc-500">{formatBudget(cmp.dailyBudget)}</span>
            <span className="text-[11px] text-zinc-400">{formatSchedule(cmp.schedule)}</span>
          </div>
        </td>,
      );
    }

    if (row.group === null) {
      cells.push(
        <td key="empty" colSpan={2} className="px-3 py-2.5 text-zinc-300">
          그룹 없음
        </td>,
      );
    } else {
      const grp = row.group;
      const grpMismatch = isScheduleMismatch(grp.enabled, grp.schedule);
      cells.push(
        <td key="group" className="border-r border-zinc-100 px-3 py-2.5 align-top dark:border-zinc-800/60">
          <div className="font-sans font-medium text-zinc-800 dark:text-zinc-200">{grp.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <OnOffBadge enabled={grp.enabled} />
            {grpMismatch && <MismatchLabel />}
            <span className="text-[11px] text-zinc-500">{formatBudget(grp.dailyBudget)}</span>
            <span className="text-[11px] text-zinc-400">{formatSchedule(grp.schedule)}</span>
          </div>
        </td>,
      );

      const leafKey = `${info.platform}:${info.accountId}:${grp.id}`;
      const leavesFiltered = grp.leaves.filter((l) => matchFilter(l.enabled, filterLeaf));
      const on = leavesFiltered.filter((l) => l.enabled).length;
      const off = leavesFiltered.length - on;
      const expanded = expandedLeaves.has(leafKey);
      const kindLabel = grp.leafKind === "keyword" ? "키워드" : "소재";

      cells.push(
        <td key="leaves" className="px-3 py-2.5 align-top">
          {grp.leaves.length === 0 ? (
            <span className="text-zinc-300">—</span>
          ) : (
            <>
              <button
                onClick={() => onToggleLeaves(leafKey)}
                className="flex items-center gap-1.5 hover:text-blue-600"
              >
                <span className="text-zinc-400">{expanded ? "▼" : "▶"}</span>
                <span className="text-[11px] text-zinc-500">{kindLabel}</span>
                <CountBadge on={on} off={off} />
              </button>
              {expanded && (
                <ul className="mt-1.5 space-y-0.5 border-l-2 border-zinc-100 pl-3 dark:border-zinc-800">
                  {leavesFiltered.map((leaf) => (
                    <li key={leaf.id} className="flex items-center gap-2">
                      <OnOffBadge enabled={leaf.enabled} />
                      <span className="font-sans text-zinc-700 dark:text-zinc-300">{leaf.name}</span>
                    </li>
                  ))}
                  {leavesFiltered.length === 0 && (
                    <li className="text-zinc-400">필터 조건에 맞는 {kindLabel}가 없습니다.</li>
                  )}
                </ul>
              )}
            </>
          )}
        </td>,
      );
    }

    rows.push(
      <tr key={`${cmp.id}-${row.group?.id ?? "empty"}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
        {cells}
      </tr>,
    );
  });

  return <>{rows}</>;
}

function SetupGuide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <p className="text-sm font-semibold">아직 연동된 광고 계정이 없습니다.</p>
      <p className="text-sm text-zinc-500">
        아래 환경변수를 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">.env.local</code>(또는
        Render 환경변수)에 넣으면 자동으로 계정이 나타납니다. 플랫폼별로 필요한 것만 설정하면 됩니다.
        계정 목록 형식은 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">라벨:계정ID,라벨2:계정ID2</code> 입니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="py-1.5 pr-4 font-medium">플랫폼</th>
              <th className="py-1.5 font-medium">환경변수</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[11px]">
            <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
              <td className="py-2 pr-4 font-sans">네이버 (SA)</td>
              <td className="py-2">
                NAVER_SEARCHAD_API_KEY / NAVER_SEARCHAD_API_SECRET / NAVER_SEARCHAD_CUSTOMERS
              </td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
              <td className="py-2 pr-4 font-sans">구글 (SA+DA)</td>
              <td className="py-2">
                GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_OAUTH_CLIENT_ID / GOOGLE_ADS_OAUTH_CLIENT_SECRET /
                GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_CUSTOMERS (+선택: GOOGLE_ADS_LOGIN_CUSTOMER_ID)
              </td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
              <td className="py-2 pr-4 font-sans">카카오 (DA)</td>
              <td className="py-2">KAKAO_MOMENT_ACCESS_TOKEN / KAKAO_MOMENT_AD_ACCOUNTS</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans">메타 (DA)</td>
              <td className="py-2">META_ACCESS_TOKEN / META_AD_ACCOUNTS</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">
        자세한 발급 방법은 README의 &ldquo;상태창&rdquo; 섹션 참고. 설정 전에 화면을 미리 보려면:
      </p>
      <button
        onClick={onDemo}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        데모 데이터로 미리보기
      </button>
    </div>
  );
}
