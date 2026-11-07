# Cloudflare-native 全栈重构

## Objective

将 Collect Web 与 API 从两个独立 Cloudflare 部署单元收敛为一个 Cloudflare Worker：Astro 负责页面和 SSR/SSG，React Islands 保留现有交互组件，Hono 负责同一 Worker 内的 `/api/*`、Auth 与中间件，D1/Drizzle 和 R2 通过 bindings 直接访问，Feed 同步通过 Cloudflare Queues 异步执行。

## Capability Map

| Module id | Responsibility | Depends on |
|---|---|---|
| `unified-worker` | 组合 Hono API、Astro SSR 与 Static Assets | — |
| `same-origin-web` | Web 客户端改用同源 `/api/*`，收敛 Auth/CORS | `unified-worker` |
| `feed-sync-queue` | 将请求路径中的 Feed 抓取迁到 Queues | `unified-worker` |
| `main-deploy` | `main` 合并后验证并部署单一 Worker | `unified-worker`, `same-origin-web`, `feed-sync-queue` |

Build order: `unified-worker` → `same-origin-web` → `feed-sync-queue` → `main-deploy`。

## Assumptions

1. 现有 REST 路径与响应结构继续兼容 Web 和 Flutter 客户端。
2. 现有 D1、KV 与 R2 生产资源继续使用，不执行生产数据迁移或删除。
3. 原 `collect-api` Worker 在新 Worker 验证通过前保留，退役属于后续显式操作。
4. 当前没有实时协作、房间状态或跨请求强一致协调需求，因此不创建 Durable Object。
5. Feed 同步是可重试的单阶段后台任务，Queues 足够；没有需要持久化多步骤状态的长事务，因此不创建 Workflow。

## Success Criteria

- 单一 Worker 对 `/api/*` 使用 Hono，对页面路由使用 Astro，并随同一次部署交付 Static Assets。
- Web 客户端不依赖生产 API 域名或 CORS；Auth cookie 在同源路径工作。
- 手动刷新返回 `202 Accepted`，Feed 抓取由 Queue consumer 完成，消息失败可重试并进入 DLQ。
- D1 使用 Drizzle，R2 binding 保留给附件/图片/媒体；本次不虚构不存在的媒体业务接口。
- Wrangler 配置使用 `wrangler.jsonc`、当天 compatibility date、生成的 binding types、observability 与最小必要 bindings。
- GitHub 对 PR 与 `main` 执行类型、测试、构建和 Wrangler dry-run；合并前质量门通过，Cloudflare Workers Builds 在 `main` push 后独立构建并部署（2026-11-07 用户更新要求）。
- 不创建或修改生产资源、不执行生产 D1 migration、不推送代码。

## Boundaries

- Always: 使用同源 API、参数化 Drizzle 查询、结构化且无 PII 的日志、测试 Queue 消息和路由边界。
- Ask first: 生产 migration、首次 Queue/DLQ 创建后的线上切换、旧 Worker/Pages 删除、自定义域名切换。
- Never: 将 secrets 写入仓库、记录 cookie/token/email、让 Queue 消息携带不可序列化对象、用 Durable Objects 解决不存在的需求。
