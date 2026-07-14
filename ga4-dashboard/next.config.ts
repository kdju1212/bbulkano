import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 실행 번들 생성 (Render 등 컨테이너 호스팅)
  output: "standalone",
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
