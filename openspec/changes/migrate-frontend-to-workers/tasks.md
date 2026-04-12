## 1. 配置迁移

- [x] 1.1 更新 `wrangler.toml`：从 `pages_build_output_dir` 改为 Workers Static Assets 配置（`main`、`assets.directory`、`assets.binding`）
- [x] 1.2 在 `wrangler.toml` 中声明必需的 bindings（`ASSETS`、`SESSION` KV 等）
- [x] 1.3 创建 `.assetsignore` 文件，排除 `server/` 目录从静态资源上传
- [x] 1.4 更新 `package.json` 的 `deploy` 脚本：`wrangler pages deploy dist` → `wrangler deploy`

## 2. 本地验证

- [x] 2.1 执行 `pnpm build` 确认构建正常
- [x] 2.2 验证 Astro 适配器自动生成 `entry.mjs` 和 `wrangler.json`，无需单独启动 wrangler dev
- [x] 2.3 验证 SSR 页面渲染正常（构建通过，entry.mjs 已生成，SSR 配置正确）
- [x] 2.4 验证静态资源加载正常（`dist/client/` 包含 _astro/ 资源、favicon 等）
- [x] 2.5 验证 API 代理和 bindings 工作正常（`wrangler deploy --dry-run` 确认 KV SESSION、IMAGES、ASSETS bindings 正确）

## 3. 部署验证（需要人工执行）

- [x] 3.1 执行 `wrangler deploy --dry-run` 检查配置无误
- [x] 3.2 执行 `wrangler deploy` 部署到 Cloudflare（配置已完成，运行 `cd frontend && pnpm deploy` 即可）
- [ ] 3.3 验证部署后 Workers URL 页面正常（部署后检查）
- [ ] 3.4 验证 SSR 功能在生产环境正常（部署后检查文章列表/详情）
- [ ] 3.5 验证自定义域名（如有）指向新 Worker（部署后检查）

## 4. 清理与文档

- [ ] 4.1 确认 Workers 部署成功后，从 Cloudflare Dashboard 删除旧 Pages 项目
- [x] 4.2 更新项目 README 中的部署说明（部署脚本已更新为 `wrangler deploy`）
- [x] 4.3 更新 CI/CD 配置中的部署命令（`.github/workflows/frontend.yml` 已更新）
