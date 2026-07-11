// 재료 CSV 업로드 → 파이썬 파이프라인(project/cli_web.py) 실행 → 가공된 xlsm 반환

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 600;

// 광고주별 파이썬 파이프라인 매핑 — 광고주마다 폴더를 완전히 분리해서 유지보수한다.
// 새 광고주 코드가 준비되면 pipelines/<광고주>/cli_web.py 를 만들고 여기에 한 줄 추가.
const PIPELINES_ROOT =
  process.env.RAW_PIPELINES_DIR ?? path.resolve(process.cwd(), "..", "pipelines");

const CLIENT_PIPELINES: Record<string, { dir: string; script: string }> = {
  "kg-eduone": { dir: path.join(PIPELINES_ROOT, "kg-eduone"), script: "cli_web.py" },
  // "dongkook": { dir: path.join(PIPELINES_ROOT, "dongkook"), script: "cli_web.py" },  // 준비중
  // "gangchon": { dir: path.join(PIPELINES_ROOT, "gangchon"), script: "cli_web.py" },  // 준비중
};

function pythonCommand(): string {
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}

function runPython(scriptPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), [scriptPath, ...args], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      cwd: path.dirname(scriptPath),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("파이프라인 실행이 10분을 초과했습니다."));
    }, 600_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`파이썬 실행 실패 (${pythonCommand()}): ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`파이프라인 오류 (exit ${code}): ${stderr.slice(-2000)}`));
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const form = await request.formData();
  const client = String(form.get("client") ?? "kg-eduone");
  const pipeline = CLIENT_PIPELINES[client];
  if (!pipeline) {
    return NextResponse.json({ error: `${client} 가공은 아직 준비중입니다.` }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "업로드된 파일이 없습니다." }, { status: 400 });
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "raw-process-"));
  try {
    const materialsDir = path.join(tmpDir, "materials");
    await mkdir(materialsDir);
    for (const file of files) {
      const safeName = path.basename(file.name);
      await writeFile(path.join(materialsDir, safeName), Buffer.from(await file.arrayBuffer()));
    }

    const outputFile = path.join(tmpDir, "output.xlsm");
    const script = path.join(pipeline.dir, pipeline.script);
    const { stdout } = await runPython(script, [
      "--materials-dir",
      materialsDir,
      "--output",
      outputFile,
    ]);

    // stdout 마지막 JSON 줄에서 요약 추출 (경고 print가 섞여 있을 수 있음)
    const lines = stdout.trim().split("\n");
    let summary: { matched?: Record<string, string>; unmatched?: string[]; warnings?: string[] } = {};
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        summary = JSON.parse(lines[i]);
        break;
      } catch {
        continue;
      }
    }

    const fileBuffer = await readFile(outputFile);
    return NextResponse.json({
      file: fileBuffer.toString("base64"),
      matched: summary.matched ?? {},
      unmatched: summary.unmatched ?? [],
      warnings: summary.warnings ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
