from __future__ import annotations

from pathlib import Path


def detect_text_format(path: Path, force_tab: bool = False) -> tuple[str, str]:
    head = path.read_bytes()[:4]
    if head.startswith(b"\xff\xfe") or head.startswith(b"\xfe\xff"):
        return "utf-16", "\t"
    if force_tab:
        return "utf-8-sig", "\t"
    return "utf-8-sig", ","
