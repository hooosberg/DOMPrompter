import type {
  ElementPreset,
  ExportPromptSummaryMeta,
  InspectedElement,
  PageContextDescriptor,
  PageContextSnapshot,
} from './types'
import { EXPORT_INCLUDE_DETAILS, EXPORT_INCLUDE_JSON } from './shared/edition'

export interface PageExportElement {
  backendNodeId: number
  selector: string
  displayName: string
  tagName: string
  preset: ElementPreset
  textPreview: string
  identityHints: Record<string, string>
  ancestorPath: string[]
  boxModel: {
    width: number | null
    height: number | null
  }
  styleDiff: Record<string, string>
  updatedAt: number
  tags: string[]
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

function buildPageToken(snapshot: PageContextSnapshot | null | undefined) {
  const routeHref = getBasename(snapshot?.activeRouteHref || '')
  if (routeHref) return routeHref

  const pathnameToken = getBasename(snapshot?.pathname || '')
  if (pathnameToken) return pathnameToken

  const hashRoute = normalizeWhitespace(snapshot?.hashRoute)
  if (hashRoute) return getBasename(hashRoute) || hashRoute

  return ''
}

function buildPageLabel(snapshot: PageContextSnapshot | null | undefined, pageTitle: string) {
  const pageToken = buildPageToken(snapshot)
  const pathLabel = pageToken ? formatPageLabelFromToken(pageToken) : ''
  if (pathLabel) return pathLabel

  const activeRouteLabel = normalizeWhitespace(snapshot?.activeRouteLabel)
  if (activeRouteLabel) return activeRouteLabel

  const pageHeading = normalizeWhitespace(snapshot?.pageHeading)
  if (pageHeading) return pageHeading

  const title = normalizeWhitespace(snapshot?.title || pageTitle)
  if (title) return title

  return 'Current Page'
}

function normalizeContextToken(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSignals(snapshot: PageContextSnapshot | null | undefined, pageLabel: string) {
  const signals: string[] = []

  const activeRouteHref = getBasename(snapshot?.activeRouteHref || '')
  if (activeRouteHref) {
    signals.push(`route=${activeRouteHref}`)
  }

  const hashRoute = normalizeWhitespace(snapshot?.hashRoute)
  if (hashRoute) {
    signals.push(`hashRoute=${hashRoute}`)
  }

  const pageHeading = normalizeWhitespace(snapshot?.pageHeading)
  if (pageHeading && pageHeading !== pageLabel) {
    signals.push(`heading=${pageHeading}`)
  }

  const title = normalizeWhitespace(snapshot?.title)
  if (title && title !== pageLabel && title !== pageHeading) {
    signals.push(`title=${title}`)
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
  const { snapshot = null, pageTitle } = args
  const pageToken = buildPageToken(snapshot)
  const pageLabel = buildPageLabel(snapshot, pageTitle)

  const contextKey = pageToken
    || normalizeContextToken(pageLabel)
    || 'current-page'

  return {
    contextKey,
    pageLabel,
    variantLabel: null,
    scopeLabel: pageLabel,
    signals: buildSignals(snapshot, pageLabel),
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
      pageScope: 'Use page.pageLabel and page.scopeLabel to stay inside the intended page.',
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
      textPreview: entry.textPreview || null,
      identityHints: Object.keys(entry.identityHints).length > 0 ? entry.identityHints : undefined,
      ancestorPath: entry.ancestorPath.length > 0 ? entry.ancestorPath : undefined,
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
      if (entry.textPreview) {
        itemLines.push(`   - textPreview: "${entry.textPreview}"`)
      }
      if (EXPORT_INCLUDE_DETAILS) {
        const hintKeys = Object.keys(entry.identityHints)
        if (hintKeys.length > 0) {
          const hintParts = hintKeys.map((key) => `${key}="${entry.identityHints[key]}"`)
          itemLines.push(`   - identity: ${hintParts.join(', ')}`)
        }
        if (entry.ancestorPath.length > 0) {
          itemLines.push(`   - location: ${entry.ancestorPath.join(' > ')}`)
        }
      }
      if (Object.keys(entry.styleDiff).length > 0) {
        itemLines.push(`   - styleChanges: ${JSON.stringify(entry.styleDiff)}`)
      }
      if (entry.tags.length > 0) {
        itemLines.push(`   - intentTags: ${entry.tags.join('; ')}`)
      }
      return itemLines
    }),
    ...(EXPORT_INCLUDE_JSON ? [
      '',
      'Structured JSON:',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
    ] : []),
  ]

  return lines.join('\n')
}
