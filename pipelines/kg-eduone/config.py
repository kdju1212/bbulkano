from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

TEMPLATE_FILE = BASE_DIR / "template.xlsm"
JSON_DIR = BASE_DIR / "json_rules"
MATERIALS_DIR = BASE_DIR / "materials"
OUTPUT_DIR = BASE_DIR / "output"

OUTPUT_FILE = OUTPUT_DIR / "KG에듀원_임용고시_통합가공_python.xlsm"

JSON_FILES = {
    "cleaner": JSON_DIR / "001_cleaner.json",
    "external": JSON_DIR / "002_external.json",
    "conversion_cleanup": JSON_DIR / "cond" / "003_conversion_cleanup.json",
    "filldown_first": JSON_DIR / "cond" / "004_filldown_first.json",
    "missing": JSON_DIR / "cond" / "005_missing.json",
    "google_missing_campaign": JSON_DIR / "cond" / "006_google_missing_campaign.json",
    "blank_zero": JSON_DIR / "cond" / "007_blank_zero.json",
    "internal": JSON_DIR / "008_internal.json",
    "device_cleanup": JSON_DIR / "cond" / "009_device_cleanup.json",
    "date_format": JSON_DIR / "cond" / "010_date_format.json",
    "filldown_second": JSON_DIR / "cond" / "011_filldown_second.json",
}
