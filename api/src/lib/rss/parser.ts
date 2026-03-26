import Parser from "rss-parser";

/** 统一的 RSS 文章格式 */
export interface ParsedArticle {
  title: string;
  url: string;
  content: string;
  summary: string;
  author: string;
  imageUrl: string | null;
  publishedAt: string | null;
  guid: string;
}

/** 统一的 RSS 订阅源信息 */
export interface ParsedFeed {
  title: string;
  description: string;
  siteUrl: string;
  faviconUrl: string | null;
  articles: ParsedArticle[];
}

// 创建解析器实例，支持自定义字段
const rssParser = new Parser({
  customFields: {
    feed: ["subtitle", "icon"],
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail"],
      ["enclosure", "enclosure"],
    ],
  },
  timeout: 10000,
});

/** 从 HTML 中提取纯文本摘要 */
function extractSummary(html: string, maxLength = 150): string {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, "") + "…";
}

/** 从 HTML 中提取第一张图片 URL */
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/** 从 RSS/Atom/JSON Feed XML 解析订阅源数据 */
export async function parseFeedFromXML(xmlText: string): Promise<ParsedFeed> {
  const feed = await rssParser.parseString(xmlText);
  return normalizeFeed(feed);
}

/** 从 URL 或 XML 解析订阅源数据 */
export async function parseFeed(feedUrl: string, xmlText?: string): Promise<ParsedFeed> {
  const feed = xmlText
    ? await rssParser.parseString(xmlText)
    : await rssParser.parseURL(feedUrl);
  return normalizeFeed(feed);
}

/** 标准化解析后的 Feed 数据 */
function normalizeFeed(feed: any): ParsedFeed {
  const articles: ParsedArticle[] = (feed.items ?? []).map((item: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyItem = item as any;
    const rawContent =
      anyItem.contentEncoded ||
      item.content ||
      item.summary ||
      "";

    const imageUrl: string | null =
      anyItem.mediaContent?.url ||
      anyItem.mediaThumbnail?.url ||
      anyItem.enclosure?.url ||
      extractFirstImage(rawContent) ||
      null;

    return {
      title: item.title ?? "(无标题)",
      url: item.link ?? item.guid ?? "",
      content: rawContent,
      summary: item.summary ? extractSummary(item.summary) : extractSummary(rawContent),
      author: anyItem.creator || anyItem.author || "",
      imageUrl,
      publishedAt: item.isoDate || item.pubDate || null,
      guid: item.guid || item.link || item.title || "",
    };
  });

  return {
    title: feed.title ?? "未知订阅源",
    description: feed.description ?? "",
    siteUrl: feed.link ?? "",
    faviconUrl: null,
    articles,
  };
}

/** 尝试从网站 URL 发现 RSS/Atom Feed 地址 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": "Folio RSS Reader/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    const patterns = [
      /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i,
      /<link[^>]+type=["']application\/atom\+xml["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/atom\+xml["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const href = match[1];
        try {
          return new URL(href, siteUrl).toString();
        } catch {
          return href;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
