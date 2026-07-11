"""웹(Next.js)에서 호출하는 CLI 래퍼.

업로드된 재료 CSV가 담긴 폴더를 받아 파일명을 매체 스펙 이름으로 정규화한 뒤
파이프라인을 실행하고, 결과 요약(JSON)을 stdout 마지막 줄에 출력한다.

사용법:
    python cli_web.py --materials-dir <업로드폴더> --output <결과.xlsm>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import JSON_FILES, TEMPLATE_FILE  # noqa: E402
from services.csv_service import read_full  # noqa: E402
from services.json_loader import load_json  # noqa: E402
from services.pipeline import ReportPipeline  # noqa: E402


def guess_nametag(filename: str, specs: list[dict]) -> str | None:
    stem = Path(filename).stem.lower().replace(" ", "")
    exact = [spec for spec in specs if Path(spec["file"]).stem.lower() == stem]
    if exact:
        return exact[0]["nametag"]
    partial = [
        spec
        for spec in specs
        if Path(spec["file"]).stem.lower() in stem or stem in Path(spec["file"]).stem.lower()
    ]
    partial.sort(key=lambda spec: len(spec["file"]), reverse=True)
    return partial[0]["nametag"] if partial else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--materials-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    materials_dir = Path(args.materials_dir)
    output_file = Path(args.output)

    specs = load_json(JSON_FILES["external"])
    spec_by_nametag = {spec["nametag"]: spec for spec in specs}

    matched: dict[str, str] = {}  # nametag -> 업로드 파일명
    actual_paths: dict[str, Path] = {}  # nametag -> 디스크상의 실제 경로
    unmatched: list[str] = []
    for path in sorted(materials_dir.iterdir()):
        if not path.is_file():
            continue
        nametag = guess_nametag(path.name, specs)
        if nametag is None or nametag in matched:
            unmatched.append(path.name)
            continue
        matched[nametag] = path.name
        expected = spec_by_nametag[nametag]["file"]
        if path.name.lower() != expected.lower():
            path = path.rename(materials_dir / expected)
        actual_paths[nametag] = path

    raw_sheets = []
    for nametag, actual_path in actual_paths.items():
        spec = spec_by_nametag[nametag]
        force_tab = spec.get("format") == "tab"
        try:
            rows = read_full(actual_path, force_tab=force_tab)
        except UnicodeDecodeError:
            rows = [["(원본 인코딩을 읽을 수 없어 원본 시트를 건너뜁니다.)"]]
        raw_sheets.append((f"업로드원본_{nametag}", rows))

    pipeline = ReportPipeline(template_file=TEMPLATE_FILE, materials_dir=materials_dir)
    pipeline.run(JSON_FILES, output_file, raw_sheets=raw_sheets)

    print(
        json.dumps(
            {"matched": matched, "unmatched": unmatched, "warnings": pipeline.warnings},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
