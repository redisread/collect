## Context

CI workflow `.github/workflows/lint.yml` 使用 `pnpm/action-setup@v4` 并显式指定 `version: 9`。同时项目 `package.json` 中有 `packageManager: "pnpm@9.0.0"`。`pnpm/action-setup@v4` 在同时检测到两者时会报错退出。

## Goals / Non-Goals

**Goals:**
- 修复 CI pnpm 版本冲突，使 lint/type-check 步骤正常运行

**Non-Goals:**
- 不升级 pnpm 主版本
- 不修改 CI 其他配置

## Decisions

### 移除显式 version 参数

`pnpm/action-setup@v4` 支持自动从 `package.json` 的 `packageManager` 字段读取版本。移除 `version: 9` 后，action 会自动使用 `pnpm@9.0.0`，这是项目声明的版本。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 移除 version 后 CI 使用 package.json 中声明的版本 | 这是预期行为，版本一致性由 packageManager 字段保证 |
