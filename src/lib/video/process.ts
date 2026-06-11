import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readdir, rm, stat } from "fs/promises";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { getGeminiApiKey } from "../gemini";

export const MAX_VIDEO_SECONDS = 90;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const DEFAULT_YTDLP_COMMAND = "yt-dlp";
export const DEFAULT_FFMPEG_COMMAND = "ffmpeg";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export function getYtDlpPath() {
  return process.env.YTDLP_PATH?.trim() || DEFAULT_YTDLP_COMMAND;
}

export function getFfmpegPath() {
  return process.env.FFMPEG_PATH?.trim() || DEFAULT_FFMPEG_COMMAND;
}

export function isVideoAnalysisEnvEnabled() {
  return process.env.ENABLE_VIDEO_ANALYSIS?.trim().toLowerCase() === "true";
}

export async function canRunCommand(command: string | undefined, args: string[]) {
  if (!command) return false;
  try {
    await runCommand(command, args, 8_000);
    return true;
  } catch {
    return false;
  }
}

export async function videoAnalysisEnabled() {
  return (
    isVideoAnalysisEnvEnabled() &&
    Boolean(getGeminiApiKey()) &&
    (await canRunCommand(getYtDlpPath(), ["--version"])) &&
    (await canRunCommand(getFfmpegPath(), ["-version"]))
  );
}

export function commandInstallGuide(command: "yt-dlp" | "ffmpeg") {
  if (command === "yt-dlp") {
    return "yt-dlp가 설치되어 있지 않습니다. macOS에서는 `brew install yt-dlp` 또는 `python3 -m pip install -U yt-dlp` 후 YTDLP_PATH를 설정하세요.";
  }

  return "ffmpeg가 설치되어 있지 않습니다. macOS에서는 `brew install ffmpeg` 후 FFMPEG_PATH를 설정하세요.";
}

export async function tempDirWritable() {
  const testPath = path.join(os.tmpdir(), `superviral-write-test-${randomUUID()}`);
  try {
    await writeFile(testPath, "ok");
    await unlink(testPath);
    return true;
  } catch {
    return false;
  }
}

export async function createTempWorkdir() {
  const dir = path.join(os.tmpdir(), `superviral-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupTempFiles(dir: string) {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    console.warn("Temporary video analysis files could not be removed.");
  }
}

export function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Command timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = (stderr || stdout).trim().slice(0, 600);
        reject(new Error(detail || `Command failed with exit code ${code}.`));
      }
    });
  });
}

export async function assertFileSize(filePath: string, maxBytes: number) {
  const info = await stat(filePath);
  if (info.size > maxBytes) {
    throw new Error("File is too large.");
  }
  return info.size;
}

export async function listJpgFrames(dir: string) {
  const files = await readdir(dir);
  return files
    .filter((file) => /^frame_\d+\.jpg$/.test(file))
    .sort()
    .map((file) => path.join(dir, file));
}
