// 상태창 — 환경변수에서 플랫폼별 계정 설정을 읽는다 (서버 전용).
//
// 계정 목록 형식: "라벨:계정ID,라벨2:계정ID2" (콤마 구분, 라벨은 화면 표시용)
//   예) NAVER_SEARCHAD_CUSTOMERS="A기업:1234567,B기업:2345678"
//
// 플랫폼별 필요 환경변수는 .env.local.example 참고.

import type { AccountInfo, Platform } from "./types";

export type ParsedAccount = { label: string; accountId: string };

export function parseAccountList(raw: string | undefined): ParsedAccount[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx === -1) return { label: part, accountId: part };
      return { label: part.slice(0, idx).trim(), accountId: part.slice(idx + 1).trim() };
    });
}

export function naverConfigured(): boolean {
  return !!(
    process.env.NAVER_SEARCHAD_API_KEY &&
    process.env.NAVER_SEARCHAD_API_SECRET &&
    process.env.NAVER_SEARCHAD_CUSTOMERS
  );
}

export function googleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMERS
  );
}

export function kakaoConfigured(): boolean {
  return !!(process.env.KAKAO_MOMENT_ACCESS_TOKEN && process.env.KAKAO_MOMENT_AD_ACCOUNTS);
}

export function metaConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNTS);
}

/** 설정된 모든 계정 목록 (비밀값은 절대 포함하지 않는다 — 클라이언트로 그대로 나감). */
export function listConfiguredAccounts(): AccountInfo[] {
  const accounts: AccountInfo[] = [];
  const push = (platform: Platform, parsed: ParsedAccount[]) => {
    parsed.forEach(({ label, accountId }) => accounts.push({ platform, accountId, label }));
  };
  if (naverConfigured()) push("naver", parseAccountList(process.env.NAVER_SEARCHAD_CUSTOMERS));
  if (googleConfigured()) push("google", parseAccountList(process.env.GOOGLE_ADS_CUSTOMERS));
  if (kakaoConfigured()) push("kakao", parseAccountList(process.env.KAKAO_MOMENT_AD_ACCOUNTS));
  if (metaConfigured()) push("meta", parseAccountList(process.env.META_AD_ACCOUNTS));
  return accounts;
}
