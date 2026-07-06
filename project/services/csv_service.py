from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

from utils.encoding import detect_text_format
from utils.range_utils import RangeSpec


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

    def read_range(self, path: Path, spec: RangeSpec, force_tab: bool = False) -> list[list[object]]:
        encoding, sep = detect_text_format(path, force_tab=force_tab)
        rows = _read_ragged_csv(path, encoding=encoding, sep=sep)
        max_width = max((len(row) for row in rows), default=0)
        padded = [row + [""] * (max_width - len(row)) for row in rows]
        df = pd.DataFrame(padded, dtype=object)
        start_row = max((spec.min_row or 1) - 1, 0)
        if spec.max_row is None or spec.max_row == spec.min_row:
            end_row = len(df)
        else:
            end_row = min(spec.max_row, len(df))
        subset = df.iloc[start_row:end_row, spec.min_col - 1 : spec.max_col]
        return subset.where(pd.notnull(subset), "").values.tolist()


def _read_ragged_csv(path: Path, encoding: str, sep: str) -> list[list[str]]:
    with path.open("r", encoding=encoding, newline="") as fp:
        return [row for row in csv.reader(fp, delimiter=sep)]


def read_full(path: Path, force_tab: bool = False) -> list[list[str]]:
    encoding, sep = detect_text_format(path, force_tab=force_tab)
    return _read_ragged_csv(path, encoding=encoding, sep=sep)
