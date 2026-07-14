# GA4 AI 대시보드 배포용 이미지.
# Next.js(웹) + Python(RAW 가공 파이프라인)을 한 컨테이너에 담는다.
# 빌드 컨텍스트는 저장소 루트여야 한다 (ga4-dashboard/ 와 pipelines/ 를 함께 COPY하기 위함).

# ---- 1. 의존성 설치 ----
FROM node:20-slim AS deps
WORKDIR /app/ga4-dashboard
COPY ga4-dashboard/package.json ga4-dashboard/package-lock.json ./
RUN npm ci

# ---- 2. Next.js 빌드 ----
FROM node:20-slim AS builder
WORKDIR /app/ga4-dashboard
COPY --from=deps /app/ga4-dashboard/node_modules ./node_modules
COPY ga4-dashboard/ ./
RUN npm run build

# ---- 3. 실행 이미지 ----
FROM node:20-slim AS runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/ga4-dashboard
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 광고주별 파이썬 파이프라인 (pipelines/<광고주>/requirements.txt 를
# 전부 하나의 가상환경에 설치 — 새 광고주 폴더가 추가돼도 Dockerfile 수정 불필요)
COPY pipelines /app/pipelines
RUN python3 -m venv /app/pyenv \
    && find /app/pipelines -maxdepth 2 -name requirements.txt \
       -exec /app/pyenv/bin/pip install --no-cache-dir -r {} \;
ENV PYTHON=/app/pyenv/bin/python

# Next.js standalone 산출물
COPY --from=builder /app/ga4-dashboard/public ./public
COPY --from=builder /app/ga4-dashboard/.next/standalone ./
COPY --from=builder /app/ga4-dashboard/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
