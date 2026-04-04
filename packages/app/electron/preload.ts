import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  loadUrl: (url: string): Promise<boolean> => ipcRenderer.invoke('load-url', url),
  attachDebugger: (): Promise<boolean> => ipcRenderer.invoke('attach-debugger'),
  selectHtmlFile: (projectDir?: string): Promise<string | null> => ipcRenderer.invoke('select-html-file', projectDir),
  disconnect: (): Promise<void> => ipcRenderer.invoke('disconnect'),
  setPanelWidth: (width: number): Promise<void> => ipcRenderer.invoke('set-panel-width', width),
  setBuiltinViewInteractive: (interactive: boolean): Promise<boolean> => ipcRenderer.invoke('set-builtin-view-interactive', interactive),
  startInspect: (): Promise<boolean> => ipcRenderer.invoke('start-inspect'),
  stopInspect: (): Promise<void> => ipcRenderer.invoke('stop-inspect'),
  setActiveEditProperty: (property: string | null): Promise<void> => ipcRenderer.invoke('set-active-edit-property', property),
  inspectElementAtPoint: (payload: { x: number; y: number }): Promise<any> =>
    ipcRenderer.invoke('inspect-element-at-point', payload),
  inspectElementStackAtPoint: (payload: { x: number; y: number }): Promise<any[]> =>
    ipcRenderer.invoke('inspect-element-stack-at-point', payload),
  inspectElementByBackendId: (payload: { backendNodeId: number }): Promise<any> =>
    ipcRenderer.invoke('inspect-element-by-backend-id', payload),
  selectParentElement: (payload: { backendNodeId: number }): Promise<any> =>
    ipcRenderer.invoke('select-parent-element', payload),
  selectFirstChildElement: (payload: { backendNodeId: number }): Promise<any> =>
    ipcRenderer.invoke('select-first-child-element', payload),
  capturePreview: (): Promise<{ dataUrl: string; viewport: { x: number; y: number; width: number; height: number } } | null> =>
    ipcRenderer.invoke('capture-preview'),
  updateElementStyle: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-element-style', payload),
  updateElementStyles: (payload: { nodeId: number; backendNodeId: number; styles: Record<string, string> }): Promise<any> =>
    ipcRenderer.invoke('update-element-styles', payload),
  updateTextContent: (payload: { nodeId: number; backendNodeId: number; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-text-content', payload),
  updateElementAttribute: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }): Promise<any> =>
    ipcRenderer.invoke('update-element-attribute', payload),
  getPageContextSnapshot: (): Promise<any> => ipcRenderer.invoke('get-page-context-snapshot'),

  onElementSelected: (callback: (element: any, meta?: any) => void): void => {
    ipcRenderer.on('element-selected', (_event, element, meta) => callback(element, meta))
  },
  onBrowserViewLoaded: (callback: (info: { url: string; title: string }) => void): void => {
    ipcRenderer.on('browser-view-loaded', (_event, info) => callback(info))
  },
  onPropertyActivated: (callback: (property: string) => void): void => {
    ipcRenderer.on('property-activated', (_event, property) => callback(property))
  },
  onPropertyIncrement: (callback: (cssProperty: string) => void): void => {
    ipcRenderer.on('property-increment', (_event, cssProperty) => callback(cssProperty))
  },
  onContextAction: (callback: (action: string) => void): void => {
    ipcRenderer.on('context-action', (_event, action) => callback(action))
  },
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('element-selected')
    ipcRenderer.removeAllListeners('browser-view-loaded')
    ipcRenderer.removeAllListeners('property-activated')
    ipcRenderer.removeAllListeners('property-increment')
    ipcRenderer.removeAllListeners('context-action')
    ipcRenderer.removeAllListeners('shortcuts:openSettings')
    ipcRenderer.removeAllListeners('shortcuts:openHtmlFile')
    ipcRenderer.removeAllListeners('shortcuts:reloadPage')
    ipcRenderer.removeAllListeners('shortcuts:forceReload')
    ipcRenderer.removeAllListeners('shortcuts:toggleToolbar')
    ipcRenderer.removeAllListeners('shortcuts:copyPagePrompt')
    ipcRenderer.removeAllListeners('shortcuts:copyElementCSS')
    ipcRenderer.removeAllListeners('shortcuts:focusAddressBar')
    ipcRenderer.removeAllListeners('shortcuts:newWindow')
    ipcRenderer.removeAllListeners('shortcuts:escape')
  },

  generateAIPrompt: (element: any): Promise<string> => ipcRenderer.invoke('generate-ai-prompt', element),
  generateCSS: (element: any): Promise<string> => ipcRenderer.invoke('generate-css', element),
  generateCSSVariables: (variables: Record<string, string>): Promise<string> => ipcRenderer.invoke('generate-css-variables', variables),

  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value),
  },
  menu: {
    changeLanguage: (language: string): Promise<void> => ipcRenderer.invoke('menu:changeLanguage', language),
  },
  overlay: {
    sync: (payload: { tool: string; tags: unknown[] }): Promise<boolean> => ipcRenderer.invoke('overlay:sync', payload),
  },
  shortcuts: {
    onOpenSettings: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:openSettings', () => callback())
    },
    onOpenHtmlFile: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:openHtmlFile', () => callback())
    },
    onReloadPage: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:reloadPage', () => callback())
    },
    onForceReload: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:forceReload', () => callback())
    },
    onToggleToolbar: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:toggleToolbar', () => callback())
    },
    onCopyPagePrompt: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:copyPagePrompt', () => callback())
    },
    onCopyElementCSS: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:copyElementCSS', () => callback())
    },
    onFocusAddressBar: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:focusAddressBar', () => callback())
    },
    onNewWindow: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:newWindow', () => callback())
    },
    onEscape: (callback: () => void): void => {
      ipcRenderer.on('shortcuts:escape', () => callback())
    },
  },
  license: {
    getStatus: (): Promise<unknown> => ipcRenderer.invoke('license:getStatus'),
    purchase: (): Promise<unknown> => ipcRenderer.invoke('license:purchase'),
    restore: (): Promise<unknown> => ipcRenderer.invoke('license:restore'),
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
})
