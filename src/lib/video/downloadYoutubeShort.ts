import path from "path";
import {
  assertFileSize,
  getYtDlpPath,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  runCommand,
} from "./process";

export type DownloadedVideo = {
  videoPath: string;
  durationSeconds: number;
};

export async function downloadYoutubeShort(url: string, workdir: string) {
  const ytdlp = getYtDlpPath();

  const outputTemplate = path.join(workdir, "source.%(ext)s");
  const videoPath = path.join(workdir, "source.mp4");

  await runCommand(
    ytdlp,
    [
      "--no-playlist",
      "--no-part",
      "--no-mtime",
      "--max-filesize",
      String(MAX_VIDEO_BYTES),
      "--match-filter",
      `duration <= ${MAX_VIDEO_SECONDS}`,
      "-f",
      "mp4/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate,
      url,
    ],
    45_000,
  );

  await assertFileSize(videoPath, MAX_VIDEO_BYTES);

  const durationResult = await runCommand(
    ytdlp,
    ["--no-playlist", "--print", "%(duration)s", url],
    15_000,
  );
  const durationSeconds = Number(durationResult.stdout.trim()) || 0;
  if (durationSeconds > MAX_VIDEO_SECONDS) {
    throw new Error("Video is longer than allowed.");
  }

  return { videoPath, durationSeconds } satisfies DownloadedVideo;
}
