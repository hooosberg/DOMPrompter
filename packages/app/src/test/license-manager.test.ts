import { describe, expect, it } from 'vitest'
import { LicenseManager } from '../services/LicenseManager'

describe('LicenseManager', () => {
  it('blocks page export for free users', () => {
    expect(
      LicenseManager.checkFeatureAccess('page-export', {
        isPro: false,
        provider: 'dev-stub',
        lastValidatedAt: null,
      }),
    ).toEqual({
      allowed: false,
      reason: 'pro-required',
    })
  })

  it('allows page export for pro users', () => {
    expect(
      LicenseManager.checkFeatureAccess('page-export', {
        isPro: true,
        provider: 'dev-stub',
        lastValidatedAt: null,
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    })
  })
})
