## Context

前端当前运行在 Astro 5.7 + React 19 + Tailwind CSS v4 技术栈上，部署目标为 Cloudflare Pages。项目使用 Astro Islands 架构，3 个 `.astro` 页面（index/login/register）分别加载 React 组件作为交互岛屿。

Astro 6 作为主要版本升级，可能引入以下变化：
- Islands 架构行为调整
- `client:*` 指令语义变化
- Cloudflare 适配器 API 变更
- Vite 插件集成方式变化
- Tailwind CSS v4 集成方式变化

## Goals / Non-Goals

**Goals:**
- 将前端从 Astro 5 升级到 Astro 6 及所有 `@astrojs/*` 配套包
- 确保现有功能（三栏布局、RSS 阅读、翻译 UI、认证）全部正常工作
- 确保 Cloudflare Pages 部署流程不变
- 构建通过、类型检查通过、无运行时错误

**Non-Goals:**
- 不迁移到其他渲染框架（保持 React Islands）
- 不修改 Tailwind CSS v4 集成方式（保持 `@tailwindcss/vite`）
- 不重构组件代码（仅做版本升级所需的适配）
- 不修改 API 层或移动端代码

## Decisions

### 1. 渐进式升级策略

先在独立分支安装 Astro 6 及相关包，运行 `astro check` 和 `astro build` 验证，根据 breaking changes 逐项修复。不预先假设所有 breaking changes，而是以实际构建错误为导向。

**备选方案**: 先通读 Astro 6 CHANGELOG 再做针对性修改。但由于 Astro 6 变更量大，这种方式容易产生遗漏。实际构建验证更可靠。

### 2. 包版本统一策略

所有 `@astrojs/*` 包必须升级到与 Astro 6 兼容的版本，包括：
- `@astrojs/react` → Astro 6 兼容版本
- `@astrojs/cloudflare` → Astro 6 兼容版本
- `@astrojs/check` → 最新版本
- `@astrojs/tailwind` → Astro 6 兼容版本

**决策**: 使用 `pnpm up` 一次性升级到最新兼容版本，而非逐个包手动指定版本号。

### 3. `astro.config.mjs` 适配策略

当前配置使用：
- `output: "server"` — SSR 模式
- `@astrojs/cloudflare` 适配器 + `platformProxy`
- `@tailwindcss/vite` 作为 Vite 插件

如果 Astro 6 对上述配置项有 breaking changes，直接在 `astro.config.mjs` 中修改。重点验证 `platformProxy.enabled` 和 Vite 插件注册方式。

### 4. React Islands 兼容性

当前使用 `client:load` 指令加载 React 组件。Astro 6 如果修改了 `client:*` 指令（如引入 `client:idle` 语义变化），需要逐页面验证。3 个页面文件结构简单，手动验证成本很低。

### 5. 不修改 `@astrojs/tailwind` 集成

当前项目直接使用 `@tailwindcss/vite` 插件（Tailwind CSS v4 推荐方式），而非 `@astrojs/tailwind` 的传统集成。Astro 6 如果变更了 `@astrojs/tailwind` 的默认行为，对我们的项目没有影响，因为我们不依赖它。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Astro 6 breaking changes 导致 React 19 集成异常 | 升级后运行 `astro dev` 验证所有 React Islands 正常加载 |
| Cloudflare 适配器 API 变化导致部署失败 | 本地运行 `astro build` 验证产物，再用 `wrangler pages deploy --dry-run` 验证 |
| Tailwind CSS v4 样式渲染异常 | 升级后在浏览器中验证关键页面（首页、登录、阅读页） |
| `astro.config.mjs` 配置项废弃 | 参照 Astro 6 官方迁移指南更新配置 |
| 升级过程中影响开发效率 | 在独立分支进行，不影响 main 分支 |

## Migration Plan

1. 创建特性分支 `upgrade/astro-6`
2. 升级 `frontend/package.json` 中 Astro 及相关依赖
3. `pnpm install` 安装新依赖
4. 运行 `astro check` 修复类型错误
5. 运行 `astro build` 验证构建
6. 运行 `pnpm dev` 在浏览器中验证所有页面
7. 如有 breaking changes，参照官方迁移指南逐项修复
8. 提交 PR

**Rollback**: 如果升级遇到无法短期解决的问题，保留 `package.json` 和 `pnpm-lock.yaml` 的原始版本即可回退。

## Open Questions

- Astro 6 是否要求 Node.js 最低版本升级？（当前要求 Node >=20）
- `@astrojs/cloudflare` 在 Astro 6 下是否仍支持 `platformProxy.enabled`？需要在安装后验证
