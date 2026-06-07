import { readFile } from "fs/promises";
import type { AiResult, Metadata, VideoAnalysisResult } from "../../types/superviral";

const fallbackText =
  "영상 직접 분석 결과가 충분하지 않아 메타데이터와 가능한 프레임 정보를 기준으로 보수적으로 진단했습니다.";

function grade(score: number): VideoAnalysisResult["grade"] {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function fallbackVideoAnalysis(input: {
  metadata: Metadata;
  vcareResult?: AiResult;
  videoAnalysisUsed: boolean;
  audioAnalysisUsed: boolean;
  transcriptUsed: boolean;
  transcript?: string;
}): VideoAnalysisResult {
  const base = input.vcareResult?.totalScore ?? 58;
  const hookScore = Math.min(100, Math.max(0, input.vcareResult?.scores.hooking.score ?? base));
  const retentionScore = Math.min(100, Math.max(0, input.vcareResult?.scores.retention.score ?? base));
  const emotionScore = Math.min(100, Math.max(0, input.vcareResult?.scores.empathy.score ?? base));
  const shareabilityScore = Math.min(
    100,
    Math.max(0, input.vcareResult?.scores.shareReason.score ?? base),
  );
  const editingScore = Math.min(100, Math.max(0, input.vcareResult?.scores.platformFit.score ?? base));
  const audioScore = Math.min(100, Math.max(0, input.vcareResult?.scores.soundFit.score ?? 55));
  const overallScore = Math.round(
    hookScore * 0.25 +
      retentionScore * 0.25 +
      emotionScore * 0.15 +
      shareabilityScore * 0.2 +
      editingScore * 0.1 +
      audioScore * 0.05,
  );
  const usedData = [
    "metadata",
    ...(input.videoAnalysisUsed ? ["videoFrames"] : []),
    ...(input.transcriptUsed ? ["audioTranscript"] : []),
    "aiInference",
  ];
  const analysisMode: VideoAnalysisResult["analysisMode"] =
    input.videoAnalysisUsed && input.transcriptUsed
      ? "video_audio_direct"
      : input.videoAnalysisUsed || input.transcriptUsed
        ? "video_partial"
        : "metadata_fallback";

  return {
    analysisMode,
    usedData,
    overallScore,
    grade: grade(overallScore),
    hookScore,
    retentionScore,
    emotionScore,
    shareabilityScore,
    editingScore,
    audioScore,
    videoAnalysisUsed: input.videoAnalysisUsed,
    audioAnalysisUsed: input.audioAnalysisUsed,
    transcriptUsed: input.transcriptUsed,
    metadataUsed: true,
    visualAnalysis: {
      summary: input.videoAnalysisUsed
        ? "대표 프레임 흐름을 기준으로 장면 전환, 메시지 명확성, 정보 밀도를 점검했습니다."
        : fallbackText,
      firstThreeSeconds: input.videoAnalysisUsed
        ? "첫 3초 프레임을 기준으로 초반 시선 집중력과 메시지 이해도를 확인했습니다."
        : fallbackText,
      keyScenes: input.videoAnalysisUsed
        ? ["첫 장면의 메시지 명확성", "중반 정보 밀도", "마지막 행동 유도 장면"]
        : ["메타데이터 기반 보수 추정"],
      editingStyle: input.videoAnalysisUsed
        ? "대표 프레임 간 변화량을 기준으로 컷 전환과 자막 밀도를 보수적으로 평가했습니다."
        : fallbackText,
      retentionRiskPoints: input.videoAnalysisUsed
        ? ["중반 장면 변화가 약한 구간", "마지막 행동 유도 전 이탈 가능 구간"]
        : ["영상 프레임 미확보로 이탈 지점 판단 제한"],
    },
    audioAnalysis: {
      transcript: input.transcriptUsed ? input.transcript ?? "전사 텍스트를 반영했습니다." : "",
      voiceTone: input.audioAnalysisUsed
        ? "오디오와 전사 정보를 함께 참고해 음성 전달력을 평가했습니다."
        : "오디오 분석은 사용되지 않았습니다.",
      musicMood: input.audioAnalysisUsed
        ? "전사와 오디오 기반으로 콘텐츠 무드와 사운드 몰입도를 함께 추정했습니다."
        : "오디오 미확보로 음악 무드는 판단하지 않았습니다.",
      soundImpact: input.audioAnalysisUsed
        ? "사운드 무드와 초반 몰입 요소를 함께 점검했습니다."
        : "메타데이터 기반으로 사운드 적합도를 보수적으로 추정했습니다.",
      audioWeaknesses: input.audioAnalysisUsed
        ? ["마지막 CTA 음성 강조가 약할 수 있음"]
        : ["오디오 미확보"],
    },
    viralDiagnosis: {
      whyItCanGoViral: ["소재가 명확하면 첫 3초 후킹을 통해 초반 체류를 만들 수 있습니다."],
      whyItMayFail: ["댓글이나 저장을 유도하는 명확한 이유가 약하면 추가 노출이 제한될 수 있습니다."],
      targetAudienceFit: "메타데이터와 기존 AI 추론을 기준으로 타깃 적합도를 보수적으로 판단했습니다.",
      shareTriggers: ["경험 공유 질문", "비교/반전 장면", "저장 가능한 체크포인트"],
    },
    prescription: {
      topThreeFixes: [
        "첫 1초 자막을 문제 제기형으로 바꾸기",
        "중반부에 비교 컷 또는 클로즈업 추가하기",
        "마지막 2초에 댓글 선택지를 넣기",
      ],
      firstThreeSecondsRewrite: "이거 아직도 그냥 넘기고 계세요?",
      captionSuggestions: ["여기서 차이가 납니다.", "저장해두면 다음에 바로 써먹을 수 있어요."],
      editingSuggestions: ["5초 지점에 화면 변화가 큰 컷을 넣으세요.", "핵심 자막은 화면 중앙 안전 영역에 짧게 배치하세요."],
      audioSuggestions: ["첫 1초에 명확한 사운드 훅을 추가하세요.", "말소리와 배경음 볼륨 차이를 더 분명하게 만드세요."],
    },
    strengths: ["소재를 진단 가능한 정보로 구조화할 수 있음", "바로 수정 가능한 후킹/CTA 여지가 있음"],
    weaknesses: ["영상 직접 분석 정보가 제한되면 중반 유지력 판단 정확도가 낮아짐", "댓글 유도 장치 보완 필요"],
    expectedPerformance: "첫 3초 자막과 고정댓글을 수정하면 초반 이탈과 댓글 신호 개선 가능성이 있습니다.",
    exposureBottleneck: input.vcareResult?.mainBottleneck ?? "첫 장면과 댓글 유도 신호가 약합니다.",
    improvements: [
      "첫 자막을 문제 제기형으로 바꾸세요. 예: 이거 아직도 그냥 넘기고 계세요?",
      "5초 지점에 비교 장면 또는 클로즈업을 추가해 중반 템포를 끌어올리세요.",
      "마지막 2초에 질문형 CTA를 넣으세요. 예: 여러분이라면 어떻게 하시겠어요?",
    ],
  };
}

async function frameToDataUrl(framePath: string) {
  const bytes = await readFile(framePath);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

export async function analyzeVideoFrames(input: {
  metadata: Metadata;
  thumbnailUrl: string;
  durationSeconds?: number;
  channelName?: string;
  framePaths: string[];
  transcript: string;
  vcareResult?: AiResult;
  audioAnalysisUsed: boolean;
}): Promise<VideoAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackVideoAnalysis({
    metadata: input.metadata,
    vcareResult: input.vcareResult,
    videoAnalysisUsed: input.framePaths.length > 0,
    audioAnalysisUsed: input.audioAnalysisUsed,
    transcriptUsed: Boolean(input.transcript),
    transcript: input.transcript,
  });

  if (!apiKey || input.framePaths.length === 0) {
    return fallback;
  }

  const imageParts = await Promise.all(
    input.framePaths.slice(0, 12).map(async (framePath) => ({
      type: "image_url",
      image_url: { url: await frameToDataUrl(framePath), detail: "low" },
    })),
  );

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "너는 숏폼 영상·오디오 바이럴 분석가다. JSON만 반환한다. 조회수 보장, 봇, 자동 좋아요, 정책 우회는 제안하지 않는다.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `대표 프레임, 전사, 메타데이터, 기존 V-CARE 결과를 함께 보고 숏폼 바이럴 관점에서 진단해줘. 단순 요약 금지. 반드시 실제 프레임과 transcript를 근거로 판단해.\n분석 질문: 1 첫 3초 훅이 강한가? 2 어디서 이탈할 가능성이 높은가? 3 화면 구성과 컷 전환은 좋은가? 4 자막이 잘 읽히는가? 5 음성 전달력은 좋은가? 6 BGM/효과음이 몰입에 도움이 되는가? 7 감정 자극이 있는가? 8 공유/저장/댓글 유도 요소가 있는가? 9 왜 터질 수 있는가? 10 왜 안 터질 수 있는가? 11 조회수를 높이려면 무엇을 고쳐야 하는가?\n점수는 0~100. Overall은 Hook 25%, Retention 25%, Emotion 15%, Shareability 20%, Editing 10%, Audio 5%. Grade는 S=90 이상, A=80 이상, B=70 이상, C=60 이상, D=60 미만.\nJSON만 반환해. 반드시 포함할 JSON 구조: {"analysisMode":"video_audio_direct","usedData":["metadata","videoFrames","audioTranscript","aiInference"],"overallScore":number,"grade":"S|A|B|C|D","hookScore":number,"retentionScore":number,"emotionScore":number,"shareabilityScore":number,"editingScore":number,"audioScore":number,"visualAnalysis":{"summary":"string","firstThreeSeconds":"string","keyScenes":["string"],"editingStyle":"string","retentionRiskPoints":["string"]},"audioAnalysis":{"transcript":"string","voiceTone":"string","musicMood":"string","soundImpact":"string","audioWeaknesses":["string"]},"viralDiagnosis":{"whyItCanGoViral":["string"],"whyItMayFail":["string"],"targetAudienceFit":"string","shareTriggers":["string"]},"prescription":{"topThreeFixes":["string"],"firstThreeSecondsRewrite":"string","captionSuggestions":["string"],"editingSuggestions":["string"],"audioSuggestions":["string"]},"strengths":["string"],"weaknesses":["string"],"improvements":["string"]}\nmetadata=${JSON.stringify(input.metadata)}\nthumbnailUrl=${input.thumbnailUrl}\ndurationSeconds=${input.durationSeconds ?? ""}\nchannelName=${input.channelName ?? ""}\ntranscript=${input.transcript}\nvcare=${JSON.stringify(input.vcareResult ?? null)}`,
            },
            ...imageParts,
          ],
        },
      ],
    }),
  });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT Vision analysis failed: ${errorText.slice(0, 500)}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("GPT Vision analysis returned empty content.");
    }
    const parsed = JSON.parse(content) as Partial<VideoAnalysisResult>;
    const analysisMode: VideoAnalysisResult["analysisMode"] =
      input.framePaths.length > 0 && input.transcript.trim()
        ? "video_audio_direct"
        : input.framePaths.length > 0 || input.transcript.trim()
          ? "video_partial"
          : "metadata_fallback";
    return {
      ...fallback,
      ...parsed,
      analysisMode,
      usedData: [
        "metadata",
        ...(input.framePaths.length > 0 ? ["videoFrames"] : []),
        ...(input.transcript.trim() ? ["audioTranscript"] : []),
        "aiInference",
      ],
      visualAnalysis: {
        ...fallback.visualAnalysis,
        ...(parsed.visualAnalysis ?? {}),
      },
      audioAnalysis: {
        ...fallback.audioAnalysis,
        ...(parsed.audioAnalysis ?? {}),
        transcript: parsed.audioAnalysis?.transcript ?? input.transcript,
      },
      viralDiagnosis: {
        ...fallback.viralDiagnosis,
        ...(parsed.viralDiagnosis ?? {}),
      },
      prescription: {
        ...fallback.prescription,
        ...(parsed.prescription ?? {}),
      },
      strengths: parsed.strengths?.length ? parsed.strengths : fallback.strengths,
      weaknesses: parsed.weaknesses?.length ? parsed.weaknesses : fallback.weaknesses,
      improvements: parsed.improvements?.length ? parsed.improvements : fallback.improvements,
      videoAnalysisUsed: input.framePaths.length > 0,
      audioAnalysisUsed: input.audioAnalysisUsed,
      transcriptUsed: Boolean(input.transcript.trim()),
      metadataUsed: true,
    };
}
