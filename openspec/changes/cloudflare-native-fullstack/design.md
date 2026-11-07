# Design: 单一 Cloudflare Worker

## Runtime topology

```text
Request
  ├─ /api/* → Hono routes/middleware → D1/KV/R2/Queue bindings
  └─ /*      → Cloudflare adapter handler → Astro SSR/SSG + Static Assets

Scheduled trigger → digest/maintenance scheduling
Queue consumer    → FeedSyncService → external feed + D1/KV
```

`frontend/src/worker.ts` 是唯一 Module Worker 入口。Hono 从 `api/src/app.ts` 挂载 API 路由，避免 Worker self-fetch 或公开 API 域名；未匹配的页面请求交给 Astro Cloudflare adapter 的默认 handler。这里不使用 Astro 的 advanced-routing `cf()` middleware；默认 handler 的 session、Cookie、Static Assets fallback 和缓存行为更完整，也避开了当前 advanced-routing 路径的已知运行时与行为一致性问题。

## Configuration

- `frontend/wrangler.jsonc` 是部署 source of truth。
- `main` 指向源码 Worker entry，Static Assets 指向 Astro client build。
- D1 migrations 继续位于 `api/drizzle/migrations`；本次不修改 schema。
- `COLLECT_KV` 用于应用缓存，`SESSION` 由 Astro session 使用，`COLLECT_R2` 留给媒体对象。
- `FEED_SYNC_QUEUE` 同时配置 producer 和 consumer，并配置 DLQ。
- 不配置 Durable Objects 或 Workflows，避免为未来假设引入状态和迁移负担。

## Auth and trust boundaries

- 浏览器只调用相对路径 `/api`，不再信任任意跨域 credentialed request。
- Better Auth 的 `baseURL` 由同一 Worker 的请求 origin 推导；secret 仍由 Wrangler secret 提供。
- Native mobile 不受浏览器 CORS 约束，发布时将 API base URL 指向统一 Worker 域名。
- Queue body 只包含 `feedId`、`requestId`、`source` 等普通可序列化字段；consumer 再从 D1 读取权威状态。

## Reliability and observability

- 请求入口接受或生成 `x-request-id` 并回传；日志只记录事件名、request ID、路由类别、状态和耗时。
- Feed Queue 使用 at-least-once 模型；同步逻辑使用 feedId 与 URL 的确定性主键、D1 权威 URL 去重和 `onConflictDoNothing` 保持幂等。
- consumer 对单条消息显式 `ack`/`retry`，不让一条失败阻塞整个 batch。
- 旧 API Worker 保留作为回滚路径；Worker 代码回滚不等于 D1/R2/Queue 数据回滚。

## Rejected alternatives

- 两个公开 Worker + CORS：增加 cookie、域名、部署和故障面。
- Worker 通过公开 URL self-fetch API：增加网络跳转与认证复杂度。
- Durable Objects：当前没有实时连接或单实体强一致协调需求。
- Workflows：当前 Feed 同步是单阶段可重试任务，Queue 已覆盖需求。
- 新增媒体上传 API：产品当前没有附件上传能力，本次只保留 R2 基础 binding，避免无需求扩张。
