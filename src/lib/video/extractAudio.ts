import path from "path";
import { assertFileSize, getFfmpegPath, MAX_AUDIO_BYTES, runCommand } from "./process";

export async function extractAudio(videoPath: string, workdir: string) {
  const ffmpeg = getFfmpegPath();

  const audioPath = path.join(workdir, "audio.wav");
  await runCommand(
    ffmpeg,
    [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-t",
      "90",
      audioPath,
    ],
    30_000,
  );
  await assertFileSize(audioPath, MAX_AUDIO_BYTES);
  return audioPath;
}
