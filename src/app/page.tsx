"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AiInference,
  AiResult,
  DetectPlatformResponse,
  ExtractMetadataApiResponse,
  Goal,
  InputData,
  Metadata,
  MetadataStatus,
  PerformanceData,
  Platform,
  SavedDiagnosis,
  VideoAnalysisApiResponse,
  VideoAnalysisResult,
} from "../types/superviral";
import { detectPlatform, isValidHttpUrl } from "../lib/platform";
import { mergeAnalysisResults } from "../lib/video/analysisMerge";

const STORAGE_KEY = "superviral-diagnoses";
const EMPTY_META: Metadata = {
  title: "",
  description: "",
  thumbnailUrl: "",
  hashtags: [],
};
const EMPTY_PERFORMANCE: PerformanceData = {
  views: null,
  comments: null,
  hoursAfterUpload: null,
  likes: null,
  saves: null,
  shares: null,
};

type Step =
  | "home"
  | "confirm"
  | "inference"
  | "freeScore"
  | "performance"
  | "result"
  | "recent";

const platformLabel: Record<Platform, string> = {
  youtube_shorts: "YouTube Shorts",
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  unknown: "직접 입력",
};

const goalLabel: Record<Goal, string> = {
  views: "조회수 확대",
  comments: "댓글 반응",
  saves_shares: "저장/공유",
  followers: "팔로워 증가",
  purchase_conversion: "구매 전환",
  brand_awareness: "브랜드 인지도",
};

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function splitTags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "요청에 실패했습니다.");
  }
  return data as T;
}

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-200">
      {children}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg shadow-blue-200">
      <div className="text-center">
        <div className="text-4xl font-black">{score}</div>
        <div className="text-xs font-bold opacity-80">점</div>
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("home");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus>("failed");
  const [metadata, setMetadata] = useState<Metadata>(EMPTY_META);
  const [manualTitle, setManualTitle] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualTags, setManualTags] = useState("");
  const [manualPlatformName, setManualPlatformName] = useState("");
  const [aiInference, setAiInference] = useState<AiInference | null>(null);
  const [editingInference, setEditingInference] = useState(false);
  const [estimate, setEstimate] = useState<Pick<
    AiResult,
    "estimatedScore" | "status" | "oneLineDiagnosis" | "mainBottleneck" | "diagnosisAccuracy"
  > | null>(null);
  const [performance, setPerformance] = useState<PerformanceData>(EMPTY_PERFORMANCE);
  const [result, setResult] = useState<AiResult | null>(null);
  const [videoResult, setVideoResult] = useState<VideoAnalysisResult | null>(null);
  const [videoMessages, setVideoMessages] = useState<string[]>([]);
  const [videoProgress, setVideoProgress] = useState("");
  const [saved, setSaved] = useState<SavedDiagnosis[]>([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("제목");

  const currentInput = useMemo<InputData | null>(() => {
    if (!aiInference) return null;
    return {
      contentUrl: url,
      platform,
      metadataStatus,
      metadata,
      manualFallback: {
        used: metadataStatus === "manual_required" || metadataStatus === "manual",
        titleOrHook: manualTitle,
        summary: manualSummary,
        hashtags: splitTags(manualTags),
      },
      aiInference,
      performance,
    };
  }, [
    aiInference,
    manualSummary,
    manualTags,
    manualTitle,
    metadata,
    metadataStatus,
    performance,
    platform,
    url,
  ]);

  useEffect(() => {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setSaved(JSON.parse(raw) as SavedDiagnosis[]);
    } catch {
      storage()?.removeItem(STORAGE_KEY);
    }
  }, []);

  function persist(next: SavedDiagnosis[]) {
    setSaved(next);
    storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function resetForNew() {
    setMetadata(EMPTY_META);
    setMetadataStatus("failed");
    setAiInference(null);
    setEstimate(null);
    setResult(null);
    setVideoResult(null);
    setVideoMessages([]);
    setVideoProgress("");
    setPerformance(EMPTY_PERFORMANCE);
    setError("");
  }

  async function startDiagnosis(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    const trimmed = url.trim();
    if (!trimmed) {
      setError("SNS 링크를 입력해주세요.");
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setError("http 또는 https 형식의 URL을 입력해주세요.");
      return;
    }

    resetForNew();
    setLoading("플랫폼을 확인하고 있어요.");

    try {
      const detected = await postJson<DetectPlatformResponse>("/api/detect-platform", {
        url: trimmed,
      });
      setPlatform(detected.platform);

      if (detected.platform === "youtube_shorts") {
        const extracted = await postJson<ExtractMetadataApiResponse>(
          "/api/extract-metadata",
          { url: trimmed, platform: detected.platform },
        );
        if (extracted.success) {
          setMetadata({
            title: extracted.title,
            description: extracted.description,
            thumbnailUrl: extracted.thumbnailUrl,
            hashtags: extracted.hashtags,
          });
          setMetadataStatus(extracted.status);
          setManualTitle(extracted.title);
          setManualSummary(extracted.description);
          setManualTags(extracted.hashtags.map((tag) => `#${tag}`).join(" "));
        }
      } else {
        setMetadataStatus("manual_required");
        setMetadata(EMPTY_META);
      }
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "진단 시작에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function inferContent() {
    const title = metadata.title || manualTitle;
    const description = metadata.description || manualSummary;
    const hashtags = metadata.hashtags.length ? metadata.hashtags : splitTags(manualTags);
    if (!title.trim() || !description.trim()) {
      setError("콘텐츠 제목 또는 첫 문장과 한 줄 요약을 입력해주세요.");
      return;
    }

    setError("");
    setLoading("AI가 콘텐츠 특징을 이해하고 있어요.");
    try {
      const inferred = await postJson<AiInference>("/api/infer-content", {
        platform,
        title,
        description,
        hashtags,
        manualFallbackUsed: metadataStatus !== "success" && metadataStatus !== "partial",
      });
      setAiInference(inferred);
      setStep("inference");
    } catch {
      setError("AI 추론에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading("");
    }
  }

  async function estimateScore(inference = aiInference) {
    if (!inference) return;
    const input: InputData = {
      contentUrl: url,
      platform,
      metadataStatus,
      metadata,
      manualFallback: {
        used: metadataStatus !== "success" && metadataStatus !== "partial",
        titleOrHook: manualTitle || metadata.title,
        summary: manualSummary || metadata.description,
        hashtags: splitTags(manualTags),
      },
      aiInference: inference,
      performance: EMPTY_PERFORMANCE,
    };

    setLoading("무료 예상 점수를 계산하고 있어요.");
    try {
      const score = await postJson<typeof estimate>("/api/estimate-score", input);
      setEstimate(score);
      setStep("freeScore");
    } finally {
      setLoading("");
    }
  }

  async function analyze(perf = performance) {
    if (!currentInput) return;
    setLoading("V-CARE 상세 처방전을 생성하고 있어요.");
    setVideoResult(null);
    setVideoMessages([]);
    setVideoProgress("");
    try {
      const inputForAnalysis = {
        ...currentInput,
        performance: perf,
      };
      const detailed = await postJson<AiResult>("/api/analyze", {
        ...inputForAnalysis,
      });

      if (inputForAnalysis.platform === "youtube_shorts") {
        const statuses = [
          "메타데이터 확인 중...",
          "영상 다운로드 중...",
          "프레임 추출 중...",
          "오디오 추출 중...",
          "음성 전사 중...",
          "AI 분석 중...",
          "결과 정리 중...",
        ];
        let index = 0;
        setLoading(statuses[0]);
        setVideoProgress(statuses[0]);
        const timer = window.setInterval(() => {
          index = Math.min(index + 1, statuses.length - 1);
          setVideoProgress(statuses[index]);
          setLoading(statuses[index]);
        }, 1400);
        try {
          const video = await postJson<VideoAnalysisApiResponse>("/api/analyze-video", {
            inputData: inputForAnalysis,
            vcareResult: detailed,
          });
          console.info("[SuperViral Front] analyzeVideoApiCalled =", true);
          setVideoMessages(video.messages);
          setVideoResult(video.result ?? null);
          const merged = mergeAnalysisResults(detailed, video.result ?? null);
          setResult(merged);
          console.info("[SuperViral Front] final result =", merged);
          console.info("[SuperViral Front] diagnosisAccuracy =", merged.diagnosisAccuracy);
          console.info(
            "[SuperViral Front] videoAnalysisResult exists =",
            merged.videoAnalysisResult !== null,
          );
          setVideoProgress(
            video.success ? "영상·오디오 분석 완료" : "영상·오디오 분석 실패 지점을 확인했습니다.",
          );
          setStep("result");
        } catch {
          const merged = mergeAnalysisResults(detailed, null);
          setResult(merged);
          console.info("[SuperViral Front] analyzeVideoApiCalled =", true);
          console.info("[SuperViral Front] final result =", merged);
          console.info("[SuperViral Front] diagnosisAccuracy =", merged.diagnosisAccuracy);
          console.info("[SuperViral Front] videoAnalysisResult exists =", false);
          setVideoMessages([
            "AI 분석 중 오류가 발생했습니다. 기존 메타데이터 기반 분석 결과를 표시합니다.",
          ]);
          setVideoProgress("영상·오디오 분석 요청 실패");
          setStep("result");
        } finally {
          window.clearInterval(timer);
        }
      } else {
        setResult(detailed);
        setStep("result");
      }
    } finally {
      setLoading("");
    }
  }

  function saveDiagnosis(revisitAfter24h = false) {
    if (!result || !currentInput) return;
    const item: SavedDiagnosis = {
      id: crypto.randomUUID(),
      diagnosedAt: new Date().toISOString(),
      contentUrl: url,
      platform,
      title: metadata.title || manualTitle || "제목 없음",
      thumbnailUrl: metadata.thumbnailUrl,
      metadataStatus,
      estimatedScore: result.estimatedScore,
      totalScore: result.totalScore,
      status: result.status,
      oneLineDiagnosis: result.oneLineDiagnosis,
      result,
      videoResult: result.videoAnalysisResult ?? videoResult,
      videoMessages,
      inputData: currentInput,
      revisitAfter24h,
    };
    persist([item, ...saved.filter((savedItem) => savedItem.contentUrl !== url)].slice(0, 20));
  }

  function openSaved(item: SavedDiagnosis) {
    setUrl(item.contentUrl);
    setPlatform(item.platform);
    setMetadataStatus(item.metadataStatus);
    setMetadata(item.inputData.metadata);
    setManualTitle(item.inputData.manualFallback.titleOrHook);
    setManualSummary(item.inputData.manualFallback.summary);
    setManualTags(item.inputData.manualFallback.hashtags.map((tag) => `#${tag}`).join(" "));
    setAiInference(item.inputData.aiInference);
    setPerformance(item.inputData.performance);
    setEstimate({
      estimatedScore: item.result.estimatedScore,
      status: item.result.status,
      oneLineDiagnosis: item.result.oneLineDiagnosis,
      mainBottleneck: item.result.mainBottleneck,
      diagnosisAccuracy: item.result.diagnosisAccuracy,
    });
    setResult(item.result);
    setVideoResult(item.result.videoAnalysisResult ?? item.videoResult ?? null);
    setVideoMessages(item.videoMessages ?? []);
    setStep("result");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep("home")}
            className="text-left text-lg font-black text-blue-800"
          >
            슈퍼바이럴
          </button>
          <button
            type="button"
            onClick={() => setStep("recent")}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            최근 진단 보기
          </button>
        </header>

        {loading ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            {loading}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            {error}
          </div>
        ) : null}

        {step === "home" ? (
          <Card className="overflow-hidden">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <StatusPill>콘텐츠 응급실</StatusPill>
                <h1 className="mt-5 text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                  조회수 안 나온 콘텐츠,
                  <br />
                  아직 죽은 게 아닙니다.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                  YouTube Shorts는 링크만으로, Instagram과 TikTok은 최소 입력으로
                  30초 만에 노출 병목과 바이럴 처방전을 받아보세요.
                </p>
                <form onSubmit={startDiagnosis} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="SNS 링크를 붙여넣으세요"
                    className="h-12 rounded-md border border-slate-300 bg-white px-4 text-base outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    className="h-12 rounded-md bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800"
                  >
                    콘텐츠 응급진단 시작
                  </button>
                </form>
              </div>
              <div className="rounded-lg bg-slate-950 p-5 text-white">
                <div className="text-sm font-bold text-blue-200">V-CARE</div>
                <div className="mt-3 grid gap-3">
                  {["Viral Score", "Content Bottleneck", "Action Prescription", "Ready-to-copy Booster"].map(
                    (item) => (
                      <div key={item} className="rounded-md bg-white/10 p-4 text-sm font-bold">
                        {item}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {step === "confirm" ? (
          <ConfirmStep
            platform={platform}
            metadata={metadata}
            metadataStatus={metadataStatus}
            manualPlatformName={manualPlatformName}
            setManualPlatformName={setManualPlatformName}
            manualTitle={manualTitle}
            setManualTitle={setManualTitle}
            manualSummary={manualSummary}
            setManualSummary={setManualSummary}
            manualTags={manualTags}
            setManualTags={setManualTags}
            onNext={inferContent}
            onEdit={() => setMetadataStatus("manual")}
          />
        ) : null}

        {step === "inference" && aiInference ? (
          <InferenceStep
            aiInference={aiInference}
            setAiInference={setAiInference}
            editing={editingInference}
            setEditing={setEditingInference}
            onNext={() => estimateScore(aiInference)}
          />
        ) : null}

        {step === "freeScore" && estimate ? (
          <FreeScoreStep
            estimate={estimate}
            onDetail={() => setStep("performance")}
            onBasic={() => analyze(EMPTY_PERFORMANCE)}
          />
        ) : null}

        {step === "performance" ? (
          <PerformanceStep
            performance={performance}
            setPerformance={setPerformance}
            onSubmit={() => analyze(performance)}
            onSkip={() => analyze(EMPTY_PERFORMANCE)}
          />
        ) : null}

        {step === "result" && result ? (
          <ResultStep
            result={result}
            videoResult={result.videoAnalysisResult ?? videoResult}
            videoMessages={videoMessages}
            videoProgress={videoProgress}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onSave={() => saveDiagnosis(false)}
            onRevisit={() => saveDiagnosis(true)}
          />
        ) : null}

        {step === "recent" ? (
          <RecentStep
            saved={saved}
            onOpen={openSaved}
            onDelete={(id) => persist(saved.filter((item) => item.id !== id))}
          />
        ) : null}
      </div>
    </main>
  );
}

function ConfirmStep(props: {
  platform: Platform;
  metadata: Metadata;
  metadataStatus: MetadataStatus;
  manualPlatformName: string;
  setManualPlatformName: (value: string) => void;
  manualTitle: string;
  setManualTitle: (value: string) => void;
  manualSummary: string;
  setManualSummary: (value: string) => void;
  manualTags: string;
  setManualTags: (value: string) => void;
  onNext: () => void;
  onEdit: () => void;
}) {
  const manualRequired =
    props.platform !== "youtube_shorts" || props.metadataStatus === "manual";
  const title =
    props.platform === "youtube_shorts"
      ? "콘텐츠를 찾았어요."
      : props.platform === "instagram"
        ? "인스타그램 릴스 링크는 확인했어요."
        : props.platform === "tiktok"
          ? "틱톡 영상 링크는 확인했어요."
          : "지원 플랫폼이 아니지만, 콘텐츠 정보를 직접 입력하면 진단할 수 있어요.";
  const guide =
    props.platform === "instagram"
      ? "다만 인스타그램은 외부 앱에서 제목, 썸네일, 본문 가져오기를 제한하는 경우가 많아요. 아래 2가지만 입력하면 바로 V-CARE 진단을 진행할 수 있습니다."
      : props.platform === "tiktok"
        ? "틱톡은 외부 미리보기 정보가 제한되어 있어요. 아래 2가지만 입력하면 바로 V-CARE 진단을 진행할 수 있습니다."
        : "";

  return (
    <Card>
      <StatusPill>{platformLabel[props.platform]}</StatusPill>
      <h2 className="mt-4 text-2xl font-black">{title}</h2>
      {guide ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{guide}</p> : null}

      {!manualRequired ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="aspect-video overflow-hidden rounded-lg bg-slate-100">
            {props.metadata.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.metadata.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <h3 className="text-xl font-black">{props.metadata.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {props.metadata.description || "설명 정보가 비어 있습니다."}
            </p>
            <TagList tags={props.metadata.hashtags} />
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={props.onNext} className="rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white">
                이 콘텐츠 맞아요
              </button>
              <button onClick={props.onEdit} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black">
                정보 수정하기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ManualForm {...props} />
      )}
    </Card>
  );
}

function ManualForm(props: Parameters<typeof ConfirmStep>[0]) {
  return (
    <div className="mt-5 grid gap-3">
      {props.platform === "unknown" ? (
        <input
          value={props.manualPlatformName}
          onChange={(event) => props.setManualPlatformName(event.target.value)}
          placeholder="플랫폼명, 선택"
          className="h-12 rounded-md border border-slate-300 px-4 outline-none focus:border-blue-600"
        />
      ) : null}
      <input
        value={props.manualTitle}
        onChange={(event) => props.setManualTitle(event.target.value)}
        placeholder="콘텐츠 제목 또는 첫 문장"
        className="h-12 rounded-md border border-slate-300 px-4 outline-none focus:border-blue-600"
      />
      <textarea
        value={props.manualSummary}
        onChange={(event) => props.setManualSummary(event.target.value)}
        placeholder="콘텐츠 내용 한 줄 요약"
        className="min-h-24 rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
      />
      <input
        value={props.manualTags}
        onChange={(event) => props.setManualTags(event.target.value)}
        placeholder="해시태그, 선택 예: #제주여행 #쇼츠"
        className="h-12 rounded-md border border-slate-300 px-4 outline-none focus:border-blue-600"
      />
      <button onClick={props.onNext} className="h-12 rounded-md bg-blue-700 px-4 text-sm font-black text-white">
        이 정보로 진단하기
      </button>
    </div>
  );
}

function InferenceStep(props: {
  aiInference: AiInference;
  setAiInference: (value: AiInference) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onNext: () => void;
}) {
  const rows = [
    ["타깃 고객", props.aiInference.targetAudience],
    ["콘텐츠 목적", goalLabel[props.aiInference.goal]],
    ["무드", props.aiInference.mood],
    ["콘텐츠 유형", props.aiInference.contentType],
    ["예상 시청자 욕구", props.aiInference.viewerDesire],
  ];

  return (
    <Card>
      <h2 className="text-2xl font-black">AI가 이 콘텐츠를 이렇게 이해했어요.</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      {props.editing ? (
        <div className="mt-5 grid gap-3">
          {(["targetAudience", "mood", "contentType", "viewerDesire"] as const).map((key) => (
            <input
              key={key}
              value={props.aiInference[key]}
              onChange={(event) =>
                props.setAiInference({ ...props.aiInference, [key]: event.target.value })
              }
              className="h-11 rounded-md border border-slate-300 px-3"
            />
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <button onClick={props.onNext} className="rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white">
          맞아요
        </button>
        <button onClick={() => props.setEditing(!props.editing)} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black">
          수정할래요
        </button>
      </div>
    </Card>
  );
}

function FreeScoreStep({
  estimate,
  onDetail,
  onBasic,
}: {
  estimate: NonNullable<ReturnType<typeof useMemo<InputData | null>>> extends never
    ? never
    : Pick<AiResult, "estimatedScore" | "status" | "oneLineDiagnosis" | "mainBottleneck" | "diagnosisAccuracy">;
  onDetail: () => void;
  onBasic: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing score={estimate.estimatedScore} />
        <div>
          <StatusPill>{estimate.status}</StatusPill>
          <h2 className="mt-3 text-2xl font-black">무료 예상 바이럴 점수</h2>
          <p className="mt-3 text-base font-bold text-slate-800">{estimate.oneLineDiagnosis}</p>
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            대표 병목: {estimate.mainBottleneck}
          </p>
          <p className="mt-2 text-xs font-bold text-slate-500">
            진단 정확도: 기본 진단 · 사용 데이터: 링크 정보 + AI 추론
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={onDetail} className="rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white">
          상세 처방전 받기
        </button>
        <button onClick={onBasic} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black">
          기본 처방만 보기
        </button>
      </div>
    </Card>
  );
}

function PerformanceStep({
  performance,
  setPerformance,
  onSubmit,
  onSkip,
}: {
  performance: PerformanceData;
  setPerformance: (value: PerformanceData) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const update = (key: keyof PerformanceData, value: string) =>
    setPerformance({ ...performance, [key]: value === "" ? null : Number(value) });

  return (
    <Card>
      <h2 className="text-2xl font-black">정확도를 높이고 싶다면 현재 반응을 알려주세요.</h2>
      <p className="mt-2 text-sm text-slate-600">모르면 건너뛰어도 괜찮아요.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricInput label="조회수" value={performance.views} onChange={(value) => update("views", value)} />
        <MetricInput label="댓글 수" value={performance.comments} onChange={(value) => update("comments", value)} />
        <select
          value={performance.hoursAfterUpload ?? ""}
          onChange={(event) => update("hoursAfterUpload", event.target.value)}
          className="h-12 rounded-md border border-slate-300 px-3"
        >
          <option value="">업로드 후 경과 시간</option>
          <option value="6">6시간 이내</option>
          <option value="24">24시간 이내</option>
          <option value="72">3일 이내</option>
          <option value="168">1주일 이상</option>
        </select>
      </div>
      <details className="mt-4 rounded-md border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-black">고급 입력</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricInput label="좋아요" value={performance.likes} onChange={(value) => update("likes", value)} />
          <MetricInput label="저장" value={performance.saves} onChange={(value) => update("saves", value)} />
          <MetricInput label="공유" value={performance.shares} onChange={(value) => update("shares", value)} />
        </div>
      </details>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={onSubmit} className="rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white">
          입력하고 정확도 높이기
        </button>
        <button onClick={onSkip} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black">
          건너뛰고 바로 진단하기
        </button>
      </div>
    </Card>
  );
}

function MetricInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      className="h-12 rounded-md border border-slate-300 px-3"
    />
  );
}

function ResultStep({
  result,
  videoResult,
  videoMessages,
  videoProgress,
  activeTab,
  setActiveTab,
  onSave,
  onRevisit,
}: {
  result: AiResult;
  videoResult: VideoAnalysisResult | null;
  videoMessages: string[];
  videoProgress: string;
  activeTab: string;
  setActiveTab: (value: string) => void;
  onSave: () => void;
  onRevisit: () => void;
}) {
  const tabs = {
    제목: result.boosterPack.titles,
    썸네일: result.boosterPack.thumbnailTexts,
    고정댓글: result.boosterPack.pinnedComments,
    스토리: result.boosterPack.storyTexts,
    해시태그: result.boosterPack.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`),
    "후속 콘텐츠": [],
    "사운드 추천": result.boosterPack.soundRecommendations,
  };
  const allBooster = JSON.stringify(result.boosterPack, null, 2);

  return (
    <div className="grid gap-5">
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={result.totalScore} />
          <div>
            <StatusPill>{result.status}</StatusPill>
            <h2 className="mt-3 text-2xl font-black">상태 요약</h2>
            <p className="mt-2 text-base font-bold text-slate-800">{result.oneLineDiagnosis}</p>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="text-lg font-black">진단 정확도</h3>
        <p className="mt-2 text-sm text-slate-700">
          {result.diagnosisAccuracy.level} · 사용 데이터: {result.diagnosisAccuracy.usedData.join(", ")}
        </p>
        <p className="mt-1 text-sm text-slate-500">{result.diagnosisAccuracy.note}</p>
      </Card>
      <VideoAnalysisSection
        videoResult={videoResult}
        videoMessages={videoMessages}
        videoProgress={videoProgress}
      />
      <Card>
        <h3 className="text-lg font-black">노출 병목 TOP 3</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {result.bottlenecks.map((item) => (
            <div key={item.name} className="rounded-md bg-rose-50 p-4">
              <div className="text-sm font-black text-rose-900">{item.name} · {item.score}점</div>
              <p className="mt-2 text-sm text-rose-800">{item.reason}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-lg font-black">우선순위 처방전</h3>
        <div className="mt-4 grid gap-3">
          {result.prescriptions.slice(0, 3).map((item) => (
            <div key={item.priority} className="rounded-md border border-slate-200 p-4">
              <div className="text-sm font-black text-blue-800">{item.priority}순위: {item.title}</div>
              <p className="mt-2 text-sm text-slate-600">왜? {item.why}</p>
              <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm font-bold">{item.copyText}</div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">기대 효과: {item.expectedEffect}</p>
                <CopyButton text={item.copyText} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-black">세부 점수 카드</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(result.scores).map(([key, item]) => (
            <div key={key} className="rounded-md bg-slate-50 p-4">
              <div className="text-sm font-black">{scoreName(key)} · {item.score}점</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{item.analysisType}</div>
            </div>
          ))}
        </div>
      </details>
      <Card>
        <h3 className="text-lg font-black">체크리스트 결과</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ListBlock title="통과" items={result.checklist.passed} />
          <ListBlock title="보완 필요" items={result.checklist.missing} />
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">부스터팩</h3>
          <CopyButton text={allBooster} label="전체 복사" />
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {Object.keys(tabs).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-black ${
                activeTab === tab ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === "후속 콘텐츠" ? (
          <div className="mt-4 grid gap-4">
            {result.boosterPack.followUpIdeas.map((idea) => (
              <div key={idea.title} className="rounded-md border border-slate-200 p-4">
                <h4 className="font-black">{idea.title}</h4>
                <p className="mt-2 text-sm font-bold text-blue-800">첫 2초 후킹 장면: {idea.firstTwoSeconds}</p>
                <div className="mt-3 grid gap-2">
                  {idea.sceneSteps.map((step) => (
                    <div key={step.timeRange} className="rounded-md bg-slate-50 p-3 text-sm">
                      <b>{step.timeRange}</b> · {step.scene}
                      <div className="mt-1 text-slate-600">자막: {step.caption}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm">고정댓글: {idea.pinnedComment}</p>
                <p className="mt-1 text-sm">스토리 재공유 문구: {idea.storyText}</p>
                <p className="mt-1 text-sm">기대 효과: {idea.expectedEffect}</p>
                <div className="mt-3">
                  <CopyButton text={JSON.stringify(idea, null, 2)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {tabs[activeTab as keyof typeof tabs].map((text) => (
              <div key={text} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
                <p className="text-sm font-bold">{text}</p>
                <CopyButton text={text} />
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2">
          <button onClick={onSave} className="rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white">
            결과 저장하기
          </button>
          <button onClick={onRevisit} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-black">
            24시간 후 재진단하기
          </button>
        </div>
      </Card>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <div className="text-sm font-black">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function VideoAnalysisSection({
  videoResult,
  videoMessages,
  videoProgress,
}: {
  videoResult: VideoAnalysisResult | null;
  videoMessages: string[];
  videoProgress: string;
}) {
  if (!videoResult && !videoProgress && videoMessages.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusPill>
              {videoResult?.analysisMode === "video_audio_direct"
                ? "영상·오디오 분석 기반 진단"
                : videoResult?.videoAnalysisUsed
                  ? "영상 프레임 기반 진단"
                  : "메타데이터 기반 진단"}
            </StatusPill>
            {videoResult?.audioAnalysisUsed ? <StatusPill>오디오 분석 사용</StatusPill> : null}
          </div>
          <h3 className="mt-3 text-xl font-black">영상·오디오 기반 숏폼 분석</h3>
        </div>
        {videoResult ? (
          <div className="rounded-lg bg-blue-700 px-5 py-4 text-center text-white">
            <div className="text-3xl font-black">{videoResult.overallScore}</div>
            <div className="text-xs font-bold">Grade {videoResult.grade}</div>
          </div>
        ) : null}
      </div>

      {videoProgress ? (
        <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm font-bold text-blue-800">
          {videoProgress}
        </p>
      ) : null}

      {videoMessages.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {videoMessages.map((message) => (
            <p key={message} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {videoResult ? (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <VideoMetric label="Hook" value={videoResult.hookScore} />
            <VideoMetric label="Retention" value={videoResult.retentionScore} />
            <VideoMetric label="Emotion" value={videoResult.emotionScore} />
            <VideoMetric label="Shareability" value={videoResult.shareabilityScore} />
            <VideoMetric label="Editing" value={videoResult.editingScore} />
            <VideoMetric label="Audio" value={videoResult.audioScore} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalysisBlock
              title="영상 분석"
              rows={[
                ["분석 모드", videoResult.analysisMode],
                ["사용 데이터", videoResult.usedData.join(", ")],
                ["장면 분석", videoResult.visualAnalysis.summary],
                ["첫 3초 진단", videoResult.visualAnalysis.firstThreeSeconds],
                ["핵심 장면", videoResult.visualAnalysis.keyScenes.join(", ")],
                ["장면 전환 진단", videoResult.visualAnalysis.editingStyle],
                ["이탈 위험 구간", videoResult.visualAnalysis.retentionRiskPoints.join(", ")],
              ]}
            />
            <AnalysisBlock
              title="오디오 분석"
              rows={[
                ["음성 분석", videoResult.audioAnalysis.voiceTone],
                ["대사 분석", videoResult.audioAnalysis.transcript || "전사 정보가 없어 대사 분석은 제한적으로만 반영했습니다."],
                ["음악 분석", videoResult.audioAnalysis.musicMood],
                [
                  "효과음 분석",
                  videoResult.audioAnalysisUsed
                    ? "프레임과 전사 정보를 함께 보며 사운드 몰입도를 판단했습니다."
                    : "오디오 분석이 사용되지 않아 효과음 판단은 제한적입니다.",
                ],
                ["사운드 개선 제안", videoResult.audioAnalysis.soundImpact],
                ["오디오 약점", videoResult.audioAnalysis.audioWeaknesses.join(", ")],
              ]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ListBlock title="강점" items={videoResult.strengths} />
            <ListBlock title="약점" items={videoResult.weaknesses} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ListBlock title="왜 터질 수 있는가" items={videoResult.viralDiagnosis.whyItCanGoViral} />
            <ListBlock title="왜 안 터질 수 있는가" items={videoResult.viralDiagnosis.whyItMayFail} />
          </div>

          <div className="rounded-md bg-slate-50 p-4">
            <h4 className="text-sm font-black">타깃·공유 진단</h4>
            <p className="mt-2 text-sm text-slate-700">
              타깃 적합도: {videoResult.viralDiagnosis.targetAudienceFit}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              공유 트리거: {videoResult.viralDiagnosis.shareTriggers.join(", ")}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-black">개선 제안 TOP 3</h4>
            <div className="mt-3 grid gap-3">
              {videoResult.prescription.topThreeFixes.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-md border border-slate-200 p-4">
                  <div className="text-sm font-black text-blue-800">{index + 1}순위 수정안</div>
                  <p className="mt-2 text-sm text-slate-600">{item}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-bold">{item}</p>
                    <CopyButton text={item} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalysisBlock
              title="처방 문구"
              rows={[
                ["첫 3초 재작성", videoResult.prescription.firstThreeSecondsRewrite],
                ["자막 제안", videoResult.prescription.captionSuggestions.join(", ")],
              ]}
            />
            <AnalysisBlock
              title="편집·오디오 처방"
              rows={[
                ["편집 제안", videoResult.prescription.editingSuggestions.join(", ")],
                ["오디오 제안", videoResult.prescription.audioSuggestions.join(", ")],
              ]}
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function VideoMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function AnalysisBlock({
  title,
  rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <h4 className="text-sm font-black">{title}</h4>
      <div className="mt-3 grid gap-3">
        {rows.map(([label, text]) => (
          <div key={label}>
            <div className="text-xs font-bold text-slate-500">{label}</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentStep({
  saved,
  onOpen,
  onDelete,
}: {
  saved: SavedDiagnosis[];
  onOpen: (item: SavedDiagnosis) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <h2 className="text-2xl font-black">최근 진단</h2>
      <div className="mt-4 grid gap-3">
        {saved.length === 0 ? <p className="text-sm text-slate-500">아직 저장된 진단이 없습니다.</p> : null}
        {saved.map((item) => (
          <div key={item.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="text-xs font-bold text-slate-500">
                {platformLabel[item.platform]} · {formatDate(item.diagnosedAt)}
              </div>
              <div className="mt-1 font-black">{item.title}</div>
              <p className="mt-1 text-sm text-slate-600">{item.oneLineDiagnosis}</p>
              <div className="mt-2 text-sm font-bold text-blue-800">
                {item.totalScore}점 · {item.status}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onOpen(item)} className="h-10 rounded-md bg-blue-700 px-3 text-xs font-black text-white">
                다시 열기
              </button>
              <button onClick={() => onDelete(item.id)} className="h-10 rounded-md border border-slate-300 px-3 text-xs font-black">
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
          #{tag}
        </span>
      ))}
    </div>
  );
}

function scoreName(key: string) {
  const names: Record<string, string> = {
    hooking: "후킹력",
    empathy: "공감력",
    retention: "유지력",
    commentPotential: "댓글유도력",
    saveValue: "저장가치",
    shareReason: "공유명분",
    conversionPotential: "전환력",
    platformFit: "플랫폼적합도",
    soundFit: "사운드적합도",
    beatEditSync: "비트/편집싱크",
  };
  return names[key] ?? key;
}
