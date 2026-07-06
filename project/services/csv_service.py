from __future__ import annotations

import csv
from pathlib import Path

from utils.encoding import detect_text_format


class CsvService:
    def __init__(self, materials_dir: Path) -> None:
        self.materials_dir = materials_dir

    def find_file(self, name: str) -> Path | None:
        requested = self.materials_dir / name
        if requested.exists():
            return requested
        lower_name = name.lower()
        for path in self.materials_dir.iterdir():
            if path.is_file() and path.name.lower() == lower_name:
                return path
        return None

    def read_rows(self, path: Path, force_tab: bool = False) -> list[list[str]]:
        """CSV 전체를 읽어 모든 행을 같은 폭으로 패딩한 문자열 표를 반환한다."""
        rows = _read_ragged_csv(path, *detect_text_format(path, force_tab=force_tab))
        width = max((len(row) for row in rows), default=0)
        return [row + [""] * (width - len(row)) for row in rows]


def _read_ragged_csv(path: Path, encoding: str, sep: str) -> list[list[str]]:
    with path.open("r", encoding=encoding, newline="") as fp:
        return [row for row in csv.reader(fp, delimiter=sep)]


def read_full(path: Path, force_tab: bool = False) -> list[list[str]]:
    encoding, sep = detect_text_format(path, force_tab=force_tab)
    return _read_ragged_csv(path, encoding=encoding, sep=sep)
