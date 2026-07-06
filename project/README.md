# VBA 대체 Python 보고서 생성기

`main.py` 하나로 기존 `KG에듀원_임용고시_통합가공.xlsm` 템플릿과 `json_rules` 규칙, `materials` CSV 파일을 읽어 보고서 파일을 생성합니다.

> 폴더/규칙 파일 이름은 Windows 압축 해제 시 한글 파일명이 깨지는 문제를 피하기 위해 영문으로 되어 있습니다 (`json_모음` → `json_rules`, `조건` → `cond`, `재료` → `materials`). JSON 파일 내용(시트명, 규칙)은 그대로입니다.

## 실행 방법

```bash
pip install -r requirements.txt
python main.py
```

생성 파일:

```text
output/KG에듀원_임용고시_통합가공_python.xlsm
```

## 웹 UI (Streamlit)

재료 CSV 파일을 매번 `materials/` 폴더에 직접 넣지 않고, 브라우저에서 업로드해 결과 파일을 바로 받을 수 있습니다.

```bash
pip install -r requirements.txt
streamlit run app.py
```

- 가지고 있는 재료 CSV만 골라서 업로드하면 되고, 나머지 매체는 비워둬도 됩니다 (해당 매체는 결과에서 비어 있고 경고만 표시됩니다).
- 업로드한 파일이 어떤 매체(카카오MO/PC, 네이버RAW 등)인지 자동으로 추측해 선택박스에 표시하며, 필요하면 직접 바꿀 수 있습니다.
- 결과 엑셀에는 기존처럼 정제된 RAW/종합시트 외에, 업로드한 원본 CSV 내용을 그대로 담은 `업로드원본_<매체>` 시트가 함께 들어갑니다.
- 처리에는 템플릿 크기에 따라 수십 초가 걸릴 수 있습니다 (내부 수식 평가기가 VLOOKUP을 행 단위로 스캔하기 때문).

## 프로젝트 구조

```text
project/
├── main.py
├── app.py
├── config.py
├── services/
│   ├── csv_service.py
│   ├── excel_service.py
│   ├── formula_eval.py
│   ├── json_loader.py
│   └── pipeline.py
├── utils/
│   ├── encoding.py
│   └── range_utils.py
├── json_rules/
├── materials/
├── output/
├── requirements.txt
├── template.xlsm
└── README.md
```

## 처리 흐름

1. `001_cleaner.json`(클리너)으로 대상 시트의 기존 데이터 영역을 비웁니다.
2. `002_external.json`(외부통합)의 범위 매핑을 그대로 읽어 CSV 데이터를 템플릿 시트에 입력합니다.
3. `cond` 폴더의 정제, 필다운, 미포함, 공백 0 처리 규칙을 순서대로 실행합니다.
4. `008_internal.json`(내부통합)으로 RAW 시트 데이터를 `종합시트`에 통합합니다.
5. 기기명 정리, 날짜 서식, 종합시트 필다운을 적용한 뒤 결과 파일을 저장합니다.

## 구현 메모

- JSON 파일은 수정하지 않고 UTF-8 그대로 읽습니다.
- CSV는 BOM/UTF-16 여부를 감지해 콤마 또는 탭 구분으로 읽습니다.
- openpyxl은 수식 계산 엔진이 아니므로 템플릿 수식을 보존하고, 결과 파일에 Excel 재계산 옵션을 설정합니다.
- Python 실행 중 필요한 `CONCATENATE`, `IFERROR(VLOOKUP(...), "미포함")` 판정은 내부 평가기로 처리합니다.
