import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(__dirname, '../../../..', relativePath), 'utf8')
}

describe('MAS builtin-only source contract', () => {
  it('main process source removes forbidden external launch and CDP plumbing', () => {
    const mainSource = readProjectFile('packages/app/electron/main.ts')
    const forbiddenPatterns = [
      'child_process',
      'spawn(',
      'CDPClient',
      'discover-cdp-url',
      'inspect-project',
      'select-project-directory',
      'launch-project-session',
      'stop-project-session',
      'launch-electron-app',
      'kill-launched-app',
      'connect-cdp',
      'discover-local-apps',
      'resize-window-to-sidebar',
      'restore-window-size',
    ]

    for (const pattern of forbiddenPatterns) {
      expect(mainSource).not.toContain(pattern)
    }

    const allowedHandlers = [
      "ipcMain.handle('load-url'",
      "ipcMain.handle('attach-debugger'",
      "ipcMain.handle('select-html-file'",
      "ipcMain.handle('disconnect'",
      "ipcMain.handle('start-inspect'",
      "ipcMain.handle('generate-ai-prompt'",
    ]

    for (const handler of allowedHandlers) {
      expect(mainSource).toContain(handler)
    }
  })

  it('preload only exposes builtin-safe APIs and future grouped bridges', () => {
    const preloadSource = readProjectFile('packages/app/electron/preload.ts')

    const forbiddenApiNames = [
      'discoverCDPUrl',
      'connectCDP',
      'discoverLocalApps',
      'selectProjectDirectory',
      'inspectProject',
      'launchProjectSession',
      'stopProjectSession',
      'launchElectronApp',
      'killLaunchedApp',
      'setExternalOverlayState',
      'onLaunchStatus',
      'onAutoConnected',
      'resizeWindowToSidebar',
      'restoreWindowSize',
    ]

    for (const name of forbiddenApiNames) {
      expect(preloadSource).not.toContain(name)
    }

    const groupedApis = ['settings:', 'menu:', 'shortcuts:', 'license:']
    for (const group of groupedApis) {
      expect(preloadSource).toContain(group)
    }
  })

  it('renderer types collapse to builtin-only mode', () => {
    const typesSource = readProjectFile('packages/app/src/types.ts')

    const forbiddenTypeNames = [
      "'external'",
      'DiscoveredApp',
      'ProjectLaunchCommands',
      'ProjectLaunchCapabilities',
      'ProjectScriptInfo',
      'ProjectInfo',
      'SelectProjectDirectoryOptions',
      'ProjectLaunchStatus',
      'discoverCDPUrl',
      'connectCDP',
      'discoverLocalApps',
      'launchProjectSession',
    ]

    for (const name of forbiddenTypeNames) {
      expect(typesSource).not.toContain(name)
    }

    const groupedApis = ['settings:', 'menu:', 'shortcuts:', 'license:']
    for (const group of groupedApis) {
      expect(typesSource).toContain(group)
    }
  })
})
