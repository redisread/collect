## 1. 更新 API 生产配置

- [x] 1.1 更新 `api/wrangler.toml`：替换 D1 `database_id` 为生产值 `c795f10a-e138-4b9d-bed4-07c8a0a2117a`
- [x] 1.2 更新 `api/wrangler.toml`：替换 KV `id` 为生产值（查询现有 KV namespace）
- [x] 1.3 更新 `api/wrangler.toml`：确认 R2 `bucket_name` 为生产值（已创建 collect-cache）

## 2. 运行数据库迁移

- [ ] 2.1 执行 `wrangler d1 migrations apply collect-db` 应用数据库迁移到生产

## 3. 部署后端 API

- [ ] 3.1 执行 `pnpm --filter api deploy` 部署 API 到 Workers
- [ ] 3.2 验证 API 生产 URL 返回正常响应

## 4. 部署前端

- [ ] 4.1 执行 `pnpm --filter frontend deploy` 部署前端到 Workers
- [x] 4.2 验证前端生产 URL 页面正常
- [x] 4.3 验证前端到 API 的连通性
