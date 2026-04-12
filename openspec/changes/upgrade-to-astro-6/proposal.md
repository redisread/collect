## Why

前端当前使用 Astro 5.7，Astro 6 已发布并带来构建性能提升、改进的 Islands 架构、更好的 React 19 兼容性以及更优的 Cloudflare Pages 部署体验。升级可确保我们持续获得性能优化、安全补丁和新特性，同时统一相关组件到 Astro 6 生态。

## What Changes

- 将 `frontend/` 从 Astro 5 升级到 Astro 6
- 同步更新所有 `@astrojs/*` 集成插件到与 Astro 6 兼容的最新版本
- 更新 `@astrojs/react` 集成以匹配 Astro 6 的 React Islands 行为
- 更新 Tailwind CSS v4 相关集成确保兼容
- 验证 Cloudflare Pages 适配器和部署流程
- 更新根 `turbo.json` 中受影响的 outputs/dependsOn 配置（如有变更）

## Capabilities

### New Capabilities
<!-- 本次为框架版本升级，不引入新的用户可见能力 -->

### Modified Capabilities
<!-- 本次升级不修改任何现有 spec 的行为要求。所有 API 契约、用户交互、翻译功能等保持不变。 -->

## Impact

- **frontend/**: 所有 `package.json` 依赖、`astro.config.mjs` 配置、可能的 Breaking Changes 适配
- **packages/shared/**: 无影响（纯 TypeScript 包）
- **api/**: 无影响
- **mobile/**: 无影响
- **CI/CD**: 构建产物路径和部署流程需验证
