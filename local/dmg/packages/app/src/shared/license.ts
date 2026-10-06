export const MAS_PRODUCT_ID = 'com.domprompter.app.pro.lifetime'

export type LicenseProvider = 'mas' | 'dev-stub' | 'unsupported' | 'community'
export type LicenseFeature = 'page-export' | 'premium-themes'

export interface StoredLicenseState {
  isPro: boolean
  provider: LicenseProvider
  lastValidatedAt: string | null
}
