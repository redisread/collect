// HTML 净化工具，防止 XSS 攻击

/** 允许的 HTML 标签（保留文章内容所需标签） */
const ALLOWED_TAGS = new Set([
	"a", "b", "blockquote", "br", "caption", "cite", "code",
	"col", "colgroup", "dd", "del", "details", "div", "dl", "dt",
	"em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
	"hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre",
	"q", "s", "section", "small", "span", "strong", "sub", "summary",
	"sup", "table", "tbody", "td", "th", "thead", "time", "tr", "u", "ul",
]);

/** 允许的 HTML 属性 */
const ALLOWED_ATTRS = new Set([
	"href", "src", "alt", "title", "width", "height",
	"class", "id", "datetime", "cite", "lang", "dir", "colspan", "rowspan",
]);

/** Parse before filtering so encoded protocols and malformed attributes cannot bypass checks. */
export function sanitizeHtml(html: string): string {
	if (!html || typeof DOMParser === "undefined") return "";
	const document = new DOMParser().parseFromString(html, "text/html");
	document.querySelectorAll("script,style,iframe,object,embed,form,svg,math,template").forEach(node => node.remove());
	for (const element of Array.from(document.body.querySelectorAll("*"))) {
		if (!ALLOWED_TAGS.has(element.tagName.toLowerCase())) {
			element.replaceWith(...element.childNodes);
			continue;
		}
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (!ALLOWED_ATTRS.has(name)) { element.removeAttribute(name); continue; }
			if (["href", "src", "cite"].includes(name)) {
				const value = attribute.value.replace(/[\u0000-\u0020]/g, "");
				if (!/^(https?:|mailto:|\/|#|\.\/|\.\.\/)/i.test(value)) element.removeAttribute(name);
			}
		}
	}
	return document.body.innerHTML;
}

/** 转义 HTML 特殊字符 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
