## Why

前后端已完成 Workers 迁移，但尚未正式部署到生产环境。后端 API 的 `wrangler.toml` 中数据库和 KV 的 ID 仍为本地开发值（`local-collect-db`），需要替换为生产资源 ID。同时需要执行前后端的实际部署，确保生产环境可用。

## What Changes

- 更新后端 API `wrangler.toml`：将本地资源 ID 替换为生产资源 ID（D1 数据库、KV、R2）
- 执行后端 API 部署到 Cloudflare Workers
- 执行前端部署到 Cloudflare Workers + Static Assets
- 验证生产环境前后端连通性
- 验证 CI/CD 自动部署流程正常工作

## Capabilities

### New Capabilities
- `production-api-deployment`: 后端 API 生产环境部署，包括正确的 D1/KV/R2 资源绑定
- `production-frontend-deployment`: 前端生产环境部署到 Workers + Static Assets

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- **api/wrangler.toml**: 数据库和 KV 的 ID 从本地值改为生产值
- **生产环境**: 前端和后端将在 Cloudflare Workers 上运行
- **CI/CD**: 验证 GitHub Actions 自动部署流程
