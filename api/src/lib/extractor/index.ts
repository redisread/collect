import { fetchPublicFeed } from "../rss/public-fetch";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  author?: string;
  image?: string;
}

export interface ExtractorError {
  message: string;
  code: "TIMEOUT" | "FETCH_ERROR" | "PARSE_ERROR" | "UNKNOWN";
}

// 提取超时时间（毫秒）
const EXTRACTION_TIMEOUT = 30000;

/**
 * 从 URL 提取文章内容
 * @param url - 文章链接
 * @returns 提取的内容或错误
 */
export async function extractArticle(url: string): Promise<ExtractedContent> {
  // 创建超时 Promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("提取超时"));
    }, EXTRACTION_TIMEOUT);
  });

  try {
    // 竞争：提取 vs 超时
    const result = await Promise.race([
      fetchAndExtract(url),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    // 分类错误
    if (error instanceof Error) {
      if (error.message === "提取超时") {
        throw {
          message: "提取文章超时，请稍后重试",
          code: "TIMEOUT",
        } as ExtractorError;
      }
      if (error.message.includes("fetch") || error.message.includes("network")) {
        throw {
          message: `获取文章失败: ${error.message}`,
          code: "FETCH_ERROR",
        } as ExtractorError;
      }
      if (error.message.includes("parse") || error.message.includes("extract")) {
        throw {
          message: `解析文章失败: ${error.message}`,
          code: "PARSE_ERROR",
        } as ExtractorError;
      }
    }

    throw {
      message: error instanceof Error ? error.message : "未知错误",
      code: "UNKNOWN",
    } as ExtractorError;
  }
}

/**
 * 获取并提取文章内容
 */
async function fetchAndExtract(url: string): Promise<ExtractedContent> {
  // 获取页面 HTML
  const response = await fetchPublicFeed(url, {
    signal: AbortSignal.timeout(EXTRACTION_TIMEOUT),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CollectBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();

  // 使用 linkedom 解析 HTML
  const { document } = parseHTML(html);

  // 使用 Readability 提取正文
  const reader = new Readability(document as Document, {
    // Readability 选项
    charThreshold: 100, // 最小字符阈值
  });

  const article = reader.parse();

  if (!article) {
    throw new Error("无法提取文章内容");
  }

  // 提取第一张图片
  const image = extractFirstImage(article.content || "");

  return {
    title: article.title || "",
    content: article.content || "",
    excerpt: article.excerpt || "",
    author: article.byline || undefined,
    image: image || undefined,
  };
}

/**
 * 从 HTML 内容中提取第一张图片
 */
function extractFirstImage(html: string): string | null {
  const { document } = parseHTML(html);
  const img = document.querySelector("img");
  return img?.getAttribute("src") || null;
}

/**
 * 检查 URL 是否可提取
 * @param url - 待检查的 URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
