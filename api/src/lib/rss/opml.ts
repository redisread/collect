/** OPML 导入/导出工具 */
import { parser } from "sax";

export class OpmlParseError extends Error {}

export interface OpmlFeed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folderName?: string;
}

/** 解析 OPML XML 文本，返回订阅源列表 */
export function parseOpml(opmlXml: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];
  if (new TextEncoder().encode(opmlXml).length > 2 * 1024 * 1024) throw new OpmlParseError("OPML 文件不能超过 2 MB");
  const stack: { tag: string; folder?: string }[] = [];
  let hasBody = false;
  const xmlOptions = { position: true, strictEntities: true };
  const xml = parser(true, xmlOptions);
  xml.onerror = () => { throw new OpmlParseError("OPML XML 格式无效，请检查文件是否完整"); };
  xml.ondoctype = () => { throw new OpmlParseError("不支持包含 DTD 的 OPML 文件"); };
  xml.onsgmldeclaration = () => { throw new OpmlParseError("OPML 包含不支持的声明"); };
  xml.onopentag = node => {
    const tag = node.name.toLowerCase();
    if (!stack.length && tag !== "opml") throw new OpmlParseError("文件根节点必须为 OPML");
    if (stack.filter(item => item.tag === "outline").length >= 32) throw new OpmlParseError("文件夹层级过深，最多支持 32 层");
    if (tag === "body" && stack.length === 1) hasBody = true;
    let folder: string | undefined;
    if (tag === "outline" && stack.some(item => item.tag === "body")) {
      const attributes = Object.fromEntries(Object.entries(node.attributes).map(([key, value]) => [key.toLowerCase(), String(value)]));
      const title = (attributes.text || attributes.title || "").trim();
      if ("xmlurl" in attributes || attributes.type?.toLowerCase() === "rss") {
        const folderName = stack.map(item => item.folder).filter(Boolean).join(" / ");
        const xmlUrl = (attributes.xmlurl || "").trim();
        if (xmlUrl.length > 2048 || title.length > 500 || folderName.length > 1000 || (attributes.htmlurl?.length ?? 0) > 2048) throw new OpmlParseError("订阅地址或名称过长");
        feeds.push({ xmlUrl, title: title || xmlUrl || "未命名订阅", htmlUrl: attributes.htmlurl, folderName: folderName || undefined });
        if (feeds.length > 1000) throw new OpmlParseError("每次最多导入 1000 个订阅源");
      } else { folder = title; }
    }
    stack.push({ tag, folder });
  };
  xml.onclosetag = () => { stack.pop(); };
  xml.write(opmlXml.trim()).close();
  if (!hasBody) throw new OpmlParseError("OPML 缺少 body 节点");
  return feeds;
}

/** 生成 OPML XML 字符串 */
export function generateOpml(
  feeds: Array<{ title: string; feedUrl: string; url: string; folderName?: string }>
): string {
  const folderMap = new Map<string, typeof feeds>();
  const rootFeeds: typeof feeds = [];

  for (const feed of feeds) {
    if (feed.folderName) {
      const existing = folderMap.get(feed.folderName) ?? [];
      existing.push(feed);
      folderMap.set(feed.folderName, existing);
    } else {
      rootFeeds.push(feed);
    }
  }

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const feedToOutline = (feed: (typeof feeds)[0]) =>
    `    <outline text="${escape(feed.title)}" xmlUrl="${escape(feed.feedUrl)}" htmlUrl="${escape(feed.url)}" type="rss"/>`;

  const folderOutlines = Array.from(folderMap.entries())
    .map(
      ([name, folderFeeds]) =>
        `  <outline text="${escape(name)}">\n${folderFeeds.map(feedToOutline).join("\n")}\n  </outline>`
    )
    .join("\n");

  const rootOutlines = rootFeeds.map(feedToOutline).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Folio RSS 订阅列表</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${folderOutlines}
${rootOutlines}
  </body>
</opml>`;
}
