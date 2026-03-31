import type { Plugin } from 'vite'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export function electronPatchPlugin(): Plugin {
  let patched = false

  const patchMainJs = () => {
    const mainPath = join(process.cwd(), 'dist-electron/main.js')

    if (!existsSync(mainPath)) {
      return
    }

    try {
      let content = readFileSync(mainPath, 'utf-8')

      // Check if already patched
      if (content.includes('const { app, BrowserWindow, ipcMain } = electron;')) {
        return
      }

      // Add destructuring after electron require
      content = content.replace(
        'const electron = require("electron");',
        'const electron = require("electron");\nconst { app, BrowserWindow, ipcMain } = electron;'
      )

      // Replace electron.* references
      content = content.replace(/electron\.app\./g, 'app.')
      content = content.replace(/electron\.BrowserWindow/g, 'BrowserWindow')
      content = content.replace(/electron\.ipcMain/g, 'ipcMain')

      writeFileSync(mainPath, content, 'utf-8')
      console.log('✓ Patched dist-electron/main.js')
      patched = true
    } catch (error) {
      console.error('Failed to patch main.js:', error)
    }
  }

  return {
    name: 'electron-patch-plugin',
    apply: 'serve',

    writeBundle() {
      // Try to patch immediately after bundle is written
      setTimeout(patchMainJs, 100)
    },

    closeBundle() {
      // Also try on closeBundle
      if (!patched) {
        patchMainJs()
      }
    },

    buildEnd() {
      // And on buildEnd
      if (!patched) {
        setTimeout(patchMainJs, 200)
      }
    }
  }
}
