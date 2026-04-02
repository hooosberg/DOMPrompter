# Mac App Store 上架可行性自检报告

> 自检日期：2026-04-03
> 基于当前 `local` 分支架构分析

---

## 一、当前架构概览

应用有 **两种 CDP 工作模式**：

| 模式 | 实现方式 | 连接目标 |
|------|---------|---------|
| **Builtin 模式** | `webContents.debugger.attach()` | 自己内嵌的 BrowserView |
| **External 模式** | `ws` 包 WebSocket 连接 | 外部 Chrome/Electron 进程 |

关键行为：

- **`child_process.spawn()`** 启动子进程（Web dev server、外部 Electron 应用），`shell: true`
- **本地端口扫描**（3000-9229 等十几个端口）发现 CDP 目标
- **文件系统读写**：读项目配置、写 debug session 数据到 temp 目录
- **无自定义协议处理器**，无外网连接

---

## 二、Apple 规范对照自检

### 1. App Sandbox（强制要求）

所有 MAS 应用必须开启 `com.apple.security.app-sandbox`。

| 行为 | 沙盒影响 | 风险等级 |
|------|---------|---------|
| `child_process.spawn()` 启动外部进程 | **严重冲突** — 沙盒禁止 spawn 任意外部进程 | HIGH |
| 扫描本地端口 (HTTP HEAD) | 需要 `network.client` 权限，可授予 | LOW |
| WebSocket 连接到 localhost | 需要 `network.client`，可授予 | LOW |
| 读写 `app.getPath('userData')` | 沙盒允许的容器目录 | LOW |
| 读取用户选择的项目目录 | 需通过 `dialog.showOpenDialog()` + Security-Scoped Bookmarks | MEDIUM |
| 写入 `app.getPath('temp')` | 沙盒允许 | LOW |
| `webContents.debugger` 调试内嵌 BrowserView | Electron 内部 API，不越界 | LOW |

### 2. App Review Guidelines

| 条款 | 要求 | 状态 |
|------|-----|------|
| **2.5.6** WebKit 要求 | macOS 不强制，Electron 应用普遍通过 | PASS |
| **2.5.1** 仅使用公共 API | CDP 是 Electron 内部调试协议，调试自己的 BrowserView 可以 | PASS |
| **2.5.2** 自包含 | 不能下载执行代码、不能控制外部进程 | **External 模式违反** |
| **4.2** 最低功能 | 需提供超越网页包装的真实价值 | PASS |

### 3. Electron MAS 构建要求

| 要求 | 当前状态 |
|------|---------|
| 使用 MAS 专用 Electron 构建 | 未配置 |
| Universal 架构 (arm64 + x86_64) | 未配置 |
| `@electron/osx-sign` 签名 | 未配置 |
| 子进程 `com.apple.security.inherit` | 未配置 |
| `ElectronTeamID` in Info.plist | 未配置 |
| `Assets.car` + `AppIcon.icns` | 未配置 |

---

## 三、核心结论

**现有架构不能直接上 MAS。** 关键阻断项有两个：

### 阻断项 1：`child_process.spawn()` 启动外部应用

`packages/app/electron/main.ts` 中有 5 处 `spawn()` 调用（行 1058、1097、1370、1447、1566），用于：

- 启动用户项目的 Web dev server（npm/pnpm/yarn）
- 启动外部 Electron 应用

App Sandbox **严格禁止** spawn 任意外部进程。MAS 构建中 `child_process` 的功能会被大幅限制。

### 阻断项 2：External CDP 模式连接外部浏览器

`packages/core/src/cdp/connection.ts` 通过 WebSocket 连接外部 Chrome/Electron 进程的 CDP 端口，违反 Review Guideline 2.5.2（自包含）。端口扫描发现外部进程的行为也会引起审核疑虑。

---

## 四、上架可行的改造方案

如果要上 MAS，需要 **只保留 Builtin 模式**：

| 改造点 | 具体做法 |
|--------|---------|
| 砍掉 External 模式 | 移除 `CDPClient` WebSocket 连接、端口扫描、进程发现 |
| 砍掉 `child_process.spawn()` | 不再启动用户的 dev server 或外部 Electron |
| 只保留内嵌 BrowserView 调试 | 用户在应用内输入 URL -> BrowserView 加载 -> `webContents.debugger` 调试 |
| 用户需自行启动 dev server | 应用只负责连接已运行的本地页面 URL |
| 文件访问走 Security-Scoped Bookmarks | `dialog.showOpenDialog()` 选择项目后持久化访问权限 |

**改造后的产品形态**：用户先自行启动本地开发服务器，然后在 Visual Inspector 中输入 `localhost:3000` 等 URL，应用在内嵌 BrowserView 中加载并提供可视化调试能力。

---

## 五、分发策略建议

| 渠道 | 功能范围 | 限制 |
|------|---------|------|
| **GitHub Releases / DMG（Notarized）** | 全功能（Builtin + External + spawn） | 无沙盒限制 |
| **Mac App Store** | 仅 Builtin 模式（内嵌浏览器调试） | 沙盒合规 |

建议 **初期走 Notarized DMG 分发**（保留全功能），MAS 版本作为后续精简版上架。两个渠道可以共存，用条件编译区分功能集。

---

## 六、MAS 版本所需的 Entitlements 配置

### 主应用 `entitlements.mas.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>TEAM_ID.com.visual-inspector.app</string>
    </array>
</dict>
</plist>
```

### 子进程 `entitlements.mas.inherit.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.inherit</key>
    <true/>
</dict>
</plist>
```

---

## 七、参考文档

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Electron MAS Submission Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [App Sandbox Entitlements Reference](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
- [Configuring macOS App Sandbox](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox)
- [App Sandbox Temporary Exception Entitlements](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/AppSandboxTemporaryExceptionEntitlements.html)
