import { NextResponse } from "next/server";
import {
  canRunCommand,
  commandInstallGuide,
  getFfmpegPath,
  getYtDlpPath,
  isVideoAnalysisEnvEnabled,
  runCommand,
  tempDirWritable,
} from "../../../lib/video/process";
import { getGeminiModel } from "../../../lib/gemini";

export const runtime = "nodejs";

async function getVersion(commandPath: string, args: string[]) {
  try {
    const result = await runCommand(commandPath, args, 8_000);
    return {
      version: (result.stdout || result.stderr).split("\n")[0]?.trim() ?? "",
      error: "",
    };
  } catch (error) {
    return {
      version: "",
      error: error instanceof Error ? error.message : "version command failed",
    };
  }
}

export async function GET() {
  const ytdlpPath = getYtDlpPath();
  const ffmpegPath = getFfmpegPath();
  const [ytdlpExecutable, ffmpegExecutable, writable, ytdlpVersion, ffmpegVersion] =
    await Promise.all([
      canRunCommand(ytdlpPath, ["--version"]),
      canRunCommand(ffmpegPath, ["-version"]),
      tempDirWritable(),
      getVersion(ytdlpPath, ["--version"]),
      getVersion(ffmpegPath, ["-version"]),
    ]);

  const ytdlpInstallGuide = ytdlpExecutable ? "" : commandInstallGuide("yt-dlp");
  const ffmpegInstallGuide = ffmpegExecutable ? "" : commandInstallGuide("ffmpeg");

  return NextResponse.json({
    enableVideoAnalysisRaw: process.env.ENABLE_VIDEO_ANALYSIS ?? "",
    enableVideoAnalysisParsed: isVideoAnalysisEnvEnabled(),
    openaiApiKeyExists: Boolean(process.env.OPENAI_API_KEY?.trim()),
    geminiApiKeyExists: Boolean(process.env.GEMINI_API_KEY?.trim()),
    geminiModel: getGeminiModel(),
    ytdlpPath,
    ytdlpExists: ytdlpExecutable,
    ytdlpExecutable,
    ytdlpVersion: ytdlpVersion.version,
    ytdlpError: ytdlpVersion.error,
    ytdlpInstallGuide,
    ffmpegPath,
    ffmpegExists: ffmpegExecutable,
    ffmpegExecutable,
    ffmpegVersion: ffmpegVersion.version,
    ffmpegError: ffmpegVersion.error,
    ffmpegInstallGuide,
    tempDirWritable: writable,
    nodeEnv: process.env.NODE_ENV ?? "",
  });
}
