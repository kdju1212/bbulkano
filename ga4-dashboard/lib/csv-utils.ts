// 브라우저에서 CSV 파일을 파싱/생성하는 유틸 (캠페인·그룹 UTM 모드가 사용).

export function parseCSVText(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return clean
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parseCSVLine);
}

/** parseCSVText와 달리 빈 줄도 그대로 보존한다 (사용자가 헤더 시작 행을 직접 고르는 UI용). */
export function splitCSVLines(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return clean.replace(/\r\n/g, "\n").split("\n").map(parseCSVLine);
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** hints에 있는 후보 이름과 대소문자/공백/기호 무시하고 근접 매칭되는 헤더를 찾는다. */
export function autoMatchColumn(headers: string[], hints: string[]): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  for (const hint of hints) {
    const nh = normalize(hint);
    for (const col of headers) {
      const nc = normalize(col);
      if (nc === nh || nc.includes(nh)) return col;
    }
  }
  return "";
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** UTF-8로 먼저 읽고 깨진 문자(대체문자) 비율이 높으면 EUC-KR로 재시도한다. */
export function readFileWithEncoding(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryRead = (enc: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result ?? "");
        const corruptRatio = (text.match(/�/g)?.length ?? 0) / (text.length || 1);
        if (enc === "UTF-8" && corruptRatio > 0.01) tryRead("EUC-KR");
        else resolve(text);
      };
      reader.onerror = () => reject(new Error(`파일 읽기 실패 (${enc})`));
      reader.readAsText(file, enc);
    };
    tryRead("UTF-8");
  });
}

/** UTF-8 BOM CSV로 즉시 다운로드한다 (서버 왕복 없이 브라우저에서 완결). */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
