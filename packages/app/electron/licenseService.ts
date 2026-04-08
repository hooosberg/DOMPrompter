import { ipcMain } from 'electron'

/**
 * Community Edition — all features unlocked, no in-app purchase flow.
 */
export function registerLicenseHandlers() {
  ipcMain.handle('license:getStatus', async () => ({
    isPro: true,
    provider: 'community',
    lastValidatedAt: null,
    productId: 'community',
  }))

  ipcMain.handle('license:purchase', async () => ({ success: true }))
  ipcMain.handle('license:restore', async () => ({ success: true }))
}
