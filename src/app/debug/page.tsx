"use client";

import { useEffect, useState } from "react";

type DebugEnv = Record<string, unknown>;
type DebugOpenAi = Record<string, unknown>;
type DebugGemini = Record<string, unknown>;
type DebugAnalyze = {
  success?: boolean;
  url?: string;
  platform?: string;
  steps?: Record<
    string,
    {
      success: boolean;
      message: string;
      error?: string;
      frameCount?: number;
      transcriptLength?: number;
    }
  >;
  diagnosisAccuracy?: unknown;
  videoAnalysisResult?: unknown;
};

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  return (await response.json()) as T;
}

export default function DebugPage() {
  const [env, setEnv] = useState<DebugEnv | null>(null);
  const [openai, setOpenai] = useState<DebugOpenAi | null>(null);
  const [gemini, setGemini] = useState<DebugGemini | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<DebugAnalyze | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadEnv() {
    setEnv(await getJson<DebugEnv>("/api/debug-video-env"));
    setOpenai(await getJson<DebugOpenAi>("/api/debug-openai"));
    setGemini(await getJson<DebugGemini>("/api/debug-gemini"));
  }

  useEffect(() => {
    void loadEnv();
  }, []);

  async function runDebug() {
    setLoading(true);
    try {
      const data = await getJson<DebugAnalyze>("/api/debug-analyze-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-blue-700">SuperViral Debug</p>
          <h1 className="mt-2 text-3xl font-black">영상 분석 환경 진단</h1>
          <p className="mt-2 text-sm text-slate-600">
            개발 중 yt-dlp, ffmpeg, OpenAI, 임시 폴더 문제를 단계별로 확인합니다.
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">서버 환경</h2>
            <button
              type="button"
              onClick={loadEnv}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black"
            >
              새로고침
            </button>
          </div>
          {env ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(env).map(([key, value]) => (
                <div key={key} className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs font-bold text-slate-500">{key}</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words text-sm font-bold">
                    {String(value)}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">환경 정보를 불러오는 중입니다.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Gemini API 진단</h2>
          {gemini ? (
            <pre className="mt-4 max-h-[360px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-white">
              {JSON.stringify(gemini, null, 2)}
            </pre>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Gemini API 상태를 확인하는 중입니다.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">OpenAI API 진단</h2>
          {openai ? (
            <pre className="mt-4 max-h-[360px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-white">
              {JSON.stringify(openai, null, 2)}
            </pre>
          ) : (
            <p className="mt-4 text-sm text-slate-500">OpenAI API 상태를 확인하는 중입니다.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">영상 분석 강제 테스트</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://youtube.com/shorts/xxxxx"
              className="h-12 rounded-md border border-slate-300 px-4 outline-none focus:border-blue-600"
            />
            <button
              type="button"
              onClick={runDebug}
              disabled={loading}
              className="h-12 rounded-md bg-blue-700 px-5 text-sm font-black text-white disabled:bg-slate-400"
            >
              {loading ? "테스트 중" : "영상 분석 강제 테스트"}
            </button>
          </div>
        </section>

        {result ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  result.success
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-rose-50 text-rose-800"
                }`}
              >
                {result.success ? "success" : "failed"}
              </span>
              <span className="text-sm font-bold text-slate-500">{result.platform}</span>
            </div>

            {result.steps ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {Object.entries(result.steps).map(([key, step]) => (
                  <div
                    key={key}
                    className={`rounded-md p-4 ${
                      step.success ? "bg-emerald-50" : "bg-rose-50"
                    }`}
                  >
                    <div className="text-sm font-black">{key}</div>
                    <p className="mt-2 text-sm">{step.message}</p>
                    {step.error ? (
                      <p className="mt-2 break-words text-xs text-rose-800">{step.error}</p>
                    ) : null}
                    {typeof step.frameCount === "number" ? (
                      <p className="mt-1 text-xs">frameCount: {step.frameCount}</p>
                    ) : null}
                    {typeof step.transcriptLength === "number" ? (
                      <p className="mt-1 text-xs">
                        transcriptLength: {step.transcriptLength}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <h3 className="mt-6 text-lg font-black">Raw JSON</h3>
            <pre className="mt-3 max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-white">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
