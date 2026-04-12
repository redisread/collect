## Why

双语翻译功能已在上一个变更中完整实现（后端分段翻译 + KV 缓存 + 速率限制、前端三模式 UI、移动端 Flutter 翻译），但仍有以下待改进项：

1. **缺少手动验证测试**：前端三模式切换、移动端端到端翻译流程尚未实际验证
2. **翻译质量未优化**：Google Translate 公共接口返回质量未经调优，HTML 结构保留不完整
3. **语言覆盖有限**：仅支持 5 种语言（zh-CN/zh-TW/en/ja/ko），不支持更多语言
4. **无翻译历史**：用户无法查看之前翻译过的文章或翻译记录
5. **离线翻译缺失**：移动端未实现离线缓存翻译结果（仅在线翻译）

## What Changes

- 完成剩余手动测试验证（4.4 ~ 4.7）
- 增加更多翻译语言支持（法语、德语、西班牙语、俄语等）
- 优化翻译质量：改进 HTML 结构保留和段落重组逻辑
- 添加翻译历史记录功能：记录用户翻译过的文章和语言
- 移动端离线翻译缓存优化

## Capabilities

### New Capabilities
- `translation-history`: 翻译历史记录能力，用户可查看和回顾翻译过的文章
- `extended-language-support`: 扩展翻译语言支持，新增 10+ 种语言
- `offline-translation`: 移动端离线翻译缓存能力

### Modified Capabilities
- `article-translation`: 优化翻译质量，改进 HTML 结构保留
- `mobile-translation`: 增强离线缓存和翻译历史

## Impact

- **后端**：`api/src/routes/translate.ts` 优化 HTML 处理逻辑，增加语言白名单
- **后端**：新增翻译历史存储（D1 表或 KV 扩展）
- **前端**：新增翻译历史页面和 UI 组件
- **移动端**：`mobile/` 增强本地缓存逻辑，支持离线查看
- **依赖**：可能需要额外的 D1 表存储翻译历史
