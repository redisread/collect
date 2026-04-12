## Why

当前双语翻译功能只有骨架：后端有一个调用 Google Translate 的 API，前端能触发翻译并切换原文/译文/双语三种模式，但存在以下关键缺失：

1. **翻译是逐段而非全文的** — `translateArticle` 直接把整个 HTML 内容去掉标签后拼成一段发给 Google，超长文本会被截断或拒绝
2. **翻译结果未持久化** — 翻译缓存仅存在 Zustand 内存 store 中，刷新页面后丢失
3. **翻译结果渲染质量差** — 译文以 `whitespace-pre-wrap` 纯文本展示，丢失了原文的段落、图片、链接等结构
4. **缺少目标语言选择** — 硬编码 `zh-CN`，无法切换翻译语言
5. **移动端没有翻译功能** — Flutter 端没有任何翻译相关代码
6. **无速率限制** — Google Translate 公共接口有频率限制，后端未做节流/限流保护

## What Changes

- **分段翻译**：将文章 HTML 按段落/标题/列表等块级元素拆分，逐段翻译后重组，保持 HTML 结构
- **翻译缓存持久化**：使用 Cloudflare KV 存储翻译结果，按 `userId:articleId:targetLang` 键缓存
- **目标语言选择器**：在翻译按钮旁增加语言选择（默认中文简体，可切换英文/日文/韩文等）
- **译文结构化渲染**：翻译结果按原文段落结构渲染，保留段落分隔
- **速率限制**：后端添加 per-user 翻译限流（如 10 次/分钟）
- **移动端翻译**：Flutter 端添加翻译按钮、语言选择、三模式切换
- **移动端翻译缓存**：Flutter 端本地缓存（SharedPreferences / Hive）

## Capabilities

### New Capabilities
- `article-translation`: 完整的文章翻译能力，包括分段翻译、KV 缓存、速率限制、多语言选择
- `translation-ui`: 前端的翻译 UI，包括工具栏语言选择器、三模式切换（原文/双语/译文）、译文结构化渲染
- `mobile-translation`: 移动端（Flutter）的翻译功能，包括 API 调用、本地缓存、UI 展示

### Modified Capabilities
- *(无 — 当前翻译功能尚未形成完整的 spec，以下为全新实现)*

## Impact

- **后端**：`api/src/routes/translate.ts` 需要重写为分段翻译 + KV 缓存 + 速率限制
- **后端**：`api/src/routes/articles.ts` 可能需要暴露文章原始 HTML 内容
- **前端**：`frontend/src/lib/store/articleStore.ts` 翻译状态需增加语言维度和持久化逻辑
- **前端**：`frontend/src/components/app/article/ArticleToolbar.tsx` 增加语言选择器
- **前端**：`frontend/src/components/app/article/ArticleReader.tsx` 优化译文渲染（段落级映射）
- **移动端**：`mobile/` 新增翻译相关 widget、provider、API 调用
- **依赖**：后端需要 Cloudflare KV binding（已有 `COLLECT_KV`）
