import type { LicenseActionResult, LicenseStatus } from '../types'
import type { LicenseFeature } from '../shared/license'

export class LicenseManager {
  static async getStatus(): Promise<LicenseStatus> {
    return {
      isPro: true,
      provider: 'community',
      lastValidatedAt: null,
    } as LicenseStatus
  }

  static async purchase(): Promise<LicenseActionResult> {
    return { success: true }
  }

  static async restore(): Promise<LicenseActionResult> {
    return { success: true }
  }

  static checkFeatureAccess(_feature: LicenseFeature, _status: LicenseStatus) {
    return {
      allowed: true,
      reason: null,
    }
  }
}
