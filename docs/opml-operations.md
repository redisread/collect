# OPML 导入运行与恢复

## 状态和重试预算

任务由 D1 持久化，Queues 负责唤醒处理。只有抓取和原子保存成功才新增订阅。

- `ready` 尚未确认，`pending` 等待派发或重试，`processing` 持有处理租约。
- `imported`、`skipped`、`failed` 是终态，重复消息不会重新抓取。
- 导入每次消费只抓取一次。HTTP 408/429/5xx、网络和超时可延迟重试，数据库 attempts 限制最多 3 次实际抓取。默认退避 60、120 秒，Retry-After 支持秒数与日期并限制在 60–900 秒。
- 等待时间保存在 lease_until 和 next_dispatch_at，重复消息不能绕过退避。第三次暂时失败成为 failed。
- URL 安全校验、不可读取的内容及其它 HTTP 错误直接失败。用户可检查后重新导入，已有订阅会跳过。
- 数据库/运行时错误由消费者 retry，并由 Cron 兜底。队列自身 max_retries 与数据库 attempts 是独立计数，不保证每项一定进入 DLQ。

## 观察信号

在 Cloudflare 的 collect Worker 日志按 event 过滤。每五分钟查看一轮，同一轮导入派发失败仍会尝试普通订阅同步，最后保留 scheduled 失败状态。

| event | 用途 |
| --- | --- |
| opml_backlog | pending 总数及 oldestJobAgeMs；该年龄从最早任务确认时间起算，不代表单条最后进展时间 |
| opml_batch_dispatched | 派发数量与耗时 |
| opml_dispatch_failed | 队列发送阶段失败，持久化记录等待补发 |
| opml_fetch_retry | 受控错误码、尝试次数与等待秒数 |
| opml_item_failed | 抓取最终失败 |
| opml_item_error | 持久化/运行时错误，需关联 itemId 排查 |
| opml_item_retry | 消费者安排重试，包括租约等待 |
| scheduled_task_failed | opml_dispatch 或 feed_sync_dispatch 阶段失败 |

建议将超过 15 分钟仍有 pending 的任务作为人工检查信号，结合多轮 pending 数量是否下降判断停滞。大任务正常处理也可能超过阈值。查看 Queues 指标中的积压和 DLQ 消息数量。当前提供结构化日志与操作流程，未配置外部通知服务。

日志不包含订阅 XML、地址 query、上游响应正文或异常原文。查看个人设置的条目明细可获得受控用户提示。

## DLQ 检查与安全重放

1. 在 Cloudflare Queues 打开 `collect-feed-sync-dlq`，先读取消息。共享队列同时含普通同步消息和 `source: opml-import`，必须先区分。
2. 对 OPML 消息记录原 itemId，用只读 D1 查询确认所属任务与状态（使用绑定参数或经过校验的 UUID，避免直接拼接外部内容）：

```sql
SELECT i.id, i.status, i.attempts, i.lease_until, i.next_dispatch_at,
       j.id AS job_id, j.status AS job_status, j.confirmed_at
FROM opml_import_items i
JOIN opml_import_jobs j ON j.id=i.job_id
WHERE i.id = ?;
```

3. imported/skipped/failed 或不存在的条目无需重放。终态 failed 由用户检查后重新导入，不直接修改 attempts 或清空租约。
4. running 任务中的 pending/processing 项优先等定时补发。若 DB/Queue 仍异常，先修复依赖。租约未过期则等待。
5. 需要手动恢复时，向 `collect-feed-sync` 发送 JSON `{"source":"opml-import","itemId":"原 UUID"}`，保持原 ID，不伪造新条目。不要把普通同步消息转换为 OPML 消息。
6. 返回个人设置确认进度更新及最终状态。重复投递应被幂等消费保护；保留原 DLQ 记录直到核对结果，清理按数据保留策略单独执行。不要自动批量重放所有消息。

五分钟 Cron 是补发周期，不是完成时限。平台故障、积压和订阅源响应速度会延长处理时间。DLQ 有保留期，重要事故需保存脱敏诊断，不能将 DLQ 当永久档案。

## 本地验证

`pnpm --filter api test` 运行快速 SQLite/错误分类回归。

`pnpm --filter api test:runtime` 使用已安装 Wrangler 携带的 Miniflare/workerd，加载项目兼容日期与 flags，应用真实迁移，测试 100/147 条任务、201 条部分派发失败恢复与重复消费。RSS 内容使用确定性测试数据，D1 和 Queues 使用真实本地绑定。测试 Worker 不被生产入口引用，临时目录与 runtime 在 finally 中释放。

该集成测试已进入 GitHub CI。本地模拟不验证实际套餐限额、Cloudflare 网络及第三方 RSS 可用性；部署后仍核对原生构建和只读线上任务状态。
