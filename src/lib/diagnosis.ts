import type {
  AiInference,
  AiResult,
  BoosterPack,
  DiagnosisAccuracy,
  Goal,
  InputData,
  PerformanceData,
  Platform,
  ScoreMap,
} from "../types/superviral";

type JsonRecord = Record<string, unknown>;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const goalLabels: Record<Goal, string> = {
  views: "조회수 확대",
  comments: "댓글 반응",
  saves_shares: "저장/공유",
  followers: "팔로워 증가",
  purchase_conversion: "구매 전환",
  brand_awareness: "브랜드 인지도",
};

export function splitHashtags(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanTag).filter(Boolean);
  }

  return (value ?? "")
    .split(/[\s,]+/)
    .map(cleanTag)
    .filter(Boolean);
}

function cleanTag(value: string) {
  return value.trim().replace(/^#/, "");
}

function clamp(value: number, min = 1, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textOf(input: InputData) {
  return [
    input.metadata.title,
    input.metadata.description,
    input.manualFallback.titleOrHook,
    input.manualFallback.summary,
    ...input.metadata.hashtags,
    ...input.manualFallback.hashtags,
  ]
    .filter(Boolean)
    .join(" ");
}

function hasChoicePrompt(text: string) {
  return /[①②③④]|1번|2번|댓글|어떻게|무엇|추천|골라|선택|\?/.test(text);
}

function inferGoal(text: string): Goal {
  if (/구매|예약|문의|신청|판매|가격|할인/.test(text)) return "purchase_conversion";
  if (/저장|꿀팁|방법|체크리스트|리스트|정보|정리/.test(text)) return "saves_shares";
  if (/댓글|투표|골라|어떻게|여러분/.test(text)) return "comments";
  if (/브랜드|런칭|소개|신제품/.test(text)) return "brand_awareness";
  if (/팔로우|시리즈|다음 편/.test(text)) return "followers";
  return "views";
}

export function fallbackInference(input: {
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  manualFallbackUsed: boolean;
}): AiInference {
  const joined = [input.title, input.description, ...input.hashtags].join(" ");
  const goal = inferGoal(joined);
  const type = /후기|리뷰/.test(joined)
    ? "후기/리뷰형"
    : /방법|꿀팁|체크리스트|정리/.test(joined)
      ? "정보/팁형"
      : /일상|브이로그|여행|맛집/.test(joined)
        ? "경험 공유형"
        : "문제 해결형";

  return {
    targetAudience: /제주|여행|맛집/.test(joined)
      ? "여행과 로컬 경험에 관심이 있는 20~40대 시청자"
      : "짧은 시간 안에 쓸모 있는 답을 얻고 싶은 SNS 시청자",
    goal,
    mood: /실패|위험|문제|고민/.test(joined)
      ? "문제 제기형, 응급 진단 톤"
      : "실용적이고 바로 따라 할 수 있는 톤",
    contentType: type,
    viewerDesire:
      goal === "comments"
        ? "내 경험을 비교하고 의견을 남기고 싶어함"
        : goal === "saves_shares"
          ? "나중에 다시 볼 만한 실용 정보를 원함"
          : "짧게 보고 바로 이해되는 흥미와 효용을 원함",
    reasoningSummary: input.manualFallbackUsed
      ? "플랫폼 미리보기 제한으로 사용자가 보완한 제목과 요약을 중심으로 추론했습니다."
      : "링크 메타데이터의 제목, 설명, 해시태그를 중심으로 추론했습니다.",
  };
}

function scoreInput(input: InputData): ScoreMap {
  const text = textOf(input);
  const hasHashtags =
    input.metadata.hashtags.length + input.manualFallback.hashtags.length > 0;
  const titleLength = (input.metadata.title || input.manualFallback.titleOrHook).length;
  const hasQuestion = hasChoicePrompt(text);
  const hasUsefulWords = /방법|꿀팁|체크리스트|정리|보관|비교|추천|템플릿/.test(text);
  const hasEmotion = /충격|실패|후회|진짜|왜|아직|위험|살릴|응급/.test(text);
  const perf = input.performance;
  const commentRate =
    perf.views && perf.comments ? Math.min(20, (perf.comments / perf.views) * 1000) : 0;
  const saveShareSignal =
    perf.views && (perf.saves || perf.shares)
      ? Math.min(16, (((perf.saves ?? 0) + (perf.shares ?? 0)) / perf.views) * 1000)
      : 0;

  return {
    hooking: {
      score: clamp(38 + (hasEmotion ? 18 : 0) + (titleLength < 34 ? 10 : 0)),
      analysisType: "automatic",
    },
    empathy: {
      score: clamp(48 + (/고민|안 나온|힘든|여러분|우리/.test(text) ? 22 : 10)),
      analysisType: "automatic",
    },
    retention: {
      score: clamp(48 + (hasUsefulWords ? 12 : 0) + (input.platform === "youtube_shorts" ? 5 : 0)),
      analysisType: "estimated",
    },
    commentPotential: {
      score: clamp(24 + (hasQuestion ? 34 : 0) + commentRate),
      analysisType: "automatic",
    },
    saveValue: {
      score: clamp(30 + (hasUsefulWords ? 28 : 0) + saveShareSignal),
      analysisType: "automatic",
    },
    shareReason: {
      score: clamp(28 + (/공유|친구|알려|논쟁|반전|비교/.test(text) ? 24 : 8)),
      analysisType: "automatic",
    },
    conversionPotential: {
      score: clamp(35 + (input.aiInference.goal === "purchase_conversion" ? 22 : 8)),
      analysisType: "automatic",
    },
    platformFit: {
      score: clamp(52 + (input.platform === "youtube_shorts" ? 12 : 5) + (hasHashtags ? 7 : 0)),
      analysisType: "automatic",
    },
    soundFit: {
      score: clamp(58 + (/감성|빠른|긴장|브이로그|리듬/.test(text) ? 9 : 0)),
      analysisType: "estimated",
    },
    beatEditSync: {
      score: 48,
      analysisType: "requires_video_analysis",
    },
  };
}

function totalFrom(scores: ScoreMap) {
  const weights: Record<keyof ScoreMap, number> = {
    hooking: 1.15,
    empathy: 0.85,
    retention: 1,
    commentPotential: 1,
    saveValue: 0.95,
    shareReason: 0.9,
    conversionPotential: 0.7,
    platformFit: 0.85,
    soundFit: 0.4,
    beatEditSync: 0.2,
  };
  const sum = Object.entries(scores).reduce(
    (acc, [key, item]) => acc + item.score * weights[key as keyof ScoreMap],
    0,
  );
  const weightSum = Object.values(weights).reduce((acc, item) => acc + item, 0);
  return clamp(sum / weightSum);
}

function statusFrom(score: number) {
  if (score >= 82) return "확산 가능";
  if (score >= 68) return "살릴 수 있음";
  if (score >= 50) return "묻힐 위험";
  return "응급 처방 필요";
}

function accuracyFor(performance: PerformanceData): DiagnosisAccuracy {
  const hasBasicPerf =
    performance.views !== null ||
    performance.comments !== null ||
    performance.hoursAfterUpload !== null;
  const hasAdvancedPerf =
    performance.likes !== null || performance.saves !== null || performance.shares !== null;

  return {
    level: hasAdvancedPerf ? "advanced" : hasBasicPerf ? "improved" : "basic",
    usedData: [
      "metadata",
      "aiInference",
      ...(hasBasicPerf || hasAdvancedPerf ? ["performance"] : []),
    ],
    videoAnalysisUsed: false,
    soundAnalysisUsed: false,
    note: "영상 분석 조건이 충족되면 프레임과 오디오 전사를 추가로 반영합니다.",
  };
}

function scoreLabel(key: keyof ScoreMap) {
  const labels: Record<keyof ScoreMap, string> = {
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
  return labels[key];
}

function lowScores(scores: ScoreMap) {
  return (Object.entries(scores) as [keyof ScoreMap, ScoreMap[keyof ScoreMap]][])
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 3)
    .map(([key, item]) => ({
      name: scoreLabel(key),
      score: item.score,
      reason:
        key === "commentPotential"
          ? "댓글을 남길 질문이나 선택지가 부족합니다."
          : key === "hooking"
            ? "첫 3초에 멈춰 볼 이유가 더 선명해야 합니다."
            : key === "saveValue"
              ? "나중에 다시 볼 정보 구조가 약합니다."
              : key === "shareReason"
                ? "친구에게 보내야 할 명분이 약합니다."
                : "현재 입력 정보만으로는 강한 확산 신호가 부족합니다.",
    }));
}

function boosterPack(input: InputData): BoosterPack {
  const title = input.metadata.title || input.manualFallback.titleOrHook || "이 콘텐츠";
  const topic = input.manualFallback.summary || input.metadata.description || title;

  return {
    titles: [
      `${title}, 안 퍼진 이유 3가지`,
      `조회수 멈춘 ${title} 살리는 법`,
      `사람들이 그냥 넘기는 순간은 여기입니다`,
      `이걸 바꾸면 댓글이 달리기 시작합니다`,
      `${topic.slice(0, 18)}... 여러분은 어떻게 생각하세요?`,
    ],
    thumbnailTexts: [
      "왜 안 퍼졌을까?",
      "3초 후킹 교체",
      "댓글이 막힌 지점",
      "지금 바꿀 1가지",
    ],
    pinnedComments: [
      `여러분은 이 상황에서 무엇을 먼저 바꾸실 건가요? ① 제목 ② 첫 장면 ③ 댓글 질문 ④ 해시태그`,
      `이 콘텐츠가 더 궁금해지려면 어떤 말이 필요할까요? 경험을 남겨주세요.`,
      `비슷한 경험 있으신가요? 댓글로 한 줄만 남겨주시면 후속편에 반영할게요.`,
    ],
    storyTexts: [
      `투표 스티커: 이 콘텐츠, 왜 덜 퍼졌을까요? ① 첫 3초 ② 댓글 유도 ③ 저장 가치`,
      `질문 스티커: 여러분이라면 이 콘텐츠 제목을 어떻게 바꾸실 건가요?`,
      `방금 올린 콘텐츠, 반응이 애매해서 의견 받습니다. 한 줄 피드백 주세요.`,
    ],
    hashtags: [
      "숏폼마케팅",
      "콘텐츠진단",
      "릴스전략",
      "쇼츠전략",
      "틱톡마케팅",
      "조회수올리는법",
      "콘텐츠기획",
      "바이럴전략",
      ...input.metadata.hashtags,
      ...input.manualFallback.hashtags,
    ].slice(0, 14),
    replyTexts: [
      "이 부분 공감해주셔서 감사해요. 다음 편에서는 실제 수정 예시로 보여드릴게요.",
      "좋은 포인트예요. 이 댓글 기준으로 제목 후보를 다시 뽑아보겠습니다.",
      "비슷한 경험이 많네요. 댓글 사례를 모아서 후속 콘텐츠로 정리해볼게요.",
    ],
    followUpIdeas: [
      {
        title: `${title} 전후 비교: 바꾸기 전 vs 바꾼 후`,
        firstTwoSeconds: "기존 첫 장면을 0.5초 보여주고 바로 빨간 표시로 멈춥니다.",
        sceneSteps: [
          {
            timeRange: "0~2초",
            scene: "기존 콘텐츠 첫 화면을 보여주며 문제 지점 표시",
            caption: "여기서 대부분 넘깁니다",
          },
          {
            timeRange: "3~6초",
            scene: "수정한 후킹 문구와 첫 장면을 나란히 비교",
            caption: "첫 문장을 이렇게 바꾸면 이유가 생겨요",
          },
          {
            timeRange: "7~10초",
            scene: "댓글 질문과 저장 포인트를 화면에 고정",
            caption: "마지막엔 선택지를 남기세요",
          },
        ],
        pinnedComment:
          "전/후 중 어떤 버전이 더 멈춰 보이나요? ① 기존 ② 수정본",
        storyText: "투표 스티커: 기존 vs 수정본, 뭐가 더 클릭되나요?",
        expectedEffect: "시청자가 비교에 참여하면서 댓글과 재시청 신호를 만들 수 있습니다.",
      },
    ],
    soundRecommendations: [
      "빠른 템포의 긴장감 있는 비트 검색",
      "before after 전환에 맞는 팝/하우스 계열 검색",
      "차분한 설명형 콘텐츠라면 lo-fi tutorial mood 검색",
    ],
  };
}

export function fallbackAnalyze(input: InputData): AiResult {
  const scores = scoreInput(input);
  const totalScore = totalFrom(scores);
  const bottlenecks = lowScores(scores);
  const mainBottleneck = bottlenecks[0]?.reason ?? "확산을 막는 핵심 신호가 약합니다.";
  const status = statusFrom(totalScore);

  return {
    estimatedScore: totalScore,
    totalScore,
    status,
    diagnosisAccuracy: accuracyFor(input.performance),
    oneLineDiagnosis:
      "소재는 살릴 수 있지만 첫 3초 후킹, 댓글 유도, 저장 가치 중 하나를 더 선명하게 만들어야 합니다.",
    mainBottleneck,
    scores,
    bottlenecks,
    checklist: {
      passed: [
        "링크와 플랫폼이 확인되었습니다.",
        "타깃과 콘텐츠 목적을 기준으로 진단했습니다.",
      ],
      missing: [
        "영상/사운드 직접 분석은 아직 포함되지 않았습니다.",
        "고정댓글 또는 스토리 재공유 장치가 더 필요합니다.",
      ],
    },
    prescriptions: [
      {
        priority: 1,
        title: "고정댓글 교체",
        why: "댓글 신호가 약하면 추가 노출이 막히기 쉽습니다.",
        copyText:
          "여러분은 이 상황에서 무엇을 먼저 바꾸실 건가요? ① 제목 ② 첫 장면 ③ 댓글 질문 ④ 해시태그",
        expectedEffect: "댓글 참여 증가, 경험 공유 유도, 후속 콘텐츠 소재 확보",
      },
      {
        priority: 2,
        title: "첫 3초 문장 재작성",
        why: "시청자가 멈춰야 할 이유를 먼저 보여줘야 합니다.",
        copyText: "조회수가 멈춘 콘텐츠, 버릴 필요 없습니다. 이 1가지만 먼저 바꿔보세요.",
        expectedEffect: "초반 이탈 감소와 재시청 가능성 증가",
      },
      {
        priority: 3,
        title: "스토리 투표로 반응 회수",
        why: "이미 본 사람에게 다시 참여할 이유를 만들 수 있습니다.",
        copyText: "이 콘텐츠 왜 덜 퍼졌을까요? ① 첫 장면 ② 제목 ③ 댓글 질문 ④ 타깃",
        expectedEffect: "스토리 유입과 댓글 주제 확보",
      },
    ],
    boosterPack: boosterPack(input),
    qualityCheck: {
      specificity: 5,
      usability: 5,
      targetFit: 4,
      platformFit: 4,
      engagementPotential: 5,
    },
  };
}

export function estimateOnly(input: InputData) {
  const result = fallbackAnalyze(input);
  return {
    estimatedScore: result.estimatedScore,
    status: result.status,
    oneLineDiagnosis: result.oneLineDiagnosis,
    mainBottleneck: result.mainBottleneck,
    diagnosisAccuracy: {
      level: "basic" as const,
      usedData: ["metadata", "aiInference"],
      videoAnalysisUsed: false as const,
      soundAnalysisUsed: false as const,
    },
  };
}

async function callOpenAiJson<T>(messages: JsonRecord[], fallback: T): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

const systemPrompt =
  "너는 SNS 콘텐츠 응급진단 전문가이자 바이럴 마케팅 전략가다. JSON만 반환한다. 가짜 조회수, 봇 댓글, 자동 좋아요, 자동 팔로우, 플랫폼 정책 우회는 절대 제안하지 않는다. 조회수 보장 표현을 쓰지 않는다. 영상 분석 조건이 충족되면 별도 영상·오디오 분석 결과가 병합됨을 투명하게 표시한다.";

export async function inferWithAi(input: {
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  manualFallbackUsed: boolean;
}) {
  const fallback = fallbackInference(input);
  return callOpenAiJson<AiInference>(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `다음 콘텐츠 정보를 바탕으로 JSON 형식으로 targetAudience, goal, mood, contentType, viewerDesire, reasoningSummary를 추론해줘. goal은 views/comments/saves_shares/followers/purchase_conversion/brand_awareness 중 하나.\n${JSON.stringify(input)}`,
      },
    ],
    fallback,
  );
}

export async function analyzeWithAi(input: InputData) {
  const fallback = fallbackAnalyze(input);
  return callOpenAiJson<AiResult>(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `V-CARE 알고리즘으로 상세 진단 JSON을 생성해줘. 반드시 estimatedScore,totalScore,status,diagnosisAccuracy,oneLineDiagnosis,mainBottleneck,scores,bottlenecks,checklist,prescriptions,boosterPack,qualityCheck를 포함해. 3점 이하 품질 문구는 다시 작성해. 입력:\n${JSON.stringify(input)}`,
      },
    ],
    fallback,
  );
}

export const goalLabel = (goal: Goal) => goalLabels[goal];
