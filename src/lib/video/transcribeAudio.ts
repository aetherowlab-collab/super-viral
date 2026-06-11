import { fileToInlineData, generateGeminiContent } from "../gemini";

export async function transcribeAudio(audioPath: string) {
  const audioPart = await fileToInlineData(audioPath, "audio/wav");
  const transcript = await generateGeminiContent({
    responseMimeType: "text/plain",
    temperature: 0.1,
    parts: [
      {
        text:
          "이 오디오를 한국어로 정확히 전사해줘. 말소리가 없으면 '음성 대사 없음'이라고만 답해. 배경음악이나 효과음이 들리면 마지막 줄에 [사운드 메모: ...] 형식으로 짧게 적어.",
      },
      audioPart,
    ],
  });
  return transcript.trim();
}
