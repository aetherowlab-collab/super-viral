import { NextRequest, NextResponse } from "next/server";
import { extractMetadata } from "../../../lib/metadata";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown; platform?: unknown };
    const platform = typeof body.platform === "string" ? body.platform : undefined;

    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          platform: "unknown",
          error: "테스트할 URL을 입력해주세요.",
          requiresManualInput: true,
        },
        { status: 400 },
      );
    }

    const result = await extractMetadata(body.url.trim(), platform as never);
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        platform: "unknown",
        error: "요청 형식을 확인해주세요. JSON body에 url 값을 보내야 합니다.",
        requiresManualInput: true,
      },
      { status: 400 },
    );
  }
}
