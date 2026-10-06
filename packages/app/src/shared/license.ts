export const MAS_PRODUCT_ID = 'com.domprompter.app.pro.lifetime'

export type LicenseProvider = 'mas' | 'unsupported'
export type LicenseFeature = 'page-export' | 'premium-themes'

export interface LicenseOffer {
  productId: string
  title: string | null
  description: string | null
  formattedPrice: string | null
  currencyCode: string | null
}

export interface StoredLicenseState {
  isPro: boolean
  provider: LicenseProvider
  lastValidatedAt: string | null
}
