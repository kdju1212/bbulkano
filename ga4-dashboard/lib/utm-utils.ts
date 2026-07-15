// UTM 빌더 전체(키워드/캠페인·그룹/DA 모드)가 공유하는 URL·인코딩 유틸.

// encodeURIComponent는 한글을 %EC%95... 식으로 퍼센트 인코딩해서 사람이 못 읽게 만든다.
// UTM 값은 쿼리스트링 구조를 깨는 문자(공백, &, =, #, +, %)만 최소한으로 escape하고
// 한글을 포함한 나머지 문자는 그대로 둔다 (대부분의 광고/분석 플랫폼이 원문 그대로 잘 처리함).
export function encodeUtmValue(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/=/g, "%3D")
    .replace(/#/g, "%23")
    .replace(/\+/g, "%2B")
    .replace(/ /g, "+");
}

export function appendQuery(base: string, query: string): string {
  const trimmed = base.trim();
  if (!query || trimmed === "") return trimmed;
  return trimmed + (trimmed.includes("?") ? "&" : "?") + query;
}

/** URL에 이미 붙어있는 utm_* 쿼리 파라미터를 제거한다 (재결합 전 중복 방지용). */
export function stripUtmParams(url: string): string {
  const trimmed = url.trim();
  const qIndex = trimmed.indexOf("?");
  if (qIndex === -1) return trimmed;
  const base = trimmed.slice(0, qIndex);
  const query = trimmed.slice(qIndex + 1);
  if (!query) return trimmed;
  const kept = query
    .split("&")
    .filter((pair) => pair !== "" && !pair.toLowerCase().startsWith("utm_"))
    .join("&");
  return kept ? `${base}?${kept}` : base;
}
