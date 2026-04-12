## Why

CI `Lint & Type Check` workflow 在 PR #1 上失败，错误为 `pnpm/action-setup@v4` 的 `version: 9` 配置与 `package.json` 中 `packageManager: "pnpm@9.0.0"` 字段冲突，导致 `ERR_PNPM_BAD_PM_VERSION` 错误阻断后续 type-check 步骤。

## What Changes

- 移除 `.github/workflows/lint.yml` 中 `pnpm/action-setup@v4` 的 `version: 9` 参数，让 action 自动从 `packageManager` 字段读取版本

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `.github/workflows/lint.yml` — CI 配置修复
- 所有 PR 的 CI 检查将恢复正常
