// Google OAuth 설정 (Auth.js v5)
// - analytics.readonly + spreadsheets.readonly 스코프로 GA4·구글시트 조회 권한을 함께 요청한다.
// - access_type=offline + prompt=consent 로 refresh_token을 받아 만료 시 자동 갱신한다.
// - 시트 접근은 별도 서버 저장 토큰 없이 "로그인한 사람 본인의" 세션 토큰으로만 호출한다 —
//   그 계정이 시트에 권한이 없으면 구글 API가 자체적으로 막아준다 (다른 사람이 로그인해도 안전).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GA_SCOPE =
  "openid email profile https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/spreadsheets.readonly";

type TokenBundle = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch seconds
  error?: "RefreshTokenError";
};

async function refreshAccessToken(token: TokenBundle): Promise<TokenBundle> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
      }),
    });
    const data = await response.json();
    if (!response.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GA_SCOPE,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const bundle = token as typeof token & TokenBundle;
      // 최초 로그인 시 토큰 저장
      if (account) {
        bundle.accessToken = account.access_token;
        bundle.refreshToken = account.refresh_token ?? bundle.refreshToken;
        bundle.expiresAt = account.expires_at;
        return bundle;
      }
      // 만료 전이면 그대로 사용 (60초 여유)
      if (bundle.expiresAt && Date.now() / 1000 < bundle.expiresAt - 60) {
        return bundle;
      }
      // 만료됐으면 갱신
      if (bundle.refreshToken) {
        return { ...bundle, ...(await refreshAccessToken(bundle)) };
      }
      return bundle;
    },
    async session({ session, token }) {
      const bundle = token as TokenBundle;
      return {
        ...session,
        accessToken: bundle.accessToken,
        tokenError: bundle.error ?? null,
      };
    },
  },
});
