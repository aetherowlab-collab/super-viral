import { NextRequest, NextResponse } from "next/server";
import { analyzeWithAi } from "../../../lib/diagnosis";
import type { InputData } from "../../../types/superviral";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const inputData = (await request.json()) as InputData;
    const result = await analyzeWithAi(inputData);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "상세 진단 생성에 실패했습니다." }, { status: 400 });
  }
}
