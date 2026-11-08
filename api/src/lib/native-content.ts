import { load } from "cheerio";

/** Restrict feed HTML to passive reading content before sending it to WebKit. */
export function nativeContent(html: string, baseURL: string) {
  const $ = load(html, {}, false);
  const allowed = new Set("p div span article section h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code strong b em i u s del a img figure figcaption table thead tbody tr th td br hr sup sub details summary".split(" "));
  const images: string[] = [];
  $("script,style,iframe,object,embed,form,input,button,video,audio,source,link,meta,base,svg,math").remove();
  $("*").each((_, element) => {
    if (!("tagName" in element)) return;
    if (!allowed.has(element.tagName)) { $(element).replaceWith($(element).contents()); return; }
    const original = { ...element.attribs };
    for (const key of Object.keys(original)) $(element).removeAttr(key);
    if (element.tagName === "a" && original.href) {
      try {
        const url = new URL(original.href, baseURL);
        if (["https:", "http:"].includes(url.protocol)) $(element).attr("href", url.href);
      } catch { /* Invalid links remain readable text. */ }
    }
    if (element.tagName === "img") {
      try {
        const source = original["data-src"] || original.src || "";
        if (/^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(source)) {
          $(element).attr("src", source).attr("alt", original.alt || "");
          return;
        }
        const url = new URL(source, baseURL);
        if (url.protocol === "http:") url.protocol = "https:";
        if (url.protocol !== "https:" || !source) { $(element).remove(); return; }
        images.push(url.href);
        $(element).attr("src", url.href).attr("alt", original.alt || "");
      } catch { $(element).remove(); }
    }
  });
  return { content: $.html(), images: [...new Set(images)] };
}
