from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as fp:
        data = json.load(fp)
    if not isinstance(data, list):
        raise ValueError(f"JSON 최상위 구조는 list여야 합니다: {path}")
    return data
