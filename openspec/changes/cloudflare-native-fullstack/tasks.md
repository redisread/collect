# Implementation tasks

- [x] 1. 建立统一 Worker 契约与测试
  - Acceptance: `/api/*` 由 Hono 处理，非 API 路由进入 Astro handler。
  - Verify: focused Vitest route tests。

- [x] 2. 迁移 Wrangler 配置与生成 types
  - Acceptance: JSONC 包含 Static Assets、D1/KV/R2/Queues、Cron、observability，无手写 Env。
  - Verify: `wrangler types --check`、schema 校验、`wrangler deploy --dry-run`。

- [x] 3. 收敛同源 Web API 与 Auth/CORS
  - Acceptance: Web 使用相对 `/api`，Better Auth 只信任当前 origin，现有 API 路径不变。
  - Verify: auth/origin tests、frontend tests/type check。

- [x] 4. 将手动 Feed 刷新迁到 Queue
  - Acceptance: producer 返回 202，consumer 可处理、ack、retry；消息不包含敏感数据。
  - Verify: Queue unit/integration tests。

- [x] 5. 合并 CI/CD
  - Acceptance: GitHub PR/main 质量门覆盖 API 与 Web；Cloudflare Workers Builds 监听 main 部署单一 Worker，部署凭据和运行时 secrets 由 Cloudflare 管理。
  - Verify: workflow static review、local parity commands。

- [x] 6. 更新架构与运维文档
  - Acceptance: README/CLAUDE 反映单 Worker、同源 API、回滚与首次资源切换边界。
  - Verify: 文档命令与 package scripts 一致。

- [x] 7. 完成全量验证与差异审查
  - Acceptance: focused tests、full tests、type check、build、dry-run、startup check、diff check 有明确结果。
  - Verify: 记录实际执行结果，不把基线或未运行项标为通过。

## Verification record

- API：TypeScript 通过；7 个测试文件、47 个测试通过。
- Frontend：Astro check 0 errors（11 个既存 hints）；1 个测试文件、17 个测试通过。
- Workspace：Turbo lint、type-check、build 通过。
- Cloudflare：生成 bindings 校验通过；`wrangler deploy --dry-run` 通过；本地 startup profile 86.8 ms。
- Runtime：生产 preview 的 `/` 与 `/api/health` 均返回 200，API 返回 `x-request-id`。
- Supply chain：冻结安装通过；生产依赖 audit 为 0 critical、0 high、1 moderate。
- Production：创建主 Queue 与 DLQ，设置两个 Worker secrets，并部署版本 `84077909-9a98-484b-a538-088225db1700`；线上 `/` 与 `/api/health` 均为 200。
- 2026-11-07 修复验收：应用 `0001_account_issuer.sql`，将 `collect.jiahongw.com` 切至统一 Worker；临时账号完成注册、会话读取、受保护 API、退出、重新登录，全部通过并清理测试数据。
- API 回归现为 63 项，涵盖认证 Cookie/Bearer、Better Auth schema 契约与 Queue 重投；前端 17 项通过。
