import { NextResponse } from "next/server";
import { generateGeminiContent, getGeminiApiKey, getGeminiModel } from "../../../lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return NextResponse.json({
      geminiApiKeyExists: false,
      geminiModel: getGeminiModel(),
      minimalGeneration: {
        ok: false,
        message: "GEMINI_API_KEY가 서버 환경에 없습니다.",
      },
    });
  }

  try {
    const text = await generateGeminiContent({
      responseMimeType: "text/plain",
      temperature: 0,
      parts: [{ text: "Return ok" }],
    });

    return NextResponse.json({
      geminiApiKeyExists: true,
      keyPrefix: `${apiKey.slice(0, 6)}...`,
      geminiModel: getGeminiModel(),
      minimalGeneration: {
        ok: true,
        message: text,
      },
    });
  } catch (error) {
    return NextResponse.json({
      geminiApiKeyExists: true,
      keyPrefix: `${apiKey.slice(0, 6)}...`,
      geminiModel: getGeminiModel(),
      minimalGeneration: {
        ok: false,
        message: error instanceof Error ? error.message : "Gemini 요청이 실패했습니다.",
      },
    });
  }
}
