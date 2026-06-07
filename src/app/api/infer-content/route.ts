import { NextRequest, NextResponse } from "next/server";
import { inferWithAi, splitHashtags } from "../../../lib/diagnosis";
import type { Platform } from "../../../types/superviral";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      platform?: Platform;
      title?: string;
      description?: string;
      hashtags?: string[] | string;
      manualFallbackUsed?: boolean;
    };

    const result = await inferWithAi({
      platform: body.platform ?? "unknown",
      title: body.title ?? "",
      description: body.description ?? "",
      hashtags: splitHashtags(body.hashtags),
      manualFallbackUsed: Boolean(body.manualFallbackUsed),
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI 추론 요청에 실패했습니다." }, { status: 400 });
  }
}
