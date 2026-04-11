import * as cheerio from "cheerio";

export interface FetchContentResult {
	content: string;
	title: string;
	excerpt: string;
}

/**
 * Fetch and extract content from a URL
 */
export async function fetchArticleContent(url: string): Promise<FetchContentResult> {
	// Validate URL
	const parsedUrl = new URL(url);
	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		throw new Error("Invalid URL protocol");
	}

	// Fetch the webpage
	const response = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (compatible; CollectRSS/1.0; +https://github.com/your-repo)",
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	// Remove unwanted elements
	$("script, style, noscript, iframe, form, nav, header, footer, aside, .advertisement, .ad, .sidebar, .comments, .comment, [role='banner'], [role='navigation'], [role='complementary']").remove();

	// Extract title
	const title =
		$("meta[property='og:title']").attr("content") ||
		$("meta[name='twitter:title']").attr("content") ||
		$("title").text() ||
		$("h1").first().text() ||
		"";

	// Try to find main content
	let content = "";

	// Priority: article > main > [role='main'] > .post-content > .article-content > .entry-content > body
	const contentSelectors = [
		"article",
		"main",
		"[role='main']",
		".post-content",
		".article-content",
		".entry-content",
		".content",
		".post",
		".article",
		"#content",
		"#main",
		"body",
	];

	for (const selector of contentSelectors) {
		const $el = $(selector).first();
		if ($el.length && $el.text().trim().length > 200) {
			content = $el.html() || "";
			break;
		}
	}

	// Extract excerpt
	const excerpt =
		$("meta[property='og:description']").attr("content") ||
		$("meta[name='description']").attr("content") ||
		$("meta[name='twitter:description']").attr("content") ||
		"";

	// Clean up the content
	const $content = cheerio.load(content);
	$content("script, style, noscript, iframe, object, embed").remove();

	// Remove inline event handlers
	$content("*").each((_, el) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const attribs = (el as any).attribs;
		if (attribs) {
			Object.keys(attribs).forEach((attr) => {
				if (attr.startsWith("on")) {
					$content(el).removeAttr(attr);
				}
			});
		}
	});

	// Convert relative URLs to absolute
	$content("a[href]").each((_, el) => {
		const href = $content(el).attr("href");
		if (href && !href.startsWith("http") && !href.startsWith("//")) {
			try {
				$content(el).attr("href", new URL(href, url).href);
			} catch {
				// Ignore invalid URLs
			}
		}
	});

	$content("img[src]").each((_, el) => {
		const src = $content(el).attr("src");
		if (src && !src.startsWith("http") && !src.startsWith("//")) {
			try {
				$content(el).attr("src", new URL(src, url).href);
			} catch {
				// Ignore invalid URLs
			}
		}
	});

	// Limit content size (max 500KB)
	let finalContent = $content.html() || "";
	if (finalContent.length > 500 * 1024) {
		finalContent = finalContent.substring(0, 500 * 1024) + "...";
	}

	return {
		content: finalContent,
		title: title.trim(),
		excerpt: excerpt.trim(),
	};
}