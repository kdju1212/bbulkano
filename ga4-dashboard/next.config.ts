import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // RAW 가공 기본 진입점 → 현재 동작하는 KG에듀원 탭
        source: "/raw-processor",
        destination: "/raw-processor/kg-eduone",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
