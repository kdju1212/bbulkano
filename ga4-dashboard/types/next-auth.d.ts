import "next-auth";

declare module "next-auth" {
  interface Session {
    /** GA4 API 호출에 쓰는 Google OAuth access token */
    accessToken?: string;
    tokenError?: "RefreshTokenError" | null;
  }
}
