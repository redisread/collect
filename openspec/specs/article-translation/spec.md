## ADDED Requirements

### Requirement: Segment-based HTML translation
The system SHALL translate HTML article content by parsing it into block-level segments (p, h1-h6, li, blockquote, etc.), translating each text node individually while preserving the original HTML tag structure, and returning structured segment pairs.

#### Scenario: Translate HTML with multiple paragraphs
- **WHEN** user requests translation of an article containing `<p>Hello</p><p>World</p>`
- **THEN** the system returns two segment pairs: `{ original: "Hello", translated: "你好" }` and `{ original: "World", translated: "世界" }`

#### Scenario: Preserve HTML tags during translation
- **WHEN** a paragraph contains inline tags like `<p>Click <a href="#">here</a></p>`
- **THEN** the translated segment preserves the anchor tag structure in the output

#### Scenario: Handle empty or missing content
- **WHEN** the article has no content or empty content
- **THEN** the system returns a 400 error with message "缺少文章内容"

### Requirement: KV-backed translation cache
The system SHALL cache translation results in Cloudflare KV with key format `translation:{userId}:{articleId}:{targetLang}`, TTL of 604800 seconds (7 days), and return cached results before attempting translation.

#### Scenario: Cache hit returns stored translation
- **WHEN** a user requests translation of an article that was previously translated with the same target language
- **THEN** the system returns the cached translation without calling Google Translate

#### Scenario: Cache miss triggers translation
- **WHEN** a user requests translation of an article not in cache
- **THEN** the system calls Google Translate, stores the result in KV, and returns the translation

#### Scenario: Different target languages have separate cache entries
- **WHEN** user translates article A to zh-CN, then to ja
- **THEN** two separate KV entries are created: `translation:{userId}:A:zh-CN` and `translation:{userId}:A:ja`

### Requirement: Per-user rate limiting
The system SHALL limit translation requests to 10 per user per 60-second sliding window using Cloudflare KV. Requests exceeding the limit SHALL receive a 429 response.

#### Scenario: Normal usage within rate limit
- **WHEN** a user makes 5 translation requests within 60 seconds
- **THEN** all 5 requests succeed

#### Scenario: Exceeding rate limit
- **WHEN** a user makes 11 translation requests within 60 seconds
- **THEN** the 11th request returns 429 with error "翻译请求过于频繁，请稍后再试"

### Requirement: Multi-language target support
The system SHALL support translation to at least the following target languages: zh-CN (Simplified Chinese), zh-TW (Traditional Chinese), en (English), ja (Japanese), ko (Korean). The target language SHALL be specified by the `targetLang` parameter.

#### Scenario: Translate to Traditional Chinese
- **WHEN** user requests translation with `targetLang: "zh-TW"`
- **THEN** the article is translated to Traditional Chinese

#### Scenario: Invalid target language
- **WHEN** user requests translation with an unsupported `targetLang`
- **THEN** the system returns a 400 error with message "不支持的目标语言"

### Requirement: Translation API request format
The translation endpoint `POST /api/translate` SHALL accept JSON body with fields: `articleId` (string, required), `content` (string, required, HTML content), `targetLang` (string, optional, default "zh-CN"), `sourceLang` (string, optional, default "auto"). The response SHALL include segment pairs with original and translated text.

#### Scenario: Successful translation request
- **WHEN** user sends a valid POST request with articleId, content, and targetLang
- **THEN** the response contains `{ success: true, data: { segments: [...], targetLang, detectedLang } }`

#### Scenario: Missing required parameters
- **WHEN** user sends a request without `articleId` or `content`
- **THEN** the system returns 400 with an appropriate error message
