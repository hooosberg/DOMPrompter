import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GITHUB_REPO_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL, WEBSITE_URL } from '../shared/externalLinks'
import { APP_LANGUAGE_OPTIONS } from '../shared/languages'
import type { AppLanguage, AppSettings } from '../types'

const APP_NAME = 'DOMPrompter'

const SHORTCUT_ROWS = [
  { key: 'openSettings', combo: 'Cmd+,' },
  { key: 'openHtml', combo: 'Cmd+O' },
  { key: 'newWindow', combo: 'Cmd+Shift+W' },
  { key: 'reload', combo: 'Cmd+R' },
  { key: 'forceReload', combo: 'Cmd+Shift+R' },
  { key: 'toggleToolbar', combo: 'Cmd+Shift+T' },
  { key: 'focusAddress', combo: 'Cmd+L' },
  { key: 'copyPrompt', combo: 'Cmd+Shift+C' },
  { key: 'copyCss', combo: 'Cmd+Shift+E' },
  { key: 'selectParent', combo: 'Esc' },
  { key: 'selectChild', combo: 'Enter' },
  { key: 'escape', combo: 'Esc' },
]

interface SettingsProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onThemeChange: (theme: AppSettings['theme']) => void
  onLanguageChange: (language: AppLanguage) => void
}

type SettingsTab = 'appearance' | 'shortcuts' | 'about'

export function Settings({
  open,
  settings,
  onClose,
  onThemeChange,
  onLanguageChange,
}: SettingsProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [languageExpanded, setLanguageExpanded] = useState(false)

  const tabs = useMemo<Array<{ id: SettingsTab; label: string }>>(() => ([
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'shortcuts', label: t('settings.shortcuts') },
    { id: 'about', label: t('settings.about') },
  ]), [t])
  const currentLanguageLabel = useMemo(
    () => APP_LANGUAGE_OPTIONS.find((option) => option.code === settings.language)?.label || 'English',
    [settings.language],
  )

  if (!open) return null

  return (
    <div className="wizard-screen wizard-screen-home settings-page">
      <div className="settings-shell">
        <div className="settings-page-header">
          <div className="settings-page-heading">
            <h1>{t('settings.title')}</h1>
          </div>
          <button className="btn-utility wide" onClick={onClose}>{t('settings.close')}</button>
        </div>

        <div className="settings-page-body">
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-panel">
            {activeTab === 'appearance' && (
              <div className="settings-stack">
                <section className="settings-section">
                  <div className="settings-section-header">
                    <h3>{t('settings.appearance')}</h3>
                    <p>{t('settings.theme')}</p>
                  </div>
                  <div className="settings-segmented" role="tablist" aria-label={t('settings.theme')}>
                    <button
                      type="button"
                      className={`settings-choice ${settings.theme === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                    >
                      {t('settings.themeLight')}
                    </button>
                    <button
                      type="button"
                      className={`settings-choice ${settings.theme === 'dark' ? 'active' : ''}`}
                      onClick={() => onThemeChange('dark')}
                    >
                      {t('settings.themeDark')}
                    </button>
                  </div>
                </section>

                <section className="settings-section">
                  <button
                    type="button"
                    className={`settings-disclosure ${languageExpanded ? 'expanded' : ''}`}
                    aria-expanded={languageExpanded}
                    onClick={() => setLanguageExpanded((expanded) => !expanded)}
                  >
                    <span className="settings-disclosure-copy">
                      <span className="settings-disclosure-title">{t('settings.language')}</span>
                      <span className="settings-disclosure-value">{currentLanguageLabel}</span>
                    </span>
                    <span className="settings-disclosure-chevron" aria-hidden="true" />
                  </button>

                  {languageExpanded && (
                    <div className="settings-language-list" role="listbox" aria-label={t('settings.language')}>
                      {APP_LANGUAGE_OPTIONS.map((option) => (
                        <button
                          key={option.code}
                          className={`settings-language-item ${settings.language === option.code ? 'active' : ''}`}
                          onClick={() => onLanguageChange(option.code)}
                        >
                          <span>{option.label}</span>
                          <span className="settings-language-indicator" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="settings-stack">
                {SHORTCUT_ROWS.map((item) => (
                  <div key={item.key} className="settings-row">
                    <span>{t(`shortcuts.${item.key}`)}</span>
                    <code>{item.combo}</code>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-stack">
                <div className="settings-about-header">
                  <img
                    src="./icon.png"
                    alt={APP_NAME}
                    className="settings-about-icon"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="settings-about-meta">
                    <strong className="settings-about-name">{APP_NAME}</strong>
                    <span className="settings-about-version">{t('about.version', { version: '0.1.0' })}</span>
                  </div>
                </div>
                <p className="settings-copy">{t('about.description')}</p>
                <p className="settings-copy settings-copy-features">{t('about.descFeatures')}</p>
                <p className="settings-copy settings-copy-muted">{t('about.descPrivacy')}</p>
                <div className="settings-links">
                  <button type="button" className="settings-link-btn" onClick={() => void window.electronAPI.openExternal(WEBSITE_URL)}>{t('about.website')}</button>
                  <button type="button" className="settings-link-btn" onClick={() => void window.electronAPI.openExternal(SUPPORT_URL)}>{t('about.support')}</button>
                  <button type="button" className="settings-link-btn" onClick={() => void window.electronAPI.openExternal(PRIVACY_URL)}>{t('about.privacy')}</button>
                  <button type="button" className="settings-link-btn" onClick={() => void window.electronAPI.openExternal(TERMS_URL)}>{t('about.terms')}</button>
                  <button type="button" className="settings-link-btn" onClick={() => void window.electronAPI.openExternal(GITHUB_REPO_URL)}>{t('about.github')}</button>
                </div>
                <p className="settings-copy settings-copy-muted">{t('about.copyright')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
