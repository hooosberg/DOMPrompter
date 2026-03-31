import { app, BrowserWindow, BrowserView, ipcMain, dialog, screen, type Rectangle } from 'electron'
import { basename, dirname, join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { CDPClient, InspectorService, discoverLocalApps, generateAIPrompt, generateCSSClass, generateCSSVariables } from '@visual-inspector/core'
import type { ICDPTransport, InspectedElement, CSSProperty } from '@visual-inspector/core'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RIGHT_PANEL_WIDTH = 320
const TOP_BAR_HEIGHT = 48
const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800, minWidth: 900, minHeight: 600, alwaysOnTop: false }
const SIDEBAR_WINDOW_SIZE = { width: 380, minWidth: 360, minHeight: 620, alwaysOnTop: true }
const WINDOW_STATE_FILE = 'window-state.json'

let mainWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null
let cdpClient: CDPClient | null = null
let inspectorService: InspectorService | null = null
let currentMode: 'builtin' | 'external' = 'builtin'
let launchedProcess: ChildProcess | null = null
let currentWindowPreset: 'default' | 'sidebar' = 'default'
let restoreBounds: Rectangle | null = null
let restoreAlwaysOnTop = false
let builtinViewInteractive = false
let currentRightPanelWidth = RIGHT_PANEL_WIDTH

type PackageManager = 'npm' | 'pnpm' | 'yarn'

interface ProjectLaunchCommands {
  builtin: string | null
  external: string | null
}

interface ProjectLaunchCapabilities {
  builtin: boolean
  external: boolean
}

interface ProjectLaunchStatusPayload {
  status: 'idle' | 'project-selected' | 'launching' | 'starting-web' | 'starting-electron' | 'waiting-web' | 'waiting-cdp' | 'ready' | 'error' | 'stopped' | 'exited'
  projectDir?: string
  projectName?: string
  selectedMode?: 'builtin' | 'external'
  builtinUrl?: string | null
  externalEndpoint?: string | null
  commands?: ProjectLaunchCommands
  capabilities?: ProjectLaunchCapabilities
  message?: string
  autoConnected?: boolean
}

interface ProjectDescriptor {
  projectDir: string
  projectName: string
  packageManager: PackageManager
  commands: ProjectLaunchCommands
  capabilities: ProjectLaunchCapabilities
}

interface DirectElectronLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

interface ProjectSessionState extends ProjectDescriptor {
  selectedMode: 'builtin' | 'external'
  webProcess: ChildProcess | null
  electronProcess: ChildProcess | null
  builtinUrl: string | null
  externalEndpoint: string | null
}

let projectSession: ProjectSessionState | null = null

interface PersistedWindowState {
  bounds?: Rectangle
  restoreBounds?: Rectangle
}

function getWindowStatePath() {
  return join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function sanitizeBounds(bounds: Rectangle | null | undefined): Rectangle | null {
  if (!bounds) return null
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null
  if (bounds.width < DEFAULT_WINDOW_SIZE.minWidth || bounds.height < DEFAULT_WINDOW_SIZE.minHeight) return null
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function loadWindowState(): PersistedWindowState {
  try {
    const file = getWindowStatePath()
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PersistedWindowState
    return {
      bounds: sanitizeBounds(parsed.bounds) || undefined,
      restoreBounds: sanitizeBounds(parsed.restoreBounds) || undefined,
    }
  } catch (error) {
    console.error('Failed to load window state:', error)
    return {}
  }
}

function saveWindowState(state: PersistedWindowState) {
  try {
    const file = getWindowStatePath()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state), 'utf8')
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

function persistCurrentWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const currentBounds = sanitizeBounds(mainWindow.getBounds())
  const normalBounds = sanitizeBounds(currentWindowPreset === 'sidebar' ? restoreBounds : currentBounds)
  saveWindowState({
    bounds: currentBounds || undefined,
    restoreBounds: normalBounds || undefined,
  })
}

function emitLaunchStatus(payload: ProjectLaunchStatusPayload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launch-status', payload)
  }
}

function inferPackageManager(projectDir: string): PackageManager {
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(projectDir, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function readPackageJson(projectDir: string): any | null {
  try {
    const raw = readFileSync(join(projectDir, 'package.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function detectProjectDescriptor(projectDir: string): ProjectDescriptor | null {
  const pkg = readPackageJson(projectDir)
  if (!pkg) return null

  const scripts = pkg.scripts || {}
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const hasElectronDependency = Boolean(
    dependencies.electron
    || dependencies['vite-plugin-electron']
    || dependencies['electron-vite']
    || dependencies['electron-builder'],
  )

  const builtinCommand = typeof scripts.dev === 'string'
    ? 'dev'
    : typeof scripts.start === 'string'
      ? 'start'
      : null

  const externalCommand = typeof scripts['electron:inspect'] === 'string'
    ? 'electron:inspect'
    : typeof scripts['electron:dev'] === 'string'
      ? 'electron:dev'
      : null

  const capabilities: ProjectLaunchCapabilities = {
    builtin: Boolean(builtinCommand),
    external: Boolean(externalCommand || hasElectronDependency),
  }

  return {
    projectDir,
    projectName: pkg.name || basename(projectDir),
    packageManager: inferPackageManager(projectDir),
    commands: {
      builtin: builtinCommand,
      external: externalCommand,
    },
    capabilities,
  }
}

function buildRunCommand(packageManager: PackageManager, scriptName: string) {
  if (packageManager === 'yarn') {
    return { command: 'yarn', args: [scriptName] }
  }
  return { command: packageManager, args: ['run', scriptName] }
}

function resolveProjectElectronLaunch(projectDir: string): DirectElectronLaunch | null {
  const pkg = readPackageJson(projectDir)
  if (!pkg || typeof pkg.main !== 'string' || !pkg.main.trim()) {
    return null
  }

  const mainEntry = join(projectDir, pkg.main)
  if (!existsSync(mainEntry)) {
    return null
  }

  const electronBinary = join(
    projectDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron',
  )

  if (!existsSync(electronBinary)) {
    return null
  }

  return {
    command: electronBinary,
    args: ['.', '--remote-debugging-port=9222'],
    env: {},
  }
}

function buildChildProcessEnv(overrides: Record<string, string> = {}) {
  const filteredEntries = Object.entries(process.env).filter(([key]) => {
    const normalized = key.toLowerCase()
    // 过滤所有 npm/pnpm 注入的环境变量，避免子进程 pnpm 误判 workspace
    if (normalized.startsWith('npm_')) return false
    if (normalized === 'init_cwd') return false
    if (normalized === 'electron_run_as_node') return false
    return true
  })

  return {
    ...Object.fromEntries(filteredEntries),
    ...overrides,
  }
}

function buildProjectDebugUserDataDir(projectDir: string) {
  const projectHash = createHash('sha1').update(projectDir).digest('hex').slice(0, 10)
  const dir = join(app.getPath('temp'), 'visual-inspector-targets', projectHash)
  mkdirSync(dir, { recursive: true })
  return dir
}

function normalizeLocalUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1'
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.replace('http://localhost:', 'http://127.0.0.1:').replace(/\/$/, '')
  }
}

function pickBuiltinApp(apps: Awaited<ReturnType<typeof discoverLocalApps>>) {
  const currentOrigin = VITE_DEV_SERVER_URL ? normalizeLocalUrl(VITE_DEV_SERVER_URL) : ''
  const priority = [5174, 5175, 5173, 5176, 3000, 3001, 4173, 4200, 8080, 8081]
  return [...apps]
    .filter((app) => app.type === 'web' && normalizeLocalUrl(app.url) !== currentOrigin)
    .sort((a, b) => {
      const aIndex = priority.indexOf(a.port)
      const bIndex = priority.indexOf(b.port)
      const aScore = aIndex === -1 ? priority.length + a.port : aIndex
      const bScore = bIndex === -1 ? priority.length + b.port : bIndex
      return aScore - bScore
    })[0] || null
}

async function waitForBuiltinUrl(timeoutMs: number = 20000): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const apps = await discoverLocalApps()
      const app = pickBuiltinApp(apps)
      if (app) return app.url
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

function stopChildProcess(process: ChildProcess | null) {
  if (!process) return
  try {
    process.kill()
  } catch {
    // ignore
  }
}

function stopProjectSessionProcesses() {
  if (!projectSession) return
  stopChildProcess(projectSession.webProcess)
  stopChildProcess(projectSession.electronProcess)
  projectSession.webProcess = null
  projectSession.electronProcess = null
}

function resetProjectSession() {
  stopProjectSessionProcesses()
  projectSession = null
}

/**
 * 如果 cdpUrl 是 browser-level target（/devtools/browser/...），
 * 通过 /json/list 解析出 page-level target 的 WebSocket URL。
 * 只有 page-level target 才支持 DOM.enable 等命令。
 */
async function resolvePageTargetUrl(cdpUrl: string): Promise<string> {
  const browserMatch = cdpUrl.match(/^ws:\/\/([\w.-]+):(\d+)\/devtools\/browser\//)
  if (!browserMatch) return cdpUrl // 已经是 page target 或其他格式，直接返回

  const host = browserMatch[1]
  const port = browserMatch[2]
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(`http://${host}:${port}/json/list`, { signal: controller.signal })
    clearTimeout(t)
    if (resp.ok) {
      const targets = await resp.json() as any[]
      const pageTarget = targets.find((target: any) =>
        target.type === 'page'
        && target.webSocketDebuggerUrl
        && !String(target.url || '').startsWith('devtools://'),
      )
      if (pageTarget?.webSocketDebuggerUrl) {
        console.log('[resolvePageTargetUrl] Resolved browser target to page target:', pageTarget.webSocketDebuggerUrl)
        return pageTarget.webSocketDebuggerUrl
      }
    }
  } catch (e) {
    console.warn('[resolvePageTargetUrl] Failed to resolve page target, using original URL:', e)
  }
  return cdpUrl
}

async function connectExternalInspector(cdpUrl: string, maxRetries = 3) {
  currentMode = 'external'
  builtinViewInteractive = false
  cleanupBrowserView()

  if (cdpClient) cdpClient.disconnect()

  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 确保连接到 page-level target（而非 browser target）
      const resolvedUrl = await resolvePageTargetUrl(cdpUrl)

      cdpClient = new CDPClient()
      await cdpClient.connect(resolvedUrl)

      inspectorService = new InspectorService(cdpClient)
      await inspectorService.initialize()

      // 连接成功 — 注册事件监听
      inspectorService.onElementSelected((element: InspectedElement, meta) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('element-selected', element, meta)
        }
      })
      inspectorService.onOverlayAction((action) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('overlay-action', action)
        }
      })
      return // 成功，退出重试循环
    } catch (e) {
      lastError = e as Error
      console.warn(`[connectExternalInspector] attempt ${attempt + 1}/${maxRetries} failed:`, (e as Error).message)
      if (cdpClient) { try { cdpClient.disconnect() } catch {} }
      cdpClient = null
      inspectorService = null
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000)) // 1s, 2s 递增延迟
      }
    }
  }
  throw lastError || new Error('Failed to connect to external inspector after retries')
}

// ─── Electron Debugger Adapter（模式 A）─────────

/** 将 BrowserView 的 webContents.debugger 适配为 ICDPTransport */
class ElectronDebuggerTransport implements ICDPTransport {
  private view: BrowserView
  private listeners = new Map<string, Set<(params: any) => void>>()
  private _connected = false

  constructor(view: BrowserView) {
    this.view = view
  }

  get connected(): boolean {
    return this._connected
  }

  async attach(): Promise<void> {
    try {
      this.view.webContents.debugger.attach('1.3')
      this._connected = true

      this.view.webContents.debugger.on('message', (_event, method, params) => {
        const cbs = this.listeners.get(method)
        if (cbs) {
          for (const cb of cbs) {
            try { cb(params) } catch (e) { console.error(`Debugger event error [${method}]:`, e) }
          }
        }
      })

      this.view.webContents.debugger.on('detach', () => {
        this._connected = false
      })
    } catch (err) {
      console.error('Failed to attach debugger:', err)
      throw err
    }
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this._connected) throw new Error('Debugger not attached')
    return this.view.webContents.debugger.sendCommand(method, params || {})
  }

  on(event: string, callback: (params: any) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: (params: any) => void): void {
    this.listeners.get(event)?.delete(callback)
  }

  disconnect(): void {
    if (this._connected) {
      try { this.view.webContents.debugger.detach() } catch { /* ignore */ }
      this._connected = false
    }
    this.listeners.clear()
  }
}

let debuggerTransport: ElectronDebuggerTransport | null = null

// ─── 窗口创建 ──────────────────────────────────

function createWindow() {
  const storedState = loadWindowState()
  const workArea = screen.getPrimaryDisplay().workArea
  const storedBounds = storedState.restoreBounds || storedState.bounds
  const initialBounds = storedBounds
    && storedBounds.width >= workArea.width * 0.88
    && storedBounds.height >= workArea.height * 0.78
      ? storedBounds
      : null
  mainWindow = new BrowserWindow({
    width: initialBounds?.width || workArea.width,
    height: initialBounds?.height || workArea.height,
    ...(initialBounds
      ? { x: initialBounds.x, y: initialBounds.y }
      : { x: workArea.x, y: workArea.y }),
    minWidth: DEFAULT_WINDOW_SIZE.minWidth,
    minHeight: DEFAULT_WINDOW_SIZE.minHeight,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    resizable: true
  })

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const display = screen.getDisplayMatching(mainWindow.getBounds())
    const workArea = display.workArea
    mainWindow.setBounds(workArea)

    // 每次启动都先铺满工作区，避免恢复到之前意外保存的较小窗口。
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    cleanupBrowserView()
  })

  // 窗口大小变化时调整 BrowserView
  mainWindow.on('resize', () => {
    updateBrowserViewBounds()
    if (currentWindowPreset === 'default') {
      persistCurrentWindowState()
    }
  })

  mainWindow.on('move', () => {
    if (currentWindowPreset === 'default') {
      persistCurrentWindowState()
    }
  })

  mainWindow.on('close', () => {
    persistCurrentWindowState()
  })
}

function resizeWindowToSidebar() {
  if (!mainWindow || mainWindow.isDestroyed() || currentWindowPreset === 'sidebar') return

  restoreBounds = mainWindow.getBounds()
  restoreAlwaysOnTop = mainWindow.isAlwaysOnTop()

  const { height } = mainWindow.getBounds()
  mainWindow.setMinimumSize(SIDEBAR_WINDOW_SIZE.minWidth, SIDEBAR_WINDOW_SIZE.minHeight)
  mainWindow.setAlwaysOnTop(SIDEBAR_WINDOW_SIZE.alwaysOnTop, 'floating')
  mainWindow.setSize(SIDEBAR_WINDOW_SIZE.width, Math.max(height, SIDEBAR_WINDOW_SIZE.minHeight), true)
  currentWindowPreset = 'sidebar'
  persistCurrentWindowState()
}

function restoreWindowSize() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.setMinimumSize(DEFAULT_WINDOW_SIZE.minWidth, DEFAULT_WINDOW_SIZE.minHeight)
  mainWindow.setAlwaysOnTop(restoreAlwaysOnTop || DEFAULT_WINDOW_SIZE.alwaysOnTop)

  if (restoreBounds) {
    mainWindow.setBounds(restoreBounds, true)
  } else {
    mainWindow.setSize(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height, true)
  }

  currentWindowPreset = 'default'
  persistCurrentWindowState()
}

// ─── BrowserView 管理 ──────────────────────────

function createBrowserView(url: string) {
  if (!mainWindow) return

  cleanupBrowserView()

  browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.setBrowserView(browserView)
  updateBrowserViewBounds()
  browserView.webContents.loadURL(url)

  browserView.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser-view-loaded', {
        url: browserView?.webContents.getURL(),
        title: browserView?.webContents.getTitle()
      })
    }

    if (currentMode === 'builtin' && inspectorService) {
      void inspectorService.startInspecting().catch((error) => {
        console.error('Failed to restore builtin inspect mode after load:', error)
      })
    }
  })
}

function updateBrowserViewBounds() {
  if (!mainWindow || !browserView) return
  const bounds = mainWindow.getContentBounds()
  const rightPanelWidth = Math.max(0, Math.round(currentRightPanelWidth))
  if (currentMode === 'builtin' && !builtinViewInteractive) {
    browserView.setBounds({
      x: -(bounds.width + 10000),
      y: TOP_BAR_HEIGHT,
      width: Math.max(100, bounds.width - rightPanelWidth),
      height: Math.max(100, bounds.height - TOP_BAR_HEIGHT),
    })
    return
  }
  browserView.setBounds({
    x: 0,
    y: TOP_BAR_HEIGHT,
    width: Math.max(100, bounds.width - rightPanelWidth),
    height: Math.max(100, bounds.height - TOP_BAR_HEIGHT),
  })
}

function cleanupBrowserView() {
  if (debuggerTransport) {
    debuggerTransport.disconnect()
    debuggerTransport = null
  }
  if (inspectorService) {
    inspectorService = null
  }
  if (browserView && mainWindow) {
    mainWindow.removeBrowserView(browserView)
      ; (browserView.webContents as any).destroy?.()
    browserView = null
  }
}

// ─── App 生命周期 ──────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: 模式 A — 内置浏览器 ──────────────────

ipcMain.handle('load-url', async (_event, url: string): Promise<boolean> => {
  try {
    currentMode = 'builtin'
    builtinViewInteractive = false
    restoreWindowSize()

    // 清理旧的外部连接
    if (cdpClient) {
      cdpClient.disconnect()
      cdpClient = null
    }

    createBrowserView(url)
    return true
  } catch (error) {
    console.error('Failed to load URL:', error)
    return false
  }
})

ipcMain.handle('attach-debugger', async (): Promise<boolean> => {
  if (!browserView) return false

  try {
    debuggerTransport = new ElectronDebuggerTransport(browserView)
    await debuggerTransport.attach()

    inspectorService = new InspectorService(debuggerTransport)
    await inspectorService.initialize()

    inspectorService.onElementSelected((element: InspectedElement, meta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('element-selected', element, meta)
      }
    })
    inspectorService.onOverlayAction((action) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overlay-action', action)
      }
    })

    await inspectorService.startInspecting()

    return true
  } catch (error) {
    console.error('Failed to attach debugger:', error)
    return false
  }
})

// ─── IPC: 模式 B — 外部 CDP ────────────────────

/** 在主进程中发现 CDP WebSocket URL（避免渲染进程 CORS 限制）*/
ipcMain.handle('discover-cdp-url', async (_event, input: string): Promise<string | null> => {
  try {
    // 清理输入
    let addr = input.trim().replace(/\/+$/, '')

    // 如果已经是 ws:// 地址，直接返回
    if (addr.startsWith('ws://') || addr.startsWith('wss://')) {
      return addr
    }

    // 解析 host 和 port
    let host = '127.0.0.1'
    let port = '9222'

    // 去掉 http:// 前缀
    addr = addr.replace(/^https?:\/\//, '')

    // 解析 host:port
    const parts = addr.split(':')
    if (parts.length >= 2) {
      host = parts[0] || 'localhost'
      port = parts[1].replace(/\/.*/, '') || '9222'
    } else if (parts[0]) {
      // 只有 host，没有 port
      host = parts[0]
    }

    const pickInspectablePageTarget = (targets: any[]): string | null => {
      const pageTarget = targets.find((target) => {
        if (target.type !== 'page') return false
        if (!target.webSocketDebuggerUrl) return false
        const targetUrl = String(target.url || '')
        return !targetUrl.startsWith('devtools://')
      })

      return pageTarget?.webSocketDebuggerUrl || null
    }

    const hostCandidates = host === 'localhost'
      ? ['127.0.0.1', 'localhost']
      : host === '127.0.0.1'
        ? ['127.0.0.1', 'localhost']
        : [host]

    for (const candidateHost of hostCandidates) {
      const baseUrl = `http://${candidateHost}:${port}`
      console.log('Discovering CDP at:', baseUrl)

      try {
        // 优先从 /json/list 里挑真实页面 target，而不是 browser target。
        const listResp = await fetch(`${baseUrl}/json/list`)
        if (listResp.ok) {
          const pages = await listResp.json() as any[]
          const pageWsUrl = pickInspectablePageTarget(pages)
          if (pageWsUrl) {
            console.log('Discovered page CDP URL:', pageWsUrl)
            return pageWsUrl
          }
        }
      } catch {
        // try next host candidate
      }

      // /json/version 仅用于确认端口可达，不返回 browser-level URL
      // 因为 browser target 不支持 DOM.enable 等页面级命令
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const resp = await fetch(`${baseUrl}/json/version`, { signal: controller.signal })
        clearTimeout(timeout)
        if (resp.ok) {
          console.log(`CDP port reachable at ${baseUrl}, but no page target found yet`)
        }
      } catch {
        // port not reachable
      }
    }

    return null
  } catch (error) {
    console.error('CDP discovery failed:', error)
    return null
  }
})

// ─── IPC: 一键启动 Electron 应用 ────────────────

/** 等待 CDP 端口可用（轮询方式），始终查找 page-level target */
async function waitForCDP(host: string, port: number, timeoutMs: number = 15000): Promise<string | null> {
  const start = Date.now()
  let portReachable = false
  while (Date.now() - start < timeoutMs) {
    // 尝试 /json/list 获取页面级 target（支持 DOM.enable 等命令）
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 1500)
      const resp = await fetch(`http://${host}:${port}/json/list`, { signal: controller.signal })
      clearTimeout(t)
      if (resp.ok) {
        portReachable = true
        const targets = await resp.json() as any[]
        const pageTarget = targets.find((target) =>
          target.type === 'page'
          && target.webSocketDebuggerUrl
          && !String(target.url || '').startsWith('devtools://'),
        )
        if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl
        // /json/list 可达但还没有 page target，继续轮询等待页面加载
      }
    } catch { /* not ready yet */ }

    // 仅用 /json/version 来检测端口是否可达（不再返回 browser-level URL）
    if (!portReachable) {
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 1500)
        const resp = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal })
        clearTimeout(t)
        if (resp.ok) {
          portReachable = true
          // 端口已可达，但仍需等待 page target，继续轮询
        }
      } catch { /* not ready yet */ }
    }

    await new Promise(r => setTimeout(r, portReachable ? 300 : 500))
  }
  return null
}

/**
 * 从进程的 stdout/stderr 输出中实时解析 CDP WebSocket 地址。
 * Electron 启动时会输出 "DevTools listening on ws://..." 这样的日志。
 */
function waitForCDPFromOutput(
  childProcess: ChildProcess,
  fallbackHost: string,
  fallbackPort: number,
  timeoutMs: number = 20000,
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    let bufferedOutput = ''
    let detectedPort = fallbackPort
    let portProbeStarted = false
    const startedAt = Date.now()

    const finish = (value: string | null) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      childProcess.stdout?.off('data', handleOutput)
      childProcess.stderr?.off('data', handleOutput)
      childProcess.off('exit', handleExit)
      resolve(value)
    }

    const timeout = setTimeout(() => {
      finish(null)
    }, timeoutMs)

    const maybeProbeDetectedPort = () => {
      if (portProbeStarted) return
      portProbeStarted = true

      const remainingMs = timeoutMs - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        finish(null)
        return
      }

      void waitForCDP(fallbackHost, detectedPort, remainingMs).then((cdpUrl) => {
        if (cdpUrl) {
          finish(cdpUrl)
        }
      })
    }

    const handleOutput = (chunk: Buffer | string) => {
      if (resolved) return
      bufferedOutput = `${bufferedOutput}${chunk.toString()}`.slice(-4096)

      // 匹配 DevTools/Debugger listening on ws://...
      const match = bufferedOutput.match(/(?:DevTools|Debugger)\s+listening\s+on\s+(ws:\/\/[^\s]+)/i)
      if (match) {
        const rawUrl = match[1]
        console.log('[waitForCDPFromOutput] Parsed CDP URL from process output:', rawUrl)

        // 如果是 browser-level target（/devtools/browser/...），提取端口后走 waitForCDP 获取 page target
        const browserMatch = rawUrl.match(/^ws:\/\/([\w.-]+):(\d+)\/devtools\/browser\//)
        if (browserMatch) {
          const parsedHost = browserMatch[1]
          const parsedPort = parseInt(browserMatch[2], 10)
          console.log(`[waitForCDPFromOutput] Browser-level URL detected, probing ${parsedHost}:${parsedPort} for page target...`)
          detectedPort = parsedPort
          if (!portProbeStarted) {
            portProbeStarted = true
            const remainingMs = timeoutMs - (Date.now() - startedAt)
            void waitForCDP(parsedHost, parsedPort, Math.max(remainingMs, 5000)).then((pageUrl) => {
              finish(pageUrl || rawUrl) // 如果找不到 page target，回退到原始 URL
            })
          }
          return
        }

        finish(rawUrl)
        return
      }

      // 某些脚本只会打印调试端口，不会直接打印 ws 地址。
      const portMatch = bufferedOutput.match(/remote-debugging-port(?:=|:|\s).*?(\d{4,5})/i)
      if (portMatch) {
        detectedPort = parseInt(portMatch[1], 10)
        console.log(`[waitForCDPFromOutput] Detected debugging port ${detectedPort} from output, will poll...`)
        maybeProbeDetectedPort()
      }
    }

    const handleExit = () => {
      if (!portProbeStarted) {
        finish(null)
      }
    }

    childProcess.stdout?.on('data', handleOutput)
    childProcess.stderr?.on('data', handleOutput)
    childProcess.on('exit', handleExit)
  })
}

/**
 * 竞争模式：同时用端口轮询和输出解析来获取 CDP URL，取先返回的结果。
 */
async function waitForCDPWithOutputRace(
  childProcess: ChildProcess,
  host: string,
  port: number,
  timeoutMs: number = 20000,
): Promise<string | null> {
  const result = await waitForFirstAvailable([
    waitForCDP(host, port, timeoutMs),
    waitForCDPFromOutput(childProcess, host, port, timeoutMs),
  ])
  return result
}

/**
 * 从进程 stdout/stderr 中解析 Web Dev Server URL。
 * 匹配 Vite、Webpack、Next.js 等常见输出格式：
 *  - ➜  Local:   http://localhost:5173/
 *  - http://127.0.0.1:3000
 *  - started server on http://localhost:3000
 */
function waitForDevServerUrlFromOutput(childProcess: ChildProcess, timeoutMs: number = 20000): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    let bufferedOutput = ''
    const currentOrigin = VITE_DEV_SERVER_URL ? normalizeLocalUrl(VITE_DEV_SERVER_URL) : ''

    const finish = (value: string | null) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      childProcess.stdout?.off('data', handleOutput)
      childProcess.stderr?.off('data', handleOutput)
      childProcess.off('exit', handleExit)
      resolve(value)
    }

    const timeout = setTimeout(() => {
      finish(null)
    }, timeoutMs)

    const handleOutput = (chunk: Buffer | string) => {
      if (resolved) return
      bufferedOutput = `${bufferedOutput}${chunk.toString()}`.slice(-4096)

      // 匹配 http://localhost:PORT 或 http://127.0.0.1:PORT
      const match = bufferedOutput.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{4,5})\/?/i)
      if (match) {
        const url = match[0].replace(/\/$/, '')
        const normalizedUrl = normalizeLocalUrl(url)
        // 排除 Visual Inspector 自身的 dev server
        if (normalizedUrl !== currentOrigin) {
          console.log('[waitForDevServerUrlFromOutput] Parsed dev server URL from output:', url)
          finish(url)
        }
      }
    }

    const handleExit = () => {
      finish(null)
    }

    childProcess.stdout?.on('data', handleOutput)
    childProcess.stderr?.on('data', handleOutput)
    childProcess.on('exit', handleExit)
  })
}

/**
 * 内置模式：竞争端口扫描和输出解析来发现 dev server URL。
 */
async function waitForBuiltinUrlWithOutputRace(
  childProcess: ChildProcess,
  timeoutMs: number = 20000,
): Promise<string | null> {
  const result = await waitForFirstAvailable([
    waitForBuiltinUrl(timeoutMs),
    waitForDevServerUrlFromOutput(childProcess, timeoutMs),
  ])
  return result
}

function attachProjectProcessLogging(process: ChildProcess, label: 'web' | 'electron') {
  process.stdout?.on('data', (data) => {
    console.log(`[project:${label}]`, data.toString().trim())
  })
  process.stderr?.on('data', (data) => {
    console.error(`[project:${label}]`, data.toString().trim())
  })
}

async function ensureBuiltinDevServerForExternal(session: ProjectSessionState, timeoutMs: number = 20000): Promise<string | null> {
  if (session.builtinUrl) {
    return session.builtinUrl
  }

  session.builtinUrl = await waitForBuiltinUrl(2500)
  if (session.builtinUrl) {
    return session.builtinUrl
  }

  if (session.webProcess) {
    emitLaunchStatus(buildProjectStatusPayload(session, 'waiting-web', '等待网页调试服务就绪，用于直连 Electron'))
    session.builtinUrl = await waitForBuiltinUrlWithOutputRace(session.webProcess, timeoutMs)
    return session.builtinUrl
  }

  if (!session.commands.builtin) {
    return null
  }

  emitLaunchStatus(buildProjectStatusPayload(session, 'starting-web', '桌面脚本未暴露调试端口，回退为先启动网页调试服务'))
  const run = buildRunCommand(session.packageManager, session.commands.builtin)
  const sessionProjectDir = session.projectDir
  session.webProcess = spawn(run.command, run.args, {
    cwd: session.projectDir,
    env: buildChildProcessEnv(),
    stdio: 'pipe',
    shell: true,
    detached: false,
  })
  attachProjectProcessLogging(session.webProcess, 'web')
  session.webProcess.on('exit', (code) => {
    if (mainWindow && !mainWindow.isDestroyed() && projectSession?.projectDir === sessionProjectDir) {
      emitLaunchStatus(buildProjectStatusPayload(projectSession!, 'exited', `Web 进程已退出（${code ?? 'null'}）`))
    }
  })

  emitLaunchStatus(buildProjectStatusPayload(session, 'waiting-web', '等待网页调试服务地址'))
  session.builtinUrl = await waitForBuiltinUrlWithOutputRace(session.webProcess, timeoutMs)
  return session.builtinUrl
}

async function launchExternalViaDirectElectron(session: ProjectSessionState, timeoutMs: number = 20000): Promise<string | null> {
  const directLaunch = resolveProjectElectronLaunch(session.projectDir)
  if (!directLaunch) {
    return null
  }

  const builtinUrl = await ensureBuiltinDevServerForExternal(session, timeoutMs)
  if (!builtinUrl) {
    return null
  }

  const debugPort = 9222
  const userDataDir = buildProjectDebugUserDataDir(session.projectDir)
  const args = [
    ...directLaunch.args.filter((arg) => !arg.startsWith('--user-data-dir=')),
    `--user-data-dir=${userDataDir}`,
  ]

  emitLaunchStatus(buildProjectStatusPayload(session, 'starting-electron', '使用直连 Electron 回退模式启动桌面调试'))
  const sessionProjectDir = session.projectDir
  session.electronProcess = spawn(directLaunch.command, args, {
    cwd: session.projectDir,
    env: buildChildProcessEnv({
      ...directLaunch.env,
      NODE_ENV: 'development',
      ELECTRON_RUN_AS_NODE: '',
      ELECTRON_RENDERER_URL: builtinUrl,
      VITE_DEV_SERVER_URL: builtinUrl,
      VI_REMOTE_DEBUGGING_PORT: String(debugPort),
      ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${debugPort}`,
    }),
    stdio: 'pipe',
    shell: false,
    detached: false,
  })
  attachProjectProcessLogging(session.electronProcess, 'electron')
  session.electronProcess.on('exit', (code) => {
    if (mainWindow && !mainWindow.isDestroyed() && projectSession?.projectDir === sessionProjectDir) {
      emitLaunchStatus(buildProjectStatusPayload(projectSession!, 'exited', `Electron 进程已退出（${code ?? 'null'}）`))
    }
  })

  emitLaunchStatus(buildProjectStatusPayload(session, 'waiting-cdp', '等待直连 Electron 暴露调试端口'))
  session.externalEndpoint = await waitForCDPWithOutputRace(session.electronProcess, '127.0.0.1', debugPort, timeoutMs)
  return session.externalEndpoint
}

async function ensureProjectDescriptor(
  projectDir?: string | null,
  options?: { forceDialog?: boolean },
): Promise<ProjectDescriptor | null> {
  const resolvedProjectDir = projectDir || (options?.forceDialog ? null : projectSession?.projectDir || null)
  if (resolvedProjectDir) {
    return detectProjectDescriptor(resolvedProjectDir)
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择项目文件夹',
    properties: ['openDirectory'],
    buttonLabel: '选择项目',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return detectProjectDescriptor(result.filePaths[0])
}

function buildProjectStatusPayload(session: ProjectSessionState, status: ProjectLaunchStatusPayload['status'], message?: string): ProjectLaunchStatusPayload {
  return {
    status,
    projectDir: session.projectDir,
    projectName: session.projectName,
    selectedMode: session.selectedMode,
    builtinUrl: session.builtinUrl,
    externalEndpoint: session.externalEndpoint,
    commands: session.commands,
    capabilities: session.capabilities,
    message,
  }
}

function waitForFirstAvailable<T>(promises: Array<Promise<T | null>>): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length
    let settled = false

    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    for (const promise of promises) {
      promise
        .then((value) => {
          if (settled) return
          if (value !== null) {
            finish(value)
            return
          }
          pending -= 1
          if (pending === 0) {
            finish(null)
          }
        })
        .catch((error) => {
          console.error('waitForFirstAvailable worker failed:', error)
          pending -= 1
          if (!settled && pending === 0) {
            finish(null)
          }
        })
    }
  })
}


ipcMain.handle('inspect-project', async (_event, projectDir: string) => {
  try {
    const pkg = readPackageJson(projectDir)
    const scripts = pkg?.scripts || {}
    const dependencies = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
    const hasElectron = Boolean(
      dependencies.electron
      || dependencies['vite-plugin-electron']
      || dependencies['electron-vite']
      || dependencies['electron-builder'],
    )

    const scriptInfos = Object.entries(scripts).map(([name, command]) => ({
      name,
      command: String(command),
    }))

    // Scan for HTML files in project root and common subdirectories
    const htmlFiles: string[] = []
    const scanDirs = [projectDir, join(projectDir, 'frontend'), join(projectDir, 'public'), join(projectDir, 'src')]
    for (const dir of scanDirs) {
      try {
        const entries = require('fs').readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.html')) {
            const relativePath = dir === projectDir
              ? entry.name
              : `${dir.replace(projectDir + '/', '')}/${entry.name}`
            htmlFiles.push(relativePath)
          }
        }
      } catch {
        // directory doesn't exist
      }
    }

    return {
      projectDir,
      projectName: pkg?.name || basename(projectDir),
      packageManager: inferPackageManager(projectDir),
      scripts: scriptInfos,
      hasElectron,
      htmlFiles,
    }
  } catch (error) {
    console.error('Failed to inspect project:', error)
    return null
  }
})

ipcMain.handle('select-html-file', async (_event, projectDir?: string) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 HTML 文件',
    defaultPath: projectDir || undefined,
    properties: ['openFile'],
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    buttonLabel: '选择',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('select-project-directory', async (_event, options?: { forceDialog?: boolean }): Promise<ProjectLaunchStatusPayload | null> => {
  const descriptor = await ensureProjectDescriptor(null, options)
  if (!descriptor) return null

  projectSession = {
    ...descriptor,
    selectedMode: 'builtin',
    webProcess: null,
    electronProcess: null,
    builtinUrl: null,
    externalEndpoint: null,
  }

  const payload = buildProjectStatusPayload(projectSession, 'project-selected')
  emitLaunchStatus(payload)
  return payload
})

ipcMain.handle('launch-project-session', async (_event, payload?: { projectDir?: string | null; preferredMode?: 'builtin' | 'external'; customCommand?: string }): Promise<{ success: boolean; error?: string }> => {
  try {
    const descriptor = await ensureProjectDescriptor(payload?.projectDir)
    if (!descriptor) {
      return { success: false, error: 'cancelled' }
    }

    const selectedMode = payload?.preferredMode || 'builtin'

    if (projectSession?.projectDir !== descriptor.projectDir) {
      resetProjectSession()
    } else {
      stopProjectSessionProcesses()
    }

    projectSession = {
      ...descriptor,
      selectedMode,
      webProcess: null,
      electronProcess: null,
      builtinUrl: null,
      externalEndpoint: null,
    }

    // 用户自定义启动命令覆盖自动检测的命令
    if (payload?.customCommand) {
      if (selectedMode === 'builtin') {
        projectSession.commands.builtin = payload.customCommand
      } else {
        projectSession.commands.external = payload.customCommand
      }
      // 确保 capabilities 标记为可用
      if (selectedMode === 'builtin') {
        projectSession.capabilities.builtin = true
      } else {
        projectSession.capabilities.external = true
      }
    }

    emitLaunchStatus(buildProjectStatusPayload(projectSession, 'launching'))

    const { packageManager, commands } = projectSession
    let webStarted = false
    let electronStarted = false
    let electronExitedEarly = false
    let electronExitCode: number | null = null
    let attemptedDirectFallback = false

    if (selectedMode === 'external') {
      // 先尝试发现已运行的桌面调试目标（扫描多个常用端口）
      const cdpPorts = [9222, 9229, 9223]
      for (const candidatePort of cdpPorts) {
        projectSession.externalEndpoint = await waitForCDP('127.0.0.1', candidatePort, 1500)
        if (projectSession.externalEndpoint) break
      }
      if (projectSession.externalEndpoint) {
        // 发现已运行目标，直接自动连接
        try {
          await connectExternalInspector(projectSession.externalEndpoint)
          emitLaunchStatus({
            ...buildProjectStatusPayload(projectSession, 'ready', '发现到正在运行的桌面调试目标，已自动连接'),
            autoConnected: true,
          })
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auto-connected', { mode: 'external', endpoint: projectSession.externalEndpoint })
          }
          return { success: true }
        } catch (e) {
          console.error('Auto-connect to existing target failed:', e)
          // 继续走启动流程
        }
      }

      // 尝试直接启动 Electron（不依赖脚本）
      if (!commands.external) {
        if (resolveProjectElectronLaunch(projectSession.projectDir)) {
          console.log('[launch-project-session] No electron:dev script found, using direct Electron launch')
          projectSession.externalEndpoint = await launchExternalViaDirectElectron(projectSession, 20000)
          electronStarted = Boolean(projectSession.electronProcess)
        } else {
          emitLaunchStatus(buildProjectStatusPayload(projectSession, 'error', '当前项目没有可用的桌面启动脚本（需要 electron:inspect 或 electron:dev），也未找到可直接启动的 Electron 入口'))
          return { success: false, error: '当前项目没有可用的桌面启动脚本（需要 electron:inspect 或 electron:dev），也未找到可直接启动的 Electron 入口' }
        }
      } else {
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'starting-electron'))
        const run = buildRunCommand(packageManager, commands.external)
        const env = buildChildProcessEnv({
          // 多种方式注入调试端口，兼容不同项目的启动方式
          VI_REMOTE_DEBUGGING_PORT: '9222',
          ELECTRON_EXTRA_LAUNCH_ARGS: '--remote-debugging-port=9222',
          // Chromium 标准环境变量（部分 Electron 版本支持）
          ELECTRON_INSPECT_PORT: '9222',
        })
        const sessionProjectDir = projectSession.projectDir
        projectSession.electronProcess = spawn(run.command, run.args, {
          cwd: projectSession.projectDir,
          env,
          stdio: 'pipe',
          shell: true,
          detached: false,
        })
        attachProjectProcessLogging(projectSession.electronProcess, 'electron')
        projectSession.electronProcess.on('exit', (code) => {
          electronExitedEarly = true
          electronExitCode = code
          if (mainWindow && !mainWindow.isDestroyed() && projectSession?.projectDir === sessionProjectDir) {
            emitLaunchStatus(buildProjectStatusPayload(projectSession!, 'exited', `Electron 进程已退出（${code ?? 'null'}）`))
          }
        })
        electronStarted = true

        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'waiting-cdp'))
        // 使用竞争模式：同时轮询端口和解析 stdout
        projectSession.externalEndpoint = await waitForCDPWithOutputRace(
          projectSession.electronProcess, '127.0.0.1', 9222, 20000,
        )

        // 处理单实例应用场景：第一个进程退出后第二个接管，需重新探测
        if (!projectSession.externalEndpoint && electronExitedEarly) {
          console.log('[launch] Electron exited early, re-probing port for possible restart...')
          projectSession.externalEndpoint = await waitForCDP('127.0.0.1', 9222, 8000)
        }
      }

      // 仅当没有用户自定义命令时，才尝试直连 Electron 回退模式。
      // 如果用户指定了启动命令（customCommand），说明用户的脚本自己负责启动 Electron，
      // 不应该再另起一个 Electron 进程（否则会导致"启动两次"问题）。
      const userSpecifiedCommand = Boolean(payload?.customCommand)
      if (!projectSession.externalEndpoint && commands.external && !userSpecifiedCommand && resolveProjectElectronLaunch(projectSession.projectDir)) {
        attemptedDirectFallback = true
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'launching', '桌面启动脚本未暴露调试端口，尝试直连 Electron 回退模式'))
        stopChildProcess(projectSession.electronProcess)
        projectSession.electronProcess = null
        electronExitedEarly = false
        electronExitCode = null
        projectSession.externalEndpoint = await launchExternalViaDirectElectron(projectSession, 20000)
        electronStarted = electronStarted || Boolean(projectSession.electronProcess)
      }

      if (!projectSession.externalEndpoint) {
        const errorMessage = electronExitedEarly
          ? `桌面调试没有成功连上调试端口，Electron 进程已退出（${electronExitCode ?? 'null'}）。可能原因：\n` +
            '1. 目标应用是单实例应用，请先关闭已运行的实例\n' +
            '2. 目标应用未正确读取 ELECTRON_EXTRA_LAUNCH_ARGS 环境变量\n' +
            (attemptedDirectFallback
              ? '3. 目标应用在独立调试资料目录下仍然启动失败\n'
              : '') +
            '建议：在项目的启动脚本中添加 --remote-debugging-port=9222 参数，或使用「连接已运行」模式手动连接'
          : '没有成功发现桌面调试端点。\n' +
            '目标应用可能没有暴露调试端口。建议：\n' +
            '1. 在启动脚本中添加 --remote-debugging-port=9222 参数\n' +
            '2. 或先手动启动应用，然后用「连接已运行」模式连接'
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'error', errorMessage))
        return { success: false, error: errorMessage }
      }
    } else {
      // 内置模式：先检查是否已有可用的 web dev server
      projectSession.builtinUrl = await waitForBuiltinUrl(2500)
      if (projectSession.builtinUrl) {
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'ready', '发现到正在运行的网页调试目标'))
        return { success: true }
      }

      if (!commands.builtin) {
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'error', '当前项目没有可用的网页启动脚本（需要 dev 或 start）'))
        return { success: false, error: '当前项目没有可用的网页启动脚本（需要 dev 或 start）' }
      }

      emitLaunchStatus(buildProjectStatusPayload(projectSession, 'starting-web'))
      const run = buildRunCommand(packageManager, commands.builtin)
      const sessionProjectDir = projectSession.projectDir
      projectSession.webProcess = spawn(run.command, run.args, {
        cwd: projectSession.projectDir,
        env: buildChildProcessEnv(),
        stdio: 'pipe',
        shell: true,
        detached: false,
      })
      attachProjectProcessLogging(projectSession.webProcess, 'web')
      projectSession.webProcess.on('exit', (code) => {
        if (mainWindow && !mainWindow.isDestroyed() && projectSession?.projectDir === sessionProjectDir) {
          emitLaunchStatus(buildProjectStatusPayload(projectSession!, 'exited', `Web 进程已退出（${code ?? 'null'}）`))
        }
      })
      webStarted = true

      emitLaunchStatus(buildProjectStatusPayload(projectSession, 'waiting-web'))
      // 使用竞争模式：同时端口扫描和解析 stdout 中的 URL
      projectSession.builtinUrl = await waitForBuiltinUrlWithOutputRace(
        projectSession.webProcess, 20000,
      )
      if (!projectSession.builtinUrl) {
        emitLaunchStatus(buildProjectStatusPayload(projectSession, 'error', '没有成功发现网页调试地址'))
        return { success: false, error: '没有成功发现网页调试地址' }
      }
    }

    // 外部模式：自动建立 CDP 连接
    if (selectedMode === 'external' && projectSession.externalEndpoint) {
      try {
        await connectExternalInspector(projectSession.externalEndpoint)
        emitLaunchStatus({
          ...buildProjectStatusPayload(
            projectSession,
            'ready',
            electronStarted ? '桌面调试已启动并自动连接' : '发现到正在运行的桌面调试目标，已自动连接',
          ),
          autoConnected: true,
        })
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-connected', { mode: 'external', endpoint: projectSession.externalEndpoint })
        }
        return { success: true }
      } catch (e) {
        console.error('Auto-connect after launch failed, falling back to manual connect:', e)
      }
    }

    emitLaunchStatus(buildProjectStatusPayload(
      projectSession,
      'ready',
      selectedMode === 'external'
        ? (electronStarted ? '桌面调试已启动' : '发现到正在运行的桌面调试目标')
        : (webStarted ? '网页调试已启动' : '发现到正在运行的网页调试目标'),
    ))
    return { success: true }
  } catch (error: any) {
    console.error('Launch project session failed:', error)
    emitLaunchStatus({
      status: 'error',
      message: error?.message || '项目启动失败',
      projectDir: projectSession?.projectDir,
      projectName: projectSession?.projectName,
      selectedMode: projectSession?.selectedMode,
      commands: projectSession?.commands,
      capabilities: projectSession?.capabilities,
      builtinUrl: projectSession?.builtinUrl,
      externalEndpoint: projectSession?.externalEndpoint,
    })
    return { success: false, error: error?.message || '项目启动失败' }
  }
})

ipcMain.handle('stop-project-session', async (): Promise<void> => {
  stopProjectSessionProcesses()
  emitLaunchStatus({
    status: 'stopped',
    projectDir: projectSession?.projectDir,
    projectName: projectSession?.projectName,
    selectedMode: projectSession?.selectedMode,
    commands: projectSession?.commands,
    capabilities: projectSession?.capabilities,
  })
})

ipcMain.handle('launch-electron-app', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    // 让用户选择项目文件夹
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Electron 项目文件夹',
      properties: ['openDirectory'],
      buttonLabel: '启动并连接'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    const projectDir = result.filePaths[0]
    console.log('Launching Electron app from:', projectDir)

    // 杀掉之前启动的进程
    if (launchedProcess) {
      launchedProcess.kill()
      launchedProcess = null
    }

    // 通知前端正在启动
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch-status', { status: 'launching', dir: projectDir })
    }

    // 使用 ELECTRON_EXTRA_LAUNCH_ARGS 注入 remote-debugging-port
    const debugPort = 9222
    const env = {
      ...process.env,
      ELECTRON_EXTRA_LAUNCH_ARGS: `--remote-debugging-port=${debugPort}`,
    }

    // 尝试 npm run electron:dev，fallback 到 npm run dev
    launchedProcess = spawn('npm', ['run', 'electron:dev'], {
      cwd: projectDir,
      env,
      stdio: 'pipe',
      shell: true,
      detached: false
    })

    launchedProcess.stdout?.on('data', (data) => {
      console.log('[target]', data.toString().trim())
    })
    launchedProcess.stderr?.on('data', (data) => {
      console.error('[target]', data.toString().trim())
    })
    launchedProcess.on('exit', (code) => {
      console.log('Target app exited with code:', code)
      launchedProcess = null
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('launch-status', { status: 'exited', code })
      }
    })

    // 通知前端正在等待 CDP
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch-status', { status: 'waiting-cdp' })
    }

    // 等待 CDP 可用
    const cdpUrl = await waitForCDP('localhost', debugPort, 20000)
    if (!cdpUrl) {
      return { success: false, error: 'CDP 端口超时，目标应用可能不支持 ELECTRON_EXTRA_LAUNCH_ARGS' }
    }

    // 自动连接
    currentMode = 'external'
    cleanupBrowserView()
    if (cdpClient) cdpClient.disconnect()

    cdpClient = new CDPClient()
    await cdpClient.connect(cdpUrl)

    inspectorService = new InspectorService(cdpClient)
    await inspectorService.initialize()

    inspectorService.onElementSelected((element: InspectedElement, meta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('element-selected', element, meta)
      }
    })
    inspectorService.onOverlayAction((action) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overlay-action', action)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Launch failed:', error)
    return { success: false, error: error.message || '启动失败' }
  }
})

ipcMain.handle('kill-launched-app', async (): Promise<void> => {
  if (launchedProcess) {
    launchedProcess.kill()
    launchedProcess = null
  }
})

ipcMain.handle('connect-cdp', async (_event, cdpUrl: string): Promise<boolean> => {
  try {
    await connectExternalInspector(cdpUrl)
    return true
  } catch (error) {
    console.error('Failed to connect CDP:', error)
    return false
  }
})

ipcMain.handle('disconnect', async (): Promise<void> => {
  restoreWindowSize()
  builtinViewInteractive = false
  if (currentMode === 'builtin') {
    cleanupBrowserView()
  } else {
    if (inspectorService) {
      try { await inspectorService.stopInspecting() } catch { /* ignore */ }
      inspectorService = null
    }
    if (cdpClient) {
      cdpClient.disconnect()
      cdpClient = null
    }
  }
})

ipcMain.handle('set-builtin-view-interactive', async (_event, interactive: boolean): Promise<boolean> => {
  try {
    builtinViewInteractive = interactive
    updateBrowserViewBounds()
    return true
  } catch (error) {
    console.error('Failed to toggle builtin BrowserView interactivity:', error)
    return false
  }
})

ipcMain.handle('resize-window-to-sidebar', async (): Promise<boolean> => {
  try {
    resizeWindowToSidebar()
    return true
  } catch (error) {
    console.error('Failed to resize window to sidebar:', error)
    return false
  }
})

ipcMain.handle('restore-window-size', async (): Promise<boolean> => {
  try {
    restoreWindowSize()
    return true
  } catch (error) {
    console.error('Failed to restore window size:', error)
    return false
  }
})

ipcMain.handle('discover-local-apps', async () => {
  try {
    return await discoverLocalApps()
  } catch (error) {
    console.error('Failed to discover local apps:', error)
    return []
  }
})

// ─── IPC: Inspector 模式 ────────────────────────

ipcMain.handle('start-inspect', async (): Promise<boolean> => {
  if (!inspectorService) return false
  try {
    await inspectorService.startInspecting(false)
    return true
  } catch (error) {
    console.error('Start inspect error:', error)
    return false
  }
})

ipcMain.handle('stop-inspect', async (): Promise<void> => {
  if (!inspectorService) return
  try { await inspectorService.stopInspecting() } catch { /* ignore */ }
})

ipcMain.handle('set-active-edit-property', async (_event, property: string | null): Promise<void> => {
  if (!inspectorService) return
  try {
    await inspectorService.setActiveEditProperty(property)
  } catch (error) {
    console.error('Failed to set active edit property:', error)
  }
})

ipcMain.handle('set-external-overlay-state', async (_event, payload: any): Promise<void> => {
  if (!inspectorService) return
  try {
    await inspectorService.setExternalOverlayState(payload)
  } catch (error) {
    console.error('Failed to set external overlay state:', error)
  }
})

ipcMain.handle('inspect-element-at-point', async (_event, payload: {
  x: number
  y: number
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.getElementAtPoint(payload.x, payload.y)
  } catch (error) {
    console.error('Failed to inspect element at point:', error)
    return null
  }
})

ipcMain.handle('inspect-element-stack-at-point', async (_event, payload: {
  x: number
  y: number
}): Promise<InspectedElement[]> => {
  if (!inspectorService) return []
  try {
    return await inspectorService.getElementStackAtPoint(payload.x, payload.y)
  } catch (error) {
    console.error('Failed to inspect element stack at point:', error)
    return []
  }
})

ipcMain.handle('inspect-element-by-backend-id', async (_event, payload: {
  backendNodeId: number
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.getElementDetails(payload.backendNodeId)
  } catch (error) {
    console.error('Failed to inspect element by backend id:', error)
    return null
  }
})

ipcMain.handle('update-element-style', async (_event, payload: {
  nodeId: number
  backendNodeId: number
  name: string
  value: string
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    const updated = await inspectorService.updateElementStyle(
      payload.nodeId,
      payload.backendNodeId,
      payload.name,
      payload.value
    )
    return updated
  } catch (error) {
    console.error('Failed to update element style:', error)
    return null
  }
})

ipcMain.handle('update-element-styles', async (_event, payload: {
  nodeId: number
  backendNodeId: number
  styles: Record<string, string>
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.updateElementStyles(
      payload.nodeId,
      payload.backendNodeId,
      payload.styles
    )
  } catch (error) {
    console.error('Failed to update element styles:', error)
    return null
  }
})

ipcMain.handle('update-text-content', async (_event, payload: {
  nodeId: number
  backendNodeId: number
  value: string
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.updateTextContent(
      payload.nodeId,
      payload.backendNodeId,
      payload.value
    )
  } catch (error) {
    console.error('Failed to update text content:', error)
    return null
  }
})

ipcMain.handle('update-element-attribute', async (_event, payload: {
  nodeId: number
  backendNodeId: number
  name: string
  value: string
}): Promise<InspectedElement | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.updateElementAttribute(
      payload.nodeId,
      payload.backendNodeId,
      payload.name,
      payload.value
    )
  } catch (error) {
    console.error('Failed to update element attribute:', error)
    return null
  }
})

ipcMain.handle('capture-preview', async (): Promise<{ dataUrl: string; viewport: Rectangle } | null> => {
  if (!inspectorService) return null
  try {
    return await inspectorService.capturePreviewDataUrl()
  } catch (error) {
    console.error('Failed to capture preview:', error)
    return null
  }
})

// ─── IPC: 代码生成 ──────────────────────────────

ipcMain.handle('generate-ai-prompt', async (_event, element: InspectedElement): Promise<string> => {
  return generateAIPrompt({
    tagName: element.tagName,
    classNames: element.classNames,
    id: element.id,
    computedStyles: element.computedStyles,
    cssVariables: element.cssVariables,
    outerHTMLPreview: element.outerHTMLPreview
  })
})

ipcMain.handle('generate-css', async (_event, element: InspectedElement): Promise<string> => {
  const selector = element.id ? `#${element.id}` : element.classNames.length > 0 ? `.${element.classNames[0]}` : element.tagName
  const properties: CSSProperty[] = Object.entries(element.computedStyles).map(([name, value]) => ({ name, value }))
  return generateCSSClass(selector, properties)
})

ipcMain.handle('generate-css-variables', async (_event, variables: Record<string, string>): Promise<string> => {
  return generateCSSVariables(variables)
})

// ─── IPC: 窗口控制 ──────────────────────────────

ipcMain.handle('set-panel-width', async (_event, _width: number): Promise<void> => {
  currentRightPanelWidth = Number.isFinite(_width) ? Math.max(0, Math.round(_width)) : RIGHT_PANEL_WIDTH
  updateBrowserViewBounds()
})
