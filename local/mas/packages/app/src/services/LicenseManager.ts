import type { LicenseActionResult, LicenseStatus } from '../types'
import type { LicenseFeature } from '../shared/license'

export class LicenseManager {
  static async getStatus(): Promise<LicenseStatus> {
    return window.electronAPI.license.getStatus()
  }

  static async purchase(): Promise<LicenseActionResult> {
    return window.electronAPI.license.purchase()
  }

  static async restore(): Promise<LicenseActionResult> {
    return window.electronAPI.license.restore()
  }

  static checkFeatureAccess(feature: LicenseFeature, status: LicenseStatus) {
    if (feature === 'page-export' || feature === 'premium-themes') {
      return {
        allowed: status.isPro,
        reason: status.isPro ? null : 'pro-required',
      }
    }

    return {
      allowed: false,
      reason: 'unknown-feature',
    }
  }
}
