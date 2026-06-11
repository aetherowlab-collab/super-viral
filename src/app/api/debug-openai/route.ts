import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 500);
  }
}

async function checkOpenAi(name: string, path: string, init?: RequestInit) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      name,
      ok: false,
      status: 0,
      errorCode: "missing_api_key",
      message: "OPENAI_API_KEY가 서버 환경에 없습니다.",
    };
  }

  try {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const body = await readJson(response);
    const error =
      typeof body === "object" && body && "error" in body
        ? (body as { error?: { code?: string; message?: string; type?: string } }).error
        : undefined;

    return {
      name,
      ok: response.ok,
      status: response.status,
      errorCode: error?.code ?? "",
      errorType: error?.type ?? "",
      message: error?.message ?? (response.ok ? "ok" : "OpenAI 요청이 실패했습니다."),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      errorCode: "network_or_runtime_error",
      message: error instanceof Error ? error.message : "OpenAI 요청 중 알 수 없는 오류가 발생했습니다.",
    };
  }
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const [models, minimalGeneration] = await Promise.all([
    checkOpenAi("models", "/models"),
    checkOpenAi("minimal_generation", "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: "Return ok" }],
        max_tokens: 5,
      }),
    }),
  ]);

  return NextResponse.json({
    openaiApiKeyExists: Boolean(apiKey),
    keyPrefix: apiKey ? `${apiKey.slice(0, 7)}...` : "",
    checks: {
      models,
      minimalGeneration,
    },
    likelyIssue:
      !minimalGeneration.ok && minimalGeneration.errorCode === "insufficient_quota"
        ? "API 키는 인식되지만 이 키가 속한 프로젝트/조직의 사용 가능 크레딧 또는 예산 한도가 부족합니다."
        : "",
  });
}
