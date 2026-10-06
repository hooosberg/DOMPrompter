import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const rootDir = process.cwd()
const isCi = process.argv.includes('--ci')

const appPackagePath = join(rootDir, 'packages/app/package.json')
const evidenceDir = join(rootDir, 'reports/mas')
const evidencePath = join(evidenceDir, 'evidence-checklist.md')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8')
}

function checkBranding() {
  const targets = [
    'packages/app/package.json',
    'packages/app/index.html',
    'packages/app/electron/main.ts',
    'packages/app/src/App.tsx',
    'packages/app/src/components/OnboardingWizard.tsx',
  ]

  const failures = []
  for (const relativePath of targets) {
    const fullPath = join(rootDir, relativePath)
    if (!existsSync(fullPath)) {
      failures.push(`${relativePath}: missing`)
      continue
    }
    if (readText(fullPath).includes('Visual Inspector')) {
      failures.push(`${relativePath}: still contains legacy brand`)
    }
  }
  return failures
}

function checkForbiddenPatterns() {
  const checks = [
    {
      file: 'packages/app/electron/main.ts',
      patterns: [
        'child_process',
        'spawn(',
        'CDPClient',
        'discover-cdp-url',
        'inspect-project',
        'select-project-directory',
        'launch-project-session',
        'stop-project-session',
        'launch-electron-app',
        'kill-launched-app',
        'connect-cdp',
        'discover-local-apps',
      ],
    },
    {
      file: 'packages/app/electron/preload.ts',
      patterns: [
        'discoverCDPUrl',
        'connectCDP',
        'discoverLocalApps',
        'selectProjectDirectory',
        'inspectProject',
        'launchProjectSession',
        'stopProjectSession',
        'launchElectronApp',
        'killLaunchedApp',
        'setExternalOverlayState',
        'onLaunchStatus',
        'onAutoConnected',
      ],
    },
    {
      file: 'packages/app/src/types.ts',
      patterns: [
        "'external'",
        'DiscoveredApp',
        'ProjectLaunchCommands',
        'ProjectLaunchCapabilities',
        'ProjectScriptInfo',
        'ProjectInfo',
        'SelectProjectDirectoryOptions',
        'ProjectLaunchStatus',
      ],
    },
    {
      file: 'packages/core/src/index.ts',
      patterns: ['CDPClient', 'discoverLocalApps'],
    },
    {
      file: 'packages/core/src/cdp/connection.ts',
      patterns: ['export class CDPClient'],
    },
  ]

  const failures = []
  for (const check of checks) {
    const filePath = join(rootDir, check.file)
    if (!existsSync(filePath)) {
      failures.push(`${check.file}: missing`)
      continue
    }
    const content = readText(filePath)
    for (const pattern of check.patterns) {
      if (content.includes(pattern)) {
        failures.push(`${check.file}: contains forbidden pattern "${pattern}"`)
      }
    }
  }
  if (existsSync(join(rootDir, 'packages/core/src/app-discovery.ts'))) {
    failures.push('packages/core/src/app-discovery.ts: discovery module still present')
  }
  return failures
}

function checkRequiredFiles() {
  const requiredFiles = [
    'docs/mas-refactor-progress.md',
    'packages/app/src/components/OnboardingWizard.tsx',
    'packages/app/src/components/Settings.tsx',
    'packages/app/src/components/PaywallDialog.tsx',
    'packages/app/src/i18n.ts',
    'packages/app/src/locales/en.json',
    'packages/app/electron/licenseService.ts',
    'packages/app/src/services/LicenseManager.ts',
    'packages/app/src/shared/license.ts',
    'packages/app/build/entitlements.mas.plist',
    'packages/app/build/entitlements.mas.inherit.plist',
    'packages/app/build/en.lproj/InfoPlist.strings',
    'packages/app/build/zh-Hans.lproj/InfoPlist.strings',
    'packages/app/build/zh-Hant.lproj/InfoPlist.strings',
    'packages/app/build/ja.lproj/InfoPlist.strings',
    'packages/app/build/ko.lproj/InfoPlist.strings',
    'packages/app/build/fr.lproj/InfoPlist.strings',
    'packages/app/build/de.lproj/InfoPlist.strings',
    'packages/app/build/es.lproj/InfoPlist.strings',
    'packages/app/build/pt.lproj/InfoPlist.strings',
    'packages/app/build/it.lproj/InfoPlist.strings',
    'packages/app/build/ru.lproj/InfoPlist.strings',
    'packages/app/build/ar.lproj/InfoPlist.strings',
  ]

  return requiredFiles
    .filter((relativePath) => !existsSync(join(rootDir, relativePath)))
    .map((relativePath) => `${relativePath}: missing`)
}

function checkPackageMetadata() {
  const failures = []
  const appPackage = readJson(appPackagePath)
  const build = appPackage.build || {}
  const masReview = appPackage.masReview || build.masReview || {}

  if (!String(appPackage.author || '').trim()) {
    failures.push('packages/app/package.json: author is required for electron-builder packaging')
  }
  if (appPackage.productName !== 'DOMPrompter') {
    failures.push('packages/app/package.json: productName must be DOMPrompter')
  }
  if (!build.appId || build.appId !== 'com.domprompter.app') {
    failures.push('packages/app/package.json: build.appId must be com.domprompter.app')
  }
  if (build.masReview) {
    failures.push('packages/app/package.json: build.masReview is unsupported by electron-builder; move it to top-level masReview')
  }
  if (!masReview.supportUrl || !String(masReview.supportUrl).startsWith('https://')) {
    failures.push('packages/app/package.json: masReview.supportUrl must be an https URL')
  }
  if (!masReview.privacyUrl || !String(masReview.privacyUrl).startsWith('https://')) {
    failures.push('packages/app/package.json: masReview.privacyUrl must be an https URL')
  }
  if (!String(masReview.productId || '').trim()) {
    failures.push('packages/app/package.json: masReview.productId is required')
  }

  return failures
}

const sections = [
  { title: 'Forbidden APIs', failures: checkForbiddenPatterns() },
  { title: 'Required Files', failures: checkRequiredFiles() },
  { title: 'Package Metadata', failures: checkPackageMetadata() },
  { title: 'Branding', failures: checkBranding() },
]

const blockerCount = sections.reduce((sum, section) => sum + section.failures.length, 0)

mkdirSync(evidenceDir, { recursive: true })

const evidenceLines = [
  '# MAS Evidence Checklist',
  '',
  `- Mode: ${isCi ? 'CI' : 'Local'}`,
  `- Timestamp: ${new Date().toISOString()}`,
  `- Blocking issues: ${blockerCount}`,
  '',
]

for (const section of sections) {
  evidenceLines.push(`## ${section.title}`)
  if (section.failures.length === 0) {
    evidenceLines.push('- PASS')
  } else {
    for (const failure of section.failures) {
      evidenceLines.push(`- FAIL: ${failure}`)
    }
  }
  evidenceLines.push('')
}

writeFileSync(evidencePath, evidenceLines.join('\n'))

if (blockerCount > 0) {
  console.error(`[mas:check] ${blockerCount} blocking issue(s) found. Evidence written to ${evidencePath}`)
  process.exit(1)
}

console.log(`[mas:check] PASS. Evidence written to ${evidencePath}`)
