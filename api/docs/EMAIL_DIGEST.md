# 邮件订阅摘要功能

## 功能概述

邮件订阅摘要功能允许用户接收每日或每周的未读文章摘要邮件，帮助用户及时了解自己订阅的最新内容。

## 实现架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  HTTP 路由   │   │   Cron 任务  │   │  Resend API  │    │
│  │              │   │              │   │              │    │
│  │ /api/settings│   │ 每小时触发   │   │ 发送邮件     │    │
│  │ (配置管理)   │   │              │   │              │    │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            ▼                                │
│                   ┌────────────────┐                       │
│                   │  邮件服务层    │                       │
│                   │                │                       │
│                   │ - 模板渲染     │                       │
│                   │ - 邮件发送     │                       │
│                   └───────┬────────┘                       │
│                           ▼                                 │
│                   ┌────────────────┐                       │
│                   │    D1 数据库   │                       │
│                   └────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 数据模型 (schema.ts)

用户表增加了以下字段：

```typescript
emailDigestEnabled: boolean    // 是否启用邮件摘要
emailDigestFrequency: string   // "daily" | "weekly" | "off"
emailDigestTime: string        // 发送时间，格式 "HH:MM"
emailDigestDay: number         // 每周几发送（1-7，周日=7）
lastDigestSentAt: string       // 上次发送时间
```

### 2. 邮件服务 (lib/email/index.ts)

- **发送邮件**：使用 Resend API 发送邮件
- **HTML 模板**：美观的响应式邮件模板
- **纯文本备选**：支持纯文本邮件客户端

### 3. 定时任务 (lib/scheduler/digest.ts)

- **调度逻辑**：根据用户配置的时间和频率发送
- **防止重复**：通过 `lastDigestSentAt` 确保每天/每周只发送一次
- **测试模式**：支持模拟发送（不调用真实 API）

### 4. 设置 API (routes/settings.ts)

- `GET /api/settings` - 获取用户邮件设置
- `PUT /api/settings` - 更新邮件设置
- `POST /api/settings/test-digest` - 发送测试邮件

## 配置说明

### wrangler.toml

```toml
[triggers]
crons = ["0 * * * *"]  # 每小时运行一次
```

Cron 表达式说明：
- `0 * * * *` - 每小时运行一次
- `0 9 * * *` - 每天上午 9 点运行
- `0 9 * * 1` - 每周一上午 9 点运行

### 环境变量

```bash
# 添加到 wrangler.toml 或 .dev.vars
RESEND_API_KEY = "your_resend_api_key"
FRONTEND_URL = "https://collect.app"
```

## API 使用示例

### 获取设置

```bash
curl -X GET http://localhost:8787/api/settings \
  -H "Cookie: session=your_session_cookie"
```

响应：
```json
{
  "success": true,
  "data": {
    "emailDigest": {
      "enabled": true,
      "frequency": "daily",
      "time": "09:00",
      "day": 1
    }
  }
}
```

### 更新设置

```bash
curl -X PUT http://localhost:8787/api/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{
    "emailDigest": {
      "enabled": true,
      "frequency": "daily",
      "time": "09:00",
      "day": 1
    }
  }'
```

### 发送测试邮件

```bash
curl -X POST http://localhost:8787/api/settings/test-digest \
  -H "Cookie: session=your_session_cookie"
```

## 本地测试

### 1. 安装依赖

```bash
cd api && pnpm install
```

### 2. 配置环境变量

创建 `.dev.vars` 文件：

```
RESEND_API_KEY=re_xxxxxxxx
collect_FE_URL=http://localhost:4321
```

### 3. 运行开发服务器

```bash
pnpm dev:api
```

### 4. 测试邮件发送

在没有配置 `RESEND_API_KEY` 的情况下，系统会自动进入模拟模式：

```bash
# 发送测试邮件（模拟模式）
curl -X POST http://localhost:8787/api/settings/test-digest \
  -H "Cookie: session=your_session_cookie"
```

响应将包含生成的 HTML 内容：
```json
{
  "success": true,
  "data": {
    "message": "Test email generated (mock mode)",
    "html": "<!DOCTYPE html>..."
  }
}
```

### 5. 真实邮件发送

配置 `RESEND_API_KEY` 后，测试邮件将真实发送：

```bash
# 发送真实测试邮件
curl -X POST http://localhost:8787/api/settings/test-digest \
  -H "Cookie: session=your_session_cookie"
```

## 部署

### 1. 配置 Resend

1. 注册 [Resend](https://resend.com)
2. 添加并验证域名
3. 获取 API Key

### 2. 配置环境变量

```bash
wrangler secret put RESEND_API_KEY
# 输入你的 Resend API Key
```

### 3. 部署 Workers

```bash
pnpm deploy
```

### 4. 配置 Cron Triggers

在 Cloudflare Dashboard 中配置 Cron Triggers：
- 每小时运行：`0 * * * *`
- 或每天运行：`0 9 * * *`

## 邮件模板预览

邮件模板特点：
- 响应式设计，支持移动端
- 简洁现代的风格
- 包含 Collect 品牌标识
- 文章列表展示（标题、来源、摘要）
- 一键跳转阅读链接
- 退订和设置链接

## 注意事项

1. **频率限制**：Resend 免费版有每日发送限制
2. **时间精度**：Cron 每小时运行一次，实际发送时间可能有 1 小时误差
3. **重复发送**：系统通过 `lastDigestSentAt` 字段防止重复发送
4. **无未读文章**：如果没有未读文章，不会发送邮件

## 未来优化

- [ ] 支持更多邮件服务商（SendGrid、AWS SES）
- [ ] 支持自定义邮件模板
- [ ] 支持按文件夹/订阅源筛选摘要内容
- [ ] 支持阅读进度统计
- [ ] 支持 A/B 测试邮件内容
