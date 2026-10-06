import { app, inAppPurchase, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { MAS_PRODUCT_ID, type LicenseOffer, type StoredLicenseState } from '../src/shared/license'

const LICENSE_FILE = 'license-state.json'
const PENDING_LICENSE_ACTION_TIMEOUT_MS = 60_000

type PendingLicenseActionKind = 'purchase' | 'restore'

interface PendingLicenseAction {
  kind: PendingLicenseActionKind
  resolve: (result: { success: boolean; error?: string }) => void
  timer: NodeJS.Timeout
}

interface MasTransaction {
  transactionState?: string
  transactionDate?: string
  errorMessage?: string
  errorCode?: string | number
  payment?: {
    productIdentifier?: string
  }
  productIdentifier?: string
}

interface MasProduct {
  productIdentifier?: string
  localizedTitle?: string
  localizedDescription?: string
  formattedPrice?: string
  currencyCode?: string
}

type InAppPurchaseBridge = typeof inAppPurchase & {
  canMakePayments?: () => boolean
  getProducts?: (productIds: string[]) => Promise<MasProduct[]>
  purchaseProduct: (productId: string, quantity?: number | { quantity?: number; username?: string }) => Promise<boolean>
  restoreCompletedTransactions?: () => Promise<void>
  finishTransactionByDate?: (date: string) => boolean
  on?: (event: 'transactions-updated', listener: (_event: unknown, transactions: MasTransaction[]) => void) => void
}

let pendingLicenseAction: PendingLicenseAction | null = null
let hasRegisteredTransactionListener = false

function getLicenseFilePath() {
  return join(app.getPath('userData'), LICENSE_FILE)
}

function getPurchaseApi(): InAppPurchaseBridge {
  return inAppPurchase as InAppPurchaseBridge
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
  return 'unsupported'
}

function loadStoredLicenseState(): StoredLicenseState {
  const provider = getProvider()

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
  const filePath = getLicenseFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(state), 'utf8')
}

function canMakeMasPayments() {
  if (!process.mas) return false

  const purchaseApi = getPurchaseApi()
  if (typeof purchaseApi.canMakePayments !== 'function') {
    return true
  }

  try {
    return purchaseApi.canMakePayments()
  } catch {
    return false
  }
}

async function loadMasOffer(): Promise<LicenseOffer | null> {
  if (!process.mas || !canMakeMasPayments()) {
    return null
  }

  const purchaseApi = getPurchaseApi()
  if (typeof purchaseApi.getProducts !== 'function') {
    return null
  }

  try {
    const products = await Promise.resolve(purchaseApi.getProducts([MAS_PRODUCT_ID]))
    if (!Array.isArray(products) || products.length === 0) {
      return null
    }

    const product = products.find((item) => item.productIdentifier === MAS_PRODUCT_ID) || products[0]
    return {
      productId: product.productIdentifier || MAS_PRODUCT_ID,
      title: product.localizedTitle || null,
      description: product.localizedDescription || null,
      formattedPrice: product.formattedPrice || null,
      currencyCode: product.currencyCode || null,
    }
  } catch {
    return null
  }
}

async function buildLicenseStatus() {
  const state = loadStoredLicenseState()
  return {
    ...state,
    productId: MAS_PRODUCT_ID,
    offer: state.provider === 'mas' ? await loadMasOffer() : null,
  }
}

function finishTransaction(transaction: MasTransaction) {
  if (!transaction.transactionDate) return

  const purchaseApi = getPurchaseApi()
  if (typeof purchaseApi.finishTransactionByDate !== 'function') {
    return
  }

  try {
    purchaseApi.finishTransactionByDate(transaction.transactionDate)
  } catch {
    // Ignore finish failures and let the queue retry on next launch.
  }
}

function clearPendingLicenseAction() {
  if (!pendingLicenseAction) return
  clearTimeout(pendingLicenseAction.timer)
  pendingLicenseAction = null
}

function resolvePendingLicenseAction(
  kind: PendingLicenseActionKind,
  result: { success: boolean; error?: string },
) {
  if (!pendingLicenseAction || pendingLicenseAction.kind !== kind) {
    return
  }

  const { resolve } = pendingLicenseAction
  clearPendingLicenseAction()
  resolve(result)
}

function createPendingLicenseAction(kind: PendingLicenseActionKind) {
  if (pendingLicenseAction) {
    return Promise.resolve({
      success: false,
      error: 'Another purchase operation is already in progress.',
    })
  }

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    pendingLicenseAction = {
      kind,
      resolve,
      timer: setTimeout(() => {
        resolvePendingLicenseAction(kind, {
          success: false,
          error: kind === 'purchase'
            ? 'Purchase timed out. Please try again.'
            : 'No previous purchase was found to restore.',
        })
      }, PENDING_LICENSE_ACTION_TIMEOUT_MS),
    }
  })
}

function persistUnlockedState() {
  const currentState = loadStoredLicenseState()
  const nextState: StoredLicenseState = {
    ...currentState,
    isPro: true,
    lastValidatedAt: new Date().toISOString(),
  }
  saveStoredLicenseState(nextState)
}

function handleTransactionsUpdated(transactions: MasTransaction[]) {
  for (const transaction of transactions) {
    const productId = transaction.payment?.productIdentifier || transaction.productIdentifier
    if (productId !== MAS_PRODUCT_ID) {
      continue
    }

    switch (transaction.transactionState) {
      case 'purchased':
        finishTransaction(transaction)
        persistUnlockedState()
        resolvePendingLicenseAction('purchase', { success: true })
        break
      case 'restored':
        finishTransaction(transaction)
        persistUnlockedState()
        resolvePendingLicenseAction('restore', { success: true })
        break
      case 'failed':
        finishTransaction(transaction)
        resolvePendingLicenseAction('purchase', {
          success: false,
          error: transaction.errorMessage || 'Purchase failed.',
        })
        resolvePendingLicenseAction('restore', {
          success: false,
          error: transaction.errorMessage || 'Restore failed.',
        })
        break
      case 'deferred':
        resolvePendingLicenseAction('purchase', {
          success: false,
          error: 'Purchase is pending approval.',
        })
        break
      default:
        break
    }
  }
}

function ensureMasTransactionListener() {
  if (!process.mas || hasRegisteredTransactionListener) {
    return
  }

  const purchaseApi = getPurchaseApi()
  if (typeof purchaseApi.on !== 'function') {
    return
  }

  purchaseApi.on('transactions-updated', (_event: unknown, transactions: MasTransaction[]) => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return
    }
    handleTransactionsUpdated(transactions)
  })

  hasRegisteredTransactionListener = true
}

export function registerLicenseHandlers() {
  ensureMasTransactionListener()
  ipcMain.removeHandler('license:getStatus')
  ipcMain.removeHandler('license:purchase')
  ipcMain.removeHandler('license:restore')

  ipcMain.handle('license:getStatus', async () => {
    return buildLicenseStatus()
  })

  ipcMain.handle('license:purchase', async () => {
    const state = loadStoredLicenseState()

    if (state.provider === 'mas') {
      if (!canMakeMasPayments()) {
        return { success: false, error: 'Purchases are unavailable for this Apple ID right now.' }
      }

      try {
        const pendingResult = createPendingLicenseAction('purchase')
        const purchaseApi = getPurchaseApi()
        const queued = await Promise.resolve(purchaseApi.purchaseProduct(MAS_PRODUCT_ID, 1))
        if (!queued) {
          clearPendingLicenseAction()
          return { success: false, error: 'Purchase could not be started.' }
        }

        return pendingResult
      } catch (error) {
        clearPendingLicenseAction()
        return { success: false, error: (error as Error).message || 'Purchase failed.' }
      }
    }

    return { success: false, error: 'Purchases are unavailable in this environment.' }
  })

  ipcMain.handle('license:restore', async () => {
    const state = loadStoredLicenseState()

    if (state.provider === 'mas') {
      try {
        const pendingResult = createPendingLicenseAction('restore')
        const purchaseApi = getPurchaseApi()
        await Promise.resolve(purchaseApi.restoreCompletedTransactions?.())
        return pendingResult
      } catch (error) {
        clearPendingLicenseAction()
        return { success: false, error: (error as Error).message || 'Restore failed.' }
      }
    }

    return { success: false, error: 'Restore is unavailable in this environment.' }
  })
}
