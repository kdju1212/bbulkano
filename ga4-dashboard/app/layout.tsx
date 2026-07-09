import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "@/lib/dashboard-context";
import { NavHeader } from "@/components/nav-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GA4 AI 대시보드",
  description: "여러 광고주의 GA4 데이터를 조회하고 AI 인사이트를 받는 개인용 분석 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <DashboardProvider>
          <NavHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </DashboardProvider>
      </body>
    </html>
  );
}
