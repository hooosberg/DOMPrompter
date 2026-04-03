<p align="center">
  <img src="../pages/img/DMG_Icon_1024x1024.png" width="128" height="128" alt="DOMPrompter Icon" />
</p>

<h1 align="center">DOMPrompter</h1>

<p align="center">
  <strong>用可视化的方式告诉 AI 你要改什么</strong>
  <br>
  AI 编程助手与你之间的可视化桥梁
  <br>
  <a href="https://hooosberg.github.io/DOMPrompter/">官方网站</a>
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README_zh.md">简体中文</a> |
  <a href="README_ja.md">日本語</a> |
  <a href="README_ko.md">한국어</a> |
  <a href="README_es.md">Español</a> |
  <a href="README_fr.md">Français</a> |
  <a href="README_de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-All%20Rights%20Reserved-red.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Apple%20Silicon-M1%20|%20M2%20|%20M3%20|%20M4-green.svg" alt="Apple Silicon">
  <img src="https://img.shields.io/badge/Electron-33-47848F.svg" alt="Electron">
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/CDP-Chrome%20DevTools%20Protocol-FF6D00.svg" alt="CDP">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Mac_App_Store-即将上线-000000?style=for-the-badge&logo=apple&logoColor=white" alt="即将登陆 Mac App Store" height="40">
</p>

---

**DOMPrompter** 是一款 macOS 桌面应用，让你可以可视化地选中页面元素、微调 CSS 属性、生成结构化 AI 提示词——让 **Cursor**、**Claude Code**、**Codex** 等 AI 工具精准修改你的源代码。

---

## 痛点

微调页面时，截图总是选不中对应的元素。AI 无法精确定位「哪个元素要改什么」，反复沟通效率极低。

**DOMPrompter 解决这个问题** —— 精确选择 + 精确描述 = 精准代码修改。

---

## 工作流程

| 步骤 | 说明 |
|:----:|:-----|
| **1** | **选中** — 点击页面上任意元素，精确高亮并获取 CSS 选择器 |
| **2** | **微调** — 可视化调整 CSS 属性（宽度、高度、内边距、外边距），实时预览 |
| **3** | **标注** — 添加文字标签描述意图（"按钮颜色太深"、"间距太大"） |
| **4** | **生成** — DOMPrompter 将选择器 + 样式差异 + 标签注释融合为结构化 AI 提示词 |
| **5** | **交付** — 粘贴到 Cursor、Claude Code、Codex 等 AI 工具，精确修改代码 |

---

## 核心特性

- **精确选择** — 点击即选中，自动识别 CSS 选择器
- **样式差异追踪** — 每次调整自动记录为前后差异（如 `width: 200px → 300px`）
- **自然语言标签** — 为元素添加文字注释，让 AI 理解设计意图
- **即时反馈** — 浮动按钮直接修改 DOM，所见即所得
- **撤销与重做** — 完整操作历史，`Cmd+Z` / `Cmd+Shift+Z`
- **本地优先** — 不收集任何数据，一切留在你的设备上

---

## 架构

```
┌──────────────────────────────────┐
│   目标页面（浏览器）                │
│   └─ 注入的 Overlay 层            │
│      ├─ 选择高亮框                │
│      ├─ 浮动动作按钮              │
│      └─ 标签徽章                  │
└──────────┬───────────────────────┘
           │ Chrome DevTools Protocol
           ▼
┌──────────────────────────────────┐
│   核心引擎                        │
│   ├─ CDP 客户端                   │
│   ├─ Inspector 服务               │
│   └─ 元素详情解析器               │
└──────────┬───────────────────────┘
           │ Electron IPC
           ▼
┌──────────────────────────────────┐
│   应用 UI（React）                │
│   ├─ 属性工作台                   │
│   ├─ 样式绑定 & 撤销/重做         │
│   └─ 提示词生成器                 │
└──────────────────────────────────┘
```

---

## 适配工具

DOMPrompter 生成的提示词兼容所有 AI 编程助手：

**Claude Code** · **Cursor** · **Codex** · **Windsurf** · **GitHub Copilot** · **Gemini** · **Cline** · **Trae** · **AmpCode** · **Kiro** · **Roo Code** 等

---

## 相关链接

- [官方网站](https://hooosberg.github.io/DOMPrompter/)
- [支持中心](https://hooosberg.github.io/DOMPrompter/pages/support.html)
- [隐私政策](https://hooosberg.github.io/DOMPrompter/pages/privacy.html)
- [服务条款](https://hooosberg.github.io/DOMPrompter/pages/terms.html)

---

## 许可

保留所有权利。&copy; 2026 DOMPrompter.
