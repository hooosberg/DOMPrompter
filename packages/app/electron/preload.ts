import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 模式 A: 内置浏览器
  loadUrl: (url: string): Promise<boolean> => ipcRenderer.invoke('load-url', url),
  attachDebugger: (): Promise<boolean> => ipcRenderer.invoke('attach-debugger'),

  // 模式 B: 外部 CDP
  discoverCDPUrl: (input: string): Promise<string | null> => ipcRenderer.invoke('discover-cdp-url', input),
  connectCDP: (cdpUrl: string): Promise<boolean> => ipcRenderer.invoke('connect-cdp', cdpUrl),
  discoverLocalApps: (): Promise<any[]> => ipcRenderer.invoke('discover-local-apps'),
  selectProjectDirectory: (options?: { forceDialog?: boolean }): Promise<any> => ipcRenderer.invoke('select-project-directory', options),
  inspectProject: (projectDir: string): Promise<any> => ipcRenderer.invoke('inspect-project', projectDir),
  selectHtmlFile: (projectDir?: string): Promise<string | null> => ipcRenderer.invoke('select-html-file', projectDir),
  launchProjectSession: (payload?: { projectDir?: string | null; preferredMode?: 'builtin' | 'external'; customCommand?: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('launch-project-session', payload),
  stopProjectSession: (): Promise<void> => ipcRenderer.invoke('stop-project-session'),
  launchElectronApp: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('launch-electron-app'),
  killLaunchedApp: (): Promise<void> => ipcRenderer.invoke('kill-launched-app'),

  // 通用
  disconnect: (): Promise<void> => ipcRenderer.invoke('disconnect'),
  resizeWindowToSidebar: (): Promise<boolean> => ipcRenderer.invoke('resize-window-to-sidebar'),
  restoreWindowSize: (): Promise<boolean> => ipcRenderer.invoke('restore-window-size'),
  setPanelWidth: (width: number): Promise<void> => ipcRenderer.invoke('set-panel-width', width),
  setBuiltinViewInteractive: (interactive: boolean): Promise<boolean> => ipcRenderer.invoke('set-builtin-view-interactive', interactive),
  startInspect: (): Promise<boolean> => ipcRenderer.invoke('start-inspect'),
  stopInspect: (): Promise<void> => ipcRenderer.invoke('stop-inspect'),
  setActiveEditProperty: (property: string | null): Promise<void> => ipcRenderer.invoke('set-active-edit-property', property),
  setExternalOverlayState: (payload: any): Promise<void> => ipcRenderer.invoke('set-external-overlay-state', payload),
  inspectElementAtPoint: (payload: { x: number; y: number }): Promise<any> =>
    ipcRenderer.invoke('inspect-element-at-point', payload),
  inspectElementStackAtPoint: (payload: { x: number; y: number }): Promise<any[]> =>
    ipcRenderer.invoke('inspect-element-stack-at-point', payload),
  inspectElementByBackendId: (payload: { backendNodeId: number }): Promise<any> =>
    ipcRenderer.invoke('inspect-element-by-backend-id', payload),
  capturePreview: (): Promise<{ dataUrl: string; viewport: { x: number; y: number; width: number; height: number } } | null> => ipcRenderer.invoke('capture-preview'),
  updateElementStyle: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-element-style', payload),
  updateElementStyles: (payload: { nodeId: number; backendNodeId: number; styles: Record<string, string> }): Promise<any> =>
    ipcRenderer.invoke('update-element-styles', payload),
  updateTextContent: (payload: { nodeId: number; backendNodeId: number; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-text-content', payload),
  updateElementAttribute: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-element-attribute', payload),

  // 事件
  onElementSelected: (callback: (element: any, meta?: any) => void): void => {
    ipcRenderer.on('element-selected', (_event, element, meta) => callback(element, meta))
  },
  onBrowserViewLoaded: (callback: (info: { url: string; title: string }) => void): void => {
    ipcRenderer.on('browser-view-loaded', (_event, info) => callback(info))
  },
  onLaunchStatus: (callback: (info: any) => void): void => {
    ipcRenderer.on('launch-status', (_event, info) => callback(info))
  },
  onAutoConnected: (callback: (info: { mode: string; endpoint: string }) => void): void => {
    ipcRenderer.on('auto-connected', (_event, info) => callback(info))
  },
  onPropertyActivated: (callback: (property: string) => void): void => {
    ipcRenderer.on('property-activated', (_event, property) => callback(property))
  },
  onPropertyIncrement: (callback: (cssProperty: string) => void): void => {
    ipcRenderer.on('property-increment', (_event, cssProperty) => callback(cssProperty))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('element-selected')
    ipcRenderer.removeAllListeners('browser-view-loaded')
    ipcRenderer.removeAllListeners('launch-status')
    ipcRenderer.removeAllListeners('auto-connected')
    ipcRenderer.removeAllListeners('property-activated')
    ipcRenderer.removeAllListeners('property-increment')
  },

  // 代码生成
  generateAIPrompt: (element: any): Promise<string> => ipcRenderer.invoke('generate-ai-prompt', element),
  generateCSS: (element: any): Promise<string> => ipcRenderer.invoke('generate-css', element),
  generateCSSVariables: (variables: Record<string, string>): Promise<string> => ipcRenderer.invoke('generate-css-variables', variables),
})
