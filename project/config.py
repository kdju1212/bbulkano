from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

TEMPLATE_FILE = BASE_DIR / "template.xlsm"
JSON_DIR = BASE_DIR / "json_모음"
MATERIALS_DIR = BASE_DIR / "재료"
OUTPUT_DIR = BASE_DIR / "output"

OUTPUT_FILE = OUTPUT_DIR / "KG에듀원_임용고시_통합가공_python.xlsm"

JSON_FILES = {
    "cleaner": JSON_DIR / "001_임용고시_클리너.json",
    "external": JSON_DIR / "002_임용고시_외부통합.json",
    "conversion_cleanup": JSON_DIR / "조건" / "003_임용고시_구글전환RAW_수정.json",
    "filldown_first": JSON_DIR / "조건" / "004_임용고시_필다운_1차.json",
    "missing": JSON_DIR / "조건" / "005_임용고시_미포함.json",
    "google_missing_campaign": JSON_DIR / "조건" / "006_임용고시_구글_미포함_캠페인.json",
    "blank_zero": JSON_DIR / "조건" / "007_임용고시_공백0처리.json",
    "internal": JSON_DIR / "008_임용고시_내부통합.json",
    "device_cleanup": JSON_DIR / "조건" / "009_임용고시_기기정리.json",
    "date_format": JSON_DIR / "조건" / "010_임용고시_날짜서식.json",
    "filldown_second": JSON_DIR / "조건" / "011_임용고시_필다운_2차.json",
}
