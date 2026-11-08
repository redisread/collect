# OPML 后台导入：Workers 最佳实践核查

核查日期：2026-11-08。代码基线：`920463c90b5a63cf5bf19f7348a1ac61402c1bd1`。

范围：本次 100 条订阅派发失败后的设计核查。仅阅读代码和官方资料，没有修改业务代码、运行测试或验证线上部署。下文分别标注已确认的平台事实、代码现状和建议；历史验证记录见 [OPML 导入说明](opml-import.md)，不视为本次重新执行。

## 结论

**保留 `json_each` 修复。** 将 ID 数组作为一个绑定参数，既符合 D1 官方支持的用法，也把当前更新从 101 个参数降为 2 个。改成每批 99 条也能解决当前超限，但将数据库参数预算和队列批次绑定在一起，今后增加更新字段仍可能再次超限。官方并未规定所有批量更新必须使用 JSON；这里是适合现有代码的选择。[D1 JSON 查询](https://developers.cloudflare.com/d1/sql-api/query-json/)

**目前架构适合小型 RSS 项目，优先补齐恢复、错误分类和可观测性。** 已有持久化任务、条件租约、唯一约束、原子落库和定时补发，无需因为这次参数错误引入 Workflows、Durable Objects 或独立 outbox 服务。这里是基于代码规模与故障模式的工程判断，不是平台强制架构。

## 1. D1：分别计算参数、字节与调用预算

| 已确认的平台限制 | 对本项目的影响 |
| --- | --- |
| 每条 SQL 最多 100 个绑定参数 | 原更新为 100 IDs + 1 timestamp，必然超限；当前为 JSON + timestamp |
| SQL 文本最多 100,000 bytes；字符串、BLOB 或行最多 2,000,000 bytes | JSON 解决参数数量，不解除字节限制；SQL 应继续参数化 |
| 每次 Worker 调用 D1 查询：Free 50、Paid 1000 | 多条处理共享一次调用预算，需统计整个 handler |
| `DB.batch()` 对调用次数算一次；其中各 SQL 仍遵守各自参数等限制 | 不能用 batch 包装绕过某条 SQL 的 100 参数上限 |

来源：[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。不要将账号资源绑定数量与 SQL 参数数量混淆。

官方文档直接示例：`JSON.stringify(array)` 作为绑定参数传给 `json_each(?)`，再选择其 `value` 列；SQLite 说明 `json_each` 将顶层数组元素展开为行。因此这里不是依赖未公开技巧，也不需要拼接 SQL 字面量。[D1 Query JSON](https://developers.cloudflare.com/d1/sql-api/query-json/)、[SQLite JSON table-valued functions](https://www.sqlite.org/json1.html#jeach)

代码现状（[OpmlImportService.ts](../api/src/services/OpmlImportService.ts)）：

- `dispatchImportItems` 每轮取 200 项、每次发送 100 项；ID 来自数据库 UUID，当前 JSON 列表很小。
- 预览插入也采用 JSON，每 100 项一个 SQL；这一处包含标题、地址等用户数据，不能仅以条数推断字节安全。原始 XML 上限并不严格等于序列化 JSON 的大小。
- 保存成功源时，把文件夹、订阅、初始文章、条目结果放在同一个 D1 batch；官方保证 batch 中语句按顺序执行，任一失败会回滚整个序列。[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

建议：保持现有 ID 批次；如果扩展导入字段或放宽文件上限，再为预览 JSON 增加实际 UTF-8 字节预算与超限错误。不要为这次修复引入通用 SQL 分批框架。

## 2. Queues：重复投递是正常情况，成功提交后再 ack

**平台事实：** Queues 提供至少一次投递，消息可能重复；官方建议使用唯一 ID 或幂等键去重。`sendBatch` 最多 100 条、总计 256 KB，单条最多 128 KB。生产者的 100 条发送上限与消费者的批次大小是不同配置。[投递保证](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)、[Queues limits](https://developers.cloudflare.com/queues/platform/limits/)

**代码现状：** 消息仅携带 `source` 和 `itemId`；消费者获取条件租约，写入使用 lease token 守卫，并用账号与 feed URL 的唯一约束去重。`processImportItem` 成功返回后 `ack()`，异常则 `retry({ delaySeconds: 60 })`。这与消息重复处理模型一致，但不能宣称端到端 exactly-once。[当前消费者](../frontend/src/worker.ts)

**平台事实：** `ack()` 明确确认消息；`retry()` 请求重新投递，单条确认优先于批次行为。达到重试上限后消息进入配置的 DLQ；无 DLQ 则删除。DLQ 是另一条队列，需要另行消费或人工处理，且有保留期，不能当永久错误档案。[确认与重试](https://developers.cloudflare.com/queues/configuration/batching-retries/)、[DLQ](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)

**代码现状：** 配置为 `max_batch_size: 1`、`max_retries: 3`，有 DLQ。批次 1 是保守的调用预算控制，不代表消费者总并发为 1。当前还存在数据库 `attempts`、抓取器内部尝试、队列 retry 三套计数，需要分别说明，不宜合称“重试三次”。[配置](../frontend/wrangler.jsonc)、[消费者并发](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/)

建议：保持批次 1，先观察耗时、D1 错误和积压，再决定是否提高。为 DLQ 写清检查、定位条目、重放与最终失败处理步骤；重放必须复用原 `itemId` 并检查终态。

## 3. 待处理记录可以承担 outbox，但恢复有条件

**代码现状：** 确认任务时，任务 `running` 和条目 `pending` 在 D1 batch 中提交；派发先将 `nextDispatchAt` 推迟五分钟，再调用 `sendBatch`。尚未成功处理的条目在租约和派发时间过期后，由五分钟 Cron 再次选择。

**推断：** 这能覆盖“写入派发时间后、发送前崩溃”以及“发送成功但调用方未收到结果”的窗口；前者延迟补发，后者可能重复。数据库写入与队列发送没有在这里组成同一原子事务。D1 batch 的原子性只覆盖它包含的 SQL，不包含外部 Queue 调用。[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[Queues 发送 API](https://developers.cloudflare.com/queues/configuration/javascript-apis/)

恢复成立需同时满足：

- pending/processing 记录仍保留，且任务维持 running；
- Cron 持续运行，DB 与 Queue 后续恢复可用；
- 查询不再持续触发同一个确定性错误；
- 过期租约允许重新处理，消费者保持幂等。

所以“五分钟定时补发”不是“五分钟内保证完成”：存在严格 `< now` 的时间条件、积压、每轮 200 项上限及服务故障。终态 failed 不会自动补发，这是当前行为。

**值得优先改的小问题：** 当前 scheduled handler 先 `await dispatchImportItems`，然后才派发普通 RSS 同步。OPML 派发异常会使该轮普通同步也跳过。建议分别捕获并记录两个任务的异常，保留失败信号，同时让另一项有机会执行；不要未经预算核算就改为无限并行。[当前 scheduled handler](../frontend/src/worker.ts)

选择待派发记录与更新时间也不是原子抢占；确认接口和 Cron 重叠可能发送重复消息。当前幂等消费可以承受，暂不必升级架构。只有观察到显著重复/争抢开销时，再使用带条件更新及返回实际抢占行的原子派发租约。

## 4. 区分暂时失败与永久失败

**代码现状：** [RSSFetcher](../api/src/lib/rss/fetcher.ts) 对抛出的网络/解析等异常最多尝试 3 次；HTTP 非成功响应以 `success: false` 返回，429/5xx 不进入其异常重试分支。抓取最终抛错后，导入服务写入 failed 并正常返回，消费者随后 ack。因此配置 `max_retries: 3` 不会替这些抓取失败再试三次。

**建议：** 后续小改动将错误归类。429、暂时性 5xx、超时可进入有上限的延迟重试；无效 URL、明确不可恢复的解析/访问问题直接成为终态。保留总尝试预算，避免抓取器与队列重试相乘；队列支持延迟 retry，可用它实现退避，而不是长时间占用单次 handler。[Queues 延迟与重试](https://developers.cloudflare.com/queues/configuration/batching-retries/)

这属于提高恢复能力的产品改进，不影响本次参数修复正确性。若暂不实现，应明确告诉用户“抓取失败需重新导入”，不能展示为后台仍在重试。

## 5. 测试：SQLite 回归保留，补一条真实 runtime 路径

**代码现状：** API Vitest 使用 Node 环境；D1 helper 实际执行 `node:sqlite`，手工模拟 batch 回滚及 100 参数限制。已有 99、100、147、200 条派发和 201 条部分发送失败回归。它能验证 SQL 与逻辑，但不能证明平台调用预算、Queues 投递和 workerd 生命周期。[测试配置](../api/vitest.config.ts)、[D1 helper](../api/src/__tests__/helpers/d1.ts)

helper 把字符串限制设为 1,000,000 bytes，与目前官方 2,000,000 bytes 不同；这可以是更保守的应用限制，但不能标成精确模拟 D1。它也没有模拟每次 invocation 查询数。

**建议最小验收集：**

1. 保留现有快速测试，不整体替换。
2. 把 100/147 条确认→派发→消费→完成，以及第二批发送失败→过期补发，做成可重复的本地 workerd + D1/Queues smoke。
3. 加一个重复消息、租约过期后旧消费者继续返回的竞态用例，检查没有重复订阅/文章或覆盖新租约结果。
4. 本地通过后，只在授权的测试环境检查真实绑定与平台限额；本地成功不等于生产验证。

官方建议测试运行于 Workers runtime；本地 Miniflare 使用 workerd，但仍不同于 Cloudflare 网络环境。当前官方 Vitest 文档推荐 `@cloudflare/vitest-plugin`，并给旧 `@cloudflare/vitest-pool-workers` 迁移指引；仓库已安装旧 pool，但配置尚未启用。应按安装版本选可运行路径，工具链迁移单独评估，不照抄旧技能示例。[Workers testing](https://developers.cloudflare.com/workers/testing/)、[Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)、[本地开发边界](https://developers.cloudflare.com/workers/local-development/)

## 6. 可观测性：基础已具备，缺的是失败原因

**代码现状：** 配置已经启用日志采样 1、trace 采样 0.05；`CloudflareEnv` 是生成的 `Cloudflare.Env` 别名，基础配置无需重复改造。日志和 trace 是独立开关，现有写法符合官方配置。[配置](../frontend/wrangler.jsonc)、[环境类型](../api/src/types.ts)、[Workers traces](https://developers.cloudflare.com/observability/traces/workers-tracing/)

路由吞掉派发异常后只记录 `opml_dispatch_deferred` 和 jobId；消费者仅记 `opml_item_retry` 和 itemId，没有阶段或受控原因，难以区分参数错误、Queue 不可用和 DB 错误。

建议增加结构化字段 `jobId/itemId`、`stage`、`errorCode`、`attempt`、`batchSize`、耗时；错误信息先清理，不记录 XML、完整订阅 URL/query 或认证信息。先关注“最老 pending/processing 年龄、失败分类、补发次数、DLQ 积压”，小项目不必先建设复杂监控平台。

## 实施顺序与验证边界

| 顺序 | 建议 | 验收标准 |
| --- | --- | --- |
| 优先 | 保留 JSON 修复；补受控错误原因与 Cron 失败隔离 | 导入派发失败可定位，且不阻断普通同步 |
| 优先 | 固化最小 runtime smoke | 100/147 条、部分失败恢复、重复投递可重复验证 |
| 随后 | 暂时/永久错误分类与有限退避 | 429/5xx/超时可恢复，永久失败会收敛 |
| 随后 | DLQ 操作说明与积压检查 | 知道何时人工介入、如何安全重放 |
| 按证据再做 | 原子派发抢占、提高并发、拆分队列 | 有重复开销、积压或资源争用数据支撑 |

本报告只完成来源核验与代码分析。没有执行部署、真实账号导入或生产 D1 查询；线上任务恢复和实际 Cloudflare 套餐/配额仍需独立验证。
