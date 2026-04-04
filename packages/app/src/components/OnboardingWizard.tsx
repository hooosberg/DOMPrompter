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
  const { t, i18n } = useTranslation()
  const [path, setPath] = useState<OnboardingPath>(null)
  const [serverStep, setServerStep] = useState<ServerStep>(1)
  const [promptCopied, setPromptCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)

  const aiSetupPrompt = useMemo(() => {
    if ((i18n.resolvedLanguage || '').startsWith('zh')) {
      return `我正在使用 DOMPrompter 调试一个网页项目。请帮我把项目的启动脚本适配到 DOMPrompter 的默认调试地址，让我不需要再手动复制粘贴地址，直接点击加载即可开始调试。

请先判断我的项目属于哪种网页项目（React / Vue / Svelte / Next.js / 纯 HTML / 其他前端项目），然后只围绕“网页能在浏览器里启动”这件事修改。优先只改 package.json 里的 scripts，不要改业务逻辑代码。

目标：
- 最终页面可以直接通过 ${defaultUrl} 打开
- DOMPrompter 第 3 步默认地址可以直接加载成功
- 你修改完以后要自己运行并验证成功

请按下面要求处理：

1. 脚本适配
- 确保存在 dev 脚本
- 开发服务器必须监听 localhost
- 优先统一到 ${defaultUrl}
- 如果是 Vite，可使用 vite --host localhost --port 5173
- 如果是 Next.js，可使用 next dev -H localhost -p 5173
- 如果是纯 HTML 且没有 package.json，请创建 package.json，并添加 "dev": "npx serve . -l 5173"

2. 修改限制
- 不要修改业务逻辑代码
- 保留项目原有其他 scripts
- 如果缺少 serve 或其他必需依赖，请直接安装
- 只关注网页调试，不需要处理 Electron、桌面端或 remote debugging 端口

3. 验证步骤必须执行
- 运行 npm run dev（或项目对应包管理器命令）
- 确认终端输出里有 localhost 地址
- 优先确认最终地址就是 ${defaultUrl}
- 确认启动无报错后再停止进程

4. 最终输出必须包含
- 你识别出的网页项目类型
- 你修改了哪些 scripts
- 最终可直接打开的地址
- 你的验证结果
- 如果不能固定为 ${defaultUrl}，明确说明原因，并给出实际可用地址

请直接开始分析并修改。只有你自己验证启动成功后，才算完成。`
    }

    return `I am using DOMPrompter to debug a web project. Please adapt the project's startup scripts to DOMPrompter's default debugging URL so I can click Load directly without manually copying and pasting a URL.

First identify what kind of web project this is (React / Vue / Svelte / Next.js / static HTML / other frontend project), then only focus on one goal: make the webpage start in the browser correctly. Prefer changing only package.json scripts and do not modify business logic.

Goal:
- The page should open directly at ${defaultUrl}
- The default URL in step 3 of DOMPrompter should load successfully
- After making changes, you must run the project and verify it yourself

Requirements:

1. Script adaptation
- Ensure a dev script exists
- The dev server must listen on localhost
- Prefer unifying the final URL to ${defaultUrl}
- For Vite, vite --host localhost --port 5173 is acceptable
- For Next.js, next dev -H localhost -p 5173 is acceptable
- For pure HTML without package.json, create one and add "dev": "npx serve . -l 5173"

2. Constraints
- Do not modify business logic
- Preserve all existing scripts
- If serve or any other required dependency is missing, install it
- Only focus on web debugging. Do not handle Electron, desktop workflows, or remote debugging ports

3. Required verification
- Run npm run dev (or the equivalent package manager command)
- Confirm the terminal prints a localhost URL
- Prefer confirming that the final URL is exactly ${defaultUrl}
- Stop the process only after verifying it starts without errors

4. Final output must include
- The detected web project type
- The scripts you changed
- The final URL that can be opened directly
- Your verification result
- If ${defaultUrl} is not possible, explain why and provide the exact working fallback URL

Start the analysis and make the changes now. The task is only complete after you verify that the web app starts successfully.`
  }, [defaultUrl, i18n.resolvedLanguage])

  const philosophy = useMemo(() => {
    if ((i18n.resolvedLanguage || '').startsWith('zh')) {
      return {
        eyebrow: 'AI 与代码之间',
        title: '把页面微调，变成 AI 能准确执行的说明',
        body: 'DOMPrompter 是一个介于 AI 和专业代码之间的可视化辅助工具。它不直接改源码，而是帮助你标记对象、记录参数变化，并生成可交付给 AI 的结构化提示词。',
        flow: ['标记', '微调', '生成', '交给 AI'],
        footerLead: '精准选择，精确描述变更，再交给 AI 落地。',
        footerBody: '页面内 Overlay 负责即时反馈，属性工作台负责持久记录。这让整个调试过程保持轻、快、可信。',
        modeHint: '选择一种开始方式',
        serverBadge: '默认推荐',
        htmlBadge: '静态页面',
      }
    }

    return {
      eyebrow: 'Between AI And Code',
      title: 'Turn visual tweaks into instructions AI can execute precisely',
      body: 'DOMPrompter is a visual assistant between AI and production code. It does not rewrite source files itself. It helps you mark targets, record parameter changes, and assemble structured prompts that AI can apply correctly.',
      flow: ['Mark', 'Tune', 'Generate', 'Hand To AI'],
      footerLead: 'Select precisely, describe precisely, then hand it to AI.',
      footerBody: 'The page overlay is responsible for immediate feedback. The workbench is responsible for durable state. That keeps the workflow light, fast, and trustworthy.',
      modeHint: 'Choose how you want to begin',
      serverBadge: 'Recommended',
      htmlBadge: 'Static Page',
    }
  }, [i18n.resolvedLanguage])

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
              <span className="wizard-home-note-label">Tip</span>
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
