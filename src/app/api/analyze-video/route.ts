import { NextRequest, NextResponse } from "next/server";
import { analyzeVideoFrames, fallbackVideoAnalysis } from "../../../lib/video/analyzeVideoFrames";
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
import type {
  AiResult,
  InputData,
  VideoAnalysisApiResponse,
  VideoAnalysisResult,
} from "../../../types/superviral";

export const runtime = "nodejs";
export const maxDuration = 120;

let activeRequests = 0;
const MAX_ACTIVE_REQUESTS = 2;

export async function POST(request: NextRequest) {
  let workdir = "";
  const messages: string[] = [];
  let platform = "unknown";
  let videoDownloadSuccess = false;
  let frameExtractionSuccess = false;
  let audioExtractionSuccess = false;
  let transcriptionSuccess = false;
  let visionAnalysisSuccess = false;

  try {
    console.info("[SuperViral] analyzeVideoApiCalled =", true);
    const body = (await request.json()) as {
      inputData?: InputData;
      vcareResult?: AiResult;
    };
    const inputData = body.inputData;

    if (!inputData) {
      return NextResponse.json({ error: "inputData가 필요합니다." }, { status: 400 });
    }
    platform = inputData.platform;
    const shouldRun = shouldRunVideoAnalysis(inputData);
    console.info("[SuperViral] platform =", platform);
    console.info("[SuperViral] ENABLE_VIDEO_ANALYSIS =", process.env.ENABLE_VIDEO_ANALYSIS ?? "");
    console.info("[SuperViral] shouldRunVideoAnalysis =", shouldRun);

    if (inputData.platform !== "youtube_shorts") {
      console.info("[SuperViral] finalDiagnosisAccuracy =", body.vcareResult?.diagnosisAccuracy ?? null);
      return NextResponse.json({
        success: false,
        status: "skipped",
        platform: inputData.platform,
        enabled: false,
        messages: ["영상 분석은 1차 업그레이드에서 YouTube Shorts만 지원합니다."],
      } satisfies VideoAnalysisApiResponse);
    }

    if (!shouldRun.shouldRun) {
      const fallback = fallbackVideoAnalysis({
        metadata: inputData.metadata,
        vcareResult: body.vcareResult,
        videoAnalysisUsed: false,
        audioAnalysisUsed: false,
        transcriptUsed: false,
      });
      console.info("[SuperViral] downloadSuccess =", false);
      console.info("[SuperViral] frameExtractionSuccess =", false);
      console.info("[SuperViral] audioExtractionSuccess =", false);
      console.info("[SuperViral] transcriptionSuccess =", false);
      console.info("[SuperViral] visionAnalysisSuccess =", false);
      console.info("[SuperViral] finalDiagnosisAccuracy =", body.vcareResult?.diagnosisAccuracy ?? null);
      return NextResponse.json({
        success: false,
        status: "fallback_metadata",
        platform: inputData.platform,
        enabled: false,
        messages: ["메타데이터 기반 분석으로 계속 진행 중...", ...shouldRun.reasons],
        result: fallback,
      } satisfies VideoAnalysisApiResponse);
    }

    const [ytdlpReady, ffmpegReady] = await Promise.all([
      canRunCommand(getYtDlpPath(), ["--version"]),
      canRunCommand(getFfmpegPath(), ["-version"]),
    ]);
    if (!ytdlpReady || !ffmpegReady) {
      const fallback = fallbackVideoAnalysis({
        metadata: inputData.metadata,
        vcareResult: body.vcareResult,
        videoAnalysisUsed: false,
        audioAnalysisUsed: false,
        transcriptUsed: false,
      });
      const finalDiagnosisAccuracy = body.vcareResult
        ? mergeAnalysisResults(body.vcareResult, fallback).diagnosisAccuracy
        : null;
      console.info("[SuperViral] downloadSuccess =", false);
      console.info("[SuperViral] frameExtractionSuccess =", false);
      console.info("[SuperViral] audioExtractionSuccess =", false);
      console.info("[SuperViral] transcriptionSuccess =", false);
      console.info("[SuperViral] visionAnalysisSuccess =", false);
      console.info("[SuperViral] finalDiagnosisAccuracy =", finalDiagnosisAccuracy);
      return NextResponse.json({
        success: false,
        status: "fallback_metadata",
        platform: inputData.platform,
        enabled: true,
        messages: [
          "영상 분석 실행 도구를 확인하지 못했습니다. 메타데이터 기반 분석으로 계속 진행합니다.",
          ...(!ytdlpReady ? [commandInstallGuide("yt-dlp")] : []),
          ...(!ffmpegReady ? [commandInstallGuide("ffmpeg")] : []),
        ],
        result: fallback,
      } satisfies VideoAnalysisApiResponse);
    }

    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      console.info("[SuperViral] finalDiagnosisAccuracy =", body.vcareResult?.diagnosisAccuracy ?? null);
      return NextResponse.json({
        success: false,
        status: "fallback_metadata",
        platform: inputData.platform,
        enabled: true,
        messages: ["현재 영상 분석 요청이 많아 메타데이터 기반 분석으로 계속 진행합니다."],
      } satisfies VideoAnalysisApiResponse);
    }

    activeRequests += 1;
    workdir = await createTempWorkdir();

    messages.push("영상 다운로드 중...");
    let downloaded;
    try {
      downloaded = await downloadYoutubeShort(inputData.contentUrl, workdir);
      videoDownloadSuccess = true;
    } catch {
      const fallback = fallbackVideoAnalysis({
        metadata: inputData.metadata,
        vcareResult: body.vcareResult,
        videoAnalysisUsed: false,
        audioAnalysisUsed: false,
        transcriptUsed: false,
      });
      messages.push(
        "유튜브 영상을 가져오지 못했습니다. 비공개/연령제한/지역제한 영상일 수 있습니다. 메타데이터 기반 분석으로 계속 진행합니다.",
      );
      console.info("[SuperViral] downloadSuccess =", false);
      console.info("[SuperViral] frameExtractionSuccess =", false);
      console.info("[SuperViral] audioExtractionSuccess =", false);
      console.info("[SuperViral] transcriptionSuccess =", false);
      console.info("[SuperViral] visionAnalysisSuccess =", false);
      console.info("[SuperViral] finalDiagnosisAccuracy =", body.vcareResult?.diagnosisAccuracy ?? null);
      return NextResponse.json({
        success: false,
        status: "fallback_metadata",
        platform: inputData.platform,
        enabled: true,
        messages,
        result: fallback,
      } satisfies VideoAnalysisApiResponse);
    }

    messages.push("프레임 추출 중...");
    let framePaths: string[] = [];
    try {
      framePaths = await extractFrames(downloaded.videoPath, workdir, downloaded.durationSeconds);
      frameExtractionSuccess = framePaths.length > 0;
    } catch {
      messages.push("영상 프레임 처리 중 오류가 발생했습니다. 가능한 정보로 분석을 계속합니다.");
    }

    messages.push("오디오 추출 중...");
    let audioPath = "";
    let audioAnalysisUsed = false;
    try {
      audioPath = await extractAudio(downloaded.videoPath, workdir);
      audioAnalysisUsed = true;
      audioExtractionSuccess = true;
    } catch {
      messages.push("오디오 분석은 실패했지만 영상 분석은 계속 진행합니다.");
    }

    messages.push("음성 전사 중...");
    let transcript = "";
    if (audioPath) {
      try {
        transcript = await transcribeAudio(audioPath);
        transcriptionSuccess = Boolean(transcript.trim());
      } catch {
        messages.push("오디오 전사는 실패했지만 영상 분석은 계속 진행합니다.");
      }
    }

    messages.push("AI 분석 중...");
    let result: VideoAnalysisResult;
    try {
      result = await analyzeVideoFrames({
        metadata: inputData.metadata,
        thumbnailUrl: inputData.metadata.thumbnailUrl,
        durationSeconds: downloaded.durationSeconds,
        framePaths,
        transcript,
        vcareResult: body.vcareResult,
        audioAnalysisUsed: transcriptionSuccess,
      });
      visionAnalysisSuccess = result.analysisMode !== "metadata_fallback";
    } catch (error) {
      const fallback = fallbackVideoAnalysis({
        metadata: inputData.metadata,
        vcareResult: body.vcareResult,
        videoAnalysisUsed: false,
        audioAnalysisUsed: false,
        transcriptUsed: false,
      });
      messages.push(
        error instanceof Error
          ? `GPT Vision 분석 실패: ${error.message}`
          : "GPT Vision 분석 실패",
      );
      console.info("[SuperViral] downloadSuccess =", videoDownloadSuccess);
      console.info("[SuperViral] frameExtractionSuccess =", frameExtractionSuccess);
      console.info("[SuperViral] audioExtractionSuccess =", audioExtractionSuccess);
      console.info("[SuperViral] transcriptionSuccess =", transcriptionSuccess);
      console.info("[SuperViral] visionAnalysisSuccess =", false);
      console.info("[SuperViral] finalDiagnosisAccuracy =", body.vcareResult?.diagnosisAccuracy ?? null);
      return NextResponse.json({
        success: false,
        status: "fallback_metadata",
        platform: inputData.platform,
        enabled: true,
        messages,
        videoDurationSeconds: downloaded.durationSeconds,
        framesCount: framePaths.length,
        transcript,
        result: fallback,
      } satisfies VideoAnalysisApiResponse);
    }
    messages.push("결과 정리 중...");
    const finalDiagnosisAccuracy = body.vcareResult
      ? mergeAnalysisResults(body.vcareResult, result).diagnosisAccuracy
      : null;
    console.info("[SuperViral] downloadSuccess =", videoDownloadSuccess);
    console.info("[SuperViral] frameExtractionSuccess =", frameExtractionSuccess);
    console.info("[SuperViral] audioExtractionSuccess =", audioExtractionSuccess);
    console.info("[SuperViral] transcriptionSuccess =", transcriptionSuccess);
    console.info("[SuperViral] visionAnalysisSuccess =", visionAnalysisSuccess);
    console.info("[SuperViral] finalDiagnosisAccuracy =", finalDiagnosisAccuracy);

    return NextResponse.json({
      success: true,
      status: "success",
      platform: inputData.platform,
      enabled: true,
      messages,
      videoDurationSeconds: downloaded.durationSeconds,
      framesCount: framePaths.length,
      transcript,
      result,
    } satisfies VideoAnalysisApiResponse);
  } catch {
    messages.push("AI 분석 중 오류가 발생했습니다. 기존 메타데이터 기반 분석 결과를 표시합니다.");
    console.info("[SuperViral] platform =", platform);
    console.info("[SuperViral] downloadSuccess =", videoDownloadSuccess);
    console.info("[SuperViral] frameExtractionSuccess =", frameExtractionSuccess);
    console.info("[SuperViral] audioExtractionSuccess =", audioExtractionSuccess);
    console.info("[SuperViral] transcriptionSuccess =", transcriptionSuccess);
    console.info("[SuperViral] visionAnalysisSuccess =", visionAnalysisSuccess);
    console.info("[SuperViral] finalDiagnosisAccuracy =", null);
    return NextResponse.json({
      success: false,
      status: "failed",
      platform: "youtube_shorts",
      enabled: shouldRunVideoAnalysis({ platform: "youtube_shorts" }).shouldRun,
      messages,
    } satisfies VideoAnalysisApiResponse);
  } finally {
    if (workdir) {
      await cleanupTempFiles(workdir);
    }
    activeRequests = Math.max(0, activeRequests - 1);
  }
}
