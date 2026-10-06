# Visual Inspector — 产品哲学与设计原则

## 我们是什么

Visual Inspector 是一个介于 AI 和专业代码之间的**可视化辅助工具**。

它**不是**一个直接修改代码的设计程序。它的核心工作方式是：

1. **标记** — 在页面上选中容器，添加标签注释
2. **微调** — 简单调整 CSS 属性（尺寸、间距、颜色等），记录每次变化
3. **生成** — 将「容器名称 + 参数变化 + 标签注释」融合为一个 AI 提示词
4. **交给 AI** — 由 Cursor / Claude 等 AI 根据提示词去真正修改源代码

### 为什么需要这个工具？

痛点：微调页面时，截图总是选不到对应的对象。AI 无法精确定位「哪个元素要改什么」。

Visual Inspector 解决的是**精确选择 + 精确描述变更**的问题，让非专业用户也能用可视化的方式告诉 AI「我要把这个按钮的宽度从 200px 改成 300px，内边距再大一点」。

---

## 两大核心功能

### 功能一：属性调整 → 参数变化记录

```
选中容器 → 在属性面板调整 CSS 参数 → 记录变化差异 (styleDiff)
→ 输出: { 容器选择器, { width: "200px → 300px", padding: "8px → 16px" } }
```

### 功能二：标签注释 → 需求描述

```
选中容器 → 添加文字标签（如 "按钮颜色太深"、"间距太大"） → 记录标签
→ 输出: { 容器选择器, 标签文本 }
```

### 最终融合

两者数据合并成一个结构化的 AI 提示词，精确告诉 AI：修改哪个元素、改什么参数、附带什么要求。

---

## 核心设计原则

### 原则 1：Overlay 是页面内 runtime，属性面板才是持久状态的唯一来源

**注入到被调试页面的所有 UI 元素（蓝框、浮动按钮、标签徽章）不是第二套编辑器，而是一层页面内 runtime。**

这层 runtime 负责：
- 渲染蓝框、浮动按钮、标签徽章与各种辅助高亮
- 在页面里提供即时反馈
- 把真正需要持久化的选择或样式变化回传给宿主

这层 runtime 不负责：
- undo/redo
- styleDiff
- baseline 重置策略
- 属性面板中的长期状态

浮动按钮采用 **style-nudge（先改后记）** 机制：

```
点击蓝框 W 按钮
→ ① picker 直接改 DOM: target.style.width = '358px' （用户立即看到效果）
→ ② picker 发 binding: { type:'style-nudge', styles:{ width:'358px' }, token }
→ ③ InspectorService: 通过 CDP setStyleProperties 正式写入
→ ④ getElementDetails → onElementSelected(element, { nudge:true, styles })
→ ⑤ App.tsx: 收到 nudge → setElement（不重置 baseline）+ 传 nudgeStyles
→ ⑥ PropertiesWorkbench: useEffect → updateStyles(styles) 记录到 undo/redo + styleDiff
```

**为什么是「先改后记」而不是「纯遥控」？**

这个问题经过多次迭代才解决。曾经尝试过的失败方案：

| 方案 | 失败原因 |
|------|---------|
| 旧 resize handles 直接改 DOM | 绕过 useStyleBinding，无 undo/redo，无 styleDiff |
| 纯 activate-property（只激活面板） | 按钮点击无即时效果，用户体验差 |
| 纯 increment-property（IPC 链路） | picker → CDP binding → InspectorService → IPC → React 链路过长，多次调试无法可靠通信 |

**style-nudge 同时解决了两个问题：**
1. **即时反馈** — picker 直接改 DOM，用户立刻看到效果
2. **正确记录** — 通过 binding 通知 React，走 useStyleBinding 记录 undo/redo + styleDiff

### 原则 2：如果语义等价于已有交互，就复用已有交互

**标签徽章不是新的选择系统。**

它的语义只是：
- 悬停标签 → 显示黄色虚线框高亮对应容器
- 点击标签 → 等价于直接点击对应容器

所以实现上也应尽量复用既有链路：
- hover 只负责预览，不改变正式选择
- click 优先复用“直接点击容器”的正常选择路径
- 不要为了标签再复制一套并行的 select 机制

这条原则适用于以后所有浮动控件：如果一个控件的意思本质上是“帮用户完成一次已有交互”，就应该派发或复用那次已有交互，而不是发明一条新协议。

### 原则 3：注入层与应用层严格分离

注入到被调试页面的元素和被调试页面本身的元素，必须有清晰的边界：

| 类别 | 标识 | 用途 |
|------|------|------|
| **Overlay 元素** | `data-vi-overlay-root="true"` | 我们注入的 UI（蓝框、按钮、徽章） |
| **应用元素** | 无特殊标识 | 被调试页面自身的 DOM 元素 |

所有 Overlay 元素：
- 被 `isOverlayElement()` 过滤，不可被选中
- z-index 在 2147483643-2147483647 范围
- 不参与 hover 检测
- 不影响被调试页面的事件流

### 原则 4：点击热区必须是一个完整控件，而不是由内部装饰元素分流

浮动控件在视觉上常常包含：
- 外层按钮/徽章容器
- 图标 `svg`
- 文本 `span`

但交互上必须只有**一个**点击面：
- 外层元素负责 click
- 内部装饰元素默认 `pointer-events:none`

这样用户点到背景、图标、还是文字，感觉都应该完全一致。只要视觉上属于一个按钮，交互上也必须是一个按钮。

### 原则 5：数据流必须只有两条显式通道

#### 宿主 → 页面 runtime

```
App.tsx
→ setExternalOverlayState({ tool, tags })
→ setActiveEditProperty(property)
→ picker runtime 更新页面内控件
```

#### 页面 runtime → 宿主

**选择流（select）— 标签徽章和直接点击共用：**
```
用户点击元素/标签徽章
→ picker 复用正常选择路径
→ CDP Binding → InspectorService
→ getElementDetails → onElementSelected(element)
→ IPC 'element-selected' → App.tsx
→ syncCurrentElement → useStyleBinding 重置 baseline
```

**修改流（style-nudge）— 浮动按钮专用：**
```
用户点击浮动按钮
→ picker 直接改 DOM（即时反馈）
→ picker 发 binding { type:'style-nudge', styles }
→ CDP Binding → InspectorService
→ CDP setStyleProperties（正式写入）
→ onElementSelected(element, { nudge:true, styles })
→ IPC → App.tsx → setElement（不重置 baseline）
→ PropertiesWorkbench → updateStyles（记录 undo/redo + styleDiff）
```

**关键区别：** select 会重置 baseline（新选择），nudge 不重置（在当前选择上追加修改）。

### 原则 6：修改浮动控件时，先判断问题属于哪一层

| 现象 | 应优先检查 |
|------|-----------|
| 按钮位置不对、hover 预览不稳定、badge 层级错误 | 注入 runtime (`connection.ts`) |
| 点击发出去了但属性面板没同步 | `InspectorService` / IPC |
| 样式已变化但没有进入 undo/redo 或 styleDiff | `App.tsx` + `useStyleBinding` |
| 标签数据是对的但页面没渲染 | `setExternalOverlayState` / `renderTags()` |

先找归属层，再改代码，可以避免每次都重写一条新的浮动机制。

---

## 系统架构概览

```
┌────────────────────────────────────────────────┐
│           被调试页面 (Target App)                │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │     注入的 Overlay 层                      │  │
│  │     ├─ 蓝色选择框 (overlay)               │  │
│  │     ├─ 浮动动作按钮 (action buttons)       │  │
│  │     ├─ 标签徽章 (tag badges)              │  │
│  │     ├─ 引导带 (margin/padding bands)      │  │
│  │     └─ 骨架层 (skeleton layer)            │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  用户操作 → emitPayload() → CDP Binding        │
└───────────────────┬────────────────────────────┘
                    │ Chrome DevTools Protocol
                    ▼
┌─────────────────────────────────────┐
│  packages/core                      │
│  ├─ CDPClient (WebSocket 连接)       │
│  ├─ CDPHelper (CDP 操作封装)         │
│  └─ InspectorService (业务编排)      │
└───────────────────┬─────────────────┘
                    │ Electron IPC
                    ▼
┌─────────────────────────────────────┐
│  packages/app (React 渲染进程)       │
│  ├─ App.tsx (状态管理)               │
│  ├─ useStyleBinding (变更追踪/撤销)   │
│  ├─ PropertiesWorkbench (属性编辑)   │
│  └─ WelcomeScreen (项目启动)         │
└─────────────────────────────────────┘
```

---

## 浮动动作按钮设计

选中元素后，蓝框周围显示 10 个方向性浮动按钮：

```
                [↑ margin 橙]
        ┌──────────────────────────────┐
        │    [↑ padding 绿]            │ [W 蓝]   点击 → width +8px
   [← 橙]│[← 绿]             [绿 →]  │ [→ 橙]
        │    [↓ padding 绿]            │
        └──────────────────────────────┘
                [↓ 橙] [H 蓝]   点击 → height +8px
```

| 按钮 | 颜色 | 机制 | 效果 |
|------|------|------|------|
| W / H | 蓝色方块 | style-nudge | 直接增加 width/height +8px |
| ↑↓←→ padding | 绿色圆形 | style-nudge | 直接增加对应方向 padding +8px |
| ↑↓←→ margin | 橙色圆形 | style-nudge | 直接增加对应方向 margin +8px |

智能显隐：容器 < 80px 隐藏内部 padding 按钮，< 50px 只显示 W/H。

---

## 开发规范

### 修改 Overlay 注入代码时

1. 所有新增的注入元素必须设置 `data-vi-overlay-root="true"`
2. 需要接收点击的元素设置 `pointer-events: auto`
3. 视觉装饰子元素（如 `svg`、`span`）默认设置 `pointer-events: none`，确保整个控件只有一个点击面
4. 样式修改必须走 **style-nudge 机制**：先 `target.style.setProperty()` 即时反馈，再通过 binding 发 `type:'style-nudge'` 通知属性面板记录
5. 选择操作优先复用 **select 管道**；如果语义上等价于点击目标元素，优先派发等价点击，而不是复制另一套选择逻辑
6. DOM 层级顺序：`skeletonLayer → overlay → tagBadgeLayer`（标签徽章必须在最顶层）
7. 修改注入 runtime 行为后，要同步更新 `ELEMENT_PICKER_RUNTIME_VERSION`，确保已打开页面替换旧脚本
8. 调试页或实验页不要复用真实 host binding 名称；mock binding 必须和正式运行时隔离

### 修改浮动控件前的最小检查清单

1. 这个需求是新语义，还是等价于已有 click/select/nudge？
2. 它是页面内即时反馈问题，还是持久状态/面板同步问题？
3. 是否无意中新增了一条并行机制？
4. 子元素会不会抢走外层控件的点击事件？
5. 这次修改后是否需要 bump runtime version？

### 修改 core 包时

修改 `packages/core/src/` 后必须运行 `tsc` 编译，`dist/` 才会更新。Electron main process 引用的是编译后的 `dist/`。

### 变更追踪

所有 CSS 修改必须经过 `useStyleBinding` hook：
- `updateStyle(name, value)` — 单属性修改
- `updateStyles(patch)` — 批量修改
- 这确保了 undo/redo 和 styleDiff 的一致性
