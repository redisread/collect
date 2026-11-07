# Collect

一个现代、极简的 RSS 阅读器。Web 端采用 Cloudflare-native 单 Worker 架构，移动端复用同一套 API。

## 项目结构

```
collect/
├── api/                    # Hono API、Auth、Drizzle schema 与业务服务
├── frontend/               # Astro 7、React Islands 与唯一 Worker 入口
├── mobile/                 # 移动端（Flutter）
├── packages/
│   ├── types/              # 共享 TypeScript 类型
│   └── config/             # 共享配置（ESLint/TypeScript）
└── .github/workflows/      # CI/CD
```

## 快速开始

### 前置要求

- Node.js >= 22.13
- pnpm >= 11.24（建议使用 Corepack）
- Flutter >= 3.x（移动端开发）
- Wrangler 使用仓库内锁定版本，无需全局安装

### 安装依赖

```bash
pnpm install
```

### 本地开发

```bash
# 启动统一 Worker（Web 页面与 /api/*，端口 4321）
pnpm dev:frontend

# 启动移动端
cd mobile && flutter run
```

### 验证与部署

```bash
# 类型、测试与构建
pnpm --filter api lint
pnpm --filter api test
pnpm --filter frontend type-check
pnpm --filter frontend test
pnpm --filter frontend build

# 仅生成并校验部署包，不发布
pnpm deploy:dry-run

# 发布统一 Worker（生产操作，需显式确认）
pnpm deploy
```

合并到 `main` 后，[Cloudflare Full-stack 工作流](.github/workflows/cloudflare.yml) 会先完成全部质量门，再通过 Wrangler 自动部署。PR 和手动触发只验证，不会发布。

## Cloudflare 架构

```text
Cloudflare Worker: collect
├── /api/*  → Hono + Better Auth + middleware
├── /*      → Astro SSR/SSG + React Islands + Static Assets
├── D1      → Drizzle 关系数据
├── KV      → 应用缓存与 Astro session
├── R2      → 未来附件、图片与媒体对象
└── Queues  → Feed 抓取、重试与 DLQ
```

`frontend/wrangler.jsonc` 是唯一部署配置。当前没有实时协作或单实体强一致协调需求，因此未配置 Durable Objects；Feed 同步是单阶段可重试任务，因此未配置 Workflows。

当前生产状态：

1. 生产域名 `https://collect.jiahongw.com` 由统一 Worker `collect` 提供服务。
2. `collect-feed-sync`、`collect-feed-sync-dlq` 与 Worker secrets 已配置。
3. Resend 使用仅限 `gomate.live` 的 Sending access key，发件人为 `Collect <digest@gomate.live>`。
4. GitHub Actions 仍需确保 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 有目标账户的 Worker 部署权限。
5. Flutter 发布时将 `API_BASE_URL` 设置为 `https://collect.jiahongw.com`。

2026-11-07 已补齐 Better Auth `account.issuer` 迁移，验证线上注册、登录、受保护 API 和退出流程，并退役旧前后端 Worker。全新环境需按顺序应用 D1 migrations 后再部署。

具体切换、回滚与资源边界见 [Cloudflare 全栈 ADR](docs/decisions/0001-cloudflare-native-fullstack.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| Worker 入口 | Hono + Astro Cloudflare adapter + Static Assets |
| Web 前端 | Astro 7 + React Islands + Tailwind CSS v4 |
| 移动端 | Flutter + Riverpod + go_router |
| 数据库 | Cloudflare D1 (SQLite) + Drizzle ORM |
| 存储与异步 | Cloudflare KV + R2 + Queues |
| 认证 | Better Auth |

## License

MIT
