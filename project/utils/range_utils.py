from __future__ import annotations

import re
from dataclasses import dataclass

from openpyxl.utils import column_index_from_string, get_column_letter


CELL_RE = re.compile(r"^([A-Z]+)(\d+)?$", re.IGNORECASE)


@dataclass(frozen=True)
class RangeSpec:
    min_col: int
    max_col: int
    min_row: int | None = None
    max_row: int | None = None

    @property
    def width(self) -> int:
        return self.max_col - self.min_col + 1


def parse_range(value: str) -> RangeSpec:
    left, _, right = value.replace("$", "").partition(":")
    right = right or left
    left_col, left_row = _split_cell(left)
    right_col, right_row = _split_cell(right)
    return RangeSpec(
        min_col=column_index_from_string(left_col),
        max_col=column_index_from_string(right_col),
        min_row=int(left_row) if left_row else None,
        max_row=int(right_row) if right_row else None,
    )


def col_index(value: str | int) -> int:
    if isinstance(value, int):
        return value
    return column_index_from_string(value.replace("$", ""))


def col_letter(value: str | int) -> str:
    return get_column_letter(col_index(value))


def split_sheet_ref(value: str) -> tuple[str | None, str]:
    if "!" not in value:
        return None, value
    sheet, ref = value.split("!", 1)
    return sheet.strip("'"), ref


def _split_cell(value: str) -> tuple[str, str | None]:
    match = CELL_RE.match(value.strip())
    if not match:
        raise ValueError(f"지원하지 않는 범위 형식입니다: {value}")
    return match.group(1).upper(), match.group(2)
