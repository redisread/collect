## Context

当前翻译功能已有基础骨架：
- 后端 `api/src/routes/translate.ts`：调用 Google Translate 公共 API，接受 `text` + `sourceLang` + `targetLang`，返回翻译结果
- 前端 `articleStore.ts`：`translateArticle` 方法调用后端 API，结果存于 Zustand 内存 store
- 前端 `ArticleToolbar.tsx`：翻译按钮，触发全文翻译
- 前端 `ArticleReader.tsx`：支持三种视图模式（原文/双语/译文），有视图切换 UI

**问题**：翻译是整段发送、无缓存持久化、无速率限制、译文丢失 HTML 结构、不支持多语言选择、移动端无翻译。

**约束**：
- 已绑定 Cloudflare KV（`COLLECT_KV`），可直接用于缓存
- Google Translate 公共接口有频率限制（约 100 请求/分钟/IP），需要服务端节流
- 前端使用 Astro + React Islands，翻译 UI 在 React 组件中
- 移动端 Flutter 使用 Dio 调用 API

## Goals / Non-Goals

**Goals:**
- 分段翻译：保持文章 HTML 结构，按块级元素逐段翻译后重组
- KV 持久化缓存：翻译结果按 `userId:articleId:targetLang` 缓存到 KV，TTL 7 天
- 速率限制：per-user 10 次翻译请求/分钟
- 多语言选择：用户可选目标语言（zh-CN / zh-TW / en / ja / ko）
- 移动端 Flutter 翻译支持
- 译文结构化渲染：段落级别对应原文，保留格式

**Non-Goals:**
- 不自建翻译服务（继续使用 Google Translate 公共 API）
- 不做逐句级对齐翻译（段落级足够）
- 不做翻译质量评估/对比
- 不修改 RSS 抓取/解析流程

## Decisions

### 1. 分段翻译策略：DOM 解析 + 逐段翻译 + 结构重组

**决策**：后端接收文章 `content`（HTML），使用简单的 HTML 解析（正则分割块级元素）拆分为文本块，逐块调用 Google Translate，再将翻译结果按原 HTML 标签结构重组。

**为什么不用 `@extractus/article-extractor` 或 `Readability`**：这些库用于提取正文，不负责翻译。我们需要的是保持 HTML 标签结构的同时翻译文本内容。

**替代方案**：
- 方案 A（整段发送）：当前方案，超长文本会被 Google 截断。❌
- 方案 B（DOM 解析）：用 `node-html-parser` 等轻量库解析 HTML，遍历文本节点逐段翻译。✅ 选择此方案，更精确。
- 方案 C（纯文本翻译 + 模板重建）：丢失格式。❌

**最终选择**：方案 B。引入 `node-html-parser`（~5KB），遍历 DOM 树，翻译每个文本节点，保持标签结构不变。

### 2. 翻译缓存：Cloudflare KV

**决策**：使用 `COLLECT_KV` 存储翻译结果，key 格式 `translation:{userId}:{articleId}:{targetLang}`，value 为 JSON `{ original, translated, timestamp, htmlStructured: true }`，TTL 604800 秒（7 天）。

**为什么不在前端缓存**：前端 Zustand store 刷新即丢失。IndexedDB 可以但增加了前端复杂度。KV 是后端统一方案，且多端共享（web + mobile 都走同一 API）。

**TTL 选择 7 天的原因**：RSS 文章是静态内容，不会变化。7 天足够覆盖活跃用户的阅读周期，同时自动清理过期数据节省 KV 空间。

### 3. 速率限制：滑动窗口计数器

**决策**：使用 Cloudflare KV 实现 per-user 滑动窗口限流。key `rate:translate:{userId}`，value `{ count, windowStart }`，窗口 60 秒，上限 10 次。

**为什么不用 Cloudflare Rate Limiting 产品**：那是 HTTP 层限流（按 IP），我们需要按用户限流。KV 足够简单。

### 4. 目标语言：用户级偏好设置

**决策**：目标语言存储在 Zustand store 中（不新增后端 API），默认为 `zh-CN`。用户可在翻译下拉菜单中选择，选择后记住。

**支持的语言**：zh-CN（简体中文）、zh-TW（繁体中文）、en（英语）、ja（日语）、ko（韩语）。覆盖目标用户的主要阅读语言。

### 5. 移动端翻译 API 复用

**决策**：Flutter 端复用同一个 `POST /api/translate` 端点，但新增一个可选参数 `articleId`，用于关联缓存。移动端本地用 `SharedPreferences` 缓存翻译结果。

### 6. 译文渲染：段落级映射

**决策**：前端将原文 HTML 按块级元素（`<p>`, `<h1-6>`, `<li>`, `<blockquote>`）拆分数组，翻译结果同样返回数组。双语模式下逐段对照显示（原文段落 + 译文段落配对）。

**API 响应格式变更**（BREAKING 对现有翻译 API 消费者）：
```json
{
  "success": true,
  "data": {
    "segments": [
      { "original": "原文段落1", "translated": "译文段落1" },
      { "original": "原文段落2", "translated": "译文段落2" }
    ],
    "targetLang": "zh-CN",
    "detectedLang": "en"
  }
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Google Translate 公共接口可能被封或变更 | 已有 User-Agent 伪装；未来可切换到 Google Cloud Translation API（付费） |
| HTML 解析不准确（嵌套标签、内联元素） | 使用 `node-html-parser` 做文本节点级别的翻译，不修改标签结构，风险可控 |
| KV 读写延迟影响响应速度 | 先查缓存再翻译；KV 读延迟通常 < 50ms，可接受 |
| 长文章翻译超时（Cloudflare Workers 10s CPU 限制） | 分段串行翻译可能超时；如遇到，可改为批量翻译（10 段一组）或使用 `node-html-parser` 减少 DOM 操作 |
| 翻译 API 被滥用（高频调用） | per-user 速率限制 + KV 缓存命中跳过翻译 |
| 移动端网络不稳定导致翻译失败 | 移动端添加重试机制 + 本地缓存 |
