import { NextRequest, NextResponse } from "next/server";
import { detectPlatform } from "../../../lib/platform";
import { fallbackAnalyze, fallbackInference } from "../../../lib/diagnosis";
import { mergeAnalysisResults, shouldRunVideoAnalysis } from "../../../lib/video/analysisMerge";
import {
  canRunCommand,
  cleanupTempFiles,
  commandInstallGuide,
  createTempWorkdir,
  getFfmpegPath,
  getYtDlpPath,
} from "../../../lib/video/process";
import { downloadYoutubeShort } from "../../../lib/video/downloadYoutubeShort";
import { extractFrames } from "../../../lib/video/extractFrames";
import { extractAudio } from "../../../lib/video/extractAudio";
import { transcribeAudio } from "../../../lib/video/transcribeAudio";
import { analyzeVideoFrames, fallbackVideoAnalysis } from "../../../lib/video/analyzeVideoFrames";
import type {
  AiResult,
  DiagnosisAccuracy,
  InputData,
  Metadata,
} from "../../../types/superviral";

export const runtime = "nodejs";
export const maxDuration = 120;

type StepResult = {
  success: boolean;
  message: string;
  error?: string;
  frameCount?: number;
  transcriptLength?: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function basicAccuracy(note: string): DiagnosisAccuracy {
  return {
    level: "basic",
    usedData: ["metadata", "aiInference"],
    videoAnalysisUsed: false,
    soundAnalysisUsed: false,
    note,
  };
}

export async function POST(request: NextRequest) {
  let workdir = "";
  const steps: Record<string, StepResult> = {};

  try {
    const body = (await request.json()) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const platform = detectPlatform(url);
    const metadata: Metadata = {
      title: "Debug video analysis",
      description: url,
      thumbnailUrl: "",
      hashtags: [],
    };
    const aiInference = fallbackInference({
      platform,
      title: metadata.title,
      description: metadata.description,
      hashtags: [],
      manualFallbackUsed: false,
    });
    const inputData: InputData = {
      contentUrl: url,
      platform,
      metadataStatus: "manual",
      metadata,
      manualFallback: {
        used: false,
        titleOrHook: "",
        summary: "",
        hashtags: [],
      },
      aiInference,
      performance: {
        views: null,
        comments: null,
        hoursAfterUpload: null,
        likes: null,
        saves: null,
        shares: null,
      },
    };
    const metadataResult: AiResult = fallbackAnalyze(inputData);

    steps.platformDetected = {
      success: platform === "youtube_shorts",
      message:
        platform === "youtube_shorts"
          ? "youtube_shorts detected"
          : `${platform} detected`,
    };

    const shouldRun = shouldRunVideoAnalysis(inputData);
    const [ytdlpReady, ffmpegReady] = await Promise.all([
      canRunCommand(getYtDlpPath(), ["--version"]),
      canRunCommand(getFfmpegPath(), ["-version"]),
    ]);
    const toolReasons = [
      ...(!ytdlpReady ? [commandInstallGuide("yt-dlp")] : []),
      ...(!ffmpegReady ? [commandInstallGuide("ffmpeg")] : []),
    ];
    steps.videoAnalysisEnabled = {
      success: shouldRun.shouldRun && ytdlpReady && ffmpegReady,
      message: shouldRun.shouldRun && ytdlpReady && ffmpegReady
        ? "ENABLE_VIDEO_ANALYSIS=true"
        : [...shouldRun.reasons, ...toolReasons].join(", "),
    };

    if (!url || platform !== "youtube_shorts" || !shouldRun.shouldRun || !ytdlpReady || !ffmpegReady) {
      const diagnosisAccuracy = basicAccuracy(
        "영상 분석 파이프라인이 실행 조건 확인 단계에서 중단되었습니다.",
      );
      return NextResponse.json({
        success: false,
        url,
        platform,
        steps: {
          ...steps,
          download: { success: false, message: "skipped because video analysis is disabled" },
          frameExtraction: { success: false, message: "skipped because download failed" },
          audioExtraction: { success: false, message: "skipped because download failed" },
          transcription: { success: false, message: "skipped because audio extraction failed" },
          visionAnalysis: { success: false, message: "skipped because no frames available" },
          cleanup: { success: true, message: "no temp files created" },
        },
        diagnosisAccuracy,
      });
    }

    workdir = await createTempWorkdir();

    let downloaded: Awaited<ReturnType<typeof downloadYoutubeShort>> | null = null;
    try {
      downloaded = await downloadYoutubeShort(url, workdir);
      steps.download = { success: true, message: "yt-dlp download success" };
    } catch (error) {
      steps.download = {
        success: false,
        message: "yt-dlp failed",
        error: errorMessage(error),
      };
    }

    let framePaths: string[] = [];
    if (downloaded) {
      try {
        framePaths = await extractFrames(downloaded.videoPath, workdir, downloaded.durationSeconds);
        steps.frameExtraction = {
          success: framePaths.length > 0,
          message: "frame extraction finished",
          frameCount: framePaths.length,
        };
      } catch (error) {
        steps.frameExtraction = {
          success: false,
          message: "ffmpeg frame extraction failed",
          error: errorMessage(error),
        };
      }
    } else {
      steps.frameExtraction = { success: false, message: "skipped because download failed" };
    }

    let audioPath = "";
    if (downloaded) {
      try {
        audioPath = await extractAudio(downloaded.videoPath, workdir);
        steps.audioExtraction = { success: true, message: "audio extraction success" };
      } catch (error) {
        steps.audioExtraction = {
          success: false,
          message: "ffmpeg audio extraction failed",
          error: errorMessage(error),
        };
      }
    } else {
      steps.audioExtraction = { success: false, message: "skipped because download failed" };
    }

    let transcript = "";
    if (audioPath) {
      try {
        transcript = await transcribeAudio(audioPath);
        steps.transcription = {
          success: Boolean(transcript.trim()),
          message: "transcription finished",
          transcriptLength: transcript.length,
        };
      } catch (error) {
        steps.transcription = {
          success: false,
          message: "transcription failed",
          error: errorMessage(error),
        };
      }
    } else {
      steps.transcription = {
        success: false,
        message: "skipped because audio extraction failed",
      };
    }

    let videoAnalysisResult = fallbackVideoAnalysis({
      metadata,
      vcareResult: metadataResult,
      videoAnalysisUsed: framePaths.length > 0,
      audioAnalysisUsed: Boolean(transcript.trim()),
      transcriptUsed: Boolean(transcript.trim()),
      transcript,
    });
    if (framePaths.length > 0 || transcript.trim()) {
      try {
        videoAnalysisResult = await analyzeVideoFrames({
          metadata,
          thumbnailUrl: "",
          durationSeconds: downloaded?.durationSeconds,
          framePaths,
          audioPath,
          transcript,
          vcareResult: metadataResult,
          audioAnalysisUsed: Boolean(transcript.trim()),
        });
        steps.visionAnalysis = { success: true, message: "Gemini multimodal analysis success" };
      } catch (error) {
        videoAnalysisResult = fallbackVideoAnalysis({
          metadata,
          vcareResult: metadataResult,
          videoAnalysisUsed: false,
          audioAnalysisUsed: false,
          transcriptUsed: false,
        });
        steps.visionAnalysis = {
          success: false,
          message: "Gemini multimodal analysis failed",
          error: errorMessage(error),
        };
      }
    } else {
      steps.visionAnalysis = {
        success: false,
        message: "skipped because no frames or transcript available",
      };
    }

    const merged = mergeAnalysisResults(metadataResult, videoAnalysisResult);
    return NextResponse.json({
      success:
        Boolean(videoAnalysisResult.videoAnalysisUsed) ||
        Boolean(videoAnalysisResult.audioAnalysisUsed),
      url,
      platform,
      steps: {
        ...steps,
        cleanup: { success: true, message: "temp files cleaned" },
      },
      diagnosisAccuracy: merged.diagnosisAccuracy,
      videoAnalysisResult,
    });
  } finally {
    if (workdir) {
      await cleanupTempFiles(workdir);
    }
  }
}
