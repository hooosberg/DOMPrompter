<p align="center">
  <img src="pages/img/DMG_Icon_1024x1024.png" width="128" height="128" alt="DOMPrompter Icon" />
</p>

<h1 align="center">DOMPrompter</h1>

<p align="center">
  <strong>Visual Bridge Between You and AI Code Editors</strong><br/>
  <sub>用可视化的方式告诉 AI 你要改什么</sub>
</p>

<p align="center">
  <a href="https://hooosberg.github.io/DOMPrompter/">Website</a> ·
  <a href="https://hooosberg.github.io/DOMPrompter/pages/support.html">Support</a> ·
  <a href="https://hooosberg.github.io/DOMPrompter/pages/privacy.html">Privacy</a> ·
  <a href="https://hooosberg.github.io/DOMPrompter/pages/terms.html">Terms</a>
</p>

---

## What is DOMPrompter? / DOMPrompter 是什么？

**EN** — DOMPrompter is a visual inspection tool that sits between AI coding assistants and your webpage. Instead of struggling with screenshots and vague descriptions, you can **precisely select elements**, **tweak CSS properties visually**, and **generate structured AI prompts** — so tools like Cursor, Claude Code, Codex and more can modify your source code accurately.

**中文** — DOMPrompter 是一个介于 AI 编程助手和网页之间的可视化辅助工具。告别截图猜测和反复沟通，你可以**精确选中元素**、**可视化微调 CSS 属性**、**生成结构化 AI 提示词**——让 Cursor、Claude Code、Codex 等工具精准修改你的源代码。

---

## The Problem / 痛点

**EN** — When fine-tuning a webpage with AI, screenshots never capture the right element. AI can't pinpoint *"which element needs what change"*. You end up going back and forth, describing layout tweaks in words that get lost in translation.

**中文** — 微调页面时，截图总是选不中对应的元素。AI 无法精确定位「哪个元素要改什么」，反复沟通效率极低。

---

## How It Works / 工作流程

| Step | EN | 中文 |
|:----:|:---|:-----|
| **1** | **Select** — Click any element to highlight it with a precise CSS selector | **选中** — 点击任意元素，精确高亮并获取 CSS 选择器 |
| **2** | **Tweak** — Adjust CSS properties visually, see changes in real time | **微调** — 可视化调整 CSS 属性，实时预览变化 |
| **3** | **Annotate** — Add text tags describing what you want | **标注** — 添加文字标签描述修改意图 |
| **4** | **Generate** — Merge selector + style diffs + annotations into a structured AI prompt | **生成** — 选择器 + 样式差异 + 注释合并为结构化 AI 提示词 |
| **5** | **Hand Off** — Paste into Cursor, Claude Code, Codex or any AI assistant | **交付** — 粘贴到 Cursor、Claude Code、Codex 等 AI 工具 |

---

## Key Features / 核心特性

- **Precise Element Selection / 精确选择** — Click-to-select with CSS selector identification
- **Style Diff Tracking / 样式差异追踪** — Every change recorded as before/after diff (e.g., `width: 200px → 300px`)
- **Natural Language Tags / 自然语言标签** — Tag elements with notes for AI context
- **Instant Feedback / 即时反馈** — Floating buttons modify DOM directly, WYSIWYG
- **Undo & Redo / 撤销重做** — Full operation history with Cmd+Z / Cmd+Shift+Z
- **Local-First / 本地优先** — No data collection, everything stays on your device

---

## Architecture / 架构

```
┌──────────────────────────────────┐
│   Target Page (Browser)          │
│   └─ Injected Overlay Layer      │
│      ├─ Selection highlight      │
│      ├─ Floating action buttons  │
│      └─ Tag badges               │
└──────────┬───────────────────────┘
           │ Chrome DevTools Protocol
           ▼
┌──────────────────────────────────┐
│   Core Engine                    │
│   ├─ CDP Client                  │
│   ├─ Inspector Service           │
│   └─ Element Details Resolver    │
└──────────┬───────────────────────┘
           │ Electron IPC
           ▼
┌──────────────────────────────────┐
│   App UI (React)                 │
│   ├─ Properties Workbench        │
│   ├─ Style Binding & Undo/Redo  │
│   └─ Prompt Generator            │
└──────────────────────────────────┘
```

---

## Platform / 平台

macOS (Electron)

---

## License

All rights reserved. &copy; 2026 DOMPrompter.
