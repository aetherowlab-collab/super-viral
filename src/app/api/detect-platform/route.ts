import { NextRequest, NextResponse } from "next/server";
import { detectPlatform, isValidHttpUrl } from "../../../lib/platform";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!url || !isValidHttpUrl(url)) {
      return NextResponse.json(
        { error: "올바른 URL을 입력해주세요." },
        { status: 400 },
      );
    }

    const platform = detectPlatform(url);
    return NextResponse.json({
      platform,
      isSupported: true,
      needsManualInput: platform !== "youtube_shorts",
    });
  } catch {
    return NextResponse.json({ error: "요청 형식을 확인해주세요." }, { status: 400 });
  }
}
