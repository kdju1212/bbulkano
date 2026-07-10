// 네이버 검색광고 '키워드 URL 일괄수정' 업로드용 CSV 생성.
// 템플릿과 동일하게 1~6행 안내문을 유지하고 CP949(EUC-KR)로 인코딩해 반환한다.

import { NextResponse } from "next/server";
import iconv from "iconv-lite";

export const runtime = "nodejs";

// 네이버 템플릿 1~6행 (그대로 유지해야 업로드가 인식됨)
const TEMPLATE_HEADER_LINES = [
  "광고그룹ID 키워드ID 는 '광고다운로드' 파일에서 확인 할 수 있습니다.,,,,",
  "키워드ID 기준으로 키워드 수정요청이 적용됩니다. 입력은 최대 만(10000)개까지 가능합니다.,,,,",
  "그룹의 웹사이트URL이 1개인 경우라도 PC/모바일 URL에 동일하게 2번 입력해주시고 PC/모바일 웹사이트를 별도로 가지고 있는 경우에만 URL을 PC /모바일 구분해서 입력하세요.,,,,",
  "URL은 http:// 등으로 시작하는 형식이어야 하며 아무것도 입력하지 않으면 소재 URL 사용으로 적용됩니다.,,,,",
  "[중요] 7행부터 입력값이 시스템에 반영됩니다. 1~6행을 삭제하지 마세요. 엑셀에서 저장시 CSV 파일형식을 꼭 확인하시기 바랍니다.,,,,",
  "광고그룹ID (선택),키워드ID (필수),키워드 (선택),PC URL,모바일 URL",
];

type RequestBody = {
  rows: Array<{
    keywordId: string;
    keyword: string;
    pcUrl: string;
    mobileUrl: string;
  }>;
};

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "생성할 행이 없습니다." }, { status: 400 });
  }
  if (body.rows.length > 10000) {
    return NextResponse.json({ error: "최대 10,000행까지 가능합니다." }, { status: 400 });
  }

  const dataLines = body.rows.map((row) =>
    [
      "", // 광고그룹ID (선택) — 비움
      csvField(row.keywordId),
      csvField(row.keyword),
      csvField(row.pcUrl),
      csvField(row.mobileUrl),
    ].join(","),
  );

  const csvText = [...TEMPLATE_HEADER_LINES, ...dataLines].join("\r\n") + "\r\n";
  const encoded = iconv.encode(csvText, "cp949");

  return new NextResponse(new Uint8Array(encoded), {
    headers: {
      "Content-Type": "text/csv; charset=EUC-KR",
      "Content-Disposition": "attachment",
    },
  });
}
