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

상단 헤더는 **대시보드 / RAW 가공 / UTM 빌더 / 네이버 관리 / 상태창** 다섯 개가 있고, 대시보드 안에 서브 탭으로 나뉩니다:

| 헤더 탭 | 서브 탭 | 내용 |
|---|---|---|
| 대시보드 | 개요 | KPI 카드(Users/Sessions/Event Count/Conversions/CVR) + 추이 차트 |
| | 유입 분석 | Source/Medium/Campaign별 성과 차트·테이블 |
| | 이벤트 분석 | 핵심 이벤트 발생 수·사용자·변화율 |
| | AI 분석 | GA4 데이터를 근거로 대화하는 챗봇 (Groq) |
| RAW 가공 | — | 재료 CSV 업로드 → 정제된 xlsm 다운로드 (`../pipelines/<광고주>/` 파이썬 파이프라인 호출) |
| UTM 빌더 | — | 키워드/캠페인·그룹/DA 토글. 키워드 모드: 키워드ID·키워드 목록 + UTM → 네이버 CSV(CP949) 다운로드. 캠페인·그룹 모드: 캠페인/광고그룹 리포트 CSV 업로드 → 캠페인ID·광고그룹ID를 utm_campaign·utm_content로 자동 치환해 UTM 결합 CSV 다운로드. DA 모드: URL + UTM → 완성 URL 복사 |
| 네이버 관리 | 소재 리스트화 | 네이버 대량관리 "광고 정보 일괄 다운로드" TSV(캠페인/광고그룹/소재/애셋/애셋링크)를 업로드하면 자동 분류·조인해 소재 리스트를 만든다. 성과 CSV를 얹으면 소재 ID 기준으로 CTR·CPC·CVR·ROAS까지 계산. 단일형/반응형 CSV, 그룹별 소재 현황(ON 소재 없는 그룹 경고) CSV 다운로드 |
| | 입찰가 대량관리 | 성과 CSV(날짜별 키워드/소재 성과) + TSV(캠페인/광고그룹/키워드/쇼핑검색 ID)를 조인해 기간 A(기준) vs B(비교) 성과를 비교한다. 파워링크/쇼핑검색/브랜드검색 유형별 CPC·CTR·CVR·ROAS·평균노출순위 증감을 보여주고, "수정할 금액" 빈 열이 포함된 CSV를 만들어 사람이 직접 입찰가를 정해 네이버 대량 편집기에 올리도록 돕는다 (입찰가를 자동으로 바꾸지는 않음) |
| | 파워링크 순위 체크 | 버튼을 누른 순간 네이버 검색결과를 그때그때 가져와 우리 광고(도메인 기준)가 파워링크 몇 위인지 확인한다. 키워드 최대 25개 × PC/모바일, 요청마다 무작위 지연(1~3초)을 두고 순차 호출. 이력·DB 없이 그 자리에서만 보여주고, 노출순위 없음/더보기 밖일 수 있음/파워링크 영역 없음/차단·캡차 의심을 구분해서 보여준다. 공식 API가 없어 HTML을 파싱하는 방식이라 네이버 페이지 구조가 바뀌면 동작하지 않을 수 있음 |
| 상태창 | — | 네이버/구글/카카오/메타 광고 API로 광고계정→캠페인→그룹→소재/키워드의 ON/OFF·일예산·운영시간을 실시간 조회. SA/DA 탭, 계정·소재 접기/펼치기(접히면 켜짐/꺼짐 집계), 칼럼별 ON/OFF 필터, "지금 켜져있어야 하는데 꺼진" 스케줄 불일치 배너 지원. API 키는 환경변수로 등록 (아래 참고) |

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

## 상태창 API 키 등록

플랫폼별로 필요한 것만 `.env.local`(로컬) 또는 Render 환경변수(배포)에 넣으면 자동으로 계정이 나타난다.
계정 목록 형식은 `라벨:계정ID,라벨2:계정ID2` (라벨은 화면 표시용). 전체 목록은 `.env.local.example` 참고.

| 플랫폼 | 발급 방법 | 비고 |
|---|---|---|
| 네이버 (SA) | 광고시스템 → 도구 → API 사용관리에서 라이선스 키·비밀키 발급. `NAVER_SEARCHAD_CUSTOMERS`에 조회할 광고주 CUSTOMER_ID 나열 | 타 광고주 계정은 권한위임 필요. DA(GFA)는 별도 API라 미지원 (추후) |
| 구글 (SA+DA) | Google Ads API 개발자 토큰 + OAuth 클라이언트 + 리프레시 토큰. MCC면 `GOOGLE_ADS_LOGIN_CUSTOMER_ID`에 MCC ID | 캠페인 유형(SEARCH/그 외)으로 SA/DA 자동 분류. 광고 노출 스케줄로 불일치 감지 지원 |
| 카카오 (DA) | 카카오모먼트 오픈API — **공식대행사만 권한 신청 가능**. 비즈 앱 전환 후 비즈니스 토큰 발급 | 카카오 키워드광고(SA) API는 추후 |
| 메타 (DA) | 비즈니스 관리자 → 시스템 사용자 토큰 권장 (일반 토큰은 60일 만료) | `META_AD_ACCOUNTS`에 `act_` 접두사 포함 가능. adset_schedule로 불일치 감지 지원 |

키를 하나도 안 넣으면 상태창에 설정 가이드와 "데모 데이터로 미리보기" 버튼이 나온다.
Google Ads / Meta의 API 버전이 만료되면 `GOOGLE_ADS_API_VERSION` / `META_API_VERSION`으로 조정.

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
