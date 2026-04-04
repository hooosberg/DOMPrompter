import { describe, expect, it } from 'vitest'
import { installElectronApiMock } from './electron-api.mock'

describe('electron api mock helper', () => {
  it('installs a reusable window.electronAPI stub with grouped APIs', async () => {
    const api = installElectronApiMock()

    expect(window.electronAPI).toBe(api)
    expect(typeof api.settings.get).toBe('function')
    expect(typeof api.shortcuts.onOpenSettings).toBe('function')
    expect(typeof api.license.getStatus).toBe('function')

    await expect(api.license.getStatus()).resolves.toEqual({
      isPro: false,
      provider: 'dev-stub',
      lastValidatedAt: null,
    })
  })

  it('keeps a session-only pro state after purchase', async () => {
    const api = installElectronApiMock()

    await expect(api.license.purchase()).resolves.toEqual({ success: true })
    await expect(api.license.getStatus()).resolves.toMatchObject({
      isPro: true,
      provider: 'dev-stub',
    })
  })
})
