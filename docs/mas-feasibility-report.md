# DOMPrompter — Mac App Store 适配实施指南

> 更新日期：2026-04-05
> 基于 `mas` 分支，供 Codex 直接执行
> 参考框架：`智简witnote笔记本`（i18n / Settings / Paywall / Menu）
> 参考 SOP：TrekReel MAS 封装与上架标准流程

---

## 一、改造目标

将 Visual Inspector 重命名为 **DOMPrompter**，从全功能版本精简为 MAS 合规版本。

### 1.1 保留功能

| 功能 | 说明 |
|------|------|
| **内置浏览器调试** | 用户输入 `http://localhost:*` URL → BrowserView 加载 → `webContents.debugger.attach()` |
| **静态 HTML 调试** | 文件选择对话框选 `.html` → `file://` URL 加载到 BrowserView |

### 1.2 移除功能

| 功能 | 原因 |
|------|------|
| `child_process.spawn()` 启动外部进程 | App Sandbox 严格禁止 |
| External CDP 模式（WebSocket 连接外部浏览器） | 违反 Review Guideline 2.5.2（自包含） |
| 本地端口扫描 | 审核疑虑 |
| 项目目录选择 + 脚本检测 | 无法自动启动项目 |
| 桌面调试模式 | 依赖 External CDP |

### 1.3 新增功能

| 功能 | 说明 |
|------|------|
| **Onboarding 引导向导** | 替代旧 WelcomeScreen，步骤轨道式引导 |
| **顶部浏览器地址栏** | 始终可见，URL 输入 + 刷新 |
| **macOS 原生菜单栏** | 标准 Apple 菜单结构 |
| **快捷键系统** | 全局快捷键 + 菜单 accelerator |
| **设置面板** | 右上角齿轮按钮，含皮肤/语言/快捷键/关于等 |
| **12 语种国际化** | i18next + react-i18next |
| **收费墙** | 导出功能（页面级提示词）Pro 买断 |
| **Dock 行为** | 新建窗口、单实例锁 |

---

## 二、代码移除清单

### 2.1 `packages/app/electron/main.ts`（1890 行）

**移除导入：**
- `spawn`, `ChildProcess` from `child_process`
- `CDPClient`, `discoverLocalApps` from `@visual-inspector/core`

**移除变量：**
- `cdpClient: CDPClient | null`（line 18）
- `currentMode: 'builtin' | 'external'`（line 20）→ 硬编码为 `'builtin'`
- `launchedProcess: ChildProcess | null`（line 21）
- `projectSession: ProjectSessionState | null`（line 75）
- `PackageManager` 类型、`ProjectLaunchCommands`, `ProjectLaunchCapabilities`, `ProjectDescriptor`, `DirectElectronLaunch`, `ProjectSessionState` 接口

**移除函数（整块删除）：**
- `connectExternalInspector()`（lines 352-400）
- `buildRunCommand()`, `buildChildProcessEnv()`, `inferPackageManager()`, `readPackageJson()`, `detectProjectDescriptor()`, `resolveProjectElectronLaunch()`
- `ensureBuiltinDevServerForExternal()`（lines ~1030-1075）
- `launchExternalViaDirectElectron()`（lines 1077-1122）
- `ensureProjectDescriptor()`（lines 1124-1144）
- `buildProjectStatusPayload()`, `waitForFirstAvailable()`, `waitForCDP()`, `waitForCDPWithOutputRace()`, `waitForBuiltinUrl()`, `waitForBuiltinUrlWithOutputRace()`
- `attachProjectProcessLogging()`, `stopChildProcess()`, `stopProjectSessionProcesses()`, `resetProjectSession()`
- `buildProjectDebugUserDataDir()`
- 5 处 `spawn()` 调用（lines 1058, 1097, 1370, 1447, 1566）

**移除 IPC handlers：**
- `'discover-cdp-url'`（line 712）
- `'inspect-project'`（line 1196）
- `'select-project-directory'`（line 1258）
- `'launch-project-session'`（line 1276）— 整个 240 行启动编排器
- `'stop-project-session'`（line 1519）
- `'launch-electron-app'`（line 1531）
- `'kill-launched-app'`（line 1627）
- `'connect-cdp'`（line 1634）
- `'discover-local-apps'`（line 1692）
- `'set-external-overlay-state'`（line 1728）

**保留 IPC handlers：**
- `'load-url'`、`'attach-debugger'`、`'select-html-file'`、`'disconnect'`
- `'set-builtin-view-interactive'`、`'start-inspect'`、`'stop-inspect'`
- 所有 `inspect-element-*`、`update-element-*`、`capture-preview`
- `'generate-ai-prompt'`、`'generate-css'`、`'generate-css-variables'`
- `'set-panel-width'`、`'set-active-edit-property'`

### 2.2 `packages/app/electron/preload.ts`

移除对应 API：`discoverCDPUrl`, `connectCDP`, `discoverLocalApps`, `selectProjectDirectory`, `inspectProject`, `launchProjectSession`, `stopProjectSession`, `launchElectronApp`, `killLaunchedApp`, `setExternalOverlayState`, `onLaunchStatus`, `onAutoConnected`

### 2.3 `packages/app/src/types.ts`

- 移除 `'external'` from `InspectorMode`
- 移除 `DiscoveredApp`, `ProjectLaunchCommands`, `ProjectLaunchCapabilities`, `ProjectScriptInfo`, `ProjectInfo`, `SelectProjectDirectoryOptions`, `ProjectLaunchStatus`
- 简化 `electronAPI` 接口

### 2.4 `packages/core/`

- `src/cdp/connection.ts`：移除 `CDPClient` 类（lines ~1561-1680），保留 `ICDPTransport` 接口
- 移除 `app-discovery.ts`（如存在）
- `src/index.ts`：移除 `export { discoverLocalApps }` 和 `export { CDPClient }`

### 2.5 `packages/app/src/App.tsx`

- 移除 `mode` 状态 → 硬编码 `'builtin'`
- 移除 `discoveredApps`、`projectSession`、所有 `autoConnect*` ref
- 移除 `getRelevantApps()`, `scoreBuiltinApp()`, `scoreExternalApp()`, `pickSuggestedTarget()`（lines 34-64）
- 移除 `handleSelectProject`, `handleLaunchProject`, `handleConnectRunning`, `handleStopProject`
- 移除 `EMPTY_PROJECT_SESSION`, `DEFAULT_URLS.external`
- 移除 External workspace hero card（lines 1176-1183）
- 新增 `showOnboarding`、`addressBarUrl` 状态

### 2.6 `packages/app/src/components/WelcomeScreen.tsx`

整个文件替换为 `OnboardingWizard.tsx`。

---

## 三、品牌重命名

全局替换 **Visual Inspector → DOMPrompter**：

| 位置 | 修改 |
|------|------|
| `packages/app/package.json` | `"name"` → `"domprompter"`, 新增 `"productName": "DOMPrompter"` |
| `packages/app/electron/main.ts` | 窗口标题、关于对话框 |
| `packages/app/src/App.tsx` | topbar 标题、HUD 显示 |
| `packages/app/src/components/OnboardingWizard.tsx` | 引导文案 |
| `packages/app/index.html` | `<title>DOMPrompter</title>` |
| `build/Info.plist`（如有） | `CFBundleName`, `CFBundleDisplayName` |
| 所有 UI 文案和 i18n 文件 | 品牌名 |

---

## 四、Onboarding 引导向导

### 4.1 整体布局

```
+----------------------------------------------------------+
|  [traffic lights]  [🔄] [______地址栏______] [⚙️ 设置]    |  ← topbar（始终可见）
+----------------------------------------------------------+
|                                                          |
|              +----------------------------+              |
|              |                            |              |
|              |       内容区域              |              |
|              |    路径选择 / 步骤内容       |              |
|              |                            |              |
|              +----------------------------+              |
|                                                          |
|    [◀]  ───●────────○────────○───  [▶]                   |  ← 步骤轨道
|          适配提示词   启动服务   加载页面                    |
+----------------------------------------------------------+
```

### 4.2 组件：`OnboardingWizard.tsx`

替代 `WelcomeScreen.tsx`，路径：`packages/app/src/components/OnboardingWizard.tsx`

**Props：**
```typescript
interface OnboardingWizardProps {
  onLoadUrl: (url: string) => void
  onLoadHtmlFile: () => void
}
```

**State：**
```typescript
type OnboardingPath = 'server' | 'html' | null
type ServerStep = 1 | 2 | 3

const [path, setPath] = useState<OnboardingPath>(null)
const [serverStep, setServerStep] = useState<ServerStep>(1)
const [promptCopied, setPromptCopied] = useState(false)
const [commandCopied, setCommandCopied] = useState(false)
const [urlValue, setUrlValue] = useState('http://localhost:5173')
```

### 4.3 路径选择页（`path === null`）

两张大卡片并排，Apple 设计风格：

**Card 1：Server 模式**
- 图标：Globe SVG
- 标题：i18n(`onboarding.serverMode`)
- 副标题："你的项目有本地开发服务器（Vite / Next.js 等）"
- 底部提示："需要 3 步引导配置"
- 点击 → `setPath('server')`, `setServerStep(1)`

**Card 2：HTML 模式**
- 图标：Document SVG
- 标题：i18n(`onboarding.htmlMode`)
- 副标题："直接打开本地 HTML 文件调试"
- 底部提示："选择文件即可开始"
- 点击 → 直接调用 `onLoadHtmlFile()`

### 4.4 Server 模式三步引导

**Step 1：复制 AI 适配提示词**
- 精简版提示词预览（前 200 字截断）
- "复制适配提示词" 主按钮 + 复制反馈
- 说明文案："将此提示词粘贴到 Cursor / Claude Code 等 AI 工具"
- 适配后效果提示："✓ npm run dev — 启动网页开发服务器"

**Step 2：启动开发服务器**
- 代码块 `npm run dev` + 复制按钮
- 说明文案："在项目目录中运行，等待终端输出 localhost 地址"
- 补充提示："也可以用 pnpm dev 或 yarn dev"

**Step 3：加载页面**
- URL 输入框，预填 `http://localhost:5173`
- "加载页面" 主按钮 → 调用 `onLoadUrl(urlValue)`
- 说明："如果端口不同，请修改上方地址"

### 4.5 步骤轨道

底部水平步骤指示器：

```
[◀ 上一步]    ●━━━━━━━○━━━━━━━○    [下一步 ▶]
             适配提示词  启动服务  加载页面
```

- 当前步骤：实心圆 + 强调色 `--vi-accent: #7dd3fc`
- 已完成：实心较暗色
- 未到达：空心圆
- Step 1 左箭头返回路径选择，路径选择页隐藏左箭头
- Step 3 右箭头变为 "加载页面" 触发 `onLoadUrl`

### 4.6 设计规范

- 卡片圆角 20-28px，背景 `--vi-surface`
- 毛玻璃 `backdrop-filter: blur(28px) saturate(170%)`
- 字体系统栈，body 13-14px，标题 20-24px
- 间距 24-32px padding，16-20px gap
- 过渡 200ms ease
- 不使用 emoji，用 SVG 图标

### 4.7 关键交互

- **地址栏随时可用**：任何步骤输入 URL 回车直接加载，向导关闭
- **向导是引导不是门槛**：用户可跳过
- **HTML 模式不进入步骤流程**

---

## 五、顶部地址栏

### 5.1 新 Topbar 布局

```
[traffic lights spacer] [🔄 刷新] [___地址栏 (flex:1)___] [⚙️ 设置] [连接状态 | 操作按钮]
```

替换 `App.tsx` lines 1124-1152 的条件渲染为始终渲染：

```tsx
<div className="topbar">
  <div className="topbar-spacer" />
  <button className="btn-refresh" onClick={handleRefresh} title={t('topbar.refresh')}>
    {/* 刷新 SVG */}
  </button>
  <input
    className="url-input"
    type="text"
    value={addressBarUrl}
    onChange={(e) => setAddressBarUrl(e.target.value)}
    placeholder={t('topbar.urlPlaceholder')}
    spellCheck={false}
    onKeyDown={(e) => { if (e.key === 'Enter') handleLoadUrl(addressBarUrl) }}
  />
  <button className="btn-settings" onClick={() => setShowSettings(true)} title={t('topbar.settings')}>
    {/* 齿轮 SVG */}
  </button>
  {connected && (
    <div className="topbar-actions">
      <span className="topbar-status-pill">{t('topbar.connected')}</span>
      <button className="btn-utility wide" onClick={toggleWorkbench}>
        {isWorkbenchVisible ? t('topbar.hideToolbar') : t('topbar.showToolbar')}
      </button>
      <button className="btn-utility wide ghost" onClick={handleCloseConnection}>
        {t('topbar.disconnect')}
      </button>
    </div>
  )}
</div>
```

### 5.2 地址栏行为

- 始终可见，无论连接状态或引导步骤
- Enter 触发 `handleLoadUrl`
- 连接后显示当前 URL，可编辑切换页面
- 自动补全 `http://` 前缀

### 5.3 简化连接流程

```typescript
const handleLoadUrl = useCallback(async (url: string) => {
  let target = url.trim()
  if (!target.startsWith('http') && !target.startsWith('file://')) {
    target = `http://${target}`
  }
  setAddressBarUrl(target)
  resetInspectorState()
  const loaded = await window.electronAPI.loadUrl(target)
  if (!loaded) { flash(t('error.loadFailed')); return }
  await new Promise(r => setTimeout(r, 1500))
  const attached = await window.electronAPI.attachDebugger()
  if (!attached) { flash(t('error.debuggerFailed')); return }
  setConnected(true)
  setShowOnboarding(false)
}, [flash, resetInspectorState, t])
```

---

## 六、精简版 AI 适配提示词

移除所有 Electron/桌面端内容，只保留 web 项目：

```typescript
const AI_SETUP_PROMPT = `我正在使用 DOMPrompter 来调试我的项目界面。请帮我适配项目的启动脚本，让我能通过 localhost 地址在 DOMPrompter 中调试。

请按照以下规范修改我的 package.json 中的 scripts：

## 规范要求

确保有 \`dev\` 脚本，启动本地开发服务器：
\`\`\`json
{
  "scripts": {
    "dev": "vite"  // 或 next dev / webpack serve / 任何启动 localhost 的命令
  }
}
\`\`\`
- 开发服务器必须监听 localhost（不要求固定端口，推荐 5173）
- 如果是纯 HTML 项目没有 package.json，请创建一个并添加 \`"dev": "npx serve ."\`

## 注意事项
- 不要修改项目的业务逻辑代码，只调整启动脚本
- 如果缺少依赖（如 serve），请帮我安装
- 保留项目原有的其他脚本不变

## 验证步骤（必须执行）

1. 运行 \`npm run dev\`（或对应的包管理器命令）
2. 等待输出 localhost 地址（如 \`http://localhost:5173\`）
3. 确认无报错后 Ctrl+C 终止

### 如果启动失败
1. **依赖未安装**：\`npm install\` 后重试
2. **端口冲突**：关闭占用进程再重试
3. **脚本语法错误**：检查 package.json 格式
4. **仍然失败**：输出完整错误日志

**重要：只有验证通过后，才算适配完成。不要跳过验证步骤。**

请分析我的项目类型，按上述规范适配。`
```

---

## 七、macOS 原生菜单栏

参考 witnote 的 `createApplicationMenu()` 模式（`智简witnote笔记本/electron/main.ts` lines 2297-2499），在 `packages/app/electron/main.ts` 新增 `createApplicationMenu()` 函数。

### 7.1 菜单结构

```
┌─ DOMPrompter (App Menu)
│  ├─ About DOMPrompter
│  ├─ ───────────────
│  ├─ Preferences...          (Cmd+,)
│  ├─ ───────────────
│  ├─ Services                (submenu)
│  ├─ Hide DOMPrompter        (Cmd+H)
│  ├─ Hide Others             (Cmd+Alt+H)
│  ├─ Show All
│  ├─ ───────────────
│  └─ Quit DOMPrompter        (Cmd+Q)
│
├─ File
│  ├─ New Window              (Cmd+Shift+W)
│  ├─ Open HTML File...       (Cmd+O)
│  ├─ ───────────────
│  ├─ Export
│  │  ├─ Copy Page Prompt     (Cmd+Shift+C)
│  │  ├─ Copy Element CSS     (Cmd+Shift+E)
│  │  └─ Copy CSS Variables
│  ├─ ───────────────
│  └─ Close Window            (Cmd+W)
│
├─ Edit (标准 macOS roles)
│  ├─ Undo / Redo
│  ├─ Cut / Copy / Paste / Paste and Match Style
│  ├─ Delete
│  └─ Select All
│
├─ View
│  ├─ Toggle Inspector Toolbar  (Cmd+Shift+T)
│  ├─ ───────────────
│  ├─ Reload Page              (Cmd+R)
│  ├─ Force Reload             (Cmd+Shift+R)
│  ├─ ───────────────
│  ├─ Actual Size              (Cmd+0)
│  ├─ Zoom In                  (Cmd+=)
│  ├─ Zoom Out                 (Cmd+-)
│  ├─ ───────────────
│  └─ Toggle Full Screen       (Ctrl+Cmd+F)
│
├─ Window
│  ├─ Minimize                 (Cmd+M)
│  ├─ Zoom
│  ├─ ───────────────
│  ├─ Bring All to Front
│  └─ Close                    (Cmd+W)
│
└─ Help
   ├─ DOMPrompter Help
   └─ Visit GitHub
```

### 7.2 菜单标签 i18n

参考 witnote 模式，在 main.ts 中定义 `allMenuTranslations` 对象（12 语种），用 `tm(key)` 函数获取当前语言标签。语言切换时通过 IPC `menu:changeLanguage` 重建菜单。

### 7.3 实现要点

```typescript
import { app, Menu, MenuItem, shell, BrowserWindow } from 'electron'

function createApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    // ... 见上方结构
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// 在 app.whenReady() 中调用
app.whenReady().then(() => {
  createApplicationMenu()
  createWindow()
})

// IPC: 语言切换时重建菜单
ipcMain.handle('menu:changeLanguage', (_e, lang: string) => {
  currentLanguage = lang
  createApplicationMenu()
})
```

---

## 八、快捷键系统

### 8.1 全局快捷键表

| 快捷键 | 功能 | IPC 事件 |
|--------|------|----------|
| `Cmd+,` | 打开设置 | `shortcuts:openSettings` |
| `Cmd+O` | 打开 HTML 文件 | `shortcuts:openHtmlFile` |
| `Cmd+R` | 刷新页面 | `shortcuts:reloadPage` |
| `Cmd+Shift+R` | 强制刷新 | `shortcuts:forceReload` |
| `Cmd+Shift+T` | 切换工具栏 | `shortcuts:toggleToolbar` |
| `Cmd+Shift+C` | 复制页面级提示词 | `shortcuts:copyPagePrompt` |
| `Cmd+Shift+E` | 复制元素 CSS | `shortcuts:copyElementCSS` |
| `Cmd+Shift+W` | 新建窗口 | `shortcuts:newWindow` |
| `Cmd+L` | 聚焦地址栏 | `shortcuts:focusAddressBar` |
| `Esc` | 取消选择 / 关闭设置 | `shortcuts:escape` |

### 8.2 实现方式

通过菜单 `accelerator` 属性绑定，菜单点击通过 `mainWindow.webContents.send()` 发送到渲染进程。

preload 中暴露：
```typescript
shortcuts: {
  onOpenSettings: (cb: () => void) => ipcRenderer.on('shortcuts:openSettings', cb),
  onOpenHtmlFile: (cb: () => void) => ipcRenderer.on('shortcuts:openHtmlFile', cb),
  onReloadPage: (cb: () => void) => ipcRenderer.on('shortcuts:reloadPage', cb),
  onToggleToolbar: (cb: () => void) => ipcRenderer.on('shortcuts:toggleToolbar', cb),
  onCopyPagePrompt: (cb: () => void) => ipcRenderer.on('shortcuts:copyPagePrompt', cb),
  onCopyElementCSS: (cb: () => void) => ipcRenderer.on('shortcuts:copyElementCSS', cb),
  onFocusAddressBar: (cb: () => void) => ipcRenderer.on('shortcuts:focusAddressBar', cb),
  onNewWindow: (cb: () => void) => ipcRenderer.on('shortcuts:newWindow', cb),
  onEscape: (cb: () => void) => ipcRenderer.on('shortcuts:escape', cb),
}
```

---

## 九、设置面板

### 9.1 入口

右上角齿轮按钮（topbar 中），点击打开模态设置面板。快捷键 `Cmd+,`。

### 9.2 设置面板结构

参考 witnote 的 `Settings.tsx` 模式，创建 `packages/app/src/components/Settings.tsx`。

**二级菜单（左侧标签）：**

```
┌─────────────────────────────────────────────┐
│  [关闭]                         设置         │
│                                             │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │ 外观     │  │                          │ │
│  │ 语言     │  │   当前选中 tab 的内容      │ │
│  │ 快捷键   │  │                          │ │
│  │ 许可证   │  │                          │ │
│  │ 关于     │  │                          │ │
│  └──────────┘  └──────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### 9.3 外观 Tab

| 设置项 | 类型 | 选项 | 默认值 |
|--------|------|------|--------|
| 主题 | 三选一 | Light / Dark / Auto (跟随系统) | Auto |
| 强调色 | 色板选择 | Sky Blue / Purple / Green / Orange / Pink | Sky Blue |
| 毛玻璃透明度 | 滑块 | 0.4 - 1.0 | 0.76 |

**主题切换实现：**
```typescript
// CSS 变量方案，参考 witnote
document.documentElement.setAttribute('data-theme', theme)
// 同步 Electron
window.electronAPI.setNativeTheme(theme) // nativeTheme.themeSource
```

**强调色方案：**
```css
/* 覆盖 --vi-accent 变量 */
[data-accent="sky"]    { --vi-accent: #7dd3fc; }
[data-accent="purple"] { --vi-accent: #c084fc; }
[data-accent="green"]  { --vi-accent: #4ade80; }
[data-accent="orange"] { --vi-accent: #fb923c; }
[data-accent="pink"]   { --vi-accent: #f472b6; }
```

### 9.4 语言 Tab

12 个常见语种选择，参考 witnote 的 i18n 架构：

| 语言 | 代码 | 本地名称 |
|------|------|---------|
| English | `en` | English |
| 简体中文 | `zh` | 简体中文 |
| 繁體中文 | `zh-TW` | 繁體中文 |
| 日本語 | `ja` | 日本語 |
| 한국어 | `ko` | 한국어 |
| Français | `fr` | Français |
| Deutsch | `de` | Deutsch |
| Español | `es` | Español |
| Português | `pt` | Português |
| Italiano | `it` | Italiano |
| Русский | `ru` | Русский |
| العربية | `ar` | العربية |

选择后立即切换，同步更新 macOS 菜单栏语言。

### 9.5 快捷键 Tab

以列表形式展示所有快捷键（只读显示，不可自定义）：

```
打开设置          ⌘ ,
打开 HTML 文件    ⌘ O
刷新页面          ⌘ R
切换工具栏        ⌘ ⇧ T
复制页面提示词     ⌘ ⇧ C
复制元素 CSS      ⌘ ⇧ E
聚焦地址栏        ⌘ L
新建窗口          ⌘ ⇧ W
```

### 9.6 许可证 Tab

显示当前许可证状态 + 购买/恢复按钮（见第十二章收费墙）。

### 9.7 关于 Tab

| 信息 | 内容 |
|------|------|
| 应用名称 | DOMPrompter |
| 版本号 | 读取 `app.getVersion()` |
| 构建号 | 读取 `CFBundleVersion` |
| 描述 | "可视化界面检查与 AI 提示词生成工具" |
| 支持 | Support URL 链接 |
| 隐私 | Privacy URL 链接 |
| GitHub | 项目仓库链接 |
| 版权 | © 2026 DOMPrompter |

### 9.8 设置持久化

使用 `electron-store` 或 `app.getPath('userData')` + JSON 文件：

```typescript
// main.ts
import Store from 'electron-store'
const store = new Store({ name: 'settings' })

ipcMain.handle('settings:get', (_e, key) => store.get(key))
ipcMain.handle('settings:set', (_e, key, value) => store.set(key, value))
```

---

## 十、国际化（i18n）

### 10.1 技术栈

参考 witnote：`i18next` + `react-i18next` + `i18next-browser-languagedetector`

```bash
# 安装依赖
cd packages/app
npm install i18next react-i18next i18next-browser-languagedetector
```

### 10.2 初始化配置

创建 `packages/app/src/i18n.ts`：

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// 导入 12 语种文件
import en from './locales/en.json'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import it from './locales/it.json'
import ru from './locales/ru.json'
import ar from './locales/ar.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      'zh-TW': { translation: zhTW },
      ja: { translation: ja },
      ko: { translation: ko },
      fr: { translation: fr },
      de: { translation: de },
      es: { translation: es },
      pt: { translation: pt },
      it: { translation: it },
      ru: { translation: ru },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'domprompter-language',
    },
    interpolation: { escapeValue: false },
  })

export default i18n
```

### 10.3 翻译文件结构

创建 `packages/app/src/locales/` 目录，12 个 JSON 文件。

**翻译 key 结构（以 `en.json` 为例）：**

```json
{
  "app": {
    "name": "DOMPrompter",
    "tagline": "Visual DOM Inspector & AI Prompt Generator"
  },
  "topbar": {
    "refresh": "Refresh",
    "urlPlaceholder": "Enter localhost URL or select HTML file",
    "settings": "Settings",
    "connected": "Connected",
    "hideToolbar": "Hide Toolbar",
    "showToolbar": "Show Toolbar",
    "disconnect": "Disconnect"
  },
  "onboarding": {
    "serverMode": "Server Mode",
    "serverDesc": "Your project has a local dev server (Vite, Next.js, etc.)",
    "serverSteps": "3-step guided setup",
    "htmlMode": "HTML Mode",
    "htmlDesc": "Open a local HTML file directly",
    "htmlSteps": "Select file to start",
    "step1Title": "Copy AI Setup Prompt",
    "step1Desc": "Paste this prompt into your AI coding tool (Cursor / Claude Code)",
    "step1Button": "Copy Prompt",
    "step1Copied": "Copied",
    "step1Check": "npm run dev — starts web dev server",
    "step2Title": "Start Dev Server",
    "step2Desc": "Run the following command in your project directory",
    "step2Hint": "Wait for localhost address in terminal output",
    "step2Alt": "Also works: pnpm dev / yarn dev",
    "step3Title": "Load Page",
    "step3Desc": "Enter your local dev server address",
    "step3Hint": "Change the port if yours is different",
    "step3Button": "Load Page",
    "prevStep": "Previous",
    "nextStep": "Next"
  },
  "settings": {
    "title": "Settings",
    "appearance": "Appearance",
    "language": "Language",
    "shortcuts": "Shortcuts",
    "license": "License",
    "about": "About",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeAuto": "Auto",
    "accentColor": "Accent Color",
    "glassOpacity": "Glass Opacity"
  },
  "license": {
    "free": "Free",
    "pro": "Pro",
    "currentPlan": "Current Plan",
    "upgrade": "Upgrade to Pro",
    "restore": "Restore Purchase",
    "purchasing": "Processing...",
    "purchaseSuccess": "Purchase successful!",
    "restoreSuccess": "Restore successful!",
    "benefits": "Pro Benefits",
    "benefitExport": "Unlimited page prompt export",
    "benefitHistory": "Export history",
    "benefitPriority": "Priority support"
  },
  "panel": {
    "emptyConnected": "Ready to select element",
    "emptyDisconnected": "Waiting for connection",
    "hoverHint": "Hover over an element and click to inspect",
    "waitHint": "Properties panel will appear after connecting"
  },
  "export": {
    "pagePrompt": "Page Prompt",
    "copyPrompt": "Copy Page Prompt",
    "copied": "Copied",
    "proRequired": "Pro required for export"
  },
  "error": {
    "loadFailed": "Page load failed",
    "debuggerFailed": "Debugger attach failed"
  }
}
```

### 10.4 Electron 菜单翻译

在 `main.ts` 中定义 `allMenuTranslations` 对象，包含 12 语种的菜单标签。参考 witnote `main.ts` lines 96-662 的模式。

### 10.5 在组件中使用

```typescript
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  return <h1>{t('app.name')}</h1>
}
```

### 10.6 macOS .lproj 文件

为 App Store 多语言显示，在 `packages/app/build/` 下创建 lproj 目录：

```
build/
├── en.lproj/
│   └── InfoPlist.strings
├── zh-Hans.lproj/
│   └── InfoPlist.strings
├── zh-Hant.lproj/
│   └── InfoPlist.strings
├── ja.lproj/
│   └── InfoPlist.strings
├── ko.lproj/
│   └── InfoPlist.strings
├── fr.lproj/
│   └── InfoPlist.strings
├── de.lproj/
│   └── InfoPlist.strings
├── es.lproj/
│   └── InfoPlist.strings
├── pt.lproj/
│   └── InfoPlist.strings
├── it.lproj/
│   └── InfoPlist.strings
├── ru.lproj/
│   └── InfoPlist.strings
└── ar.lproj/
    └── InfoPlist.strings
```

每个 `InfoPlist.strings` 内容：
```
CFBundleDisplayName = "DOMPrompter";
CFBundleName = "DOMPrompter";
```

在 electron-builder 配置中通过 `extraResources` 包含：
```json
"extraResources": [
  { "from": "build/en.lproj", "to": "en.lproj" },
  { "from": "build/zh-Hans.lproj", "to": "zh-Hans.lproj" },
  ...
]
```

---

## 十一、Dock 行为与窗口管理

### 11.1 单实例锁

```typescript
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}
```

### 11.2 Dock 菜单

```typescript
function createDockMenu() {
  const dockMenu = Menu.buildFromTemplate([
    { label: tm('menu.newWindow'), click: () => createWindow() },
    { label: tm('menu.openHtmlFile'), click: () => handleOpenHtmlFileFromMenu() },
    { label: tm('menu.openSettings'), click: () => mainWindow?.webContents.send('shortcuts:openSettings') },
  ])
  app.dock?.setMenu(dockMenu)
}
```

### 11.3 Activate 事件（点击 Dock 图标恢复窗口）

```typescript
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
```

### 11.4 关闭窗口不退出

```typescript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  // macOS 保持运行，等待 activate 事件
})
```

### 11.5 新建窗口支持

`Cmd+Shift+W` 或 Dock 菜单 "新建窗口" 调用 `createWindow()`，允许多个独立窗口，每个窗口有独立的 BrowserView 和调试会话。

---

## 十二、收费墙（Paywall）

### 12.1 收费策略

参考 witnote 的 `LicenseManager.ts` + `licenseService.ts` + `PaywallDialog.tsx` 架构。

| 功能 | 免费 | Pro（终身买断） |
|------|------|----------------|
| 内置浏览器调试 | ✅ | ✅ |
| 静态 HTML 调试 | ✅ | ✅ |
| 元素选择与属性查看 | ✅ | ✅ |
| 单元素样式修改 | ✅ | ✅ |
| 单元素 AI 提示词复制 | ✅ | ✅ |
| **页面级提示词导出** | ❌ | ✅ |
| **导出历史记录** | ❌ | ✅ |
| **所有主题皮肤** | ❌ | ✅ |
| 优先支持 | ❌ | ✅ |

核心逻辑：**单元素操作免费，页面级批量导出收费**。

### 12.2 Product ID

```typescript
const MAS_PRODUCT_ID = 'com.domprompter.app.pro.lifetime'
```

### 12.3 架构文件

| 文件 | 用途 |
|------|------|
| `packages/app/electron/licenseService.ts` | 主进程内购服务（MAS / dev-stub） |
| `packages/app/src/services/LicenseManager.ts` | 渲染进程许可证管理 |
| `packages/app/src/components/PaywallDialog.tsx` | 购买/恢复 UI |
| `packages/app/src/shared/license.ts` | 共享常量和类型 |

### 12.4 主进程内购服务

参考 witnote `electron/licenseService.ts`：

```typescript
import { inAppPurchase } from 'electron'

type LicenseProvider = 'mas' | 'dev-stub' | 'unsupported'

function getProvider(): LicenseProvider {
  if (process.mas) return 'mas'
  if (process.env.NODE_ENV === 'development') return 'dev-stub'
  return 'unsupported'
}

// IPC handlers
ipcMain.handle('license:getStatus', () => ({ isPro, provider }))
ipcMain.handle('license:purchase', async () => { /* MAS 购买流程 */ })
ipcMain.handle('license:restore', async () => { /* MAS 恢复购买 */ })
```

### 12.5 渲染进程门控

```typescript
// 在导出页面级提示词时检查
const handleCopyExportPrompt = useCallback(async () => {
  const access = LicenseManager.checkFeatureAccess('export')
  if (!access.allowed) {
    setShowPaywall(true) // 弹出收费墙
    return
  }
  await copyText(exportPromptPreview, t('export.copied'))
}, [exportPromptPreview, copyText, t])
```

### 12.6 PaywallDialog 组件

模态对话框，展示 Pro 权益 + 购买/恢复按钮：

```
┌─────────────────────────────────┐
│          Upgrade to Pro          │
│                                 │
│  ✓ 页面级提示词无限导出          │
│  ✓ 导出历史记录                  │
│  ✓ 所有主题皮肤                  │
│  ✓ 优先支持                      │
│                                 │
│  [ 购买 Pro — ¥XX ]             │
│  [ 恢复购买 ]                    │
│                                 │
└─────────────────────────────────┘
```

---

## 十三、Entitlements 与构建配置

### 13.1 `packages/app/build/entitlements.mas.plist`

参考 TrekReel SOP Section 2.1，Electron MAS 需要 JIT / unsigned memory / disable-library-validation：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>
</dict>
</plist>
```

> **注意**：`com.apple.developer.in-app-purchase` 是 iOS-only key，**绝对不能**出现在 macOS entitlements 中！macOS MAS 内购权限通过 Provisioning Profile 自动授予。

### 13.2 `packages/app/build/entitlements.mas.inherit.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.inherit</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>
</dict>
</plist>
```

### 13.3 electron-builder 配置

当前仓库中的 `packages/app/package.json` 已基本收口为下面这一版思路：

```json
{
  "name": "domprompter",
  "version": "0.1.0",
  "productName": "DOMPrompter",
  "author": "Hooosberg",
  "scripts": {
    "build": "tsc && vite build",
    "build:mas": "tsc && vite build && electron-builder --mac mas"
  },
  "build": {
    "appId": "com.domprompter.app",
    "productName": "DOMPrompter",
    "files": [
      "dist/**/*",
      "dist-electron/**/*",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": ["mas"],
      "minimumSystemVersion": "12.0"
    },
    "mas": {
      "type": "distribution",
      "target": { "target": "mas", "arch": ["arm64"] },
      "entitlements": "build/entitlements.mas.plist",
      "entitlementsInherit": "build/entitlements.mas.inherit.plist",
      "hardenedRuntime": false,
      "gatekeeperAssess": false,
      "minimumSystemVersion": "12.0"
    }
  },
  "masReview": {
    "productId": "com.domprompter.app.pro.lifetime",
    "supportUrl": "https://hooosberg.com/apps/domprompter/",
    "privacyUrl": "https://hooosberg.com/privacy/"
  }
}
```

这份配置已经足够通过当前 `npm run mas:check`，但要进入真实上架阶段，还必须补齐下面 4 个发行材料：

1. `packages/app/build/icon.icns`
2. `packages/app/build/embedded.provisionprofile`
3. `mac.icon` 与 `mas.provisioningProfile` 的 builder 配置
4. 上传前递增 `version` 与 build string（`CFBundleVersion`）

### 13.4 签名证书选择（关键陷阱）

按 Apple 官方证书分类，Mac App Store 提交流程至少会涉及两类签名材料：

- `Mac App Distribution`：用于签名 `.app`
- `Mac Installer Distribution`：用于签名上传到 App Store Connect 的 `.pkg`

如果 electron-builder 在你的机器上自动探测错了 identity，优先以最终验证结果为准：

```bash
codesign --verify --deep --strict --verbose=2 packages/app/dist/mas-arm64/DOMPrompter.app
pkgutil --check-signature path/to/DOMPrompter.pkg
```

如果自动探测不稳定，再通过环境变量显式指定证书名。

### 13.5 PKG 创建

electron-builder 可能不自动创建 PKG，需手动用 `productbuild`：

```bash
INSTALLER_CERT=$(security find-identity -v | grep "Mac Installer Distribution" | head -1 | sed 's/.*"\(.*\)".*/\1/')
productbuild --component packages/app/dist/mas-arm64/DOMPrompter.app /Applications --sign "$INSTALLER_CERT" packages/app/dist/DOMPrompter-1.0.0-arm64.pkg
```

### 13.6 当前仓库真实状态（2026-04-05）

- `npm run mas:check`：已通过
- builtin-only 合同测试：已通过
- 真正阻塞 `npm run build:mas` 进入可上传状态的，只剩发行材料
- `packages/app/build/entitlements.mas.plist` 与 `packages/app/build/entitlements.mas.inherit.plist` 已存在
- 仓库里还没有 `packages/app/build/icon.icns`
- 仓库里还没有 `packages/app/build/embedded.provisionprofile`
- 当前 `packages/app/package.json` 也还没把 `mac.icon` 和 `mas.provisioningProfile` 接进去
- 所以现阶段最先要做的不是继续改功能，而是把证书、profile、图标、版本号这几项补齐

---

## 十四、实施阶段顺序

### Phase 1：移除 main.ts 中的禁用代码
1. 移除 `child_process` 导入和全部 5 处 `spawn()` 调用
2. 移除 `CDPClient` 导入和 `connectExternalInspector()`
3. 移除 10 个 IPC handlers（见第二章）
4. 移除项目会话状态管理
5. 简化 `disconnect` handler
6. 移除 `currentMode`，硬编码 builtin

### Phase 2：移除 preload.ts、types.ts、core 中的禁用代码
1. 更新 preload.ts 移除对应 API
2. 更新 types.ts 移除 external-mode 类型
3. 移除 core 包中 `CDPClient` 和 `app-discovery`

### Phase 3：品牌重命名
1. 全局替换 Visual Inspector → DOMPrompter
2. 更新 package.json name/productName/description
3. 更新 HTML title、窗口标题

### Phase 4：安装 i18n 依赖 + 创建翻译文件
1. `npm install i18next react-i18next i18next-browser-languagedetector`
2. 创建 `src/i18n.ts` 初始化配置
3. 创建 `src/locales/` 目录和 12 个 JSON 翻译文件
4. 在 `src/main.tsx` 中 `import './i18n'`
5. 创建 `build/*.lproj/InfoPlist.strings` 文件

### Phase 5：简化 App.tsx + 重新设计 Topbar
1. 移除所有 external-mode 状态和逻辑
2. 移除 projectSession、discoveredApps、自动连接
3. 新增 `showOnboarding`、`addressBarUrl`、`showSettings`、`showPaywall` 状态
4. 创建 `handleLoadUrl`、`handleRefresh` 回调
5. 实现始终可见的地址栏 + 刷新 + 设置按钮
6. 全部 UI 文案改为 `t()` 调用

### Phase 6：构建 OnboardingWizard 组件
1. 创建 `OnboardingWizard.tsx` 替代 `WelcomeScreen.tsx`
2. 路径选择器 + 3 步 Server 向导 + HTML 直接触发
3. 步骤轨道组件（圆点 + 连线 + 箭头）
4. 精简版 AI_SETUP_PROMPT（纯 Web）
5. 复制到剪贴板功能

### Phase 7：构建 Settings 组件
1. 创建 `Settings.tsx`（外观/语言/快捷键/许可证/关于）
2. 实现主题切换（Light/Dark/Auto + 强调色）
3. 语言选择器（12 语种）
4. 快捷键列表（只读）
5. 关于信息面板
6. 设置持久化（electron-store 或 JSON）

### Phase 8：macOS 菜单栏 + 快捷键
1. 在 main.ts 新增 `createApplicationMenu()` 函数
2. 定义 `allMenuTranslations`（12 语种菜单标签）
3. 实现 `tm(key)` 翻译函数
4. 绑定 accelerator + IPC 事件
5. preload 暴露 `shortcuts` API
6. App.tsx 注册 shortcuts 监听器

### Phase 9：Dock 行为 + 窗口管理
1. 实现 `requestSingleInstanceLock()`
2. 创建 Dock 菜单（新建窗口/打开 HTML/设置）
3. 完善 `activate` 事件（恢复窗口）
4. 确保关闭窗口不退出（macOS）
5. 支持 `Cmd+Shift+W` 新建窗口

### Phase 10：收费墙
1. 创建 `licenseService.ts`（主进程，MAS/dev-stub 双模式）
2. 创建 `LicenseManager.ts`（渲染进程）
3. 创建 `license.ts`（共享常量和类型）
4. 创建 `PaywallDialog.tsx`（购买/恢复 UI）
5. 在 `handleCopyExportPrompt` 中添加门控检查
6. preload 暴露 `license` API

### Phase 11：构建配置 + Entitlements
1. 创建 `build/entitlements.mas.plist`
2. 创建 `build/entitlements.mas.inherit.plist`
3. 在 package.json 添加完整 `build` 配置
4. 添加 `build:mas` script
5. 创建 `scripts/build-mas.sh` 一键构建脚本

### Phase 12：更新 CSS
1. 移除旧 `.welcome-*` 样式
2. 新增 `.wizard-*` 向导样式
3. 新增 `.settings-*` 设置面板样式
4. 新增 `.paywall-*` 收费墙样式
5. 新增 `.address-bar` 地址栏样式
6. 新增主题变量和强调色方案
7. 新增步骤切换过渡动画

### Phase 13：验证与清理
1. `grep -r "child_process\|spawn(" packages/` — 确认无残留
2. `grep -r "CDPClient\|new WebSocket" packages/` — 确认无残留
3. `grep -r "'external'" packages/app/src/` — 确认无 external 残留
4. `grep -r "Visual Inspector" packages/` — 确认品牌替换完成
5. `tsc --noEmit` — 类型检查
6. `npm run build:mas` — 尝试构建
7. 手动测试引导向导完整流程
8. 手动测试设置面板各 tab
9. 手动测试快捷键
10. 手动测试收费墙触发和购买流程

---

## 十五、验证清单

| 验证项 | 方法 | 预期 |
|--------|------|------|
| 沙盒合规 | `electron-builder --mac mas` + Console.app | 无沙盒违规 |
| URL 加载 | 输入 `http://localhost:5173` | BrowserView 渲染 |
| 调试器 | 加载后选择元素 | attach 成功 |
| HTML 文件 | 对话框选择 .html | file:// 加载 |
| 地址栏 | 输入 URL → Enter → 更换 | 导航正常 |
| 刷新 | 点击刷新按钮 | 页面重载 |
| 引导向导 | 完整 3 步 Server 模式 | 复制/加载正常 |
| 向导跳过 | 地址栏直接输入 | 向导关闭 |
| 设置面板 | Cmd+, 或齿轮按钮 | 各 tab 正常 |
| 主题切换 | Light/Dark/Auto | 即时切换 |
| 语言切换 | 选择非默认语言 | UI + 菜单同步 |
| 快捷键 | 逐一测试 10 个快捷键 | 全部响应 |
| 菜单栏 | 检查所有菜单项 | 可点击，语言正确 |
| Dock | 点击 Dock 图标 | 恢复窗口 |
| Dock 菜单 | 右键 Dock 图标 | 显示自定义菜单 |
| 单实例 | 重复打开应用 | 聚焦已有窗口 |
| 新建窗口 | Cmd+Shift+W | 独立新窗口 |
| 收费墙 | 点击页面级导出 | 弹出购买对话框 |
| 内购 | 沙盒测试账号购买 | 购买成功，Pro 解锁 |
| 恢复购买 | 设置 > 许可证 > 恢复 | 恢复成功 |
| 无 spawn | `grep "spawn(" dist-electron/` | 零匹配 |
| 无 WebSocket CDP | `grep "CDPClient" dist-electron/` | 零匹配 |
| 无 iOS key | `grep "in-app-purchase" packages/app/build/entitlements.mas.plist` | 零匹配 |
| Entitlements | `codesign -d --entitlements :-` | 正确权限集 |
| PKG 签名 | `pkgutil --check-signature` | 签名有效 |
| 审核词扫描 | `grep -rn "debug\|mock\|test.*toggle\|beta" src/` | 无敏感词 |

---

## 十六、最后上架流程（按顺序执行）

> 最后更新：2026-04-05。已完成到 Step 9，构建 `0.1.0 (3)` 已上传成功。

下面这条线是适合当前仓库状态的最终 SOP。不要跳步，按顺序做最稳。

### Step 0：先确认后台资格

- [x] Apple Developer Program 会员状态正常
- [x] App Store Connect 的 Paid Apps Agreement 已签
- [x] 税务和收款信息已填完
- [x] 你当前账号至少有 Account Holder / Admin / App Manager 中的可操作权限

### Step 1：确认 Developer 后台标识

- [x] 在 Certificates, Identifiers & Profiles 中确认显式 App ID：`com.domprompter.app`
- [x] 确认 MAS 内购对应的 Product ID 仍为：`com.domprompter.app.pro.lifetime`
- [x] 如果你改过 capabilities，记住所有旧 provisioning profiles 会失效，要重新生成

### Step 2：准备签名证书

- [x] 本机钥匙串中安装 `3rd Party Mac Developer Application: hu Huambo (STWPBZG6S7)` 证书
- [x] 本机钥匙串中安装 `3rd Party Mac Developer Installer: hu Huambo (STWPBZG6S7)` 证书
- [x] Keychain Access 中确认证书状态有效

### Step 3：生成 MAS provisioning profile

- [x] 在 Profiles 中新建 `Mac App Store Connect` 类型 profile（名称：`DOMPrompter MAS Distribution`）
- [x] 绑定 App ID：`com.domprompter.app`，Team ID：`STWPBZG6S7`
- [x] 选择上一步的 distribution certificate
- [x] 下载 profile，放到 `packages/app/build/embedded.provisionprofile`
- [x] 有效期至 2027-04-05

验证命令：

```bash
security cms -D -i packages/app/build/embedded.provisionprofile | plutil -p -
```

### Step 4：补齐仓库里的发行材料

- [x] 生成 `packages/app/public/icon.png`（electron-builder 自动转 icns）
- [x] 配置 `build.mac.icon: “public/icon.png”`
- [x] 配置 `build.mas.provisioningProfile: “build/embedded.provisionprofile”`
- [x] 在 `entitlements.mas.plist` 中添加 `com.apple.application-identifier` 和 `com.apple.developer.team-identifier`
- [x] 分离版本号与构建号：`version: “0.1.0”` + `build.buildVersion: “3”`

### Step 5：本地重新构建并验签

- [x] `npm run mas:check` — PASS
- [x] `npm run build:mas` — 通过

构建验证清单：

```bash
# 1. 验证 provisioning profile 已嵌入
ls packages/app/dist/mas-arm64/DOMPrompter.app/Contents/embedded.provisionprofile

# 2. 验证签名完整性
codesign --verify --deep --strict --verbose=2 packages/app/dist/mas-arm64/DOMPrompter.app

# 3. 验证 application-identifier 已写入签名（TestFlight 必需）
codesign -d --entitlements - packages/app/dist/mas-arm64/DOMPrompter.app
# 应看到：com.apple.application-identifier = STWPBZG6S7.com.domprompter.app

# 4. 验证 pkg 签名
pkgutil --check-signature packages/app/dist/mas-arm64/DOMPrompter-0.1.0-arm64.pkg
```

**踩坑记录（2026-04-05）：**

| 错误 | 原因 | 修复 |
|------|------|------|
| “missing a provisioning profile” | `identity: null` 导致 electron-builder 跳过 profile 嵌入 | `repair-mas-build.mjs` 添加 `embedProvisioningProfile()` |
| “missing an application identifier” | entitlements.mas.plist 未声明 application-identifier | 添加 `com.apple.application-identifier` 和 `com.apple.developer.team-identifier` |
| “bundle version must be higher” | version 和 buildVersion 未分离，重复上传同版本号 | 新增 `build.buildVersion` 字段独立管理构建号 |

### Step 6：在 App Store Connect 创建 app record

- [x] Apps → `+` → New App
- [x] 平台选 `macOS`
- [x] App Name 填 `DOMPrompter`
- [x] Bundle ID 选 `com.domprompter.app`

### Step 7：补齐商店元数据

- [ ] App Information 中填分类、年龄分级、版权信息
- [ ] App Privacy 中填写数据收集问卷，并发布 privacy responses
- [ ] 填好 Privacy Policy URL：`https://hooosberg.com/privacy/`
- [ ] 处理 App Encryption Documentation 问卷
- [ ] 准备 Mac 截图，尺寸使用 16:10，官方当前接受：
  `1280x800` / `1440x900` / `2560x1600` / `2880x1800`
- [ ] 上传描述、副标题、关键词、支持链接、营销文案

### Step 8：创建并配置内购

- [ ] 在 App Store Connect 创建 non-consumable IAP
- [ ] Product ID 必须和代码一致：`com.domprompter.app.pro.lifetime`
- [ ] 补本地化标题、描述、价格档位（代码 fallback 为 $19.99）、审核截图
- [ ] 首次提交 IAP 时，把它和新的 app version 一起送审

### Step 9：上传 build

- [x] 用 Transporter 上传 `DOMPrompter-0.1.0-arm64.pkg`
- [x] Apple 处理完成，build `0.1.0 (3)` 出现在 App Store Connect
- [x] 如需重新上传，递增 `build.buildVersion` 后重新构建

### Step 10：选 build 并提交审核

- [ ] 在对应 macOS version 页面选择 build `0.1.0 (3)`
- [ ] 点 `Add for Review`
- [ ] 把首个 IAP 一并加入这次 submission
- [ ] 点 `Submit for Review`

### Step 11：给审核员准备说明

建议在 Review Notes 里主动解释这几点：

- [ ] App 是 Web 开发者工具，需要加载任意用户指定 URL（包括 `http://localhost:*` 本地开发服务器）
- [ ] App 不会启动外部进程，不会扫描本地端口，不会连接外部浏览器 CDP
- [ ] 付费功能只有”页面级导出提示词”，购买后解锁，且支持恢复购买
- [ ] 如果审核需要体验付费墙，说明从哪个入口触发（Settings → License）

### Step 12：上传后的回归检查

- [ ] 处理完成后在 App Store Connect 里确认版本号、build 号正确
- [ ] 用沙盒账号验证购买与恢复购买
- [ ] 检查 UI 中没有 `test` / `mock` / `beta` / `debug` 文案
- [ ] Support URL 和 Privacy URL 可访问
- [ ] 如果被打回，优先把 rejection 文本和最新 build log 一起归档

### 当前最优先的事

1. 在 App Store Connect 配置内购产品 `com.domprompter.app.pro.lifetime`
2. 补齐商店元数据（截图、描述、隐私问卷）
3. TestFlight 内测验证 IAP 流程
4. 提交审核

---

## 十七、项目关键文件索引

| 文件 | 用途 |
|------|------|
| **主进程** | |
| `packages/app/electron/main.ts` | Electron 主进程（窗口/菜单/IPC/BrowserView） |
| `packages/app/electron/preload.ts` | IPC 桥接 |
| `packages/app/electron/licenseService.ts` | 主进程内购服务（StoreKit IAP） |
| **渲染进程** | |
| `packages/app/src/main.tsx` | React 入口 |
| `packages/app/src/App.tsx` | 根组件（topbar/canvas/workbench） |
| `packages/app/src/App.css` | 主样式表 |
| `packages/app/src/i18n.ts` | i18n 初始化 |
| `packages/app/src/locales/*.json` | 12 语种翻译文件 |
| `packages/app/src/components/OnboardingWizard.tsx` | 首次引导向导 |
| `packages/app/src/components/Settings.tsx` | 设置面板 |
| `packages/app/src/components/PaywallDialog.tsx` | 收费墙对话框（fallback 价格 $19.99） |
| `packages/app/src/services/LicenseManager.ts` | 渲染进程许可证管理 |
| `packages/app/src/shared/license.ts` | 共享常量（MAS_PRODUCT_ID）/类型 |
| `packages/app/src/components/properties/PropertiesWorkbench.tsx` | 右侧属性面板 |
| **Core** | |
| `packages/core/src/cdp/connection.ts` | CDP 连接（builtin only） |
| `packages/core/src/codeGenerator.ts` | 代码/提示词生成 |
| **构建与签名** | |
| `packages/app/package.json` | 版本号（version）、构建号（buildVersion）、electron-builder 配置 |
| `packages/app/build/entitlements.mas.plist` | 主进程 entitlements（含 application-identifier） |
| `packages/app/build/entitlements.mas.inherit.plist` | 子进程 entitlements |
| `packages/app/build/embedded.provisionprofile` | MAS Distribution Profile（有效期至 2027-04-05） |
| `packages/app/build/*.lproj/InfoPlist.strings` | 多语言 App Store 显示名 |
| `scripts/repair-mas-build.mjs` | 两阶段签名修复脚本（嵌入 profile + 按序签名 + productbuild） |
| `scripts/mas-check.mjs` | MAS 合规检查脚本 |
| **报告** | |
| `reports/mas/evidence-checklist.md` | MAS gate 证据清单 |
| `docs/mas-build-guide.md` | 构建与上传完整指南 |
| `docs/mas-refactor-progress.md` | MAS 改造进度追踪 |

---

## 十八、参考文档

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Electron MAS Submission Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [App Sandbox Entitlements Reference](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
- [Configuring macOS App Sandbox](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox)
- [In-App Purchase for macOS](https://developer.apple.com/documentation/storekit/in-app_purchase)
- [Certificates Overview](https://developer.apple.com/help/account/certificates/certificates-overview)
- [Register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/)
- [Create an App Store Connect Provisioning Profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile)
- [Add a New App](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app)
- [Upload Builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Choose a Build to Submit](https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/)
- [Submit an App](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app)
- [Submit an In-App Purchase](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Determine and Upload App Encryption Documentation](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation)
- [Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications)
- TrekReel MAS SOP（内部参考）
- WitNote 框架（`智简witnote笔记本` 项目，i18n/Settings/Paywall/Menu 参考实现）
