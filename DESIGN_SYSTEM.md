# Collect 2.0 设计系统文档

## 🎨 设计理念

### Warmth in Focus —— 专注中的温暖陪伴

RSS 阅读器不应该是一个冷冰冰的信息聚合工具，而是一个**懂你、关心你、让你感到安心的阅读伙伴**。

**核心价值观**：
- ☀️ **温暖** - 有温度的视觉和文案，让用户感到被关心
- 🧘 **专注** - 减少干扰，让阅读回归本质
- ✨ **愉悦** - 细腻的交互反馈，让每次使用都成为享受
- 🤝 **陪伴** - 不是工具，是可靠的阅读伙伴

---

## 🌈 色彩系统

### Primary Colors - 柔和蓝绿调

温暖、专业、可靠的主色调，从 slock.ai 的青绿进化而来，但加入更多暖意。

```css
--primary-50: #EEFDFB   /* 极浅的背景点缀 */
--primary-100: #D4F7F3  /* 徽章背景、选中状态 */
--primary-200: #A8EBE0  /* 悬停背景 */
--primary-300: #6FD9C9  /* 边框强调 */
--primary-400: #3AC2B0  /* 悬停主色 */
--primary-500: #14A592  /* 主色 - 按钮、链接、焦点 */
--primary-600: #0D8577  /* 悬停深化 */
--primary-700: #0B6A61  /* 文字强调 */
```

### Accent Colors - 温暖琥珀橙

温暖的强调色，用于需要吸引注意力的场景。

```css
--accent-50: #FFFBF7    /* 极浅的背景点缀 */
--accent-100: #FFF4E8   /* 徽章背景 */
--accent-200: #FFE6D0   /* 悬停背景 */
--accent-300: #FFCEA8   /* 边框强调 */
--accent-400: #FFAB70   /* 悬停强调 */
--accent-500: #FF8545   /* 强调色 - CTA、重要通知 */
--accent-600: #E86A32   /* 悬停深化 */
```

### Neutral Colors - 带暖调的灰阶

避免纯灰的冰冷感，加入微妙的暖色调。

```css
--neutral-50: #FAFAFB   /* 基础背景 */
--neutral-100: #F3F4F6  /* 分组背景 */
--neutral-200: #E5E7EB  /* 边框 */
--neutral-300: #D1D5DB  /* 分隔线 */
--neutral-400: #9CA3AF  /* 三级文字 */
--neutral-500: #6B7280  /* 次要文字 */
--neutral-600: #4B5563  /* 次要文字 */
--neutral-700: #374151  /* 标题 */
--neutral-800: #1F2937  /* 主标题 */
--neutral-900: #111827  /* 最深文字 */
```

### Semantic Colors - 友好的反馈色

```css
--success: #10B981  /* 翡翠绿 - 完成、成功 */
--warning: #F59E0B  /* 琥珀黄 - 警告、注意 */
--error: #EF4444    /* 柔红 - 错误、删除 */
--info: #3B82F6     /* 天蓝 - 信息、提示 */
```

### Dark Mode - "午夜阅读"模式

不是简单的颜色反转，而是重新调色的护眼暗色主题。

```css
/* 深蓝色黑基础 */
--bg-base: #0B0F14
--bg-surface: #1A2029
--bg-raised: #242B36

/* 柔和的文字对比度 */
--text-primary: #F3F4F6
--text-secondary: #9CA3AF
--text-tertiary: #6B7280

/* 更柔和的强调色（降低饱和） */
--primary-500: #2DD4BF
--accent-500: #FB923C
```

---

## 📐 圆角系统

| 等级 | 值 | 用途 |
|------|-----|------|
| `sm` | 6px | 小按钮、徽章 |
| `md` | 10px | 输入框、卡片内元素 |
| `lg` | 16px | 标准卡片 |
| `xl` | 20px | 大模块、弹窗 |
| `2xl` | 28px | 大卡片、对话框 |
| `full` | 9999px | 头像、胶囊按钮 |

---

## 🎭 阴影系统

### 基础阴影

```css
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 12px 48px rgba(0, 0, 0, 0.12);
--shadow-2xl: 0 24px 80px rgba(0, 0, 0, 0.15);
```

### 彩色阴影（增加情感）

```css
--shadow-primary: 0 4px 16px rgba(20, 165, 146, 0.15);
--shadow-accent: 0 4px 16px rgba(255, 133, 69, 0.2);
```

---

## ✍️ 排版系统

### 字号 Scale

```css
--text-xs: 12px;      /* 徽章、辅助说明 */
--text-sm: 14px;      /* 次要信息、时间戳 */
--text-base: 15px;    /* 正文字号 */
--text-lg: 16px;      /* 强调文字 */
--text-xl: 18px;      /* 小标题 */
--text-2xl: 22px;     /* 卡片标题 */
--text-3xl: 26px;     /* 页面标题 */
--text-4xl: 32px;     /* 展示大标题 */
```

### 字重

```css
--font-weight-normal: 400;    /* 正文 */
--font-weight-medium: 500;    /* 强调 */
--font-weight-semibold: 600;  /* 标题 */
--font-weight-bold: 700;      /* 大标题 */
```

### 行高

```css
--line-height-tight: 1.3;    /* 大标题 */
--line-height-snug: 1.5;     /* 标题、卡片文字 */
--line-height-normal: 1.6;   /* 正文 */
--line-height-relaxed: 1.75; /* 长文阅读 */
```

---

## 🎬 动效系统

### 时长

```css
--transition-fast: 100ms;   /* 微交互：hover、focus */
--transition-base: 200ms;   /* 标准过渡：卡片、按钮 */
--transition-slow: 350ms;   /* 页面过渡、大型动画 */
```

### 缓动曲线

```css
/* 标准缓出 */
--ease-out: cubic-bezier(0.215, 0.61, 0.355, 1);

/* 缓入缓出 */
--ease-in-out: cubic-bezier(0.645, 0.045, 0.355, 1);

/* 弹性效果（用于愉悦反馈） */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 关键帧动画

```css
/* 淡入上浮 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 滑入右侧 */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 缩放进入 */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* 微光加载 */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 脉冲光环（用于未读指示器） */
@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.5); opacity: 0; }
}
```

---

## 🧩 组件设计指南

### 卡片组件

```tsx
// 标准卡片
<div className="card">
  {/* 内容 */}
</div>

// 悬浮卡片（可点击）
<div className="card card-elevated hover:-translate-y-0.5">
  {/* 内容 */}
</div>

// 选中状态
<div className="card ring-2 ring-primary-500 ring-offset-2">
  {/* 内容 */}
</div>
```

### 按钮组件

```tsx
// 主按钮
<button className="btn btn-primary">
  主要操作
</button>

// 强调按钮（CTA）
<button className="btn btn-accent">
  立即开始
</button>

// 次要按钮
<button className="btn btn-secondary">
  取消
</button>

// 幽灵按钮
<button className="btn btn-ghost">
  了解更多
</button>
```

### 输入框组件

```tsx
<input
  className="input"
  placeholder="搜索文章..."
/>
```

### 徽章组件

```tsx
<span className="badge badge-primary">
  新功能
</span>

<span className="badge badge-accent">
  热门
</span>

<span className="badge badge-neutral">
  普通
</span>
```

---

## 💬 微文案指南

### 语气原则

1. **温暖友好** - 像朋友一样对话，避免机械式语言
2. **简洁清晰** - 简短但有信息量
3. **积极赋能** - 强调用户能做到什么，而不是不能
4. **有情感** - 适当使用表情符号和语气词

### 示例对比

| ❌ 冰冷工具感 | ✅ 温暖伙伴感 |
|--------------|--------------|
| "未找到结果" | "没找到相关内容，换个关键词试试？🔍" |
| "加载失败" | "有点小问题，我正在努力修复～" |
| "没有未读文章" | "全部读完了！真棒！✨" |
| "空列表" | "好安静啊，去订阅一些有趣的东西吧～📭" |
| "刷新" | "检查新内容" |
| "删除" | "移除" |
| "错误 404" | "这里什么都没有，我们回去吧" |

### 常见场景文案

**加载状态：**
- "正在为你准备内容..."
- "正在检查新内容，马上就好～"
- "第一次见面，正在认识你的订阅源..."

**空状态：**
- 无内容："好安静啊，去订阅一些有趣的东西吧～"
- 无未读："全部读完了！休息一下，或者探索点新的？"
- 搜索无结果："没找到相关内容，换个关键词试试？"
- 离线："好像断线了，别担心，上线后我会帮你带回顾错过的内容"

**成功反馈：**
- "太好了！"
- "已完成！✅"
- "订阅成功！开始阅读吧～"

**错误处理：**
- "有点小问题，请稍后再试"
- "网络开小差了，检查一下连接？"
- "这个内容暂时无法访问"

---

## 🏗 信息架构

### 新导航结构

```
┌─────────────────────────────────────────┐
│  TopBar (全局导航)                       │
│  [Logo]  Today · Explore · Library      │
└─────────────────────────────────────────┘

┌──────────────┬──────────────────────────┐
│ ContextPanel │   Main Content           │
│ (动态内容)   │                          │
│              │  • Today: 智能排序        │
│ • 快捷过滤   │  • Explore: 发现视图     │
│ • 分组信息   │  • Library: 归档库       │
│ • 未读数     │                          │
│              │                          │
└──────────────┴──────────────────────────┘
```

### 核心视图

| 视图 | 目的 | 情感基调 |
|------|------|----------|
| **Today** | 今日精选，智能排序 | "为你准备" |
| **Explore** | 发现新内容，跨源探索 | "惊喜发现" |
| **Library** | 已读/归档，高级筛选 | "整理回忆" |

---

## 📱 响应式断点

```css
/* 移动优先 */
--breakpoint-sm: 640px;   /* 大手机 */
--breakpoint-md: 768px;   /* 小平板 */
--breakpoint-lg: 1024px;  /* 大平板/小笔记本 */
--breakpoint-xl: 1280px;  /* 桌面 */
--breakpoint-2xl: 1536px; /* 大桌面 */
```

---

## ♿ 可访问性

### 对比度要求

- 正常文字：至少 4.5:1
- 大文字（18px+ 或 14px+ bold）：至少 3:1
- UI 组件、图形：至少 3:1

### 焦点样式

```css
:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}
```

### 键盘导航

- Tab 键：在可交互元素间顺序导航
- Enter/Space：激活按钮、链接
- Escape：关闭弹窗、取消操作
- 方向键：列表导航

---

## 🎯 实施清单

### 第一阶段：基础建设
- [ ] 替换全局 CSS tokens
- [ ] 更新 Typography 系统
- [ ] 实现阴影和圆角系统
- [ ] 添加动效关键帧

### 第二阶段：组件重构
- [ ] TopBar 组件
- [ ] ContextPanel 组件
- [ ] ArticleCardV2 组件
- [ ] EmptyStateV2 组件
- [ ] LoadingState / SuccessState

### 第三阶段：页面整合
- [ ] Today 视图
- [ ] Explore 视图
- [ ] Library 视图
- [ ] 设置页面

### 第四阶段：细节打磨
- [ ] 微交互优化
- [ ] 微文案替换
- [ ] 性能优化
- [ ] 可访问性测试

---

## 📝 更新日志

**v2.0 - Warmth in Focus**
- 全新色彩系统：柔和蓝绿 + 温暖琥珀
- 重新设计的暗色模式
- 温暖的微文案系统
- 新的动效曲线和关键帧
- 重构的核心组件

---

*设计系统文档最后更新：2026-03-21*
