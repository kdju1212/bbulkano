from __future__ import annotations

from pathlib import Path
from typing import Sequence

from config import MATERIALS_DIR, TEMPLATE_FILE
from services.csv_service import CsvService
from services.excel_service import ExcelService, coerce_value
from services.json_loader import load_json
from utils.range_utils import col_index, parse_range


class ReportPipeline:
    def __init__(self, template_file: Path = TEMPLATE_FILE, materials_dir: Path = MATERIALS_DIR) -> None:
        self.excel = ExcelService(template_file)
        self.csv = CsvService(materials_dir)
        self.warnings: list[str] = []

    def run(
        self,
        json_files: dict[str, Path],
        output_file: Path,
        raw_sheets: Sequence[tuple[str, Sequence[Sequence[object]]]] | None = None,
    ) -> None:
        # VBA Run_ALL과 동일한 순서: M001 클리너 → M002 외부통합 →
        # M003 데이터가공(003~007) → M004 내부통합(008) →
        # M005 서식설정(010) → M006 데이터가공 2차(009, 011)
        for rule in load_json(json_files["cleaner"]):
            self.excel.clear_groups(rule)

        self._external_import(load_json(json_files["external"]))

        for key in ("conversion_cleanup", "filldown_first", "missing", "google_missing_campaign", "blank_zero"):
            self._run_rules(load_json(json_files[key]))

        self._internal_import(load_json(json_files["internal"]))

        for key in ("date_format", "device_cleanup", "filldown_second"):
            self._run_rules(load_json(json_files[key]))

        for sheet_name, rows in raw_sheets or []:
            self.excel.write_raw_sheet(sheet_name, rows)

        self.excel.save(output_file)
        for warning in self.warnings:
            print(f"경고: {warning}")

    def _external_import(self, rules: list[dict]) -> None:
        for rule in rules:
            path = self.csv.find_file(rule["file"])
            if path is None:
                self.warnings.append(f"재료 파일 없음 - {rule['file']} ({rule['nametag']})")
                continue
            rows = self.csv.read_rows(path, force_tab=rule.get("format") == "tab")
            specs = [(parse_range(src), parse_range(dst)) for src, dst in rule["map"]]
            target = rule["target_sheet"]

            # VBA 외부통합 3-6: 매체 전체에서 복사할 최대 행 수를 먼저 결정
            max_num_rows = 0
            for source_spec, _ in specs:
                first = source_spec.min_row or 1
                if source_spec.min_row and source_spec.max_row:
                    count = source_spec.max_row - first + 1
                else:
                    last = first
                    for idx in range(len(rows), 0, -1):
                        row = rows[idx - 1]
                        cols = range(source_spec.min_col - 1, min(source_spec.max_col, len(row)))
                        if any(str(row[c]).strip() != "" for c in cols):
                            last = max(last, idx)
                            break
                    count = last - first + 1
                max_num_rows = max(max_num_rows, count)
            if max_num_rows <= 0:
                continue

            # VBA 외부통합 3-7: 행번호 없는 목적지(Append 모드)는 대상 열들의
            # 마지막 사용 행 + 1에서 매체 블록 전체가 함께 시작한다.
            append_cols: set[int] = set()
            for _, dest_spec in specs:
                if dest_spec.min_row is None:
                    append_cols.update(range(dest_spec.min_col, dest_spec.max_col + 1))
            media_start = None
            if append_cols:
                media_start = max(self.excel.last_raw_row_in_cols(target, append_cols), 1) + 1

            block_start = None
            for source_spec, dest_spec in specs:
                first = source_spec.min_row or 1
                width = source_spec.max_col - source_spec.min_col + 1
                data: list[list[object]] = []
                for idx in range(first - 1, first - 1 + max_num_rows):
                    if 0 <= idx < len(rows):
                        row = rows[idx]
                        data.append(
                            [
                                row[c] if c < len(row) else ""
                                for c in range(source_spec.min_col - 1, source_spec.min_col - 1 + width)
                            ]
                        )
                    else:
                        data.append([""] * width)
                start_row = dest_spec.min_row or media_start
                self.excel.write_block(target, start_row, dest_spec.min_col, data)
                block_start = start_row if block_start is None else min(block_start, start_row)

            # VBA ApplyMarking: 블록 전체 행에 라벨을 무조건 채운다
            if rule.get("marking"):
                mark_start = media_start if media_start is not None else (block_start or 2)
                ws = self.excel.workbook[target]
                for col, value in rule["marking"]:
                    col_num = col_index(col)
                    for row in range(mark_start, mark_start + max_num_rows):
                        ws.cell(row=row, column=col_num).value = coerce_value(value)

    def _internal_import(self, rules: list[dict]) -> None:
        for rule in rules:
            first_dest = parse_range(rule["map"][0][1])
            if first_dest.min_row:
                current_start = first_dest.min_row
            else:
                # VBA 내부통합 3-5: 대상 시트 전체의 마지막 내용 행 + 1
                current_start = max(self.excel.last_content_row(rule["target_sheet"]), 1) + 1
            self.excel.copy_mapped_rows(
                rule["source_sheet"],
                rule["target_sheet"],
                rule["map"],
                markings=rule.get("marking"),
                start_row=current_start,
                link_formulas=True,
            )

    def _run_rules(self, rules: list[dict]) -> None:
        for rule in rules:
            process_type = rule.get("process_type")
            if process_type == "filldown":
                self.excel.filldown(rule)
            elif process_type == "filter_copy":
                self.excel.filter_copy(rule)
            elif process_type == "string_replace":
                self.excel.replace_in_column(
                    rule["target_sheet"], rule["target_column"], rule["replacements"]
                )
            elif process_type == "date_format":
                self.excel.format_date_column(
                    rule["target_sheet"], rule["target_column"], rule["date_format"]
                )
            elif "rules" in rule:
                self.excel.apply_rules(rule)
            else:
                raise ValueError(f"지원하지 않는 규칙입니다: {rule}")
