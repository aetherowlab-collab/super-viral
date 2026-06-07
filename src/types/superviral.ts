export type Platform = "youtube_shorts" | "instagram" | "tiktok" | "unknown";

export type MetadataStatus =
  | "success"
  | "partial"
  | "failed"
  | "manual_required"
  | "manual";

export type Goal =
  | "views"
  | "comments"
  | "saves_shares"
  | "followers"
  | "purchase_conversion"
  | "brand_awareness";

export type AnalysisType =
  | "automatic"
  | "estimated"
  | "requires_video_analysis";

export type DiagnosisAccuracyLevel = "basic" | "improved" | "advanced";

export type Metadata = {
  title: string;
  description: string;
  thumbnailUrl: string;
  hashtags: string[];
};

export type ManualFallback = {
  used: boolean;
  titleOrHook: string;
  summary: string;
  hashtags: string[];
};

export type AiInference = {
  targetAudience: string;
  goal: Goal;
  mood: string;
  contentType: string;
  viewerDesire: string;
  reasoningSummary?: string;
};

export type PerformanceData = {
  views: number | null;
  comments: number | null;
  hoursAfterUpload: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
};

export type InputData = {
  contentUrl: string;
  platform: Platform;
  metadataStatus: MetadataStatus;
  metadata: Metadata;
  manualFallback: ManualFallback;
  aiInference: AiInference;
  performance: PerformanceData;
};

export type DiagnosisAccuracy = {
  level: DiagnosisAccuracyLevel;
  usedData: string[];
  videoAnalysisUsed: boolean;
  soundAnalysisUsed: boolean;
  note?: string;
};

export type ScoreItem = {
  score: number;
  analysisType: AnalysisType;
};

export type ScoreKey =
  | "hooking"
  | "empathy"
  | "retention"
  | "commentPotential"
  | "saveValue"
  | "shareReason"
  | "conversionPotential"
  | "platformFit"
  | "soundFit"
  | "beatEditSync";

export type ScoreMap = Record<ScoreKey, ScoreItem>;

export type Bottleneck = {
  name: string;
  score: number;
  reason: string;
};

export type Prescription = {
  priority: number;
  title: string;
  why: string;
  copyText: string;
  expectedEffect: string;
};

export type FollowUpIdea = {
  title: string;
  firstTwoSeconds: string;
  sceneSteps: {
    timeRange: string;
    scene: string;
    caption: string;
  }[];
  pinnedComment: string;
  storyText: string;
  expectedEffect: string;
};

export type BoosterPack = {
  titles: string[];
  thumbnailTexts: string[];
  pinnedComments: string[];
  storyTexts: string[];
  hashtags: string[];
  replyTexts: string[];
  followUpIdeas: FollowUpIdea[];
  soundRecommendations: string[];
};

export type AiResult = {
  estimatedScore: number;
  totalScore: number;
  status: string;
  diagnosisAccuracy: DiagnosisAccuracy;
  oneLineDiagnosis: string;
  mainBottleneck: string;
  scores: ScoreMap;
  bottlenecks: Bottleneck[];
  checklist: {
    passed: string[];
    missing: string[];
  };
  prescriptions: Prescription[];
  boosterPack: BoosterPack;
  qualityCheck: {
    specificity: number;
    usability: number;
    targetFit: number;
    platformFit: number;
    engagementPotential: number;
  };
  videoAnalysisResult?: VideoAnalysisResult | null;
};

export type VideoAnalysisResult = {
  analysisMode: "video_audio_direct" | "video_partial" | "metadata_fallback";
  usedData: string[];
  overallScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  shareabilityScore: number;
  editingScore: number;
  audioScore: number;
  videoAnalysisUsed: boolean;
  audioAnalysisUsed: boolean;
  transcriptUsed: boolean;
  metadataUsed: boolean;
  visualAnalysis: {
    summary: string;
    firstThreeSeconds: string;
    keyScenes: string[];
    editingStyle: string;
    retentionRiskPoints: string[];
  };
  audioAnalysis: {
    transcript: string;
    voiceTone: string;
    musicMood: string;
    soundImpact: string;
    audioWeaknesses: string[];
  };
  viralDiagnosis: {
    whyItCanGoViral: string[];
    whyItMayFail: string[];
    targetAudienceFit: string;
    shareTriggers: string[];
  };
  prescription: {
    topThreeFixes: string[];
    firstThreeSecondsRewrite: string;
    captionSuggestions: string[];
    editingSuggestions: string[];
    audioSuggestions: string[];
  };
  strengths: string[];
  weaknesses: string[];
  expectedPerformance?: string;
  exposureBottleneck?: string;
  improvements: string[];
};

export type VideoAnalysisApiResponse = {
  success: boolean;
  status:
    | "success"
    | "skipped"
    | "fallback_metadata"
    | "failed";
  platform: Platform;
  enabled: boolean;
  messages: string[];
  videoDurationSeconds?: number;
  framesCount?: number;
  transcript?: string;
  result?: VideoAnalysisResult;
};

export type DetectPlatformResponse = {
  platform: Platform;
  isSupported: boolean;
  needsManualInput: boolean;
};

export type ExtractMetadataApiResponse =
  | ({
      success: true;
      status: "success" | "partial";
      platform: Platform;
    } & Metadata)
  | {
      success: false;
      status: "failed" | "manual_required";
      platform: Platform;
      error?: string;
      requiresManualInput: true;
    };

export type SavedDiagnosis = {
  id: string;
  diagnosedAt: string;
  contentUrl: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string;
  metadataStatus: MetadataStatus;
  estimatedScore: number;
  totalScore: number;
  status: string;
  oneLineDiagnosis: string;
  result: AiResult;
  videoResult?: VideoAnalysisResult | null;
  videoMessages?: string[];
  inputData: InputData;
  revisitAfter24h: boolean;
};
