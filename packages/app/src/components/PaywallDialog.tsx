import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

const BENEFITS = [
  { titleKey: 'paywall.benefitExportTitle', descKey: 'paywall.benefitExportDesc' },
  { titleKey: 'paywall.benefitPrecisionTitle', descKey: 'paywall.benefitPrecisionDesc' },
  { titleKey: 'paywall.benefitTagsTitle', descKey: 'paywall.benefitTagsDesc' },
  { titleKey: 'paywall.benefitFutureTitle', descKey: 'paywall.benefitFutureDesc' },
]

interface PaywallDialogProps {
  open: boolean
  onClose: () => void
  onPurchase: () => Promise<void>
  onRestore: () => Promise<void>
}

export function PaywallDialog({
  open,
  onClose,
  onPurchase,
  onRestore,
}: PaywallDialogProps) {
  const { t } = useTranslation()
  const [purchasing, setPurchasing] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!open) {
      setPurchasing(false)
      setRestoring(false)
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handlePurchase = async () => {
    setPurchasing(true)
    try {
      await onPurchase()
    } finally {
      setPurchasing(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      await onRestore()
    } finally {
      setRestoring(false)
    }
  }

  if (!open) return null

  const busy = purchasing || restoring

  return createPortal(
    <div className="paywall-backdrop" onClick={onClose}>
      <div className="paywall-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="paywall-header">
          <div className="paywall-brand">
            <div className="paywall-brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <div className="paywall-brand-copy">
              <div className="paywall-kicker">{t('paywall.kicker')}</div>
              <h3 className="paywall-title">{t('paywall.title')}</h3>
            </div>
          </div>
          <button
            type="button"
            className="paywall-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="paywall-subtitle">{t('paywall.subtitle')}</p>

        <div className="paywall-offer">
          <div className="paywall-price-badge">{t('paywall.lifetimeBadge')}</div>
          <div className="paywall-price-value">{t('paywall.priceValue')}</div>
        </div>

        <div className="paywall-benefits">
          {BENEFITS.map((benefit) => (
            <div className="paywall-benefit" key={benefit.titleKey}>
              <span className="paywall-benefit-check">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div className="paywall-benefit-copy">
                <div className="paywall-benefit-title">{t(benefit.titleKey)}</div>
                <div className="paywall-benefit-desc">{t(benefit.descKey)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="paywall-footer">
          <button
            type="button"
            className="paywall-restore-btn"
            onClick={() => void handleRestore()}
            disabled={busy}
          >
            {restoring ? t('paywall.restoring') : t('paywall.restorePurchase')}
          </button>

          <div className="paywall-actions">
            <button
              type="button"
              className="paywall-secondary-btn"
              onClick={onClose}
              disabled={busy}
            >
              {t('paywall.cancel')}
            </button>
            <button
              type="button"
              className="paywall-primary-btn"
              onClick={() => void handlePurchase()}
              disabled={busy}
            >
              {purchasing ? t('paywall.purchasing') : t('paywall.unlockNow')}
            </button>
          </div>
        </div>

        <div className="paywall-cta-note">{t('paywall.ctaNote')}</div>
      </div>
    </div>,
    document.body,
  )
}
