# GA4 AI 대시보드

여러 광고주의 GA4 데이터를 조회하고 AI 인사이트를 받는 개인용 분석 도구.
네비게이션 헤더로 페이지를 이동하며, 선택한 Property와 기간은 모든 페이지에서 공유됩니다.

## 실행 방법

```bash
npm install     # 최초 1회
npm run dev
```

브라우저에서 http://localhost:3000 접속. (Node.js 18 이상 필요)

## 페이지

상단 헤더는 **대시보드 / RAW 가공 / UTM 빌더** 세 개가 있고, 대시보드 안에 서브 탭으로 나뉩니다:

| 헤더 탭 | 서브 탭 | 내용 |
|---|---|---|
| 대시보드 | 개요 | KPI 카드(Users/Sessions/Event Count/Conversions/CVR) + 추이 차트 |
| | 유입 분석 | Source/Medium/Campaign별 성과 차트·테이블 |
| | 이벤트 분석 | 핵심 이벤트 발생 수·사용자·변화율 |
| | AI 분석 | GA4 데이터를 근거로 대화하는 챗봇 (Groq) |
| RAW 가공 | — | 재료 CSV 업로드 → 정제된 xlsm 다운로드 (`../pipelines/<광고주>/` 파이썬 파이프라인 호출) |
| UTM 빌더 | — | 키워드/캠페인·그룹/DA 토글. 키워드 모드: 키워드ID·키워드 목록 + UTM → 네이버 CSV(CP949) 다운로드. 캠페인·그룹 모드: 캠페인/광고그룹 리포트 CSV 업로드 → 캠페인ID·광고그룹ID를 utm_campaign·utm_content로 자동 치환해 UTM 결합 CSV 다운로드. DA 모드: URL + UTM → 완성 URL 복사 |

## RAW 가공 탭 사용 조건

이 저장소의 `pipelines/` 폴더가 함께 있어야 하고(같이 clone하면 됨), 파이썬 의존성이 설치되어 있어야 합니다:

```bash
cd ../pipelines/kg-eduone
pip install -r requirements.txt
```

광고주별 파이프라인 구조와 새 광고주 추가 방법은 `../pipelines/README.md` 참고.

파이썬 명령이 `python`이 아니면 `.env.local`에 `PYTHON=py` 처럼 지정하세요.

## 개발 진행 상태

- [x] STEP 1: 대시보드 UI (목데이터)
- [x] 추가: RAW 가공 탭 (기존 엑셀 정제 도구 통합)
- [x] STEP 2: Google OAuth 로그인 (`.env.local` 필요)
- [x] STEP 3: GA4 Property 목록 조회 (로그인하면 헤더 드롭다운이 실제 목록으로 교체)
- [x] STEP 4-5: GA4 Data API 실데이터 연결 (로그인하면 KPI/유입/이벤트가 실데이터)
- [x] STEP 6: AI 분석 — GA4 데이터를 근거로 대화하는 챗봇 (Groq API — `GROQ_API_KEY` 필요)

DB는 사용하지 않는다 (개인용 도구라 실시간 조회로 충분).

`.env.local` 만들기: `.env.local.example`을 복사한 뒤 값 채우기 (git에 올라가지 않음).
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_SECRET` 세 개가 로그인에 필수다.

## Render 배포

저장소 루트의 `Dockerfile`이 Node.js(웹) + Python(RAW 가공)을 한 이미지에 담는다.
빌드 컨텍스트는 반드시 **저장소 루트**여야 한다 (`ga4-dashboard/`와 `pipelines/`를 함께 COPY하기 때문).

1. Render 대시보드 → **New → Web Service** → 이 GitHub 저장소 연결
2. **Environment**: Docker 선택, Dockerfile Path `./Dockerfile`, Root Directory는 비워둠(저장소 루트)
3. Environment Variables 설정:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — 기존 값 재사용
   - `NEXTAUTH_URL` — Render가 배정한 도메인 (예: `https://ga4-ai-dashboard.onrender.com`)
   - `NEXTAUTH_SECRET` — 배포용으로 새로 강하게 생성 (Render의 "Generate" 버튼 사용 가능)
   - `GROQ_API_KEY` — 기존 값 재사용
4. Google Cloud Console → OAuth 클라이언트 → **승인된 리디렉션 URI**에 추가:
   `https://<배포도메인>/api/auth/callback/google`
5. Google Cloud Console → OAuth 동의 화면 → **테스트 사용자**는 기존 목록 그대로 유지됨 (배포와 무관)

`render.yaml`(Blueprint)이 저장소 루트에 있어서 "New → Blueprint"로도 배포 가능 (비밀값은 배포 후 대시보드에서 직접 입력).

무료 플랜은 일정 시간 요청이 없으면 슬립 상태가 되고, 다음 요청 시 1분 내외 콜드 스타트가 걸린다 — 개인용 도구 특성상 크게 문제되지 않는다.
