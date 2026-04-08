import { contextBridge, ipcRenderer } from 'electron'

// Expose a minimal bridge for file picker dialogs.
// Web apps in the BrowserView can't use the File System Access API
// (showDirectoryPicker etc.) because Chromium doesn't treat BrowserView
// as a top-level browsing context.  This preload injects a polyfill that
// proxies the calls to the Electron main process via IPC.

contextBridge.exposeInMainWorld('__domprompterBridge', {
  showDirectoryPicker: (): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('browserview:showDirectoryPicker'),
  showOpenFilePicker: (options?: { multiple?: boolean; types?: Array<{ accept: Record<string, string[]> }> }): Promise<Array<{ path: string; name: string }> | null> =>
    ipcRenderer.invoke('browserview:showOpenFilePicker', options),
  showSaveFilePicker: (options?: { suggestedName?: string }): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke('browserview:showSaveFilePicker', options),
})
