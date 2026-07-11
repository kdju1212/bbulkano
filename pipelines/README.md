# pipelines — 광고주별 RAW 가공 파이썬 코드

광고주마다 재료 포맷과 정제 규칙이 달라서 **폴더를 완전히 분리**해 관리한다.
한 광고주 코드를 고쳐도 다른 광고주에 영향이 없다.

```text
pipelines/
├── kg-eduone/     KG에듀원 — 임용고시 통합가공 (동작 중)
├── dongkook/      동국제약 (준비중)
└── gangchon/      강촌레일파크 (준비중)
```

## 새 광고주 추가 방법

1. `pipelines/<광고주>/` 폴더를 만들고 가공 코드를 작성한다.
2. 진입점은 `cli_web.py`로 만들고 아래 인터페이스를 지킨다 (웹이 이 규약으로 호출).
3. `ga4-dashboard/app/api/raw-process/route.ts`의 `CLIENT_PIPELINES`에 한 줄 추가.
4. `ga4-dashboard/app/raw-processor/<광고주>/page.tsx`의 "준비중입니다"를 업로드 UI로 교체
   (kg-eduone/page.tsx 복사해서 client 값만 바꾸면 됨).

## cli_web.py 인터페이스 규약

```bash
python cli_web.py --materials-dir <업로드된 파일 폴더> --output <결과 파일 경로>
```

- 업로드된 파일들이 `--materials-dir`에 원본 파일명 그대로 들어있다.
- 결과 파일을 `--output` 경로에 저장한다.
- 성공 시 stdout **마지막 줄**에 JSON 요약을 출력한다:

```json
{"matched": {"매체명": "파일명.csv"}, "unmatched": ["인식실패파일.csv"], "warnings": ["경고 메시지"]}
```

- 실패 시 exit code 1 + stderr에 에러를 남기면 웹 화면에 그대로 표시된다.
