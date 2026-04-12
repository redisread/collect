## 1. Backend — 扩展语言支持与配置化

- [x] 1.1 创建 `api/src/config/languages.ts` 共享语言配置常量（15 种语言）
- [x] 1.2 更新 `api/src/routes/translate.ts` 使用配置化语言白名单替代硬编码
- [x] 1.3 更新 `api/src/routes/translate.ts` 优化 HTML 分段逻辑，为每个 block 元素生成 tag 标记以保留结构
- [x] 1.4 更新 `api/src/db/schema.ts` 添加 translation_history 表定义

## 2. Frontend — 语言选择器与翻译历史

- [x] 2.1 更新 `frontend/src/lib/types.ts` 添加 `TranslationHistoryEntry` 类型
- [x] 2.2 更新 `frontend/src/lib/store/articleStore.ts` 使用 15 种语言列表
- [x] 2.3 更新 `frontend/src/components/app/article/ArticleToolbar.tsx` 语言选择器扩展至 15 种语言
- [x] 2.4 翻译历史 API 调用（集成在 TranslationHistory 组件中）
- [x] 2.5 创建 `frontend/src/components/app/translation/TranslationHistory.tsx` 翻译历史页面组件
- [x] 2.6 创建 `frontend/src/pages/translations.astro` 翻译历史路由页面
- [x] 2.7 在侧边栏添加"翻译历史"导航入口

## 3. Backend — 翻译历史存储

- [x] 3.1 创建 D1 迁移文件：添加 `translation_history` 表
- [x] 3.2 创建 `api/src/routes/translations.ts` 翻译历史 API 路由（含分页查询和删除）
- [x] 3.3 在翻译成功时自动写入翻译历史记录
- [x] 3.4 在 `api/src/index.ts` 注册翻译历史路由

## 4. Mobile — 离线翻译缓存与历史

- [x] 4.1 更新 `mobile/lib/providers/translation_provider.dart` 添加离线缓存检查逻辑
- [x] 4.2 更新 SharedPreferences 缓存格式，增加时间戳字段
- [x] 4.3 实现 7 天缓存过期检查逻辑
- [x] 4.4 添加离线状态检测（connectivity_plus）
- [x] 4.5 在文章详情页添加"离线"指示器 UI
- [x] 4.6 扩展移动端语言选择器至 15 种语言
- [x] 4.7 创建翻译历史本地缓存模型
- [x] 4.8 实现翻译历史同步逻辑（网络恢复时上传）
- [x] 4.9 创建移动端翻译历史页面

## 5. 测试与验证

- [x] 5.1 编写后端翻译历史 API 单元测试
- [x] 5.2 编写后端扩展语言配置单元测试
- [ ] 5.3 测试前端翻译历史页面渲染与交互
- [ ] 5.4 测试移动端离线翻译缓存场景
- [ ] 5.5 端到端测试：添加翻译 → 查看历史 → 删除历史 → 离线查看
