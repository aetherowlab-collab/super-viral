import { readFile } from "fs/promises";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
}

export async function fileToInlineData(filePath: string, mimeType: string) {
  const bytes = await readFile(filePath);
  return {
    inlineData: {
      mimeType,
      data: bytes.toString("base64"),
    },
  } satisfies GeminiPart;
}

function extractText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim() ?? "";
}

function stripJsonFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function generateGeminiContent(input: {
  parts: GeminiPart[];
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  timeoutMs?: number;
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        getGeminiModel(),
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: input.parts }],
          generationConfig: {
            temperature: input.temperature ?? 0.35,
            ...(input.responseMimeType
              ? { responseMimeType: input.responseMimeType }
              : {}),
          },
        }),
      },
    );
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? "Gemini request timed out."
        : error instanceof Error
          ? error.message
          : "Gemini request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await response.text();
  let data: GeminiResponse;
  try {
    data = JSON.parse(bodyText) as GeminiResponse;
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${bodyText.slice(0, 500)}`);
  }

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ??
        `Gemini request failed with status ${response.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  const text = extractText(data);
  if (!text) {
    throw new Error("Gemini returned empty content.");
  }
  return text;
}

export async function generateGeminiJson<T>(parts: GeminiPart[], timeoutMs = 75_000) {
  const text = await generateGeminiContent({
    parts,
    responseMimeType: "application/json",
    timeoutMs,
  });
  return JSON.parse(stripJsonFence(text)) as T;
}
