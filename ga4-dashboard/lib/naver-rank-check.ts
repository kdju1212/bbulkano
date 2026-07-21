// 파워링크(네이버 검색광고) 실시간 순위 체크
// 공식 API가 없어 실제 검색결과 HTML을 그때그때 가져와 파싱한다 (저장/이력 없음, 버튼 누를 때만 호출).
// 광고 하나마다 제목/URL/파비콘 링크에 동일한 r=순위&i=소재ID&d="+함수("도메인")+" 패턴이 반복 등장해
// 정규식 하나로 순위·소재ID·도메인을 뽑아낸다. PC는 urlencode(), 모바일은 encodeURIComponent()를 쓴다.
// 업체명(<span class="site">)은 광고 블록마다 한 번만 나오므로, 각 광고의 첫 r=/i= 등장 위치부터
// 다음 광고가 시작되기 전까지를 한 블록으로 잘라 그 안에서 찾는다.

export type Device = "pc" | "mobile";

export type PowerlinkAd = {
  rank: number;
  adId: string;
  domain: string;
  name: string;
};

export type BlockDebug = {
  httpStatus: number;
  length: number;
  snippet: string;
};

export type RankResult =
  | { status: "found"; rank: number; adId: string }
  | { status: "not_found_no_more" } // 파워링크 전부 확인했지만 없음 (더보기도 없음 → 노출 안 됨이 확실)
  | { status: "not_found_has_more" } // 앞쪽엔 없지만 "더보기"가 있어 더 아래 순위일 수 있음
  | { status: "no_powerlink" } // 이 키워드엔 파워링크 영역 자체가 없음
  | { status: "blocked"; debug?: BlockDebug } // 차단/비정상 응답으로 추정
  | { status: "error"; message: string };

const AD_PATTERN =
  /r=(\d+)&amp;i=(nad-[\w-]+)&amp;d=&quot;\+(?:urlencode|encodeURIComponent)\(&quot;([^&]+?)&quot;\)/g;
const SITE_NAME_PATTERN = /<span class="site">([^<]*)<\/span>/;

export function extractPowerlinkAds(html: string): PowerlinkAd[] {
  const firstByRank = new Map<number, { adId: string; domain: string; index: number }>();
  for (const m of html.matchAll(AD_PATTERN)) {
    const rank = Number(m[1]);
    if (!firstByRank.has(rank) && m.index !== undefined) {
      firstByRank.set(rank, { adId: m[2], domain: m[3], index: m.index });
    }
  }

  const entries = [...firstByRank.entries()].sort((a, b) => a[1].index - b[1].index);
  const ads: PowerlinkAd[] = entries.map(([rank, info], i) => {
    const blockEnd = i + 1 < entries.length ? entries[i + 1][1].index : html.length;
    const block = html.slice(info.index, blockEnd);
    const nameMatch = block.match(SITE_NAME_PATTERN);
    return { rank, adId: info.adId, domain: info.domain, name: nameMatch ? nameMatch[1].trim() : "" };
  });

  return ads.sort((a, b) => a.rank - b.rank);
}

function hasMoreLink(html: string): boolean {
  return /mod_more_wrap|group_more/.test(html);
}

function hasPowerlinkSection(html: string): boolean {
  return html.includes('id="power_link_body"');
}

// 정상 검색결과 페이지는 수십만 자 크기의 완전한 HTML이고, 차단/캡차 페이지는 보통 훨씬 작은 안내
// 페이지 하나뿐이다. 페이지 안에 등장하는 특정 단어로 판단하면 정상 페이지 어딘가(광고 스크립트 등)에
// 우연히 같은 단어가 섞여 있을 때 오탐이 나므로, 크기·기본 구조만으로 판단한다.
function looksBlocked(html: string): boolean {
  if (html.length < 10000) return true;
  if (!/<title[ >]/i.test(html)) return true;
  return false;
}

function makeBlockDebug(httpStatus: number, html: string): BlockDebug {
  return {
    httpStatus,
    length: html.length,
    snippet: html.replace(/\s+/g, " ").trim().slice(0, 300),
  };
}

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toLowerCase();
}

// 업체명(예: "도시락eSIM")으로 매칭하되, 도메인 형태로 입력해도(예: "dosirakesim.com") 동작하도록
// 이름·도메인 둘 다 비교한다.
export function judgeRank(html: string, advertiser: string, httpStatus = 200): RankResult {
  if (httpStatus < 200 || httpStatus >= 300 || looksBlocked(html)) {
    return { status: "blocked", debug: makeBlockDebug(httpStatus, html) };
  }
  if (!hasPowerlinkSection(html)) {
    return { status: "no_powerlink" };
  }

  const ads = extractPowerlinkAds(html);
  const targetName = normalizeName(advertiser);
  const targetDomain = normalizeDomain(advertiser);
  const hit = ads.find(
    (ad) => (ad.name && normalizeName(ad.name) === targetName) || normalizeDomain(ad.domain) === targetDomain,
  );
  if (hit) {
    return { status: "found", rank: hit.rank, adId: hit.adId };
  }
  return hasMoreLink(html) ? { status: "not_found_has_more" } : { status: "not_found_no_more" };
}

const PC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

export async function fetchNaverSearchHtml(keyword: string, device: Device): Promise<{ html: string; status: number }> {
  const host = device === "mobile" ? "m.search.naver.com" : "search.naver.com";
  const url = `https://${host}/search.naver?query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": device === "mobile" ? MOBILE_USER_AGENT : PC_USER_AGENT,
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    cache: "no-store",
  });
  // 403/429 등 차단성 상태코드도 본문을 받아 judgeRank에서 진단 정보로 남긴다 (여기서 던지지 않음).
  return { html: await res.text(), status: res.status };
}

export async function checkPowerlinkRank(keyword: string, device: Device, advertiser: string): Promise<RankResult> {
  try {
    const { html, status } = await fetchNaverSearchHtml(keyword, device);
    return judgeRank(html, advertiser, status);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export const RANK_STATUS_LABEL: Record<RankResult["status"], string> = {
  found: "노출",
  not_found_no_more: "노출순위 없음",
  not_found_has_more: "더보기 밖일 수 있음",
  no_powerlink: "파워링크 영역 없음",
  blocked: "차단/캡차 의심",
  error: "조회 실패",
};
