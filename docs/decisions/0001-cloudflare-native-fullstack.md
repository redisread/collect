# ADR 0001：Cloudflare-native 单 Worker 全栈架构

- 状态：Accepted
- 日期：2026-08-30

## 背景

Collect 原先分别部署 API Worker 和 Web Worker，浏览器通过公开 API 域名访问后端。这增加了 CORS、跨域 Cookie、两套部署配置和版本不同步的风险。现有页面已经使用 Astro 与 React Islands，API 已经使用 Hono、D1/Drizzle、KV 和 R2 binding，因此可以在不迁移关系数据的前提下收敛运行时。

## 决策

使用 `frontend/src/worker.ts` 作为唯一 Module Worker 入口：

- Hono 先处理 `/api/*`、Better Auth 与 API middleware。
- 未命中的请求交给 Astro Cloudflare adapter 的默认 handler，提供 SSR/SSG、React Islands、session 与 Static Assets fallback。
- `frontend/wrangler.jsonc` 是 D1、KV、R2、Queues、Cron、Static Assets、secrets 声明和 observability 的唯一配置来源。
- 浏览器改用同源 `/api/*`，不再启用 credentialed wildcard CORS。
- 手动刷新和定时 Feed 同步只向 `FEED_SYNC_QUEUE` 发布轻量消息；consumer 从 D1 读取权威状态，逐条 ack/retry，并使用 DLQ 收敛持续失败消息。
- R2 保留为附件、图片和媒体对象的存储边界；当前产品没有上传能力，因此本次不创建未被使用的媒体 API。
- 不配置 Durable Objects：当前没有实时连接、房间状态或单实体强一致协调需求。
- 不配置 Workflows：Feed 同步是单阶段、可重试、幂等任务，Queues 已覆盖需要。

没有直接采用 Astro 的 advanced-routing `cf()` middleware：该路径近期出现过 workerd 请求未附着 App 的运行时错误，而且与默认 handler 在 Cookie/session、缓存和静态资源 fallback 上仍有行为一致性风险。组合官方默认 handler 可以保留这些语义，同时让 Hono 继续作为统一 Worker 的 API 路由入口。

## 安全与可观测性

- Better Auth 的 base URL 与 trusted origin 从当前请求 origin 推导，敏感值只使用 Worker secrets。
- 请求接受合法 `x-request-id` 或生成 UUID；日志记录事件、状态、耗时和计数，不记录 cookie、token、email 或 Queue payload。
- Wrangler 开启 Workers Logs 与 5% tracing 采样；Queue producer 每批最多 100 条，以符合 Cloudflare Queues 限制。

## 发布与切换

GitHub Actions 对 PR 和 `main` 运行类型检查、API/Web 测试、Astro build 与 `wrangler deploy --dry-run`。按 2026-11-07 用户要求，生产发布由 Cloudflare Workers Builds 监听 `redisread/folio` 的 `main` 分支完成。构建根目录为 `frontend`，命令分别为 `pnpm build` 和 `pnpm exec wrangler deploy`，Node 24、pnpm 11.24.0。合并前确认 GitHub checks 通过，Cloudflare 在 main push 后独立执行部署。

首次切换已于 2026-08-30 完成：创建主 Queue 与 DLQ，为 Worker `collect` 设置 `BETTER_AUTH_SECRET`、仅限 `gomate.live` 发信的 `RESEND_API_KEY`，并发布到 `https://collect.wujiahong2013.workers.dev`。后续可单独切换自定义域名。现有 D1、KV 与 R2 资源复用，未执行 schema migration。

## 回滚

1. 使用 `pnpm --filter frontend exec wrangler deployments list --config wrangler.jsonc` 找到上一稳定版本。
2. 使用 `pnpm --filter frontend exec wrangler rollback <version-id> --config wrangler.jsonc` 回退 Worker 代码与 Static Assets。
3. 自定义域名 `collect.jiahongw.com` 在 Wrangler routes 中声明，恢复部署时一并恢复该绑定。

Worker 回滚只覆盖代码和部署配置。D1、KV、R2 与 Queue 数据需要独立恢复。2026-11-07 用户授权将自定义域名统一到 `collect` 并退役旧 `collect-api`、`collect-frontend` 部署，回滚使用 `collect` 的历史版本。
