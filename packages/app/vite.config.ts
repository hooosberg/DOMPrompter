import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

function patchMainJs() {
  const mainPath = resolve(__dirname, 'dist-electron/main.js')

  try {
    let content = readFileSync(mainPath, 'utf-8')

    // Check if already patched
    if (content.includes('const { app, BrowserWindow, BrowserView, ipcMain, dialog, Menu, nativeTheme, screen, shell } = electron;')) {
      return
    }

    // Add destructuring after electron require — must cover every named import used in main.ts
    content = content.replace(
      'const electron = require("electron");',
      'const electron = require("electron");\nconst { app, BrowserWindow, BrowserView, ipcMain, dialog, Menu, nativeTheme, screen, shell } = electron;'
    )

    // Replace remaining electron.* references that Rollup emits for namespace access
    content = content.replace(/electron\.app\b/g, 'app')
    content = content.replace(/electron\.BrowserWindow\b/g, 'BrowserWindow')
    content = content.replace(/electron\.BrowserView\b/g, 'BrowserView')
    content = content.replace(/electron\.ipcMain\b/g, 'ipcMain')
    content = content.replace(/electron\.dialog\b/g, 'dialog')
    content = content.replace(/electron\.Menu\b/g, 'Menu')
    content = content.replace(/electron\.nativeTheme\b/g, 'nativeTheme')
    content = content.replace(/electron\.screen\b/g, 'screen')
    content = content.replace(/electron\.shell\b/g, 'shell')

    writeFileSync(mainPath, content, 'utf-8')
    console.log('✓ Patched dist-electron/main.js')
  } catch (error) {
    console.error('Failed to patch main.js:', error)
  }
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 15173,
    strictPort: true,
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          // Patch before starting
          patchMainJs()
          // Strip ELECTRON_RUN_AS_NODE so the spawned Electron process
          // initialises its built-in modules (app, BrowserWindow, etc.).
          // VS Code / Claude Code terminals set this variable because they
          // are Electron apps themselves.
          const env = { ...process.env }
          delete env.ELECTRON_RUN_AS_NODE
          args.startup(['.',  '--no-sandbox'], { env })
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            minify: false,
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
                manualChunks: undefined
              }
            }
          },
          resolve: {
            alias: {
              '@visual-inspector/core': resolve(__dirname, '../core/src/index.ts')
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
