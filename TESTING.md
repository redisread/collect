# Collect 测试指南

本文档说明如何为 Collect RSS 阅读器项目运行单元测试。

## 项目结构

Collect 采用 pnpm monorepo 架构，包含以下子包：

- `api/` - Hono + Cloudflare Workers 后端
- `frontend/` - Astro + React 前端
- `mobile/` - Flutter 移动端

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 运行所有测试

```bash
pnpm test
```

## 各端测试

### 后端 API 测试

**框架**: Vitest + Miniflare (模拟 Cloudflare Workers 环境)

```bash
# 运行后端测试
pnpm test:api

# 或进入 api 目录
pnpm --filter api test

# 监视模式
pnpm --filter api test:watch

# 覆盖率报告
pnpm --filter api test:coverage
```

**测试文件位置**: `api/src/__tests__/*.test.ts`

**主要测试模块**:
- `parser.test.ts` - RSS 解析器测试
- `folders.test.ts` - 文件夹 API 测试

### 前端测试

**框架**: Vitest + jsdom

```bash
# 运行前端测试
pnpm test:frontend

# 或进入 frontend 目录
pnpm --filter frontend test

# 监视模式
pnpm --filter frontend test:watch

# 覆盖率报告
pnpm --filter frontend test:coverage
```

**测试文件位置**: `frontend/src/__tests__/*.test.ts`

**主要测试模块**:
- `utils.test.ts` - 工具函数测试 (cn, date 格式化)

### 移动端测试

**框架**: Flutter Test

```bash
# 运行移动端测试
pnpm test:mobile

# 或进入 mobile 目录
cd mobile && flutter test
```

**测试文件位置**: `mobile/test/**/*.dart`

**主要测试模块**:
- `models/feed_test.dart` - Feed 模型测试
- `models/article_test.dart` - Article 模型测试
- `models/folder_test.dart` - Folder 模型测试

## 添加新测试

### 后端测试示例

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

describe("My Feature", () => {
  it("should work correctly", async () => {
    // Arrange
    const app = new Hono();

    // Act
    const res = await app.request("/test");

    // Assert
    expect(res.status).toBe(200);
  });
});
```

### 前端测试示例

```typescript
import { describe, it, expect } from "vitest";
import { cn } from "../src/lib/utils/cn";

describe("Utility Function", () => {
  it("should merge classes", () => {
    const result = cn("class1", "class2");
    expect(result).toBe("class1 class2");
  });
});
```

### 移动端测试示例

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:collect/models/feed.dart';

void main() {
  group('Feed Model', () {
    test('should create from JSON', () {
      final json = {'id': '1', 'title': 'Test'};
      final feed = Feed.fromJson(json);
      expect(feed.id, '1');
    });
  });
}
```

## 持续集成

建议在 CI/CD 流程中添加：

```yaml
- name: Run Tests
  run: |
    pnpm install
    pnpm test
```

## 覆盖率目标

建议各模块达到以下覆盖率：

- **后端 API**: 70%+
- **前端工具**: 80%+
- **移动端模型**: 90%+

## 常见问题

### 后端测试失败：找不到 D1 绑定

确保使用 Miniflare 环境，它会自动模拟 Cloudflare Workers 环境。

### 前端测试：找不到模块

检查 vitest.config.ts 中的路径配置是否正确。

### 移动端测试：找不到测试文件

确保测试文件以 `_test.dart` 结尾，并位于 `mobile/test/` 目录下。
