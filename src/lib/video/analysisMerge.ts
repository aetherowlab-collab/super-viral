import type {
  AiResult,
  DiagnosisAccuracy,
  InputData,
  VideoAnalysisResult,
} from "../../types/superviral";

export function shouldRunVideoAnalysis(input?: Pick<InputData, "platform"> | null) {
  const reasons: string[] = [];

  if (input?.platform !== "youtube_shorts") {
    reasons.push("platform is not youtube_shorts");
  }
  if (process.env.ENABLE_VIDEO_ANALYSIS?.trim().toLowerCase() !== "true") {
    reasons.push("ENABLE_VIDEO_ANALYSIS is not true");
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    reasons.push("GEMINI_API_KEY is missing");
  }

  return {
    shouldRun: reasons.length === 0,
    reasons,
  };
}

export function accuracyFromVideoResult(
  metadataAccuracy: DiagnosisAccuracy,
  videoResult?: VideoAnalysisResult | null,
): DiagnosisAccuracy {
  if (videoResult?.videoAnalysisUsed && videoResult.audioAnalysisUsed) {
    return {
      level: "advanced",
      usedData: ["metadata", "videoFrames", "audioTranscript", "aiInference"],
      videoAnalysisUsed: true,
      soundAnalysisUsed: true,
      note: "영상 프레임과 오디오 전사를 함께 분석했습니다.",
    };
  }

  if (videoResult?.videoAnalysisUsed && !videoResult.audioAnalysisUsed) {
    return {
      level: "advanced",
      usedData: ["metadata", "videoFrames", "aiInference"],
      videoAnalysisUsed: true,
      soundAnalysisUsed: false,
      note: "영상 프레임 분석은 사용했지만 오디오 전사는 실패했습니다.",
    };
  }

  if (!videoResult?.videoAnalysisUsed && videoResult?.audioAnalysisUsed) {
    return {
      level: "improved",
      usedData: ["metadata", "audioTranscript", "aiInference"],
      videoAnalysisUsed: false,
      soundAnalysisUsed: true,
      note: "오디오 전사를 반영했지만 영상 프레임 분석은 실패했습니다.",
    };
  }

  return metadataAccuracy;
}

export function mergeAnalysisResults(
  metadataResult: AiResult,
  videoResult?: VideoAnalysisResult | null,
): AiResult {
  return {
    ...metadataResult,
    diagnosisAccuracy: accuracyFromVideoResult(
      metadataResult.diagnosisAccuracy,
      videoResult,
    ),
    videoAnalysisResult: videoResult ?? null,
  };
}
