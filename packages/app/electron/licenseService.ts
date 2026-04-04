import { app, inAppPurchase, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { MAS_PRODUCT_ID, type StoredLicenseState } from '../src/shared/license'

const LICENSE_FILE = 'license-state.json'
let devStubState: StoredLicenseState | null = null

function getLicenseFilePath() {
  return join(app.getPath('userData'), LICENSE_FILE)
}

function createDefaultLicenseState(provider: StoredLicenseState['provider']): StoredLicenseState {
  return {
    isPro: false,
    provider,
    lastValidatedAt: null,
  }
}

function getProvider(): StoredLicenseState['provider'] {
  if (process.mas) return 'mas'
  if (process.env.NODE_ENV === 'development') return 'dev-stub'
  return 'unsupported'
}

function loadStoredLicenseState(): StoredLicenseState {
  const provider = getProvider()

  if (provider === 'dev-stub') {
    if (!devStubState) {
      devStubState = createDefaultLicenseState(provider)
    }
    return devStubState
  }

  try {
    const filePath = getLicenseFilePath()
    if (!existsSync(filePath)) {
      return createDefaultLicenseState(provider)
    }

    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<StoredLicenseState>
    return {
      isPro: Boolean(parsed.isPro),
      provider,
      lastValidatedAt: typeof parsed.lastValidatedAt === 'string' ? parsed.lastValidatedAt : null,
    }
  } catch {
    return createDefaultLicenseState(provider)
  }
}

function saveStoredLicenseState(state: StoredLicenseState) {
  if (state.provider === 'dev-stub') {
    devStubState = state
    return
  }

  const filePath = getLicenseFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(state), 'utf8')
}

export function registerLicenseHandlers() {
  ipcMain.handle('license:getStatus', async () => {
    return {
      ...loadStoredLicenseState(),
      productId: MAS_PRODUCT_ID,
    }
  })

  ipcMain.handle('license:purchase', async () => {
    const state = loadStoredLicenseState()

    if (state.provider === 'dev-stub') {
      const nextState: StoredLicenseState = {
        ...state,
        isPro: true,
        lastValidatedAt: new Date().toISOString(),
      }
      saveStoredLicenseState(nextState)
      return { success: true }
    }

    if (state.provider === 'mas') {
      try {
        const purchaseApi = inAppPurchase as any
        const success = await Promise.resolve(purchaseApi.purchaseProduct(MAS_PRODUCT_ID))
        if (success) {
          const nextState: StoredLicenseState = {
            ...state,
            isPro: true,
            lastValidatedAt: new Date().toISOString(),
          }
          saveStoredLicenseState(nextState)
          return { success: true }
        }
        return { success: false, error: 'Purchase was cancelled or declined.' }
      } catch (error) {
        return { success: false, error: (error as Error).message || 'Purchase failed.' }
      }
    }

    return { success: false, error: 'Purchases are unavailable in this environment.' }
  })

  ipcMain.handle('license:restore', async () => {
    const state = loadStoredLicenseState()

    if (state.provider === 'dev-stub') {
      if (!state.isPro) {
        return { success: false, error: 'No previous stub purchase found.' }
      }
      return { success: true }
    }

    if (state.provider === 'mas') {
      try {
        const purchaseApi = inAppPurchase as any
        await Promise.resolve(purchaseApi.restoreCompletedTransactions?.())
        const nextState: StoredLicenseState = {
          ...state,
          isPro: true,
          lastValidatedAt: new Date().toISOString(),
        }
        saveStoredLicenseState(nextState)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message || 'Restore failed.' }
      }
    }

    return { success: false, error: 'Restore is unavailable in this environment.' }
  })
}
