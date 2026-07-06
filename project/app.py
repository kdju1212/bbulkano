from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path

import streamlit as st

from config import JSON_FILES, TEMPLATE_FILE
from services.csv_service import read_full
from services.json_loader import load_json
from services.pipeline import ReportPipeline

st.set_page_config(page_title="임용고시 통합 리포트 생성기", layout="wide")


@st.cache_data
def load_material_specs() -> list[dict]:
    return load_json(JSON_FILES["external"])


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


st.title("임용고시 통합 리포트 생성기")
st.caption(
    "네이버 · 구글 · 카카오 · PMAX 재료 CSV 중 가지고 있는 파일만 업로드하면, "
    "정제된 결과와 업로드한 원본을 함께 담은 엑셀 파일을 받을 수 있습니다."
)

specs = load_material_specs()
spec_by_nametag = {spec["nametag"]: spec for spec in specs}
nametag_options = list(spec_by_nametag)

uploaded_files = st.file_uploader(
    "재료 CSV 파일 업로드 (여러 개 선택 가능, 일부만 올려도 됩니다)",
    type=["csv"],
    accept_multiple_files=True,
)

selections: dict[str, "st.runtime.uploaded_file_manager.UploadedFile"] = {}
has_duplicate = False

if uploaded_files:
    st.subheader("업로드한 파일이 어떤 매체 데이터인지 확인해주세요")
    used_nametags: set[str] = set()
    for uploaded in uploaded_files:
        guess = guess_nametag(uploaded.name, specs)
        options = ["(선택 안 함)"] + nametag_options
        default_index = options.index(guess) if guess in options else 0
        choice = st.selectbox(
            f"`{uploaded.name}` → 매체 선택",
            options,
            index=default_index,
            key=f"select_{uploaded.name}",
        )
        if choice == "(선택 안 함)":
            continue
        if choice in used_nametags:
            st.error(f"'{choice}' 항목에 파일이 이미 지정되었습니다. 매체를 다시 선택해주세요.")
            has_duplicate = True
        used_nametags.add(choice)
        selections[choice] = uploaded

run = st.button("정제 실행", type="primary", disabled=not selections or has_duplicate)

if run:
    with st.spinner("정제 중입니다..."):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            materials_dir = tmp_dir / "재료"
            materials_dir.mkdir()

            raw_sheets = []
            for nametag, uploaded in selections.items():
                spec = spec_by_nametag[nametag]
                dest = materials_dir / spec["file"]
                dest.write_bytes(uploaded.getvalue())
                force_tab = spec.get("format") == "tab"
                try:
                    rows = read_full(dest, force_tab=force_tab)
                except UnicodeDecodeError:
                    rows = [["(원본 인코딩을 읽을 수 없어 원본 시트를 건너뜁니다.)"]]
                raw_sheets.append((f"업로드원본_{nametag}", rows))

            output_file = tmp_dir / "output.xlsm"
            pipeline = ReportPipeline(template_file=TEMPLATE_FILE, materials_dir=materials_dir)
            try:
                pipeline.run(JSON_FILES, output_file, raw_sheets=raw_sheets)
            except Exception as exc:  # noqa: BLE001 - surface any pipeline failure to the user
                st.error(f"처리 중 오류가 발생했습니다: {exc}")
            else:
                for warning in pipeline.warnings:
                    st.warning(warning)
                st.success("정제가 완료되었습니다. 아래에서 결과 파일을 받아주세요.")
                today = datetime.now().strftime("%y%m%d")
                st.download_button(
                    "결과 엑셀 다운로드",
                    data=output_file.read_bytes(),
                    file_name=f"가공된_raw파일_{today}.xlsm",
                    mime="application/vnd.ms-excel.sheet.macroEnabled.12",
                )
