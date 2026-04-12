## Context

当前前端项目使用 Astro 6 + React Islands 架构，通过 `@astrojs/cloudflare` 适配器部署到 Cloudflare Pages。构建输出包含：
- `dist/client/` — 静态资源（JS/CSS/图片）
- `dist/server/entry.mjs` — Astro 生成的 SSR Worker 脚本
- `dist/server/wrangler.json` — 适配器自动生成的 Wrangler 配置

当前部署命令：`wrangler pages deploy dist`

Pages 和 Workers Static Assets 的关键区别：
- Pages 自动检测 SPA 模式和处理 `_worker.js`
- Workers 需要显式配置 `assets` 和 `main` 入口
- Workers 需要 `.assetsignore` 排除不需要上传的文件

## Goals / Non-Goals

**Goals:**
- 将前端从 Pages 部署迁移到 Workers + Static Assets
- 保持 Astro SSR 功能不变（服务端渲染继续工作）
- 保持现有 bindings（KV、R2）可用
- 部署后功能完全等价于当前 Pages 版本

**Non-Goals:**
- 不改变 Astro 适配器（继续使用 `@astrojs/cloudflare`）
- 不修改业务逻辑或组件代码
- 不涉及后端 API 变更
- 不引入新的框架或工具

## Decisions

### Decision 1: 保留 `@astrojs/cloudflare` 适配器

**选择**: 继续使用 `@astrojs/cloudflare` 适配器，不做替换。

**理由**: Astro Cloudflare 适配器同时支持 Pages 和 Workers 部署。适配器生成的 `entry.mjs` 已经可以用作 Worker 入口。只需要修改 `wrangler.toml` 配置和部署命令即可。

**替代方案**: 考虑过使用 `@astrojs/node` 或其他适配器，但这会增加不必要的复杂度和风险。

### Decision 2: wrangler.toml 手动维护

**选择**: 手动编写 `wrangler.toml`，不依赖 Astro 自动生成的 `wrangler.json`。

**理由**: 自动生成的配置使用绝对路径，不适合版本控制。手动维护的配置更清晰、可移植。

**配置要点**:
```toml
name = "collect-frontend"
main = "./dist/server/entry.mjs"
compatibility_date = "2026-03-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist/client"
binding = "ASSETS"
not_found_handling = "SPA"
```

### Decision 3: 使用 `.assetsignore` 排除服务器文件

**选择**: 在 `dist/` 目录创建 `.assetsignore`，排除 `server/` 目录从静态资源上传。

**理由**: Workers Static Assets 只应包含客户端静态文件（`dist/client/`）。服务器脚本（`dist/server/`）通过 `main` 字段加载，不应作为静态资源重复上传。

### Decision 4: 部署流程变更

**选择**: `deploy` 脚本从 `wrangler pages deploy dist` 改为 `wrangler deploy`。

**理由**: `wrangler deploy` 是 Workers 的标准部署命令，会读取 `wrangler.toml` 中的 `main` 和 `assets` 配置，同时部署 Worker 脚本和静态资源。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Workers 部署后 SSR 路由不工作 | 本地 `wrangler dev` 验证后再部署，确保 `main` 入口正确加载 |
| 静态资源路径不匹配 | `assets.directory` 必须指向 `dist/client`，与 Astro 构建输出一致 |
| 环境变量/KV bindings 丢失 | 在 `wrangler.toml` 中重新声明所有 bindings（SESSION KV 等） |
| Pages 自定义域名配置迁移 | 需要在 Cloudflare Dashboard 手动将域名绑定到新的 Worker |
| 部署后缓存行为变化 | Workers Static Assets 的缓存策略可能与 Pages 不同，需验证 |

## Migration Plan

1. **准备阶段**: 更新 `wrangler.toml` 配置，添加 `.assetsignore`
2. **本地验证**: 运行 `astro build && wrangler dev` 确认功能正常
3. **部署**: 运行 `wrangler deploy` 部署到 Cloudflare
4. **验证**: 检查 Worker URL，确认页面渲染和资源加载正常
5. **清理**: 确认 Workers 部署成功后，可从 Cloudflare Pages 删除旧项目
6. **CI/CD 更新**: 更新 CI 流水线中的部署命令

**回滚策略**: 如果 Workers 部署出现问题，可以快速切回 Pages 部署：
- 恢复 `wrangler.toml` 中的 `pages_build_output_dir` 配置
- 恢复 `package.json` 中的 `wrangler pages deploy` 命令
- 重新执行 `wrangler pages deploy dist`

## Open Questions

- 是否需要迁移 Pages 环境变量到 Workers 环境变量（`wrangler.toml` vars 或 secrets）？
- CI/CD 使用哪个平台（GitHub Actions / Cloudflare CI）？需要确认现有 CI 配置。
