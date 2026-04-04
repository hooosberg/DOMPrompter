import type {
  ElementPreset,
  ExportPromptSummaryMeta,
  InspectedElement,
  PageContextDescriptor,
  PageContextSnapshot,
} from './types'

export interface PageExportElement {
  backendNodeId: number
  selector: string
  displayName: string
  tagName: string
  preset: ElementPreset
  boxModel: {
    width: number | null
    height: number | null
  }
  styleDiff: Record<string, string>
  updatedAt: number
  tags: string[]
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  zh: 'Chinese',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
}

function normalizeWhitespace(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getBasename(pathLike: string) {
  const trimmed = normalizeWhitespace(pathLike).split('#')[0].split('?')[0]
  if (!trimmed) return ''

  const segments = trimmed.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function formatPageLabelFromToken(token: string) {
  const rawToken = normalizeWhitespace(token)
  if (!rawToken) return ''

  const withoutExtension = rawToken.replace(/\.[a-z0-9]+$/i, '')
  if (!withoutExtension || /^(index|home)$/i.test(withoutExtension)) {
    return 'Home'
  }

  return toTitleCase(withoutExtension.replace(/[-_]+/g, ' '))
}

function buildPageToken(snapshot: PageContextSnapshot | null | undefined, pageUrl: string, targetUrl: string) {
  const routeHref = getBasename(snapshot?.activeRouteHref || '')
  if (routeHref) return routeHref

  const pathnameToken = getBasename(snapshot?.pathname || pageUrl || targetUrl)
  if (pathnameToken) return pathnameToken

  return 'current-page'
}

function buildPageLabel(snapshot: PageContextSnapshot | null | undefined, pageTitle: string, pageUrl: string, targetUrl: string) {
  const pathLabel = formatPageLabelFromToken(buildPageToken(snapshot, pageUrl, targetUrl))
  if (pathLabel) return pathLabel

  const activeRouteLabel = normalizeWhitespace(snapshot?.activeRouteLabel)
  if (activeRouteLabel) return activeRouteLabel

  const title = normalizeWhitespace(snapshot?.title || pageTitle)
  if (title) return title

  return 'Current Page'
}

function getLanguageLabel(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value).toLowerCase()
  if (!normalized) return null
  return LANGUAGE_LABELS[normalized] || value || null
}

function normalizeContextToken(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildVariantLabel(snapshot: PageContextSnapshot | null | undefined, pageLabel: string) {
  const preferredLabels = [
    normalizeWhitespace(snapshot?.activeVariantLabel),
    normalizeWhitespace(snapshot?.visibleVariantLabel),
    getLanguageLabel(snapshot?.activeVariantKey),
    getLanguageLabel(snapshot?.visibleVariantKey),
    getLanguageLabel(snapshot?.htmlLang),
  ]

  return preferredLabels.find((label) => label && label !== pageLabel) || null
}

function buildVariantToken(snapshot: PageContextSnapshot | null | undefined, variantLabel: string | null) {
  const preferredTokens = [
    normalizeContextToken(snapshot?.activeVariantKey || ''),
    normalizeContextToken(snapshot?.visibleVariantKey || ''),
    normalizeContextToken(snapshot?.htmlLang || ''),
    normalizeContextToken(variantLabel || ''),
  ]

  return preferredTokens.find(Boolean) || ''
}

function buildSignals(snapshot: PageContextSnapshot | null | undefined) {
  const signals: string[] = []

  const activeRouteHref = getBasename(snapshot?.activeRouteHref || '')
  if (activeRouteHref) {
    signals.push(`route=${activeRouteHref}`)
  }

  const activeVariantLabel = normalizeWhitespace(snapshot?.activeVariantLabel)
  if (activeVariantLabel) {
    signals.push(`activeVariantLabel=${activeVariantLabel}`)
  }

  const htmlLang = normalizeWhitespace(snapshot?.htmlLang)
  if (htmlLang) {
    signals.push(`htmlLang=${htmlLang}`)
  }

  const visibleVariantKey = normalizeWhitespace(snapshot?.visibleVariantKey)
  if (visibleVariantKey) {
    signals.push(`visibleVariant=${visibleVariantKey}`)
  }

  return signals
}

function formatDisplayUrl(value: string) {
  const raw = normalizeWhitespace(value)
  if (!raw) return 'unknown'

  try {
    return decodeURI(raw)
  } catch {
    return raw
  }
}

export function buildPageContextDescriptor(args: {
  snapshot?: PageContextSnapshot | null
  pageTitle: string
  pageUrl: string
  targetUrl: string
}): PageContextDescriptor {
  const { snapshot = null, pageTitle, pageUrl, targetUrl } = args
  const pageToken = buildPageToken(snapshot, pageUrl, targetUrl)
  const pageLabel = buildPageLabel(snapshot, pageTitle, pageUrl, targetUrl)
  const variantLabel = buildVariantLabel(snapshot, pageLabel)
  const variantToken = buildVariantToken(snapshot, variantLabel)

  return {
    contextKey: variantToken ? `${pageToken}::${variantToken}` : pageToken,
    pageLabel,
    variantLabel,
    scopeLabel: variantLabel ? `${pageLabel} / ${variantLabel}` : pageLabel,
    signals: buildSignals(snapshot),
  }
}

function buildElementSelector(element: InspectedElement) {
  const tagName = element.tagName.toLowerCase()
  if (element.id) return `#${element.id}`
  if (element.classNames.length > 0) return `${tagName}.${element.classNames[0]}`
  return tagName
}

export function buildPageExportPrompt(args: {
  appName: string
  currentElement: InspectedElement | null
  elements: PageExportElement[]
  summaryMeta: ExportPromptSummaryMeta
  pageTitle: string
  pageUrl: string
  targetUrl: string
  pageContext: PageContextDescriptor
}) {
  const {
    appName,
    currentElement,
    elements,
    summaryMeta,
    pageTitle,
    pageUrl,
    targetUrl,
    pageContext,
  } = args
  const exportedAt = new Date().toISOString()
  const currentSelection = currentElement
    ? {
        backendNodeId: currentElement.backendNodeId,
        selector: buildElementSelector(currentElement),
      }
    : null

  const payload = {
    source: 'domprompter',
    signalGuide: {
      pageScope: 'Use page.pageLabel, page.variantLabel, page.scopeLabel, and page.signals to stay inside the intended page or localized in-page variant.',
      objectIdentity: 'Each element is identified by selector, preset, tagName, and backendNodeId.',
      styleChanges: 'Structured style edits captured from the visual workbench.',
      intentTags: 'Natural-language goals attached to a selected element.',
      mergeRule: 'Honor styleChanges first, then use intentTags to preserve higher-level intent.',
    },
    page: {
      appName,
      title: pageTitle || 'Untitled Page',
      url: pageUrl || targetUrl || 'unknown',
      exportedAt,
      pageLabel: pageContext.pageLabel,
      variantLabel: pageContext.variantLabel,
      scopeLabel: pageContext.scopeLabel,
      contextKey: pageContext.contextKey,
      signals: pageContext.signals,
      currentSelection,
    },
    elements: elements.map((entry) => ({
      backendNodeId: entry.backendNodeId,
      selector: entry.selector,
      displayName: entry.displayName,
      tagName: entry.tagName,
      preset: entry.preset,
      boxModel: entry.boxModel,
      styleChanges: entry.styleDiff,
      intentTags: entry.tags,
    })),
  }

  const contextSignalsLine = pageContext.signals.length > 0
    ? pageContext.signals.join('; ')
    : 'none'

  const lines = [
    `This is a ${appName} page-level prompt export. Apply the requested UI changes directly in source code.`,
    '',
    'Page information:',
    `- Page: ${pageContext.pageLabel}`,
    `- Variant: ${pageContext.variantLabel || 'default'}`,
    `- Scope: ${pageContext.scopeLabel}`,
    `- Title: ${payload.page.title}`,
    `- URL: ${formatDisplayUrl(payload.page.url)}`,
    `- Context key: ${pageContext.contextKey}`,
    `- Detection signals: ${contextSignalsLine}`,
    `- Exported at: ${exportedAt}`,
    `- Selection anchor: ${currentSelection ? `${currentSelection.selector} (backendNodeId: ${currentSelection.backendNodeId}, secondary hint only)` : 'none'}`,
    '',
    'Execution guidance:',
    '- Modify only the code, styles, or copy related to the listed elements.',
    '- Treat the scope line above as the exact working surface for this prompt.',
    '- Keep the existing DOM structure and naming style whenever possible.',
    '- When styleChanges and intentTags both exist, satisfy styleChanges first.',
    '',
    'Summary:',
    `- Affected elements: ${summaryMeta.elementCount}`,
    `- Elements with style edits: ${summaryMeta.modifiedCount}`,
    `- Tagged elements: ${summaryMeta.taggedElementCount}`,
    `- Tag groups: ${summaryMeta.tagCount}`,
    '',
    'Element targets:',
    ...elements.flatMap((entry, index) => {
      const itemLines = [`${index + 1}. ${entry.selector} (${entry.preset} / <${entry.tagName}>)`]
      if (Object.keys(entry.styleDiff).length > 0) {
        itemLines.push(`   - styleChanges: ${JSON.stringify(entry.styleDiff)}`)
      }
      if (entry.tags.length > 0) {
        itemLines.push(`   - intentTags: ${entry.tags.join('; ')}`)
      }
      return itemLines
    }),
    '',
    'Structured JSON:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ]

  return lines.join('\n')
}
