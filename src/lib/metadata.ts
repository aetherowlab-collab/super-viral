import * as cheerio from "cheerio";
import type { ExtractMetadataApiResponse, Metadata, Platform } from "../types/superviral";
import { detectPlatform } from "./platform";

const REQUEST_TIMEOUT_MS = 9000;
const HTML_MAX_CHARS = 1_500_000;

function normalizeUrl(inputUrl: string): URL | null {
  try {
    const withProtocol = /^https?:\/\//i.test(inputUrl)
      ? inputUrl
      : `https://${inputUrl}`;
    const parsed = new URL(withProtocol);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function metaContent($: cheerio.CheerioAPI, selector: string): string {
  return ($(selector).attr("content") ?? "").trim();
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1))));
}

function getFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "요청 시간이 초과되었습니다. 플랫폼에서 응답을 늦게 주거나 차단했을 수 있습니다.";
  }

  if (error instanceof TypeError) {
    return "서버 요청에 실패했습니다. URL 접근이 차단되었거나 네트워크 연결에 문제가 있을 수 있습니다.";
  }

  return "메타데이터를 가져오지 못했습니다.";
}

function getStatusErrorMessage(status: number): string {
  if (status === 403) {
    return "403 접근 거부가 발생했습니다. 플랫폼에서 자동 접근을 제한했을 가능성이 높습니다.";
  }

  if (status === 404) {
    return "404 페이지를 찾을 수 없습니다. 링크가 삭제되었거나 공개 접근이 불가능할 수 있습니다.";
  }

  if (status >= 500) {
    return `원본 사이트 서버 오류(${status})로 메타데이터를 가져오지 못했습니다.`;
  }

  return `원본 사이트가 ${status} 상태로 응답했습니다. 공개 메타데이터 접근이 제한되었을 수 있습니다.`;
}

async function fetchYouTubeOEmbed(url: string): Promise<Metadata | null> {
  const oEmbedUrl = new URL("https://www.youtube.com/oembed");
  oEmbedUrl.searchParams.set("url", url);
  oEmbedUrl.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(oEmbedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        accept: "application/json,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };

    return {
      title: data.title ?? "",
      description: data.author_name ? `YouTube by ${data.author_name}` : "",
      thumbnailUrl: data.thumbnail_url ?? "",
      hashtags: extractHashtags(data.title ?? ""),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function extractMetadata(
  inputUrl: string,
  explicitPlatform?: Platform,
): Promise<ExtractMetadataApiResponse> {
  const parsedUrl = normalizeUrl(inputUrl);
  const platform = explicitPlatform ?? detectPlatform(inputUrl);

  if (platform === "instagram" || platform === "tiktok") {
    return {
      success: false,
      status: "manual_required",
      platform,
      error: "이 플랫폼은 외부 미리보기 정보가 제한되어 있습니다.",
      requiresManualInput: true,
    };
  }

  if (platform === "unknown") {
    return {
      success: false,
      status: "manual_required",
      platform,
      requiresManualInput: true,
    };
  }

  if (!parsedUrl) {
    return {
      success: false,
      status: "failed",
      platform,
      error: "올바른 http 또는 https URL을 입력해주세요.",
      requiresManualInput: true,
    };
  }

  const youtubeOEmbed = await fetchYouTubeOEmbed(parsedUrl.toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      if (youtubeOEmbed?.title || youtubeOEmbed?.thumbnailUrl) {
        return {
          success: true,
          status: "partial",
          platform,
          ...youtubeOEmbed,
          hashtags: extractHashtags(youtubeOEmbed.title),
        };
      }

      return {
        success: false,
        status: "failed",
        platform,
        error: getStatusErrorMessage(response.status),
        requiresManualInput: true,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        success: false,
        status: "failed",
        platform,
        error: `HTML 문서가 아닌 콘텐츠(${contentType || "알 수 없음"})가 반환되었습니다.`,
        requiresManualInput: true,
      };
    }

    const html = (await response.text()).slice(0, HTML_MAX_CHARS);
    const $ = cheerio.load(html);

    const rawMeta = {
      ogTitle: metaContent($, 'meta[property="og:title"]'),
      ogDescription: metaContent($, 'meta[property="og:description"]'),
      ogImage: metaContent($, 'meta[property="og:image"]'),
      twitterTitle: metaContent($, 'meta[name="twitter:title"]'),
      twitterDescription: metaContent($, 'meta[name="twitter:description"]'),
      twitterImage: metaContent($, 'meta[name="twitter:image"]'),
    };

    const fallbackTitle = $("title").first().text().trim();
    const fallbackDescription = metaContent($, 'meta[name="description"]');
    const title =
      rawMeta.ogTitle ||
      rawMeta.twitterTitle ||
      youtubeOEmbed?.title ||
      fallbackTitle;
    const description =
      rawMeta.ogDescription ||
      rawMeta.twitterDescription ||
      fallbackDescription ||
      youtubeOEmbed?.description ||
      "";
    const thumbnailUrl =
      rawMeta.ogImage || rawMeta.twitterImage || youtubeOEmbed?.thumbnailUrl || "";
    const hashtags = extractHashtags(`${title} ${description}`);
    const hasCoreMetadata = Boolean(title || description || thumbnailUrl);
    const hasStrongMetadata = Boolean(title && (description || thumbnailUrl));

    if (!hasCoreMetadata) {
      return {
        success: false,
        status: "failed",
        platform,
        error: "공개 meta tag에서 제목, 설명, 썸네일을 찾지 못했습니다.",
        requiresManualInput: true,
      };
    }

    return {
      success: true,
      status: hasStrongMetadata ? "success" : "partial",
      platform,
      title,
      description,
      thumbnailUrl,
      hashtags,
    };
  } catch (error) {
    if (youtubeOEmbed?.title || youtubeOEmbed?.thumbnailUrl) {
      return {
        success: true,
        status: "partial",
        platform,
        ...youtubeOEmbed,
        hashtags: extractHashtags(youtubeOEmbed.title),
      };
    }

    return {
      success: false,
      status: "failed",
      platform,
      error: getFetchErrorMessage(error),
      requiresManualInput: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
