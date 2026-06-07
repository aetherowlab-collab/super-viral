import path from "path";
import { getFfmpegPath, listJpgFrames, runCommand } from "./process";

function buildFrameTimestamps(durationSeconds?: number) {
  const duration = Math.max(0, Math.floor(durationSeconds ?? 0));
  const timestamps = new Set<number>([0, 1, 2, 3]);

  for (let second = 4; second <= duration; second += 2) {
    timestamps.add(second);
  }

  if (duration > 0) {
    timestamps.add(Math.max(0, duration - 1));
  }

  return [...timestamps]
    .filter((second) => second <= Math.max(duration, 3))
    .sort((a, b) => a - b)
    .slice(0, 12);
}

export async function extractFrames(videoPath: string, workdir: string, durationSeconds?: number) {
  const ffmpeg = getFfmpegPath();
  const timestamps = buildFrameTimestamps(durationSeconds);

  await Promise.all(
    timestamps.map((second, index) =>
      runCommand(
        ffmpeg,
        [
          "-y",
          "-ss",
          String(second),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-vf",
          "scale=512:-1",
          path.join(workdir, `frame_${String(index + 1).padStart(2, "0")}.jpg`),
        ],
        20_000,
      ),
    ),
  );

  return listJpgFrames(workdir);
}
