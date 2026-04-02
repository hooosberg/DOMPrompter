import { useState, useEffect, useCallback } from 'react'
import type { InspectorMode, ProjectInfo, ProjectLaunchStatus } from '../types'

interface WelcomeScreenProps {
  projectSession: ProjectLaunchStatus
  onSelectProject: () => void
  onLaunch: (mode: InspectorMode, customCommand?: string) => void
  onLoadStaticHtml: (filePath: string) => void
  onConnectRunning: (endpoint: string) => void
  onStop: () => void
  launchBusy: boolean
}

// ─── AI 适配提示词 ──────────────────────────────
const AI_SETUP_PROMPT = `我正在使用 Visual Inspector 来调试我的项目界面。请帮我适配项目的启动脚本，让 Visual Inspector 能一键启动并连接调试。

请按照以下规范修改我的 package.json 中的 scripts：

## 规范要求

### 1. 如果是纯网页项目（React / Vue / Svelte / Next.js / 纯 HTML 等）
确保有 \`dev\` 脚本，启动本地开发服务器：
\`\`\`json
{
  "scripts": {
    "dev": "vite"  // 或 next dev / webpack serve / 任何启动 localhost 的命令
  }
}
\`\`\`
- 开发服务器必须监听 localhost（不要求固定端口）
- 如果是纯 HTML 项目没有 package.json，请创建一个并添加 \`"dev": "npx serve ."\`

### 2. 如果是 Electron / 桌面端项目
确保有 \`electron:dev\` 脚本，启动 Electron 并 **必须包含** \`--remote-debugging-port=9222\`：
\`\`\`json
{
  "scripts": {
    "electron:dev": "你的 Electron 启动命令 --remote-debugging-port=9222"
  }
}
\`\`\`

**关键要求**：\`--remote-debugging-port=9222\` 必须作为 Electron 进程的命令行参数传入，不能只放在环境变量里。

常见适配示例：

**electron-vite 项目：**
\`\`\`json
"electron:dev": "electron-vite dev -- --remote-debugging-port=9222"
\`\`\`

**Vite + Electron (concurrently) 项目：**
\`\`\`json
"electron:dev": "concurrently -k \\"vite\\" \\"wait-on http://localhost:5173 && electron . --remote-debugging-port=9222\\""
\`\`\`

**直接 electron 启动：**
\`\`\`json
"electron:dev": "cross-env NODE_ENV=development electron . --remote-debugging-port=9222"
\`\`\`

### 3. 如果项目同时有网页和桌面模式
请同时保留两个脚本：
\`\`\`json
{
  "scripts": {
    "dev": "vite",
    "electron:dev": "concurrently -k \\"vite\\" \\"wait-on ... && electron . --remote-debugging-port=9222\\""
  }
}
\`\`\`

## 注意事项
- 不要修改项目的业务逻辑代码，只调整启动脚本
- 如果缺少依赖（如 concurrently、wait-on、cross-env、serve），请帮我安装
- 保留项目原有的其他脚本不变
- 9222 是调试端口，不要和项目的业务端口冲突

## 验证步骤（必须执行）

修改完成后，**必须**运行以下验证，确认脚本能正常启动：

### 网页项目验证
如果适配了 \`dev\` 脚本：
1. 运行 \`npm run dev\`（或对应的包管理器命令）
2. 等待几秒，观察输出是否包含 localhost 地址（如 \`http://localhost:5173\`）
3. 确认无报错后，用 Ctrl+C 终止进程

### Electron 项目验证
如果适配了 \`electron:dev\` 脚本：
1. 运行 \`npm run electron:dev\`（或对应的包管理器命令）
2. 等待窗口弹出或输出中出现 \`DevTools listening on ws://\` 字样
3. 确认无报错后，用 Ctrl+C 终止进程

### 如果启动失败
请按以下顺序排查：
1. **依赖未安装**：检查报错是否为 \`command not found\` 或 \`Cannot find module\`，执行 \`npm install\` 后重试
2. **端口冲突**：如果报 \`EADDRINUSE\`，说明 9222 端口被占用，先关闭占用进程再重试
3. **脚本语法错误**：检查 package.json 中引号转义是否正确，concurrently 的命令格式是否合法
4. **electron-vite 参数传递**：某些版本的 electron-vite 不支持 \`--\` 传参，尝试改为环境变量方式：\`cross-env ELECTRON_EXTRA_LAUNCH_ARGS=--remote-debugging-port=9222 electron-vite dev\`
5. **如果仍然失败**：输出完整的错误日志，并说明你的排查过程

**重要：只有验证通过后，才算适配完成。不要跳过验证步骤。**

请分析我的项目类型，按上述规范适配。`

// ─── 工具函数 ──────────────────────────────────

type ViewMode = 'setup' | 'launch'

function detectProjectReady(projectInfo: ProjectInfo | null): {
  hasWebDev: boolean
  hasElectronDev: boolean
  electronDevHasDebugPort: boolean
} {
  if (!projectInfo) return { hasWebDev: false, hasElectronDev: false, electronDevHasDebugPort: false }

  const scripts = projectInfo.scripts
  const devScript = scripts.find((s) => s.name === 'dev')
  const electronDevScript = scripts.find((s) => s.name === 'electron:dev')

  const hasWebDev = Boolean(devScript)
  const hasElectronDev = Boolean(electronDevScript)
  // 脚本自身包含 --remote-debugging-port，或者项目有 electron 依赖
  // （启动时会通过 ELECTRON_EXTRA_LAUNCH_ARGS 自动注入调试端口）
  const electronDevHasDebugPort = Boolean(
    electronDevScript
    && (electronDevScript.command.includes('remote-debugging-port') || projectInfo.hasElectron),
  )

  return { hasWebDev, hasElectronDev, electronDevHasDebugPort }
}

// ─── 组件 ──────────────────────────────────────

export function WelcomeScreen({
  projectSession,
  onSelectProject,
  onLaunch,
  onLoadStaticHtml,
  onConnectRunning,
  onStop,
  launchBusy,
}: WelcomeScreenProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('launch')
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [connectEndpoint, setConnectEndpoint] = useState('127.0.0.1:9222')

  const hasProject = Boolean(projectSession.projectDir)
  const showStop = projectSession.status === 'ready' || launchBusy

  // Inspect project when projectDir changes
  useEffect(() => {
    if (!projectSession.projectDir) {
      setProjectInfo(null)
      return
    }
    void (async () => {
      const info = await window.electronAPI.inspectProject(projectSession.projectDir!)
      setProjectInfo(info)
    })()
  }, [projectSession.projectDir])

  const readiness = detectProjectReady(projectInfo)

  const handleCopyPrompt = useCallback(async () => {
    await navigator.clipboard.writeText(AI_SETUP_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [])

  const handleSelectHtml = useCallback(async () => {
    const filePath = await window.electronAPI.selectHtmlFile(projectSession.projectDir || undefined)
    if (filePath) {
      onLoadStaticHtml(filePath)
    }
  }, [projectSession.projectDir, onLoadStaticHtml])

  return (
    <div className="welcome-screen">
      <div className="welcome-shell">
        <div className="welcome-card">
          <div className="welcome-header">
            <div className="welcome-icon" aria-hidden="true">
              <span className="welcome-icon-ring" />
              <span className="welcome-icon-core" />
            </div>
            <h2 className="welcome-title">Visual Inspector</h2>
            <p className="welcome-subtitle">可视化界面检查与标注工具</p>
          </div>

          <div className="welcome-body">
            {/* Tab switcher */}
            <div className="welcome-tabs">
              <button
                className={`welcome-tab ${viewMode === 'launch' ? 'active' : ''}`}
                onClick={() => setViewMode('launch')}
              >
                启动调试
              </button>
              <button
                className={`welcome-tab ${viewMode === 'setup' ? 'active' : ''}`}
                onClick={() => setViewMode('setup')}
              >
                项目适配
              </button>
            </div>

            {viewMode === 'setup' ? (
              /* ─── 适配提示词面板 ─── */
              <div className="welcome-setup">
                <div className="welcome-setup-desc">
                  复制下方提示词，粘贴到你的 AI 编程工具（Cursor / Claude Code / Windsurf 等），
                  AI 会自动分析你的项目并适配启动脚本，确保 Visual Inspector 能一键连接调试。
                </div>

                <div className="welcome-prompt-box">
                  <div className="welcome-prompt-preview">
                    {AI_SETUP_PROMPT.slice(0, 200)}…
                  </div>
                  <button
                    className="welcome-btn primary"
                    onClick={handleCopyPrompt}
                  >
                    {copied ? '已复制' : '复制适配提示词'}
                  </button>
                </div>

                <div className="welcome-setup-checklist">
                  <div className="welcome-setup-check-title">适配后你的项目会有：</div>
                  <div className="welcome-setup-check-item">
                    <code>npm run dev</code> — 启动网页开发服务器
                  </div>
                  <div className="welcome-setup-check-item">
                    <code>npm run electron:dev</code> — 启动桌面端（含调试端口）
                  </div>
                </div>
              </div>
            ) : (
              /* ─── 启动调试面板 ─── */
              <>
                {/* 项目选择 */}
                <div className="welcome-step">
                  <div className="welcome-step-label">项目目录</div>
                  <div className="welcome-project-row">
                    <div className="welcome-project-path">
                      {projectSession.projectDir || '选择要调试的项目'}
                    </div>
                    <button className="welcome-btn secondary" onClick={onSelectProject}>
                      选择项目
                    </button>
                  </div>
                </div>

                {/* 项目已选择 — 显示可用的调试模式 */}
                {hasProject && projectInfo && (
                  <div className="welcome-step">
                    <div className="welcome-step-label">选择调试方式</div>
                    <div className="welcome-launch-options">
                      {/* 网页调试 */}
                      {readiness.hasWebDev && (
                        <button
                          className="welcome-launch-btn"
                          disabled={launchBusy}
                          onClick={() => onLaunch('builtin', 'dev')}
                        >
                          <span className="welcome-launch-icon">🌐</span>
                          <div className="welcome-launch-info">
                            <span className="welcome-launch-label">网页调试</span>
                            <span className="welcome-launch-cmd">npm run dev</span>
                          </div>
                          <span className="welcome-launch-status ready" />
                        </button>
                      )}

                      {/* 桌面调试 */}
                      {readiness.hasElectronDev && (
                        <button
                          className={`welcome-launch-btn ${!readiness.electronDevHasDebugPort ? 'warn' : ''}`}
                          disabled={launchBusy}
                          onClick={() => onLaunch('external', 'electron:dev')}
                        >
                          <span className="welcome-launch-icon">🖥</span>
                          <div className="welcome-launch-info">
                            <span className="welcome-launch-label">桌面调试</span>
                            <span className="welcome-launch-cmd">npm run electron:dev</span>
                          </div>
                          <span className={`welcome-launch-status ${readiness.electronDevHasDebugPort ? 'ready' : 'needs-setup'}`} />
                        </button>
                      )}

                      {/* 桌面调试未配置调试端口的提示 */}
                      {readiness.hasElectronDev && !readiness.electronDevHasDebugPort && (
                        <div className="welcome-inline-hint">
                          electron:dev 脚本中未包含 --remote-debugging-port=9222，可能无法连接。
                          <button className="welcome-link-btn" onClick={() => setViewMode('setup')}>
                            去适配
                          </button>
                        </div>
                      )}

                      {/* 静态 HTML */}
                      <button
                        className="welcome-launch-btn"
                        disabled={launchBusy}
                        onClick={handleSelectHtml}
                      >
                        <span className="welcome-launch-icon">📄</span>
                        <div className="welcome-launch-info">
                          <span className="welcome-launch-label">静态 HTML</span>
                          <span className="welcome-launch-cmd">选择 HTML 文件直接打开</span>
                        </div>
                      </button>

                      {/* 连接已运行 */}
                      <div className="welcome-connect-row">
                        <button
                          className="welcome-launch-btn compact"
                          disabled={launchBusy || !connectEndpoint.trim()}
                          onClick={() => onConnectRunning(connectEndpoint.trim())}
                        >
                          <span className="welcome-launch-icon">🔌</span>
                          <div className="welcome-launch-info">
                            <span className="welcome-launch-label">连接已运行</span>
                          </div>
                        </button>
                        <input
                          className="welcome-endpoint-input"
                          type="text"
                          value={connectEndpoint}
                          onChange={(e) => setConnectEndpoint(e.target.value)}
                          placeholder="127.0.0.1:9222"
                          spellCheck={false}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && connectEndpoint.trim()) {
                              onConnectRunning(connectEndpoint.trim())
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 没有选择项目时也显示快捷操作 */}
                {!hasProject && (
                  <div className="welcome-step">
                    <div className="welcome-step-label">或者</div>
                    <div className="welcome-launch-options">
                      <button
                        className="welcome-launch-btn"
                        disabled={launchBusy}
                        onClick={handleSelectHtml}
                      >
                        <span className="welcome-launch-icon">📄</span>
                        <div className="welcome-launch-info">
                          <span className="welcome-launch-label">打开静态 HTML</span>
                          <span className="welcome-launch-cmd">选择 HTML 文件直接调试</span>
                        </div>
                      </button>

                      <div className="welcome-connect-row">
                        <button
                          className="welcome-launch-btn compact"
                          disabled={launchBusy || !connectEndpoint.trim()}
                          onClick={() => onConnectRunning(connectEndpoint.trim())}
                        >
                          <span className="welcome-launch-icon">🔌</span>
                          <div className="welcome-launch-info">
                            <span className="welcome-launch-label">连接已运行的程序</span>
                          </div>
                        </button>
                        <input
                          className="welcome-endpoint-input"
                          type="text"
                          value={connectEndpoint}
                          onChange={(e) => setConnectEndpoint(e.target.value)}
                          placeholder="127.0.0.1:9222"
                          spellCheck={false}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && connectEndpoint.trim()) {
                              onConnectRunning(connectEndpoint.trim())
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 没检测到任何标准脚本的提示 */}
                {hasProject && projectInfo && !readiness.hasWebDev && !readiness.hasElectronDev && (
                  <div className="welcome-warning">
                    未检测到标准启动脚本（dev / electron:dev）。
                    <button className="welcome-link-btn" onClick={() => setViewMode('setup')}>
                      复制提示词让 AI 帮你适配
                    </button>
                  </div>
                )}

                {/* Status message */}
                {projectSession.message && (
                  <div className="welcome-message">{projectSession.message}</div>
                )}

                {showStop && (
                  <div className="welcome-actions">
                    <button className="welcome-btn ghost" onClick={onStop}>
                      停止
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
