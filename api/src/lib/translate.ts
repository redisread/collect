import { load, type CheerioAPI } from "cheerio/slim";

const BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,div,section,article";
const SKIP = "script,style,pre,code,kbd,samp,svg,math,textarea,img,picture,video,audio,source,[translate=no]";

export class TranslationError extends Error {
  readonly code: string;
  readonly upstreamStatus?: number;

  constructor(code: string, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function splitTranslationText(text: string, size = 1200): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < chars.length; offset += size) chunks.push(chars.slice(offset, offset + size).join(""));
  return chunks;
}

export async function googleTranslate(text: string, target: string, source: string, signal: AbortSignal, timeoutMs = 10_000) {
  const parts: string[] = [];
  let detectedLang = source;
  for (const chunk of splitTranslationText(text)) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", sl: source, tl: target, dt: "t", q: chunk }).toString();
    let translated = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        throw new TranslationError(
          response.status === 429 ? "google_rate_limited" : "google_http_error",
          response.status === 429 ? "Google 翻译请求过于频繁，请稍后重试" : "Google 翻译服务返回错误，请稍后重试",
          response.status,
        );
      }
      const data = await response.json() as unknown;
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new TranslationError("invalid_response", "翻译服务返回了无效结果，请重试");
      translated = data[0].map((item: unknown) => Array.isArray(item) && typeof item[0] === "string" ? item[0] : "").join("");
      if (typeof data[2] === "string") detectedLang = data[2];
      if (!translated.trim()) throw new TranslationError("empty_response", "翻译服务返回了空结果，请重试");
      break;
    }
    parts.push(translated);
  }
  return { translated: parts.join(""), detectedLang };
}

/** Use the original DOM as the template when a run is long or Google alters its markup. */
async function translateContentNodes(
  source: CheerioAPI,
  translate: (text: string) => Promise<{ translated: string; detectedLang: string }>,
): Promise<{ html: string; text: string; detectedLang: string }> {
  let detectedLang = "auto";
  for (const node of source.root().contents().toArray()) {
    if (node.type === "text" && /\p{L}/u.test(node.data)) {
      const result = await translate(node.data.trim());
      const leading = node.data.match(/^\s*/)?.[0] ?? "";
      const trailing = node.data.match(/\s*$/)?.[0] ?? "";
      // Assign text data so any markup returned by Google is escaped on serialization.
      node.data = leading + result.translated + trailing;
      detectedLang = result.detectedLang;
    } else if ("tagName" in node) {
      const contents = source(node).html() || "";
      if (!contents.trim()) continue;
      const result = await translateInlineHtml(contents, translate);
      source(node).html(result.html);
      detectedLang = result.detectedLang;
    }
  }
  return { html: source.html(), text: source.text(), detectedLang };
}

/** Long runs are split at DOM boundaries so a request can never cut through a tag. */
async function translateInlineHtml(
  html: string,
  translate: (text: string) => Promise<{ translated: string; detectedLang: string }>,
): Promise<{ html: string; text: string; detectedLang: string }> {
  const source = load(html, {}, false);
  if (!/\p{L}/u.test(source.text())) {
    return { html: source.html(), text: source.text(), detectedLang: "auto" };
  }
  if (Array.from(html).length > 1200) {
    return translateContentNodes(source, translate);
  }
  const result = await translate(html);
  const output = load(result.translated, {}, false);
  const sourceElements = source("*").toArray().filter(node => "tagName" in node);
  const outputElements = output("*").toArray().filter(node => "tagName" in node);
  if (sourceElements.length !== outputElements.length ||
      sourceElements.some((node, index) => node.tagName !== outputElements[index].tagName)) {
    return translateContentNodes(source, translate);
  }
  sourceElements.forEach((node, index) => {
    outputElements[index].attribs = { ...node.attribs };
  });
  return { html: output.html(), text: output.text(), detectedLang: result.detectedLang };
}

/** Translate complete inline runs, keeping sentence context and validating returned markup. */
export async function translateHtml(
  html: string,
  target: string,
  translate: (text: string) => Promise<{ translated: string; detectedLang: string }>,
  concurrency: 1 | 2 | 4 = 4,
) {
  const original = load(html, {}, false);
  original("script,style,iframe,object,embed,form").remove();
  type HtmlNode = ReturnType<CheerioAPI>[number];
  const jobs: string[] = [];
  const marker = "collect-" + crypto.randomUUID();

  function renderChildren(nodes: HtmlNode[]): { translated: string; bilingual: string } {
    const output = { translated: "", bilingual: "" };
    let run: HtmlNode[] = [];
    function flush() {
      if (!run.length) return;
      const source = run.map(node => original.html(node)).join("");
      if (run.some(node => /\p{L}/u.test(original(node).text()))) {
        const token = "<!--" + marker + "-" + jobs.length + "-->";
        jobs.push(source);
        output.translated += token;
        output.bilingual += source + '<span class="translation-text" lang="' + target + '" dir="auto">' + token + "</span>";
      } else {
        output.translated += source;
        output.bilingual += source;
      }
      run = [];
    }
    for (const node of nodes) {
      const element = original(node);
      if (element.is(SKIP)) {
        flush();
        const source = original.html(node);
        output.translated += source;
        output.bilingual += source;
      } else if (element.is(BLOCKS + ",ul,ol,table,tbody,thead,tr,figure,dl,dd,dt") || element.find(BLOCKS + "," + SKIP).length) {
        flush();
        const children = renderChildren(element.contents().toArray());
        output.translated += original.html(element.clone().html(children.translated));
        output.bilingual += original.html(element.clone().html(children.bilingual));
      } else {
        run.push(node);
      }
    }
    flush();
    return output;
  }

  const template = renderChildren(original.root().contents().toArray());
  if (!jobs.length) throw new TranslationError("empty_content", "未找到可翻译的文本");
  if (jobs.length > 600) throw new TranslationError("too_many_segments", "文章段落过多，暂时无法全文翻译");
  const results: { html: string; text: string; detectedLang: string }[] = new Array(jobs.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (index < jobs.length) {
      const i = index++;
      results[i] = await translateInlineHtml(jobs[i], translate);
    }
  }));
  const pattern = new RegExp("<!--" + marker + "-(\\d+)-->", "g");
  return {
    segments: jobs.map((source, i) => ({ original: load(source, {}, false).text(), translated: results[i].text })),
    translatedHtml: template.translated.replace(pattern, (_, i) => results[Number(i)].html),
    bilingualHtml: template.bilingual.replace(pattern, (_, i) => results[Number(i)].html),
    detectedLang: results.find(result => result.detectedLang !== "auto")?.detectedLang ?? "auto",
  };
}
