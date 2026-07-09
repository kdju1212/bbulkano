"use client";

// RAW 가공 — 재료 CSV를 업로드하면 파이썬 파이프라인이 정제된 xlsm을 만들어준다.
// (기존 project/ 폴더의 검증된 파이프라인을 그대로 호출)

import { useRef, useState } from "react";

type Result = {
  matched: Record<string, string>;
  unmatched: string[];
  warnings: string[];
  downloadUrl: string;
  fileName: string;
};

export default function RawProcessorPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const onSelectFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
    setResult(null);
    setError(null);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/raw-process", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);

      const binary = atob(data.file as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.ms-excel.sheet.macroEnabled.12",
      });
      const today = new Date();
      const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      setResult({
        matched: data.matched,
        unmatched: data.unmatched,
        warnings: data.warnings,
        downloadUrl: URL.createObjectURL(blob),
        fileName: `가공된_raw파일_${yymmdd}.xlsm`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">RAW 가공</h1>
        <p className="text-sm text-zinc-500">
          네이버 · 구글 · 카카오 · PMAX 재료 CSV 중 가진 파일만 업로드하면, 정제된 결과와
          업로드 원본을 함께 담은 엑셀(xlsm)을 받을 수 있습니다.
        </p>
      </div>

      <section
        className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center transition-colors hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onSelectFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv"
          className="hidden"
          onChange={(e) => onSelectFiles(e.target.files)}
        />
        {files.length === 0 ? (
          <p className="text-sm text-zinc-400">
            여기를 클릭하거나 CSV 파일을 끌어다 놓으세요 (여러 개 선택 가능)
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.name} className="font-mono text-[13px]">
                {f.name} <span className="text-zinc-400">({(f.size / 1024).toFixed(1)}KB)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={run}
        disabled={files.length === 0 || loading}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "정제 중... (30초~1분 소요)" : "정제 실행"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
          {error.includes("파이썬") && (
            <p className="mt-2 text-xs">
              이 기능은 파이썬이 필요합니다. project 폴더에서{" "}
              <code className="font-mono">pip install -r requirements.txt</code>를 실행했는지
              확인하세요.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <a
            href={result.downloadUrl}
            download={result.fileName}
            className="inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            ⬇ {result.fileName} 다운로드
          </a>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 font-semibold">매체 인식 결과</h2>
            <ul className="space-y-1">
              {Object.entries(result.matched).map(([nametag, fileName]) => (
                <li key={nametag}>
                  <span className="font-medium text-emerald-600">✓ {nametag}</span>{" "}
                  <span className="text-zinc-500">← {fileName}</span>
                </li>
              ))}
              {result.unmatched.map((name) => (
                <li key={name} className="text-red-500">
                  ✗ 인식 실패: {name} (파일명을 재료 파일명과 비슷하게 바꿔서 다시 시도하세요)
                </li>
              ))}
            </ul>
          </section>

          {result.warnings.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <h2 className="mb-2 font-semibold">경고</h2>
              <ul className="list-inside list-disc space-y-1">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
