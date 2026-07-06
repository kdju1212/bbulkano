from __future__ import annotations

from pathlib import Path
from typing import Sequence

from config import MATERIALS_DIR, TEMPLATE_FILE
from services.csv_service import CsvService
from services.excel_service import ExcelService
from services.json_loader import load_json
from utils.range_utils import parse_range


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
        for rule in load_json(json_files["cleaner"]):
            self.excel.clear_groups(rule)

        self._external_import(load_json(json_files["external"]))

        for key in ("conversion_cleanup", "filldown_first", "missing", "google_missing_campaign", "blank_zero"):
            self._run_rules(load_json(json_files[key]))

        self._internal_import(load_json(json_files["internal"]))

        for key in ("device_cleanup", "date_format", "filldown_second"):
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
            force_tab = rule.get("format") == "tab"
            imported_start: int | None = None
            imported_end: int | None = None
            for source_range, dest_range in rule["map"]:
                source_spec = parse_range(source_range)
                dest_spec = parse_range(dest_range)
                rows = self.csv.read_range(path, source_spec, force_tab=force_tab)
                start_row = dest_spec.min_row or self.excel.append_row_for(
                    rule["target_sheet"], dest_spec.min_col
                )
                end_row = self.excel.write_block(
                    rule["target_sheet"],
                    start_row,
                    dest_spec.min_col,
                    rows,
                    style_row=dest_spec.min_row or start_row - 1,
                )
                if rows:
                    imported_start = start_row if imported_start is None else min(imported_start, start_row)
                    imported_end = end_row if imported_end is None else max(imported_end, end_row)
            if rule.get("marking"):
                self._apply_marking_after_external(rule, imported_start, imported_end)

    def _apply_marking_after_external(self, rule: dict, start_row: int | None, end_row: int | None) -> None:
        if start_row is None or end_row is None:
            return
        sheet = self.excel.workbook[rule["target_sheet"]]
        ref_col = parse_range(rule["map"][0][1]).min_col
        for row in range(start_row, end_row + 1):
            if sheet.cell(row=row, column=ref_col).value in (None, ""):
                continue
            for col, value in rule["marking"]:
                sheet[f"{col}{row}"] = value

    def _internal_import(self, rules: list[dict]) -> None:
        for idx, rule in enumerate(rules):
            if rule["source_sheet"] == "PMAX_RAW" and self.excel.last_data_row("PMAX_RAW", "D", 6) < 6:
                self.warnings.append("PMAX 재료가 없어 PMAX_RAW 내부통합을 건너뜀")
                continue
            if idx == 0:
                first_dest = parse_range(rule["map"][0][1])
                current_start = first_dest.min_row or 6
            else:
                current_start = self.excel.append_row_for(rule["target_sheet"], 5)
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
