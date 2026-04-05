import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface OnboardingWizardProps {
  defaultUrl: string
  onLoadUrl: (url: string) => void
  recentHtmlFiles: string[]
  onLoadHtmlFile: (filePath?: string) => void
}

type OnboardingPath = 'server' | 'html' | null
type ServerStep = 1 | 2 | 3

function clampServerStep(step: number): ServerStep {
  if (step <= 1) return 1
  if (step >= 3) return 3
  return 2
}

function getServerDeckPosition(step: ServerStep, currentStep: ServerStep) {
  const delta = step - currentStep

  if (delta === 0) return 'active'
  if (delta === -1) return 'prev'
  if (delta === 1) return 'next'
  if (delta < 0) return 'far-prev'
  return 'far-next'
}

export function OnboardingWizard({
  defaultUrl,
  onLoadUrl,
  recentHtmlFiles,
  onLoadHtmlFile,
}: OnboardingWizardProps) {
  const { t } = useTranslation()
  const [path, setPath] = useState<OnboardingPath>(null)
  const [serverStep, setServerStep] = useState<ServerStep>(1)
  const [promptCopied, setPromptCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)

  const aiSetupPrompt = useMemo(
    () => t('onboarding.aiSetupPrompt', { defaultUrl }),
    [defaultUrl, t],
  )

  const philosophy = useMemo(() => ({
    eyebrow: t('onboarding.philosophy.eyebrow'),
    title: t('onboarding.philosophy.title'),
    body: t('onboarding.philosophy.body'),
    flow: [
      t('onboarding.philosophy.flow.mark'),
      t('onboarding.philosophy.flow.tune'),
      t('onboarding.philosophy.flow.generate'),
      t('onboarding.philosophy.flow.handToAi'),
    ],
    footerLead: t('onboarding.philosophy.footerLead'),
    footerBody: t('onboarding.philosophy.footerBody'),
    modeHint: t('onboarding.philosophy.modeHint'),
    serverBadge: t('onboarding.philosophy.serverBadge'),
    htmlBadge: t('onboarding.philosophy.htmlBadge'),
  }), [t])

  const promptPreview = useMemo(
    () => aiSetupPrompt.split('\n').filter(Boolean).slice(0, 3).join('\n'),
    [aiSetupPrompt],
  )
  const recentHtmlEntries = useMemo(
    () => recentHtmlFiles.slice(0, 4).map((filePath) => {
      const normalized = filePath.replace(/\\/g, '/')
      const lastSlashIndex = normalized.lastIndexOf('/')
      const fileName = lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized
      const parentPath = lastSlashIndex > 0 ? normalized.slice(0, lastSlashIndex) : normalized

      return {
        fileName,
        filePath,
        parentPath: parentPath || normalized,
      }
    }),
    [recentHtmlFiles],
  )

  const handleCopyPrompt = useCallback(async () => {
    setServerStep(1)
    await navigator.clipboard.writeText(aiSetupPrompt)
    setPromptCopied(true)
    window.setTimeout(() => setPromptCopied(false), 1800)
    window.setTimeout(() => setServerStep(2), 120)
  }, [aiSetupPrompt])

  const handleCopyCommand = useCallback(async () => {
    setServerStep(2)
    await navigator.clipboard.writeText('npm run dev')
    setCommandCopied(true)
    window.setTimeout(() => setCommandCopied(false), 1800)
    window.setTimeout(() => setServerStep(3), 120)
  }, [])

  const handleLoad = useCallback(() => {
    setServerStep(3)
    onLoadUrl(defaultUrl)
  }, [defaultUrl, onLoadUrl])
  const handleExit = useCallback(() => {
    setPath(null)
    setServerStep(1)
  }, [])
  const handleGoPrevious = useCallback(() => {
    setServerStep((current) => clampServerStep(current - 1))
  }, [])
  const handleGoNext = useCallback(() => {
    setServerStep((current) => clampServerStep(current + 1))
  }, [])
  const serverCards = [
    {
      step: 1 as ServerStep,
      title: t('onboarding.aiPrompt'),
      description: t('onboarding.aiPromptDesc'),
      preview: (
        <div className="wizard-flow-snippet mono">{promptPreview}</div>
      ),
      ghost: t('onboarding.copyPrompt'),
      actionLabel: promptCopied ? t('onboarding.copied') : t('onboarding.copyPrompt'),
      action: () => void handleCopyPrompt(),
    },
    {
      step: 2 as ServerStep,
      title: t('onboarding.startServer'),
      description: t('onboarding.startServerDesc'),
      preview: (
        <div className="wizard-command wizard-flow-command">npm run dev</div>
      ),
      ghost: 'npm run dev',
      actionLabel: commandCopied ? t('onboarding.copied') : t('onboarding.copyCommand'),
      action: () => void handleCopyCommand(),
    },
    {
      step: 3 as ServerStep,
      title: t('onboarding.loadPage'),
      description: t('onboarding.loadPageDesc'),
      preview: (
        <>
          <div className="wizard-target-url wizard-flow-command">{defaultUrl}</div>
          <p className="wizard-flow-hint">{t('onboarding.topBarHint')}</p>
        </>
      ),
      ghost: defaultUrl,
      actionLabel: t('onboarding.loadPreset'),
      action: handleLoad,
    },
  ]

  if (path === null) {
    return (
      <div className="wizard-screen wizard-screen-home">
        <div className="wizard-shell wizard-shell-home">
          <div className="wizard-brand">
            <div className="wizard-brand-row">
              <img src="./icon.png" alt="DOMPrompter" className="wizard-brand-icon wizard-brand-icon-img" />
              <span className="wizard-brand-name">{t('app.name')}</span>
            </div>
            <p className="wizard-brand-tagline">{t('app.tagline')}</p>
          </div>

          <header className="wizard-home-header">
            <h1 className="wizard-home-title">{t('onboarding.chooseTitle')}</h1>
            <p className="wizard-home-copy">{t('onboarding.chooseDesc')}</p>
          </header>

          <main className="wizard-home-main">
            <div className="wizard-mode-list wizard-mode-list-home">
              <button className="wizard-mode-option wizard-mode-option-home" onClick={() => { setPath('server'); setServerStep(1) }}>
                <div className="wizard-mode-copy">
                  <div className="wizard-mode-meta">
                    <span className="wizard-mode-icon">SRV</span>
                    <span className="wizard-mode-badge">{philosophy.serverBadge}</span>
                  </div>
                  <div className="wizard-mode-title">{t('onboarding.serverMode')}</div>
                  <div className="wizard-mode-desc">{t('onboarding.serverDesc')}</div>
                </div>
                <div className="wizard-mode-tail">
                  <span className="wizard-mode-tail-label">{defaultUrl}</span>
                  <span>{t('onboarding.serverFoot')}</span>
                </div>
              </button>

              <button className="wizard-mode-option wizard-mode-option-home" onClick={() => { setPath('html') }}>
                <div className="wizard-mode-copy">
                  <div className="wizard-mode-meta">
                    <span className="wizard-mode-icon">HTML</span>
                    <span className="wizard-mode-badge secondary">{philosophy.htmlBadge}</span>
                  </div>
                  <div className="wizard-mode-title">{t('onboarding.htmlMode')}</div>
                  <div className="wizard-mode-desc">{t('onboarding.htmlDesc')}</div>
                </div>
                <div className="wizard-mode-tail">{t('onboarding.htmlFoot')}</div>
              </button>
            </div>

            <div className="wizard-home-note">
              <span className="wizard-home-note-label">{t('common.tip')}</span>
              <p>{t('onboarding.topBarHint')}</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (path === 'html') {
    return (
      <div className="wizard-screen wizard-screen-home wizard-screen-flow">
        <div className="wizard-shell wizard-shell-home wizard-flow-shell wizard-flow-shell-html">
          <div className="wizard-flow-header">
            <header className="wizard-home-header wizard-flow-heading">
              <div className="wizard-philosophy-eyebrow">DOMPrompter</div>
              <h1 className="wizard-home-title">{t('onboarding.htmlTitle')}</h1>
              <p className="wizard-home-copy">{t('onboarding.htmlGuide')}</p>
            </header>

            <button className="wizard-secondary wizard-flow-back" onClick={handleExit}>
              {t('onboarding.exit')}
            </button>
          </div>

          <main className="wizard-html-layout" aria-live="polite">
            <section className="wizard-html-card wizard-html-card-primary">
              <div className="wizard-html-copy">
                <span className="wizard-section-kicker">{t('onboarding.htmlMode')}</span>
                <h2>{t('onboarding.htmlGuideTitle')}</h2>
                <p>{t('onboarding.htmlGuideBody')}</p>
                <p className="wizard-flow-hint">{t('onboarding.topBarHint')}</p>
              </div>

              <button className="wizard-primary" onClick={() => void onLoadHtmlFile()}>
                {t('onboarding.htmlOpenAction')}
              </button>
            </section>

            <section className="wizard-html-card">
              <div className="wizard-html-history-head">
                <div>
                  <span className="wizard-section-kicker">{t('onboarding.htmlHistory')}</span>
                  <h2>{t('onboarding.htmlHistory')}</h2>
                </div>
              </div>

              {recentHtmlEntries.length > 0 ? (
                <div className="wizard-html-history-list" role="list">
                  {recentHtmlEntries.map((entry) => (
                    <button
                      key={entry.filePath}
                      className="wizard-html-history-item"
                      onClick={() => void onLoadHtmlFile(entry.filePath)}
                    >
                      <span className="wizard-html-history-copy">
                        <span className="wizard-html-history-name">{entry.fileName}</span>
                        <span className="wizard-html-history-path mono">{entry.parentPath}</span>
                      </span>
                      <span className="wizard-html-history-action">{t('onboarding.htmlRecentAction')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="wizard-html-empty">{t('onboarding.htmlHistoryEmpty')}</p>
              )}
            </section>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="wizard-screen wizard-screen-home wizard-screen-flow">
      <div className="wizard-shell wizard-shell-home wizard-flow-shell">
          <div className="wizard-flow-header">
            <header className="wizard-home-header wizard-flow-heading">
              <div className="wizard-philosophy-eyebrow">DOMPrompter</div>
              <h1 className="wizard-home-title">{t('onboarding.serverTitle')}</h1>
              <p className="wizard-home-copy wizard-home-copy-single-line">{t('onboarding.serverGuide')}</p>
            </header>

          <button className="wizard-secondary wizard-flow-back" onClick={handleExit}>
            {t('onboarding.exit')}
          </button>
        </div>

        <main className="wizard-deck-shell" aria-live="polite">
          <button
            className="wizard-deck-nav wizard-deck-nav-prev"
            aria-label={t('onboarding.previous')}
            onClick={handleGoPrevious}
            disabled={serverStep === 1}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="wizard-card-deck">
            {serverCards.map((card) => {
              const deckPosition = getServerDeckPosition(card.step, serverStep)
              const isActive = deckPosition === 'active'

              return (
                <section
                  key={card.step}
                  className={`wizard-deck-card wizard-deck-card-${deckPosition}`}
                  onClick={() => setServerStep(card.step)}
                >
                  <div className="wizard-flow-card-head">
                    <span className="wizard-flow-card-index">{String(card.step).padStart(2, '0')}</span>
                    <div className="wizard-flow-card-copy">
                      <h2>{card.title}</h2>
                      <p>{card.description}</p>
                    </div>
                  </div>

                  {isActive ? (
                    <>
                      {card.preview}
                      <div className="wizard-deck-actions">
                        <button className="wizard-primary" onClick={(event) => { event.stopPropagation(); card.action() }}>
                          {card.actionLabel}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="wizard-deck-ghost mono">{card.ghost}</div>
                  )}
                </section>
              )
            })}
          </div>

          <button
            className="wizard-deck-nav wizard-deck-nav-next"
            aria-label={t('onboarding.next')}
            onClick={handleGoNext}
            disabled={serverStep === 3}
          >
            <span aria-hidden="true">›</span>
          </button>
        </main>
      </div>
    </div>
  )
}
