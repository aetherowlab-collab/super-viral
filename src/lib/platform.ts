import type { Platform } from "../types/superviral";

export function detectPlatform(inputUrl: string): Platform {
  const lowerUrl = inputUrl.toLowerCase();

  if (lowerUrl.includes("youtube.com/shorts") || lowerUrl.includes("youtu.be")) {
    return "youtube_shorts";
  }

  if (lowerUrl.includes("instagram.com/reel") || lowerUrl.includes("instagram.com")) {
    return "instagram";
  }

  if (lowerUrl.includes("tiktok.com")) {
    return "tiktok";
  }

  return "unknown";
}

export function isValidHttpUrl(inputUrl: string) {
  try {
    const normalized = /^https?:\/\//i.test(inputUrl)
      ? inputUrl
      : `https://${inputUrl}`;
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
