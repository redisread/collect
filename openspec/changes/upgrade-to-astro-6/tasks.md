## 1. 依赖升级

- [x] 1.1 升级 `frontend/package.json` 中 `astro` 到 `^6`
- [x] 1.2 升级 `@astrojs/react` 到与 Astro 6 兼容的最新版本
- [x] 1.3 升级 `@astrojs/cloudflare` 到与 Astro 6 兼容的最新版本
- [x] 1.4 升级 `@astrojs/check` 和 `@astrojs/tailwind` 到最新版本
- [x] 1.5 运行 `pnpm install` 安装新依赖并更新 lockfile

## 2. 配置适配

- [x] 2.1 检查并修复 `astro.config.mjs` 中因 Astro 6 breaking changes 导致的配置问题
- [x] 2.2 检查并修复 `turbo.json` 中的 `frontend#build` outputs 配置（如产物路径变化）
- [x] 2.3 检查 Cloudflare bindings 兼容性（运行 `pnpm --filter api cf-typegen` 确认无影响）

## 3. 构建与类型验证

- [x] 3.1 运行 `pnpm --filter frontend type-check` 修复所有类型错误
- [x] 3.2 运行 `pnpm --filter frontend lint` 确保无警告
- [x] 3.3 运行 `pnpm --filter frontend build` 验证完整构建成功

## 4. 功能验证

- [x] 4.1 启动 `pnpm --filter frontend dev`，验证首页三栏布局正常渲染
- [x] 4.2 验证登录/注册页面正常加载
- [x] 4.3 验证所有 React Islands 组件交互正常（`client:load` 指令）
- [x] 4.4 验证 Tailwind CSS v4 样式无异常（主题色、深色模式）
- [x] 4.5 验证翻译 UI 功能正常（三模式切换、语言选择器）

## 5. 部署验证

- [x] 5.1 运行 `pnpm --filter frontend build` 确认产物路径正确
- [x] 5.2 运行 `wrangler pages deploy dist --dry-run` 验证部署产物格式
- [x] 5.3 更新项目文档中的 Astro 版本说明（如有版本依赖文档）

## 6. 提交

- [ ] 6.1 创建 PR，包含 `package.json`、`pnpm-lock.yaml`、配置变更
- [ ] 6.2 PR 描述中列出所有 breaking changes 及对应修复
