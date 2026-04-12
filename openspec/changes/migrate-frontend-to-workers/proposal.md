## Why

当前前端项目使用 Cloudflare Pages 部署（`wrangler pages deploy dist`），Pages 是较旧的部署模式。Cloudflare Workers + Static Assets 是更新的架构，提供更强的能力（Durable Objects、Cron Triggers、更灵活的中间件）和更好的性能。迁移后前端将与后端 API（已在 Workers 上）统一技术栈，简化运维和配置管理。

## What Changes

- 将 `wrangler.toml` 从 Pages 配置迁移到 Workers Static Assets 配置
- 使用 `assets` 字段替代 `pages_build_output_dir`
- 更新 `package.json` 部署脚本，从 `wrangler pages deploy` 改为 `wrangler deploy`
- 移除 `@astrojs/cloudflare` Pages 适配器，改用 Workers 兼容模式
- 配置 `.assetsignore` 排除开发文件
- 更新 CI/CD 部署流程

## Capabilities

### New Capabilities
- `workers-static-assets`: Workers 静态资源配置，包含资产目录、SPA 路由处理、binding 设置
- `workers-deployment`: Workers 部署流程，包括 wrangler 命令更新和 CI/CD 适配

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- **frontend/wrangler.toml**: 配置格式从 Pages 改为 Workers
- **frontend/package.json**: 部署脚本变更
- **frontend/astro.config.mjs**: 可能需要调整适配器配置
- **CI/CD**: 部署命令需要更新
- **部署目标**: 从 Pages 项目转为 Workers 资源
