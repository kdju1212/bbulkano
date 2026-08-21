// 네이버 쇼핑검색("네이버 가격비교") 실시간 순위 체크
// 파워링크와 같은 검색결과 페이지 안에 "가격비교" 섹션으로 함께 내려온다 — 같은 fetchNaverSearchHtml을 재사용한다.
// 파워링크와 다르게 순위 숫자가 HTML에 박혀있지 않아서, 상품이 문서에 등장하는 순서를 그대로 순위로 쓴다.
// 판매처 도메인도 평문으로 안 보여서(전부 리다이렉트 링크), 판매처 표시 이름으로만 매칭 가능하다.
// 주의: 상품 블록 위치는 data-slog-content 속성(비교적 안정적)으로 잡지만, 판매처 이름을 뽑는 class="iMhVFYLc"는
// 네이버가 자동 생성하는 해시 클래스라 배포될 때마다 바뀔 수 있다 — 파워링크보다 깨질 가능성이 높다.

import type { BlockDebug, Device } from "./naver-rank-check";
import { decodeCommonEntities, fetchNaverSearchHtml, looksBlocked, makeBlockDebug, normalizeName } from "./naver-rank-check";

export type ShoppingItem = {
  rank: number; // 문서에 등장한 순서 (순위 숫자가 따로 없어 이걸로 대신한다)
  storeName: string;
  isAd: boolean; // "광고" 배지 유무
};

export type ShoppingNotFoundDebug = {
  items: ShoppingItem[];
};

export type ShoppingRankResult =
  | { status: "found"; rank: number; isAd: boolean }
  | { status: "not_found"; debug?: ShoppingNotFoundDebug }
  | { status: "no_shopping_section" } // 이 키워드엔 가격비교/쇼핑검색 영역 자체가 없음
  | { status: "blocked"; debug?: BlockDebug }
  | { status: "error"; message: string };

const SHOPPING_ITEM_MARKER = /data-slog-content="shp_gui:([^"]+)"/g;
const STORE_NAME_PATTERN = /class="iMhVFYLc"[^>]*>([^<]*)</;
const AD_BADGE_PATTERN = /<span class="blind">광고<\/span>/;

export function extractShoppingItems(html: string): ShoppingItem[] {
  const decoded = decodeCommonEntities(html);
  const markers = [...decoded.matchAll(SHOPPING_ITEM_MARKER)];
  return markers.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < markers.length ? (markers[i + 1].index ?? decoded.length) : decoded.length;
    const block = decoded.slice(start, end);
    const nameMatch = block.match(STORE_NAME_PATTERN);
    return {
      rank: i + 1,
      storeName: nameMatch ? nameMatch[1].trim() : "",
      isAd: AD_BADGE_PATTERN.test(block),
    };
  });
}

function hasShoppingSection(html: string): boolean {
  return html.includes('data-slog-content="shp_gui:');
}

// 판매처 표시 이름으로 매칭한다 (도메인이 평문으로 없어서 이름만 가능). 콤마로 여러 개 입력 가능.
export function judgeShoppingRank(html: string, storeName: string, httpStatus = 200): ShoppingRankResult {
  if (httpStatus < 200 || httpStatus >= 300 || looksBlocked(html)) {
    return { status: "blocked", debug: makeBlockDebug(httpStatus, html) };
  }
  if (!hasShoppingSection(html)) {
    return { status: "no_shopping_section" };
  }

  const items = extractShoppingItems(html);
  const targets = storeName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeName);
  const hit = items.find((it) => it.storeName && targets.includes(normalizeName(it.storeName)));
  if (hit) {
    return { status: "found", rank: hit.rank, isAd: hit.isAd };
  }
  return { status: "not_found", debug: { items } };
}

export async function checkShoppingRank(keyword: string, device: Device, storeName: string): Promise<ShoppingRankResult> {
  try {
    const { html, status } = await fetchNaverSearchHtml(keyword, device);
    return judgeShoppingRank(html, storeName, status);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export const SHOPPING_STATUS_LABEL: Record<ShoppingRankResult["status"], string> = {
  found: "노출",
  not_found: "노출순위 없음",
  no_shopping_section: "가격비교 영역 없음",
  blocked: "차단/캡차 의심",
  error: "조회 실패",
};
