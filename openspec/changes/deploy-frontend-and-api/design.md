## Context

当前状态：
- **前端**: 已完成 Workers 迁移，`wrangler.toml` 配置正确，KV namespace `collect-frontend-session` 已创建（ID: `2306ca7bb81b4db39208b0b213e2d3a8`），但尚未部署到生产环境
- **后端 API**: `wrangler.toml` 中的资源 ID 仍为本地开发占位符（`local-collect-db`、`local-collect-kv`），需要替换为生产值
- **CI/CD**: GitHub Actions 已配置自动部署，但需要验证

已创建的生产资源：
- D1 数据库 `collect-db`: `c795f10a-e138-4b9d-bed4-07c8a0a2117a`

## Goals / Non-Goals

**Goals:**
- 更新 API wrangler.toml 的生产资源 ID
- 运行数据库迁移（Drizzle migrations）
- 部署后端 API 到生产 Workers
- 部署前端到生产 Workers + Static Assets
- 验证生产环境可访问

**Non-Goals:**
- 不修改任何业务逻辑代码
- 不引入新的依赖或服务
- 不变更 CI/CD 流程（已有配置）

## Decisions

### Decision 1: 先部署 API，再部署前端

**选择**: 部署顺序为 API → 前端。

**理由**: 前端依赖 API 提供服务。如果先部署前端，用户会看到一个无法正常工作的页面。

### Decision 2: 手动部署首次，后续依赖 CI/CD

**选择**: 首次生产部署手动执行，验证成功后后续推送由 GitHub Actions 自动部署。

**理由**: 首次部署需要确认资源配置正确，手动执行可以快速发现问题。

### Decision 3: 使用 wrangler.toml 管理生产配置

**选择**: 生产环境的资源 ID 直接写入 `wrangler.toml`，不使用环境变量。

**理由**: `database_id` 和 KV `id` 是资源标识符，不是秘密值。Cloudflare 通过 `CLOUDFLARE_API_TOKEN` 控制访问权限，资源 ID 本身不需要保密。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 数据库迁移未运行 | 部署前执行 `wrangler d1 migrations apply` |
| API 部署后前端无法连接 | 验证 API URL 配置正确 |
| 前端 SESSION KV namespace 权限问题 | 已创建并绑定，部署后验证 |
| 部署过程中用户访问受影响 | 首次部署无用户，后续 Cloudflare 支持零停机部署 |
