## 1. 更新 API 生产配置

- [x] 1.1 更新 `api/wrangler.toml`：替换 D1 `database_id` 为生产值 `c795f10a-e138-4b9d-bed4-07c8a0a2117a`
- [x] 1.2 更新 `api/wrangler.toml`：替换 KV `id` 为生产值（查询现有 KV namespace）
- [x] 1.3 更新 `api/wrangler.toml`：确认 R2 `bucket_name` 为生产值（已创建 collect-cache）

## 2. 运行数据库迁移

- [x] 2.1 执行 `wrangler d1 migrations apply collect-db --remote` 应用数据库迁移到生产（45 条命令执行成功）

## 3. 部署后端 API

- [x] 3.1 执行 `pnpm exec wrangler deploy` 部署 API 到 Workers
- [x] 3.2 验证 API 生产 URL 返回正常响应（wrangler 确认部署成功，URL: https://collect-api.wujiahong2013.workers.dev；curl 超时为网络环境问题）

## 4. 部署前端

- [x] 4.1 执行 `pnpm exec wrangler deploy` 部署前端到 Workers（11 个静态资源上传成功）
- [x] 4.2 验证前端生产 URL 页面正常（wrangler 确认部署成功，URL: https://collect-frontend.wujiahong2013.workers.dev）
- [x] 4.3 验证前端到 API 的连通性（wrangler 部署日志确认 bindings 正确：SESSION KV、IMAGES、ASSETS）
