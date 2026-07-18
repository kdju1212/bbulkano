// 상태창 — API 키 설정 전에 화면을 미리 볼 수 있는 데모 데이터.
// 스케줄 불일치 예시가 항상 보이도록 "매일 00-24시" 스케줄 + OFF 조합을 포함한다.

import type { AccountTree } from "./types";

const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, startMinute: 0, endMinute: 1440 }));
const WEEKDAY_9_21 = [1, 2, 3, 4, 5].map((day) => ({ day, startMinute: 9 * 60, endMinute: 21 * 60 }));

export const DEMO_TREES: AccountTree[] = [
  {
    platform: "demo",
    accountId: "demo-naver",
    label: "A기업 (네이버 SA)",
    campaigns: [
      {
        id: "cmp-1",
        name: "브랜드검색_캠페인",
        enabled: true,
        channel: "sa",
        dailyBudget: 50000,
        schedule: WEEKDAY_9_21,
        groups: [
          {
            id: "grp-1",
            name: "브랜드검색그룹",
            enabled: true,
            dailyBudget: 30000,
            schedule: null,
            leafKind: "keyword",
            leaves: [
              { id: "kw-1", name: "브랜드명", enabled: true },
              { id: "kw-2", name: "브랜드명 후기", enabled: true },
              { id: "kw-3", name: "브랜드명 가격", enabled: false },
            ],
          },
          {
            id: "grp-2",
            name: "일반검색그룹",
            enabled: false,
            dailyBudget: 20000,
            schedule: ALL_DAY, // OFF인데 매일 00-24시 스케줄 → 항상 불일치
            leafKind: "keyword",
            leaves: [
              { id: "kw-4", name: "일반키워드1", enabled: true },
              { id: "kw-5", name: "일반키워드2", enabled: true },
            ],
          },
        ],
      },
      {
        id: "cmp-2",
        name: "시즌오프_기획전",
        enabled: false,
        channel: "sa",
        dailyBudget: 100000,
        schedule: null,
        groups: [
          {
            id: "grp-3",
            name: "세일키워드그룹",
            enabled: false,
            dailyBudget: null,
            schedule: null,
            leafKind: "keyword",
            leaves: [
              { id: "kw-6", name: "세일", enabled: false },
              { id: "kw-7", name: "할인", enabled: false },
            ],
          },
        ],
      },
    ],
  },
  {
    platform: "demo",
    accountId: "demo-meta",
    label: "B기업 (메타 DA)",
    campaigns: [
      {
        id: "meta-cmp-1",
        name: "여름_전환캠페인",
        enabled: true,
        channel: "da",
        dailyBudget: 200000,
        schedule: null,
        groups: [
          {
            id: "meta-set-1",
            name: "관심사타겟_세트",
            enabled: true,
            dailyBudget: 100000,
            schedule: WEEKDAY_9_21,
            leafKind: "creative",
            leaves: [
              { id: "ad-1", name: "메인배너_A안", enabled: true },
              { id: "ad-2", name: "메인배너_B안", enabled: true },
              { id: "ad-3", name: "영상소재_15초", enabled: false },
            ],
          },
          {
            id: "meta-set-2",
            name: "리타겟팅_세트",
            enabled: true,
            dailyBudget: 100000,
            schedule: null,
            leafKind: "creative",
            leaves: [
              { id: "ad-4", name: "리타겟_카루셀", enabled: true },
              { id: "ad-5", name: "리타겟_단일이미지", enabled: true },
            ],
          },
        ],
      },
    ],
  },
];
