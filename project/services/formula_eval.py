from __future__ import annotations

import re
from typing import Any

from openpyxl.worksheet.worksheet import Worksheet

from utils.range_utils import col_index


CELL_RE = re.compile(r"^[A-Z]+\d+$", re.IGNORECASE)


def effective_value(ws: Worksheet, row: int, col: int) -> Any:
    value = ws.cell(row=row, column=col).value
    if not (isinstance(value, str) and value.startswith("=")):
        return value
    return evaluate_formula(ws, row, value)


def evaluate_formula(ws: Worksheet, row: int, formula: str) -> Any:
    formula = formula.strip()
    if formula.upper().startswith("=CONCATENATE("):
        inner = formula[len("=CONCATENATE(") : -1]
        return "".join(str(_eval_arg(ws, row, arg) or "") for arg in _split_args(inner))
    if formula.upper().startswith("=IFERROR(VLOOKUP("):
        return _eval_iferror_vlookup(ws, row, formula)
    return formula


def _eval_iferror_vlookup(ws: Worksheet, row: int, formula: str) -> Any:
    inner = formula[len("=IFERROR(") : -1]
    vlookup_text, fallback = _split_top_level_pair(inner)
    fallback_value = fallback.strip().strip('"')
    args = _split_args(vlookup_text[len("VLOOKUP(") : -1])
    key = _eval_arg(ws, row, args[0])
    range_ref = args[1].replace("$", "")
    index = int(float(args[2]))
    if "!" in range_ref:
        sheet_name, address = range_ref.split("!", 1)
        lookup_ws = ws.parent[sheet_name.strip("'")]
    else:
        lookup_ws = ws
        address = range_ref
    left, _, right = address.partition(":")
    first_col = re.match(r"[A-Z]+", left, re.I).group(0)
    last_col = re.match(r"[A-Z]+", right or left, re.I).group(0)
    start_col = col_index(first_col)
    target_col = start_col + index - 1
    max_row = lookup_ws.max_row
    for r in range(1, max_row + 1):
        if effective_value(lookup_ws, r, start_col) == key:
            return effective_value(lookup_ws, r, target_col)
    return fallback_value


def _eval_arg(ws: Worksheet, row: int, arg: str) -> Any:
    arg = arg.strip().replace("$", "")
    if CELL_RE.match(arg):
        match = re.match(r"([A-Z]+)(\d+)", arg, re.I)
        return effective_value(ws, int(match.group(2)), col_index(match.group(1)))
    if re.match(r"^[A-Z]+$", arg, re.I):
        return effective_value(ws, row, col_index(arg))
    return arg.strip('"')


def _split_args(text: str) -> list[str]:
    args: list[str] = []
    depth = 0
    in_quote = False
    start = 0
    for i, char in enumerate(text):
        if char == '"':
            in_quote = not in_quote
        elif not in_quote:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            elif char == "," and depth == 0:
                args.append(text[start:i].strip())
                start = i + 1
    args.append(text[start:].strip())
    return args


def _split_top_level_pair(text: str) -> tuple[str, str]:
    args = _split_args(text)
    if len(args) < 2:
        raise ValueError(f"IFERROR 인수 파싱 실패: {text}")
    return args[0], args[1]
