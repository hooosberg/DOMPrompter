import { vi } from 'vitest'

type AsyncFn<T> = () => Promise<T>

function asyncValue<T>(value: T): AsyncFn<T> {
  return async () => value
}

const defaultSettings = {
  theme: 'dark',
  language: 'en',
} as const

export function createElectronApiMock() {
  const shortcutListeners = {
    openSettings: [] as Array<() => void>,
    openHtmlFile: [] as Array<() => void>,
    reloadPage: [] as Array<() => void>,
    forceReload: [] as Array<() => void>,
    toggleToolbar: [] as Array<() => void>,
    copyPagePrompt: [] as Array<() => void>,
    copyElementCSS: [] as Array<() => void>,
    focusAddressBar: [] as Array<() => void>,
    newWindow: [] as Array<() => void>,
    escape: [] as Array<() => void>,
  }
  let licenseStatus = {
    isPro: false,
    provider: 'dev-stub' as const,
    lastValidatedAt: null as string | null,
  }

  return {
    loadUrl: vi.fn(async (url: string) => Boolean(url)),
    attachDebugger: vi.fn(asyncValue(true)),
    discoverCDPUrl: vi.fn(asyncValue(null as string | null)),
    connectCDP: vi.fn(asyncValue(true)),
    discoverLocalApps: vi.fn(asyncValue([])),
    selectProjectDirectory: vi.fn(asyncValue(null)),
    inspectProject: vi.fn(asyncValue(null)),
    selectHtmlFile: vi.fn(asyncValue(null as string | null)),
    launchProjectSession: vi.fn(asyncValue({ success: true })),
    stopProjectSession: vi.fn(asyncValue(undefined)),
    launchElectronApp: vi.fn(asyncValue({ success: true })),
    killLaunchedApp: vi.fn(asyncValue(undefined)),
    disconnect: vi.fn(asyncValue(undefined)),
    resizeWindowToSidebar: vi.fn(asyncValue(true)),
    restoreWindowSize: vi.fn(asyncValue(true)),
    setPanelWidth: vi.fn(asyncValue(undefined)),
    setBuiltinViewInteractive: vi.fn(asyncValue(true)),
    startInspect: vi.fn(asyncValue(true)),
    stopInspect: vi.fn(asyncValue(undefined)),
    setActiveEditProperty: vi.fn(asyncValue(undefined)),
    setExternalOverlayState: vi.fn(asyncValue(undefined)),
    inspectElementAtPoint: vi.fn(asyncValue(null)),
    inspectElementStackAtPoint: vi.fn(asyncValue([])),
    inspectElementByBackendId: vi.fn(asyncValue(null)),
    capturePreview: vi.fn(asyncValue(null)),
    updateElementStyle: vi.fn(asyncValue(null)),
    updateElementStyles: vi.fn(asyncValue(null)),
    updateTextContent: vi.fn(asyncValue(null)),
    updateElementAttribute: vi.fn(asyncValue(null)),
    onElementSelected: vi.fn(),
    onBrowserViewLoaded: vi.fn(),
    onLaunchStatus: vi.fn(),
    onAutoConnected: vi.fn(),
    onPropertyActivated: vi.fn(),
    onPropertyIncrement: vi.fn(),
    onContextAction: vi.fn(),
    removeAllListeners: vi.fn(),
    generateAIPrompt: vi.fn(asyncValue('')),
    generateCSS: vi.fn(asyncValue('')),
    generateCSSVariables: vi.fn(asyncValue('')),
    settings: {
      get: vi.fn(async (key: keyof typeof defaultSettings) => defaultSettings[key]),
      set: vi.fn(asyncValue(undefined)),
    },
    menu: {
      changeLanguage: vi.fn(asyncValue(undefined)),
    },
    overlay: {
      sync: vi.fn(asyncValue(true)),
    },
    shortcuts: {
      onOpenSettings: vi.fn((callback: () => void) => { shortcutListeners.openSettings.push(callback) }),
      onOpenHtmlFile: vi.fn((callback: () => void) => { shortcutListeners.openHtmlFile.push(callback) }),
      onReloadPage: vi.fn((callback: () => void) => { shortcutListeners.reloadPage.push(callback) }),
      onForceReload: vi.fn((callback: () => void) => { shortcutListeners.forceReload.push(callback) }),
      onToggleToolbar: vi.fn((callback: () => void) => { shortcutListeners.toggleToolbar.push(callback) }),
      onCopyPagePrompt: vi.fn((callback: () => void) => { shortcutListeners.copyPagePrompt.push(callback) }),
      onCopyElementCSS: vi.fn((callback: () => void) => { shortcutListeners.copyElementCSS.push(callback) }),
      onFocusAddressBar: vi.fn((callback: () => void) => { shortcutListeners.focusAddressBar.push(callback) }),
      onNewWindow: vi.fn((callback: () => void) => { shortcutListeners.newWindow.push(callback) }),
      onEscape: vi.fn((callback: () => void) => { shortcutListeners.escape.push(callback) }),
    },
    license: {
      getStatus: vi.fn(async () => ({ ...licenseStatus })),
      purchase: vi.fn(async () => {
        licenseStatus = {
          ...licenseStatus,
          isPro: true,
          lastValidatedAt: new Date().toISOString(),
        }
        return { success: true }
      }),
      restore: vi.fn(asyncValue({ success: true })),
    },
    __emitShortcut(name: keyof typeof shortcutListeners) {
      shortcutListeners[name].forEach((listener) => listener())
    },
  }
}

export function installElectronApiMock() {
  const electronAPI = createElectronApiMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: electronAPI,
  })
  return electronAPI
}
