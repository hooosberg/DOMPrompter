import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MAS_APP_URL } from '../shared/externalLinks'

interface ExportCompareDialogProps {
  open: boolean
  onClose: () => void
  onCopy: () => Promise<void>
  communityPrompt: string
  fullPrompt: string
  communityElementCount: number
  totalElementCount: number
}

export function ExportCompareDialog({
  open,
  onClose,
  onCopy,
  communityPrompt,
  fullPrompt,
  communityElementCount,
  totalElementCount,
}: ExportCompareDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setCopying(false)
      void window.electronAPI.setModalOpen(false).catch(() => {})
      return
    }

    void window.electronAPI.setModalOpen(true).catch(() => {})

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    setCopying(true)
    try {
      await onCopy()
      setCopied(true)
      timerRef.current = setTimeout(() => {
        setCopied(false)
        onClose()
      }, 1400)
    } finally {
      setCopying(false)
    }
  }

  const isLimited = totalElementCount > communityElementCount

  if (!open) return null

  return createPortal(
    <div className="export-compare-backdrop" onClick={onClose}>
      <div className="export-compare-dialog" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="export-compare-header">
          <div className="export-compare-title-group">
            <div className="export-compare-kicker">{t('exportCompare.kicker')}</div>
            <h3 className="export-compare-title">{t('exportCompare.title')}</h3>
          </div>
          <button type="button" className="export-compare-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Difference callout */}
        {isLimited ? (
          <div className="export-compare-callout limited">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{t('exportCompare.diffNote', { communityCount: communityElementCount, totalCount: totalElementCount })}</span>
          </div>
        ) : (
          <div className="export-compare-callout same">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{t('exportCompare.diffNoteSame', { count: totalElementCount })}</span>
          </div>
        )}

        {/* Two-column prompt comparison */}
        <div className="export-compare-panels">

          {/* Community panel */}
          <div className="export-compare-panel community">
            <div className="export-compare-panel-header">
              <span className="export-compare-panel-badge community">{t('exportCompare.communityLabel')}</span>
              <span className="export-compare-panel-meta">
                {t('exportCompare.communityMeta', { count: communityElementCount })}
              </span>
            </div>
            <pre className="export-compare-pre">{communityPrompt}</pre>
          </div>

          {/* Pro panel */}
          <div className="export-compare-panel pro">
            <div className="export-compare-panel-header">
              <span className="export-compare-panel-badge pro">{t('exportCompare.proLabel')}</span>
              <span className="export-compare-panel-meta">
                {t('exportCompare.proMeta', { count: totalElementCount })}
              </span>
            </div>
            <pre className="export-compare-pre">{fullPrompt}</pre>
            {isLimited && (
              <button
                type="button"
                className="export-compare-appstore-btn"
                onClick={() => void window.electronAPI.openExternal(MAS_APP_URL)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                {t('exportCompare.getProBtn')}
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="export-compare-footer">
          <button
            type="button"
            className={`export-compare-copy-btn ${copied ? 'copied' : ''}`}
            onClick={() => void handleCopy()}
            disabled={copying || copied}
          >
            {copied
              ? t('exportCompare.copyDone')
              : copying
                ? t('exportCompare.copying')
                : t('exportCompare.copyBtn')}
          </button>
          {isLimited && (
            <div className="export-compare-footer-note">{t('exportCompare.footerNote')}</div>
          )}
        </div>

      </div>
    </div>,
    document.body,
  )
}
