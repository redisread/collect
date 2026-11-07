# Collect API 架构改造总结

> 历史记录：本文描述早期 API 重构设想，其中部分 V2 路由与 D1 内部队列从未挂载到生产入口。当前部署架构、Queue 调度、发布与回滚规则以 [`docs/decisions/0001-cloudflare-native-fullstack.md`](../docs/decisions/0001-cloudflare-native-fullstack.md) 为准。

## 改造完成内容

### 1. 数据模型优化 ✅

#### 新增表
- **fetch_queue**: RSS抓取任务队列，支持调度和重试
- **user_preferences**: 用户偏好设置（文章保留天数、每页数量等）
- **sync_states**: 多端同步状态管理

#### 现有表增强
- **articles**: 新增 `user_id` 字段（冗余存储，避免JOIN查询）、`content_text`、`read_at`、`retention_date` 等
- **feeds**: 新增健康度追踪字段（`health_status`, `consecutive_errors`）、增量更新字段（`last_etag`, `last_modified`）、调度字段（`next_fetch_at`, `fetch_interval_minutes`）

#### 索引优化
- 为高频查询场景添加复合索引（如 `idx_articles_user_published`）
- 为队列调度添加索引（`idx_queue_status_scheduled`）

### 2. RSS抓取架构重构 ✅

#### FeedSyncService
- 基于D1表的持久化任务队列
- 支持优先级调度（新订阅源高优先级，错误源低优先级）
- 增量更新（ETag/Last-Modified）
- 指数退避重试机制
- 健康度追踪（healthy/degraded/error/stale）

#### RSSFetcher
- 支持条件请求（304 Not Modified处理）
- 可配置超时和重试
- 内容哈希计算用于变更检测

### 3. API v2 全新设计 ✅

#### 文章API (`/api/v2/articles`)
- 游标分页（`cursor` + `limit`），大数据量性能稳定
- 批量操作端点（`POST /batch`）：批量已读/未读/收藏/删除
- 基于 `user_id` 直接过滤，无需JOIN

#### 订阅源API (`/api/v2/feeds`)
- 统计端点（`GET /:id/stats`）
- 手动刷新端点（`POST /:id/refresh`）
- 支持自定义抓取频率

#### 同步API (`/api/v2/sync`)
- 手动触发同步（`POST /schedule`）
- 队列状态查看（`GET /queue`）
- 健康度监控（`GET /health`）
- 数据清理（`POST /cleanup`）

### 4. 缓存策略 ✅

#### CacheManager
- KV多级缓存封装
- 缓存失效策略（按用户、按订阅源）
- 批量操作支持

#### 缓存场景
- 用户订阅源列表（5分钟）
- 未读数统计（1分钟）
- 文章URL去重缓存（1小时）

### 5. Cron任务调度 ✅

#### 调度频率
- 每5分钟：创建抓取任务队列
- 每小时：处理待处理任务
- 每天凌晨2点：数据清理、统计更新
- 每周一：生成报告

### 6. 监控与可观测性 ✅

#### Metrics中间件
- API性能指标收集（路径、状态码、耗时）
- 异步写入KV，不影响响应

---

## 文件变更清单

### 新增文件
```
api/src/services/FeedSyncService.ts      # RSS同步服务
api/src/lib/cache/CacheManager.ts        # 缓存管理器
api/src/routes/v2/articles.ts            # V2文章路由
api/src/routes/v2/feeds.ts               # V2订阅源路由
api/src/routes/v2/sync.ts                # V2同步路由
api/src/routes/v2/index.ts               # V2路由入口
api/src/cron/handlers.ts                 # Cron任务处理器
api/src/middleware/metrics.ts            # 监控中间件
api/drizzle/migrations/0002_architecture_refactor.sql  # 数据库迁移
```

### 修改文件
```
api/src/db/schema.ts                     # 更新表定义
api/src/lib/rss/fetcher.ts               # 重构为RSSFetcher类
api/src/lib/rss/parser.ts                # 支持从XML字符串解析
api/src/routes/feeds.ts                  # 使用新数据模型
api/src/routes/refresh.ts                # 使用FeedSyncService
api/src/routes/opml.ts                   # 使用新数据模型
api/src/index.ts                         # 挂载V2路由和Cron
api/wrangler.toml                        # 添加Cron触发器
```

---

## API端点总览

### V1 API (保持兼容)
- `GET/POST /api/folders`
- `GET/POST/PUT/DELETE /api/feeds`
- `GET/PUT /api/articles`
- `POST /api/refresh`
- `GET/POST /api/opml`

### V2 API (新功能)
- `GET /api/v2/articles` - 游标分页
- `POST /api/v2/articles/batch` - 批量操作
- `GET/POST/PUT/DELETE /api/v2/feeds`
- `POST /api/v2/feeds/:id/refresh` - 手动刷新
- `GET /api/v2/feeds/:id/stats` - 统计
- `POST /api/v2/sync/schedule` - 触发同步
- `POST /api/v2/sync/process` - 处理队列
- `GET /api/v2/sync/queue` - 队列状态
- `GET /api/v2/sync/health` - 健康度

---

## 下一步操作建议

1. **应用数据库迁移**
   ```bash
   pnpm --filter api db:migrate:local
   ```

2. **部署到Cloudflare**
   ```bash
   pnpm --filter api deploy
   ```

3. **配置Cron触发器**（在Cloudflare Dashboard中）
   - 每5分钟：创建任务队列
   - 每小时：处理任务
   - 每天：数据清理

4. **验证功能**
   - 测试V2 API端点
   - 验证队列调度
   - 检查缓存命中

---

## 性能改进点

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 获取用户文章 | JOIN查询 | 直接user_id过滤 |
| 分页 | OFFSET（大数据慢） | 游标分页（稳定） |
| RSS抓取 | 同步串行 | 队列异步并行 |
| 未读数计算 | 实时COUNT | 缓存+统计字段 |
| 增量更新 | 每次都全量 | ETag/Last-Modified |

---

## 注意事项

1. **数据库迁移**：迁移文件 `0002_architecture_refactor.sql` 需要先在本地测试，再应用到生产环境
2. **V1 API兼容**：现有前端可继续使用V1 API，建议逐步迁移到V2
3. **缓存失效**：FeedSyncService会自动处理缓存失效
4. **队列监控**：定期检查 `/api/v2/sync/queue` 确保任务正常处理
