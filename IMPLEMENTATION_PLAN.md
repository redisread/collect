# Collect 2.0 实施计划

## 📋 概览

**设计主题**：Warmth in Focus —— 专注中的温暖陪伴
**实施目标**：彻底重构 UI/UX，打造温暖、现代、高级的阅读体验
**参考风格**：slock.ai 色彩氛围 + 温暖情感化升级

---

## 🎯 实施阶段

### Phase 1：基础样式迁移（优先级：高）

**目标**：将新 Design System tokens 应用到项目中

**任务清单**：
- [ ] 备份现有 `global.css`
- [ ] 将 `global-new.css` tokens 合并到现有样式
- [ ] 验证 Dark Mode 切换
- [ ] 测试色彩对比度（可访问性）

**文件**：
```
frontend/src/styles/global.css → 更新 tokens
```

**预计时间**：2-3 小时

---

### Phase 2：核心组件重构（优先级：高）

**目标**：替换关键 UI 组件为新设计版本

#### 2.1 布局组件
- [ ] 用 `TopBar.tsx` 替换现有顶部导航
- [ ] 用 `ContextPanel.tsx` 替换 `Sidebar.tsx`
- [ ] 调整 `ThreeColumnLayout.tsx` 为新架构

**文件**：
```
frontend/src/components/app/layout/TopBar.tsx (新建)
frontend/src/components/app/layout/ContextPanel.tsx (新建)
frontend/src/components/app/layout/Sidebar.tsx → 归档/替换
frontend/src/components/app/layout/ThreeColumnLayout.tsx → 更新
```

#### 2.2 内容组件
- [ ] 用 `ArticleCardV2.tsx` 替换现有卡片
- [ ] 用 `EmptyStateV2.tsx` 替换现有空状态

**文件**：
```
frontend/src/components/app/article/ArticleCardV2.tsx (新建)
frontend/src/components/app/article/ArticleCard.tsx → 替换
frontend/src/components/app/common/EmptyStateV2.tsx (新建)
frontend/src/components/app/common/EmptyState.tsx → 替换
```

**预计时间**：4-6 小时

---

### Phase 3：页面视图重构（优先级：中）

**目标**：实现新的三大核心视图架构

#### 3.1 Today 视图
- [ ] 创建 `TodayView.tsx`
- [ ] 实现智能排序逻辑
- [ ] 欢迎卡片 + 今日统计

#### 3.2 Explore 视图
- [ ] 创建 `ExploreView.tsx`
- [ ] 跨源发现算法
- [ ] 标签过滤系统

#### 3.3 Library 视图
- [ ] 创建 `LibraryView.tsx`
- [ ] 高级筛选（日期/来源/状态）
- [ ] 归档/批量操作

**文件**：
```
frontend/src/pages/today.tsx (新建)
frontend/src/pages/explore.tsx (新建)
frontend/src/pages/library.tsx (新建)
```

**预计时间**：8-12 小时

---

### Phase 4：交互动画优化（优先级：中）

**目标**：添加情感化的微交互和页面过渡

**任务清单**：
- [ ] 安装 Framer Motion（可选）
- [ ] 卡片列表进入动画
- [ ] 页面过渡效果
- [ ] 按钮/输入框微交互
- [ ] 加载骨架屏动画
- [ ] Toast 通知动画

**文件**：
```
frontend/src/components/ui/Transitions.tsx (新建)
frontend/src/hooks/usePageTransition.ts (新建)
```

**预计时间**：4-6 小时

---

### Phase 5：微文案替换（优先级：低）

**目标**：将所有界面文案替换为温暖版本

**任务清单**：
- [ ] 审查所有现有文案
- [ ] 创建文案映射表
- [ ] 逐步替换组件内文案
- [ ] 添加国际化支持准备

**文案映射示例**：
| 原文案 | 新文案 |
|--------|--------|
| "未找到结果" | "没找到相关内容，换个关键词试试？🔍" |
| "加载中..." | "正在为你准备内容..." |
| "空列表" | "好安静啊，去订阅一些有趣的东西吧～📭" |

**预计时间**：2-3 小时

---

### Phase 6：测试与优化（优先级：高）

**目标**：确保设计一致性和性能

**任务清单**：
- [ ] 视觉回归测试
- [ ] Dark Mode 全面测试
- [ ] 响应式布局测试
- [ ] 性能优化（Lighthouse）
- [ ] 可访问性测试（WCAG）
- [ ] 用户测试反馈

**预计时间**：4-6 小时

---

## 📊 优先级矩阵

| 功能 | 影响 | 难度 | 优先级 |
|------|------|------|--------|
| 基础样式迁移 | 高 | 低 | P0 |
| 核心组件重构 | 高 | 中 | P0 |
| 页面视图重构 | 高 | 高 | P1 |
| 交互动画优化 | 中 | 中 | P1 |
| 微文案替换 | 中 | 低 | P2 |
| 测试与优化 | 高 | 中 | P1 |

---

## 🔧 技术依赖

### 需要安装的包

```bash
# 可选：动画库
pnpm add framer-motion

# 可选：Toast 通知
pnpm add sonner

# 可选：手势支持
pnpm add @use-gesture/react
```

### shadcn/ui 组件定制

需要定制的组件：
- Button（新增 variant: warm）
- Card（增加 shadow 变体）
- Input（更新 focus 样式）
- Badge（更新色彩）
- Skeleton（更新动画）

---

## 📅 建议时间表

| 阶段 | 时间 | 产出 |
|------|------|------|
| Phase 1 | Day 1 | 新样式系统上线 |
| Phase 2 | Day 2-3 | 核心组件替换完成 |
| Phase 3 | Day 4-6 | 新视图架构完成 |
| Phase 4 | Day 7-8 | 交互动画完成 |
| Phase 5 | Day 9 | 微文案完成 |
| Phase 6 | Day 10-11 | 测试与优化 |

**总计**：约 11 个工作日（可根据优先级调整）

---

## ✅ 验收标准

### 视觉验收
- [ ] 色彩与 `DESIGN_SYSTEM.md` 一致
- [ ] Dark Mode 显示正确
- [ ] 响应式布局无错位
- [ ] 动画流畅无卡顿

### 体验验收
- [ ] 悬停/点击反馈明显
- [ ] 加载状态有温度
- [ ] 空状态不空洞
- [ ] 错误提示友好

### 技术验收
- [ ] Lighthouse 分数 > 90
- [ ] 无控制台错误
- [ ] 通过 WCAG 2.1 AA
- [ ] 代码通过 lint

---

## 📝 变更日志

**2026-03-21**
- 创建实施计划文档
- 完成 Phase 1-6 规划
- 定义验收标准

---

*文档维护：Design Director*
*最后更新：2026-03-21*
