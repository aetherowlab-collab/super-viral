import { readFile } from "fs/promises";

export async function transcribeAudio(audioPath: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "";
  }

  const bytes = await readFile(audioPath);
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "audio.wav");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error("Transcription failed.");
  }

  const data = (await response.json()) as { text?: string };
  return data.text ?? "";
}
