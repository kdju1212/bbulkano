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
| UTM 빌더 | — | 키워드/DA 토글. 키워드 모드: 키워드ID·키워드 목록 + UTM → 네이버 CSV(CP949) 다운로드. DA 모드: URL + UTM → 완성 URL 복사 |

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
