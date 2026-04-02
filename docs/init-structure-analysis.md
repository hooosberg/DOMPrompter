# Visual Inspector 初始化目录结构分析

## 背景

- 当前仓库的 `master` 已重命名为 `local`
- 当前分析基于本地完整工作树语义
- 本文中的目录树已排除常规应忽略内容与敏感文件

排除范围包括：

- 依赖与缓存：`node_modules/`、`.pnpm/`、`.pnpm-store/`
- 构建产物：`dist/`、`dist-electron/`、`build/`、`coverage/`
- 编辑器与系统噪音：`.vscode/`、`.idea/`、`.DS_Store`
- 敏感文件：`.env*`、`*.pem`、`*.key`、`*.p12`、`*.pfx`、`*.crt`

当前扫描结果中未发现 `.env*` 或证书/密钥文件；已发现构建产物目录 `packages/app/dist`、`packages/app/dist-electron`、`packages/core/dist`，因此本次分析不将它们视为源码结构的一部分。

## 当前有效目录骨架

```text
visual-inspector/
├── docs/
│   ├── architecture.md
│   └── init-structure-analysis.md
├── package.json
├── pnpm-workspace.yaml
└── packages/
    ├── app/
    │   ├── dev.sh
    │   ├── electron/
    │   │   ├── main.ts
    │   │   └── preload.ts
    │   ├── index.html
    │   ├── package.json
    │   ├── src/
    │   │   ├── App.css
    │   │   ├── App.tsx
    │   │   ├── components/
    │   │   │   ├── WelcomeScreen.tsx
    │   │   │   └── properties/
    │   │   │       ├── FieldControl.tsx
    │   │   │       └── PropertiesWorkbench.tsx
    │   │   ├── config/
    │   │   │   └── propertySections.ts
    │   │   ├── hooks/
    │   │   │   ├── useAdaptiveWindowPreset.ts
    │   │   │   └── useStyleBinding.ts
    │   │   ├── index.css
    │   │   ├── main.tsx
    │   │   └── types.ts
    │   ├── tsconfig.json
    │   ├── tsconfig.node.json
    │   └── vite.config.ts
    └── core/
        ├── package.json
        ├── src/
        │   ├── app-discovery.ts
        │   ├── cdp/
        │   │   └── connection.ts
        │   ├── codeGenerator.ts
        │   ├── index.ts
        │   └── inspector-service.ts
        └── tsconfig.json
```

## 结构解读

### 根目录

根目录当前仍然是一个 `pnpm workspace` 单仓壳层，承担三类职责：

- 工作区入口：`package.json`
- workspace 装配：`pnpm-workspace.yaml`
- 文档聚合：`docs/`

从现状看，根目录并不是业务源码主承载点，更多是“工作区组织层”。这个判断和你后面要把根目录转成 `workspace` 壳层的方向是一致的。

### packages/app

`packages/app` 是 Electron 应用层，负责：

- Electron 主进程与预加载桥接：`electron/`
- React 渲染层界面：`src/`
- Vite 构建入口与应用配置：`index.html`、`vite.config.ts`

这部分是当前最完整的产品入口，已经形成：

- 主进程启动与 IPC
- React 页面和属性编辑工作台
- 调试模式相关的窗口行为与交互组件

### packages/core

`packages/core` 是底层能力层，负责：

- CDP 连接与协议封装
- Inspector 核心服务
- 应用发现和代码生成能力

它是 `app` 的能力依赖层，后续如果要做公开同步，这部分是最有机会被抽成“可公开核心库”的区域。

### docs

当前 `docs/architecture.md` 已经能较完整描述系统设计，说明仓库并不是空壳，而是已有比较明确的架构和模块边界。文档区后续也很适合成为 `github/` 工作树里的第一批公开内容。

## 对后续双工作树的建议映射

### local 工作树

建议继续保留完整 monorepo：

- `packages/app`
- `packages/core`
- 本地辅助脚本
- 本地实验文件
- 不适合公开的调试和开发资产

### github 工作树

建议先从公开友好的内容开始，而不是一次性搬完整源码：

- `README`
- `docs/`
- 适合公开的演示页或 Pages 内容
- 经过筛选后的部分源码或独立子包

### workspace 根目录

最终更适合作为管理壳层，仅保留：

- worktree 使用说明
- 结构约定说明
- 少量管理脚本

不再直接承载当前 monorepo 全量源码。

## 当前结论

- 现状本质上是一个已具雏形的 Electron + React + TypeScript + pnpm monorepo
- 真实源码集中在 `packages/app` 与 `packages/core`
- 根目录已经更接近“工作区入口”，适合继续向 `workspace` 壳层过渡
- 文档与核心库都具备后续拆分到公开工作树的基础
