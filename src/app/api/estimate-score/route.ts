import { NextRequest, NextResponse } from "next/server";
import { estimateOnly } from "../../../lib/diagnosis";
import type { InputData } from "../../../types/superviral";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const inputData = (await request.json()) as InputData;
    return NextResponse.json(estimateOnly(inputData));
  } catch {
    return NextResponse.json({ error: "예상 점수 생성에 실패했습니다." }, { status: 400 });
  }
}
