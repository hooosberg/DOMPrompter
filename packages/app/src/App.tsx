import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { OnboardingWizard } from './components/OnboardingWizard'
import { PaywallDialog } from './components/PaywallDialog'
import { Settings } from './components/Settings'
import { PropertiesWorkbench } from './components/properties/PropertiesWorkbench'
import { buildPageContextDescriptor, buildPageExportPrompt, type PageExportElement } from './exportPrompt'
import { LicenseManager } from './services/LicenseManager'
import { buildStyleHistorySlotKey, undoPersistedHistory, redoPersistedHistory, resetPersistedHistory, computeStyleDiffFromHistory } from './styleHistory'
import type {
  ActiveEditProperty,
  AppLanguage,
  AppSettings,
  CanvasTool,
  ElementPreset,
  ElementTag,
  ElementTagTarget,
  ExportPromptSummaryMeta,
  GlobalStyleHistoryOperation,
  GlobalStyleHistoryState,
  InspectedElement,
  LicenseStatus,
  OverlayNudgeChange,
  PageEditLedgerEntry,
  PageContextSnapshot,
  PersistedStyleHistoryState,
} from './types'
import './App.css'

const APP_NAME = 'DOMPrompter'
const DEFAULT_WORKBENCH_WIDTH = 320
const DEFAULT_URL = 'http://localhost:5173'
const EMPTY_EXPORT_PROMPT_PREVIEW = 'No page-level edits have been collected yet. Adjust elements on the canvas and DOMPrompter will assemble a page prompt for you.'
const RECENT_HTML_FILES_STORAGE_KEY = 'domprompter:recent-html-files'
const MAX_RECENT_HTML_FILES = 4

function getDefaultTheme() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark' as const
  }

  return 'light' as const
}

function loadRecentHtmlFiles() {
  if (typeof window === 'undefined') {
    return [] as string[]
  }

  try {
    const raw = window.localStorage.getItem(RECENT_HTML_FILES_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_RECENT_HTML_FILES)
  } catch {
    return []
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: getDefaultTheme(),
  language: 'en',
}
const DEFAULT_LICENSE_STATUS: LicenseStatus = {
  isPro: false,
  provider: 'dev-stub',
  lastValidatedAt: null,
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.81 2.68c.25-.95.65-1.18 1.19-1.18s.94.23 1.19 1.18l.21.84c.1.38.42.66.8.74.59.11 1.15.26 1.69.46.36.14.76.07 1.05-.18l.65-.56c.73-.64 1.16-.68 1.52-.32.36.36.32.79-.32 1.52l-.56.65c-.25.29-.32.69-.18 1.05.2.54.35 1.1.46 1.69.08.38.36.7.74.8l.84.21c.95.25 1.18.65 1.18 1.19s-.23.94-1.18 1.19l-.84.21a1 1 0 0 0-.74.8c-.11.59-.26 1.15-.46 1.69-.14.36-.07.76.18 1.05l.56.65c.64.73.68 1.16.32 1.52-.36.36-.79.32-1.52-.32l-.65-.56a.99.99 0 0 0-1.05-.18c-.54.2-1.1.35-1.69.46-.38.08-.7.36-.8.74l-.21.84c-.25.95-.65 1.18-1.19 1.18s-.94-.23-1.19-1.18l-.21-.84a1 1 0 0 0-.8-.74 8.03 8.03 0 0 1-1.69-.46.99.99 0 0 0-1.05.18l-.65.56c-.73.64-1.16.68-1.52.32-.36-.36-.32-.79.32-1.52l.56-.65c.25-.29.32-.69.18-1.05a8.03 8.03 0 0 1-.46-1.69 1 1 0 0 0-.74-.8l-.84-.21c-.95-.25-1.18-.65-1.18-1.19s.23-.94 1.18-1.19l.84-.21c.38-.1.66-.42.74-.8.11-.59.26-1.15.46-1.69.14-.36.07-.76-.18-1.05l-.56-.65c-.64-.73-.68-1.16-.32-1.52.36-.36.79-.32 1.52.32l.65.56c.29.25.69.32 1.05.18.54-.2 1.1-.35 1.69-.46.38-.08.7-.36.8-.74l.21-.84Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <circle cx="12" cy="12" r="3.05" fill="none" stroke="currentColor" strokeWidth="1.45" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 6v5h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M5.6 18.1A8 8 0 0 0 19 11M18.4 5.9A8 8 0 0 0 5 13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

function LoadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M13 8l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <rect x="3.5" y="5.5" width="17" height="13" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
    </svg>
  )
}

function buildElementSelector(element: InspectedElement) {
  if (element.id) return `#${element.id}`
  if (element.classNames.length > 0) return `${element.tagName}.${element.classNames[0]}`
  return element.tagName.toLowerCase()
}

function buildTagTarget(element: InspectedElement): ElementTagTarget {
  return {
    backendNodeId: element.backendNodeId,
    selector: buildElementSelector(element),
    boxModel: element.boxModel,
  }
}

function tagHasTarget(tag: ElementTag, backendNodeId: number) {
  return tag.targets.some((target) => target.backendNodeId === backendNodeId)
}

function hasNestedMarkup(element: InspectedElement) {
  const tags = element.outerHTMLPreview.match(/<([a-z0-9-]+)/gi) || []
  return tags.length > 1
}

function getElementPresetForExport(element: InspectedElement): ElementPreset {
  const display = element.computedStyles.display || ''
  const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)

  if (element.tagName === 'img') return 'image'
  if (isLayoutContainer || hasNestedMarkup(element)) return 'container'
  if (element.textContentPreview && !['img', 'svg'].includes(element.tagName)) return 'text'
  return 'container'
}

function buildLedgerEntry(
  element: InspectedElement,
  styleDiff: Record<string, string> = {},
  updatedAt = Date.now(),
): PageEditLedgerEntry {
  return {
    backendNodeId: element.backendNodeId,
    selector: buildElementSelector(element),
    displayName: buildElementSelector(element),
    tagName: element.tagName.toLowerCase(),
    preset: getElementPresetForExport(element),
    boxModel: {
      width: element.boxModel ? Math.round(element.boxModel.width) : null,
      height: element.boxModel ? Math.round(element.boxModel.height) : null,
    },
    styleDiff,
    updatedAt,
  }
}

function getTagTextsForTarget(tags: ElementTag[], backendNodeId: number) {
  return tags
    .filter((tag) => tagHasTarget(tag, backendNodeId))
    .map((tag) => tag.text.trim())
    .filter(Boolean)
}

function areStyleDiffsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key] === right[key])
}

function buildPageExportElements(
  pageEditLedger: Record<number, PageEditLedgerEntry>,
  tags: ElementTag[],
  currentElement: InspectedElement | null,
): PageExportElement[] {
  const backendNodeIds = new Set<number>()

  Object.values(pageEditLedger).forEach((entry) => {
    backendNodeIds.add(entry.backendNodeId)
  })
  tags.forEach((tag) => {
    tag.targets.forEach((target) => {
      backendNodeIds.add(target.backendNodeId)
    })
  })

  return Array.from(backendNodeIds)
    .map((backendNodeId) => {
      const ledgerEntry = pageEditLedger[backendNodeId]
      const matchingTargets = tags.flatMap((tag) => (
        tag.targets
          .filter((target) => target.backendNodeId === backendNodeId)
          .map((target) => ({ target, createdAt: tag.createdAt }))
      ))
      const fallbackTarget = matchingTargets[0]?.target || null
      const relatedTags = getTagTextsForTarget(tags, backendNodeId)
      const fallbackUpdatedAt = matchingTargets.reduce((max, item) => Math.max(max, item.createdAt), 0)
      const boxModel = ledgerEntry?.boxModel || {
        width: fallbackTarget?.boxModel ? Math.round(fallbackTarget.boxModel.width) : null,
        height: fallbackTarget?.boxModel ? Math.round(fallbackTarget.boxModel.height) : null,
      }

      return {
        backendNodeId,
        selector: ledgerEntry?.selector || fallbackTarget?.selector || `backendNode:${backendNodeId}`,
        displayName: ledgerEntry?.displayName || fallbackTarget?.selector || `backendNode:${backendNodeId}`,
        tagName: ledgerEntry?.tagName || 'element',
        preset: ledgerEntry?.preset || 'container',
        boxModel,
        styleDiff: ledgerEntry?.styleDiff || {},
        updatedAt: ledgerEntry?.updatedAt || fallbackUpdatedAt,
        tags: relatedTags,
      } satisfies PageExportElement
    })
    .filter((entry) => Object.keys(entry.styleDiff).length > 0 || entry.tags.length > 0)
    .sort((left, right) => {
      if (currentElement) {
        if (left.backendNodeId === currentElement.backendNodeId) return -1
        if (right.backendNodeId === currentElement.backendNodeId) return 1
      }
      return right.updatedAt - left.updatedAt
    })
}

function buildExportSummaryMeta(
  elements: PageExportElement[],
  tags: ElementTag[],
): ExportPromptSummaryMeta {
  return {
    elementCount: elements.length,
    modifiedCount: elements.filter((entry) => Object.keys(entry.styleDiff).length > 0).length,
    tagCount: tags.length,
    taggedElementCount: elements.filter((entry) => entry.tags.length > 0).length,
  }
}

function buildTagFromElement(element: InspectedElement, text: string): ElementTag {
  return {
    id: `${element.backendNodeId}-${Date.now()}`,
    targets: [buildTagTarget(element)],
    text,
    createdAt: Date.now(),
  }
}

export default function App() {
  const { t, i18n } = useTranslation()
  const workbenchRef = useRef<HTMLElement | null>(null)
  const addressBarRef = useRef<HTMLInputElement | null>(null)
  const shortcutActionsRef = useRef({
    openSettings: () => {},
    openHtmlFile: () => {},
    reloadPage: () => {},
    forceReload: () => {},
    toggleToolbar: () => {},
    copyPagePrompt: () => {},
    copyElementCSS: () => {},
    focusAddressBar: () => {},
    newWindow: () => {},
    escape: () => {},
    selectParent: () => {},
    selectChild: () => {},
    addTag: () => {},
  })
  const selectedBackendNodeRef = useRef<number | null>(null)
  const activeToolRef = useRef<CanvasTool>('select')
  const tagsRef = useRef<ElementTag[]>([])
  const pageIdentityRef = useRef('')
  const overlayNudgeChangeRef = useRef<OverlayNudgeChange | null>(null)
  const contextKeyRef = useRef('')

  const [url, setUrl] = useState(DEFAULT_URL)
  const [addressBarUrl, setAddressBarUrl] = useState(DEFAULT_URL)
  const [connected, setConnected] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [activeEditProperty, setActiveEditProperty] = useState<ActiveEditProperty | null>(null)
  const [element, setElement] = useState<InspectedElement | null>(null)
  const [tags, setTags] = useState<ElementTag[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [isWorkbenchVisible, setIsWorkbenchVisible] = useState(true)
  const [overlayNudgeTick, setOverlayNudgeTick] = useState(0)
  const [activeEditTick, setActiveEditTick] = useState(0)
  const [pageEditLedger, setPageEditLedger] = useState<Record<number, PageEditLedgerEntry>>({})
  const [pageContextSnapshot, setPageContextSnapshot] = useState<PageContextSnapshot | null>(null)
  const [persistedStyleHistories, setPersistedStyleHistories] = useState<Record<string, PersistedStyleHistoryState>>({})
  const [globalHistory, setGlobalHistory] = useState<GlobalStyleHistoryState>({ operations: [], cursor: 0 })
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(DEFAULT_LICENSE_STATUS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [, setLicenseBusy] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [recentHtmlFiles, setRecentHtmlFiles] = useState<string[]>(() => loadRecentHtmlFiles())

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  useEffect(() => {
    tagsRef.current = tags
  }, [tags])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const nextSettings: AppSettings = {
        theme: await window.electronAPI.settings.get('theme').catch(() => DEFAULT_SETTINGS.theme),
        language: await window.electronAPI.settings.get('language').catch(() => DEFAULT_SETTINGS.language),
      }
      const nextLicenseStatus = await LicenseManager.getStatus().catch(() => DEFAULT_LICENSE_STATUS)

      if (cancelled) return

      setSettings(nextSettings)
      setLicenseStatus(nextLicenseStatus)
      void i18n.changeLanguage(nextSettings.language)
    })()

    return () => {
      cancelled = true
    }
  }, [i18n])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.lang = settings.language
  }, [settings])

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_HTML_FILES_STORAGE_KEY, JSON.stringify(recentHtmlFiles))
    } catch {
      // Ignore local storage failures in restricted environments.
    }
  }, [recentHtmlFiles])

  useEffect(() => {
    if (!connected) {
      void window.electronAPI.setPanelWidth(DEFAULT_WORKBENCH_WIDTH)
      return
    }

    if (!isWorkbenchVisible) {
      void window.electronAPI.setPanelWidth(0)
      return
    }

    const panel = workbenchRef.current
    if (!panel) {
      void window.electronAPI.setPanelWidth(DEFAULT_WORKBENCH_WIDTH)
      return
    }

    const syncPanelWidth = () => {
      const panelWidth = Math.round(panel.getBoundingClientRect().width)
      void window.electronAPI.setPanelWidth(panelWidth)
    }

    syncPanelWidth()

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => syncPanelWidth())
      : null

    observer?.observe(panel)
    window.addEventListener('resize', syncPanelWidth)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncPanelWidth)
    }
  }, [connected, isWorkbenchVisible])

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }, [])

  const copyText = useCallback(async (text: string, successMessage: string) => {
    await navigator.clipboard.writeText(text)
    flash(successMessage)
  }, [flash])

  const refreshLicenseStatus = useCallback(async () => {
    const nextStatus = await LicenseManager.getStatus()
    setLicenseStatus(nextStatus)
    return nextStatus
  }, [])

  const refreshPageContextSnapshot = useCallback(async () => {
    try {
      const snapshot = await window.electronAPI.getPageContextSnapshot()
      setPageContextSnapshot(snapshot)
      return snapshot
    } catch (error) {
      console.warn('Failed to refresh page context snapshot:', error)
      return null
    }
  }, [])

  const updatePageEditLedger = useCallback((
    updater: (current: Record<number, PageEditLedgerEntry>) => Record<number, PageEditLedgerEntry>,
  ) => {
    setPageEditLedger((current) => updater(current))
  }, [])

  const resetInspectorState = useCallback(() => {
    selectedBackendNodeRef.current = null
    overlayNudgeChangeRef.current = null
    tagsRef.current = []
    setActiveEditProperty(null)
    setActiveEditTick(0)
    setElement(null)
    setTags([])
    setPageEditLedger({})
  }, [])

  const syncCurrentElement = useCallback((selectedElement: InspectedElement) => {
    if (selectedBackendNodeRef.current !== selectedElement.backendNodeId) {
      selectedBackendNodeRef.current = selectedElement.backendNodeId
      setSelectionRevision((revision) => revision + 1)
    }

    const nextTags = tagsRef.current.map((tag) => (
      tagHasTarget(tag, selectedElement.backendNodeId)
        ? {
            ...tag,
            targets: tag.targets.map((target) => (
              target.backendNodeId === selectedElement.backendNodeId
                ? {
                    ...target,
                    selector: buildElementSelector(selectedElement),
                    boxModel: selectedElement.boxModel,
                  }
                : target
            )),
          }
        : tag
    ))
    tagsRef.current = nextTags
    setElement(selectedElement)
    setTags(nextTags)
    updatePageEditLedger((current) => {
      const existingEntry = current[selectedElement.backendNodeId]
      const relatedTags = getTagTextsForTarget(nextTags, selectedElement.backendNodeId)

      if (!existingEntry && relatedTags.length === 0) {
        return current
      }

      return {
        ...current,
        [selectedElement.backendNodeId]: {
          ...(existingEntry || buildLedgerEntry(selectedElement)),
          selector: buildElementSelector(selectedElement),
          displayName: buildElementSelector(selectedElement),
          tagName: selectedElement.tagName.toLowerCase(),
          preset: getElementPresetForExport(selectedElement),
          boxModel: {
            width: selectedElement.boxModel ? Math.round(selectedElement.boxModel.width) : null,
            height: selectedElement.boxModel ? Math.round(selectedElement.boxModel.height) : null,
          },
        },
      }
    })
  }, [updatePageEditLedger])

  const handleUpsertTag = useCallback((targetElement: InspectedElement, text: string, tagId?: string) => {
    const trimmedText = text.trim()
    const latestTags = tagsRef.current
    const existingTag = tagId
      ? latestTags.find((tag) => tag.id === tagId) || null
      : latestTags.find((tag) => tagHasTarget(tag, targetElement.backendNodeId)) || null

    if (!trimmedText) {
      if (!existingTag) {
        return
      }

      // Record tag deletion in global history
      setGlobalHistory((prev) => {
        const ops = prev.operations.slice(0, prev.cursor)
        ops.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          backendNodeId: targetElement.backendNodeId,
          contextKey: contextKeyRef.current,
          selector: '',
          createdAt: Date.now(),
          kind: 'tag-delete',
          tagSnapshot: { before: { ...existingTag, targets: [...existingTag.targets] }, after: null },
        })
        return { operations: ops, cursor: ops.length }
      })

      const nextTags = latestTags.filter((tag) => tag.id !== existingTag.id)
      tagsRef.current = nextTags
      setTags(nextTags)
      updatePageEditLedger((current) => {
        const existingEntry = current[targetElement.backendNodeId]
        const nextTagTexts = getTagTextsForTarget(nextTags, targetElement.backendNodeId)

        if (!existingEntry) {
          return current
        }

        if (Object.keys(existingEntry.styleDiff).length === 0 && nextTagTexts.length === 0) {
          const nextLedger = { ...current }
          delete nextLedger[targetElement.backendNodeId]
          return nextLedger
        }

        return {
          ...current,
          [targetElement.backendNodeId]: {
            ...buildLedgerEntry(targetElement, existingEntry.styleDiff, existingEntry.updatedAt),
            updatedAt: Date.now(),
          },
        }
      })
      return
    }

    const nextTarget = buildTagTarget(targetElement)
    const nextTag = existingTag
      ? {
          ...existingTag,
          createdAt: Date.now(),
          text: trimmedText,
          targets: tagHasTarget(existingTag, targetElement.backendNodeId)
            ? existingTag.targets
            : [...existingTag.targets, nextTarget],
        }
      : buildTagFromElement(targetElement, trimmedText)

    // Record tag upsert in global history
    setGlobalHistory((prev) => {
      const ops = prev.operations.slice(0, prev.cursor)
      ops.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        backendNodeId: targetElement.backendNodeId,
        contextKey: contextKeyRef.current,
        selector: '',
        createdAt: Date.now(),
        kind: 'tag-upsert',
        tagSnapshot: {
          before: existingTag ? { ...existingTag, targets: [...existingTag.targets] } : null,
          after: { ...nextTag, targets: [...nextTag.targets] },
        },
      })
      return { operations: ops, cursor: ops.length }
    })

    const nextTags = !existingTag
      ? [...latestTags, nextTag]
      : latestTags.map((tag) => (
          tag.id === existingTag.id
            ? nextTag
            : tag
        ))
    tagsRef.current = nextTags
    setTags(nextTags)
    updatePageEditLedger((current) => {
      const existingEntry = current[targetElement.backendNodeId]
      return {
        ...current,
        [targetElement.backendNodeId]: {
          ...(existingEntry || buildLedgerEntry(targetElement)),
          styleDiff: existingEntry?.styleDiff || {},
          updatedAt: Date.now(),
        },
      }
    })
  }, [updatePageEditLedger])

  const handleDeleteTag = useCallback((tagId: string) => {
    const removedTag = tagsRef.current.find((tag) => tag.id === tagId) || null
    if (!removedTag) return

    // Record tag deletion in global history (use first target's backendNodeId)
    const primaryTarget = removedTag.targets[0]
    if (primaryTarget) {
      setGlobalHistory((prev) => {
        const ops = prev.operations.slice(0, prev.cursor)
        ops.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          backendNodeId: primaryTarget.backendNodeId,
          contextKey: contextKeyRef.current,
          selector: '',
          createdAt: Date.now(),
          kind: 'tag-delete',
          tagSnapshot: { before: { ...removedTag, targets: [...removedTag.targets] }, after: null },
        })
        return { operations: ops, cursor: ops.length }
      })
    }

    const nextTags = tagsRef.current.filter((tag) => tag.id !== tagId)
    tagsRef.current = nextTags
    setTags(nextTags)
    updatePageEditLedger((current) => {
      const nextLedger = { ...current }
      removedTag.targets.forEach((target) => {
        const existingEntry = nextLedger[target.backendNodeId]
        if (!existingEntry) return
        const nextTagTexts = getTagTextsForTarget(nextTags, target.backendNodeId)
        if (Object.keys(existingEntry.styleDiff).length === 0 && nextTagTexts.length === 0) {
          delete nextLedger[target.backendNodeId]
          return
        }

        nextLedger[target.backendNodeId] = {
          ...existingEntry,
          updatedAt: Date.now(),
        }
      })
      return nextLedger
    })
    flash(t('toast.tagRemoved'))
  }, [flash, t, updatePageEditLedger])

  const handleElementStyleDiffChange = useCallback((
    targetElement: InspectedElement,
    styleDiff: Record<string, string>,
  ) => {
    updatePageEditLedger((current) => {
      const existingEntry = current[targetElement.backendNodeId]
      const nextTagTexts = getTagTextsForTarget(tagsRef.current, targetElement.backendNodeId)
      const hasStyleDiff = Object.keys(styleDiff).length > 0

      if (!hasStyleDiff && nextTagTexts.length === 0) {
        if (!existingEntry) return current
        const nextLedger = { ...current }
        delete nextLedger[targetElement.backendNodeId]
        return nextLedger
      }

      if (
        existingEntry
        && areStyleDiffsEqual(existingEntry.styleDiff, styleDiff)
        && existingEntry.selector === buildElementSelector(targetElement)
        && existingEntry.tagName === targetElement.tagName.toLowerCase()
        && existingEntry.boxModel.width === (targetElement.boxModel ? Math.round(targetElement.boxModel.width) : null)
        && existingEntry.boxModel.height === (targetElement.boxModel ? Math.round(targetElement.boxModel.height) : null)
      ) {
        return current
      }

      return {
        ...current,
        [targetElement.backendNodeId]: buildLedgerEntry(targetElement, styleDiff, Date.now()),
      }
    })
  }, [updatePageEditLedger])

  const pageExportElements = useMemo(
    () => buildPageExportElements(pageEditLedger, tags, element),
    [element, pageEditLedger, tags],
  )
  const exportSummaryMeta = useMemo(
    () => buildExportSummaryMeta(pageExportElements, tags),
    [pageExportElements, tags],
  )
  const previewPageContext = useMemo(
    () => buildPageContextDescriptor({
      snapshot: pageContextSnapshot,
      pageTitle,
      pageUrl,
      targetUrl: url,
    }),
    [pageContextSnapshot, pageTitle, pageUrl, url],
  )
  contextKeyRef.current = previewPageContext.contextKey
  const activePersistedStyleHistoryKey = useMemo(() => {
    if (!element) return null
    return buildStyleHistorySlotKey(previewPageContext.contextKey, element.backendNodeId)
  }, [element, previewPageContext.contextKey])
  const activePersistedStyleHistory = useMemo(() => {
    if (!activePersistedStyleHistoryKey) return null
    return persistedStyleHistories[activePersistedStyleHistoryKey] || null
  }, [activePersistedStyleHistoryKey, persistedStyleHistories])
  const handlePersistedStyleHistoryChange = useCallback((history: PersistedStyleHistoryState | null) => {
    if (!activePersistedStyleHistoryKey || !history) return

    setPersistedStyleHistories((current) => ({
      ...current,
      [activePersistedStyleHistoryKey]: history,
    }))
  }, [activePersistedStyleHistoryKey])

  // --- Global history ---
  const handleGlobalHistoryCommit = useCallback((info: { backendNodeId: number; kind: 'commit' | 'external' | 'reset' }) => {
    const contextKey = previewPageContext.contextKey
    setGlobalHistory((prev) => {
      const ops = prev.operations.slice(0, prev.cursor)
      const op: GlobalStyleHistoryOperation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        backendNodeId: info.backendNodeId,
        contextKey,
        selector: '',
        createdAt: Date.now(),
        kind: info.kind,
      }
      ops.push(op)
      return { operations: ops, cursor: ops.length }
    })
  }, [previewPageContext.contextKey])

  const globalCanUndo = globalHistory.cursor > 0
  const globalCanRedo = globalHistory.cursor < globalHistory.operations.length
  const globalCanReset = globalHistory.cursor > 0

  const applyTagSnapshot = useCallback((targetTags: ElementTag[], snapshot: { before: ElementTag | null; after: ElementTag | null }, direction: 'undo' | 'redo') => {
    // For undo: restore 'before' state; for redo: restore 'after' state
    const restoreTag = direction === 'undo' ? snapshot.before : snapshot.after
    const removeTag = direction === 'undo' ? snapshot.after : snapshot.before

    let nextTags = [...targetTags]

    // Remove the tag that was applied
    if (removeTag) {
      nextTags = nextTags.filter((tag) => tag.id !== removeTag.id)
    }

    // Add back the tag to restore
    if (restoreTag) {
      const existingIndex = nextTags.findIndex((tag) => tag.id === restoreTag.id)
      if (existingIndex >= 0) {
        nextTags[existingIndex] = restoreTag
      } else {
        nextTags.push(restoreTag)
      }
    }

    return nextTags
  }, [])

  const syncLedgerAfterStyleUndo = useCallback((backendNodeId: number, nextPersisted: PersistedStyleHistoryState) => {
    const nextStyleDiff = computeStyleDiffFromHistory(nextPersisted)
    updatePageEditLedger((current) => {
      const existingEntry = current[backendNodeId]
      const nextTagTexts = getTagTextsForTarget(tagsRef.current, backendNodeId)
      const hasStyleDiff = Object.keys(nextStyleDiff).length > 0

      if (!hasStyleDiff && nextTagTexts.length === 0) {
        if (!existingEntry) return current
        const nextLedger = { ...current }
        delete nextLedger[backendNodeId]
        return nextLedger
      }

      if (!existingEntry) return current
      return {
        ...current,
        [backendNodeId]: { ...existingEntry, styleDiff: nextStyleDiff, updatedAt: Date.now() },
      }
    })
  }, [updatePageEditLedger])

  const syncLedgerAfterTagChange = useCallback((backendNodeId: number, nextTags: ElementTag[]) => {
    updatePageEditLedger((current) => {
      const existingEntry = current[backendNodeId]
      const nextTagTexts = getTagTextsForTarget(nextTags, backendNodeId)

      if (!existingEntry) {
        // If there are tags but no entry, we can't create one without element info
        return current
      }

      if (Object.keys(existingEntry.styleDiff).length === 0 && nextTagTexts.length === 0) {
        const nextLedger = { ...current }
        delete nextLedger[backendNodeId]
        return nextLedger
      }

      return {
        ...current,
        [backendNodeId]: { ...existingEntry, updatedAt: Date.now() },
      }
    })
  }, [updatePageEditLedger])

  const handleGlobalUndo = useCallback(async () => {
    if (globalHistory.cursor <= 0) return

    const op = globalHistory.operations[globalHistory.cursor - 1]

    // Handle tag operations
    if ((op.kind === 'tag-upsert' || op.kind === 'tag-delete') && op.tagSnapshot) {
      const nextTags = applyTagSnapshot(tagsRef.current, op.tagSnapshot, 'undo')
      tagsRef.current = nextTags
      setTags(nextTags)
      syncLedgerAfterTagChange(op.backendNodeId, nextTags)
      setGlobalHistory((prev) => ({ ...prev, cursor: prev.cursor - 1 }))
      return
    }

    // Handle style operations
    const slotKey = buildStyleHistorySlotKey(op.contextKey, op.backendNodeId)
    const persisted = persistedStyleHistories[slotKey]
    if (!persisted) return

    const result = undoPersistedHistory(persisted)
    if (!result) return

    const el = await window.electronAPI.inspectElementByBackendId({ backendNodeId: op.backendNodeId })
    if (el) {
      await window.electronAPI.updateElementStyles({
        nodeId: el.nodeId,
        backendNodeId: el.backendNodeId,
        styles: result.undoPatch,
      })

      if (element?.backendNodeId === op.backendNodeId) {
        const refreshed = await window.electronAPI.inspectElementByBackendId({ backendNodeId: op.backendNodeId })
        if (refreshed) setElement(refreshed)
      }
    }

    setPersistedStyleHistories((current) => ({
      ...current,
      [slotKey]: result.next,
    }))

    // Sync ledger for prompt export
    syncLedgerAfterStyleUndo(op.backendNodeId, result.next)

    if (element?.backendNodeId === op.backendNodeId) {
      setSelectionRevision((r) => r + 1)
    }

    setGlobalHistory((prev) => ({ ...prev, cursor: prev.cursor - 1 }))
  }, [globalHistory, persistedStyleHistories, element, applyTagSnapshot, syncLedgerAfterTagChange, syncLedgerAfterStyleUndo])

  const handleGlobalRedo = useCallback(async () => {
    if (globalHistory.cursor >= globalHistory.operations.length) return

    const op = globalHistory.operations[globalHistory.cursor]

    // Handle tag operations
    if ((op.kind === 'tag-upsert' || op.kind === 'tag-delete') && op.tagSnapshot) {
      const nextTags = applyTagSnapshot(tagsRef.current, op.tagSnapshot, 'redo')
      tagsRef.current = nextTags
      setTags(nextTags)
      syncLedgerAfterTagChange(op.backendNodeId, nextTags)
      setGlobalHistory((prev) => ({ ...prev, cursor: prev.cursor + 1 }))
      return
    }

    // Handle style operations
    const slotKey = buildStyleHistorySlotKey(op.contextKey, op.backendNodeId)
    const persisted = persistedStyleHistories[slotKey]
    if (!persisted) return

    const result = redoPersistedHistory(persisted)
    if (!result) return

    const el = await window.electronAPI.inspectElementByBackendId({ backendNodeId: op.backendNodeId })
    if (el) {
      await window.electronAPI.updateElementStyles({
        nodeId: el.nodeId,
        backendNodeId: el.backendNodeId,
        styles: result.redoPatch,
      })

      if (element?.backendNodeId === op.backendNodeId) {
        const refreshed = await window.electronAPI.inspectElementByBackendId({ backendNodeId: op.backendNodeId })
        if (refreshed) setElement(refreshed)
      }
    }

    setPersistedStyleHistories((current) => ({
      ...current,
      [slotKey]: result.next,
    }))

    // Sync ledger for prompt export
    syncLedgerAfterStyleUndo(op.backendNodeId, result.next)

    if (element?.backendNodeId === op.backendNodeId) {
      setSelectionRevision((r) => r + 1)
    }

    setGlobalHistory((prev) => ({ ...prev, cursor: prev.cursor + 1 }))
  }, [globalHistory, persistedStyleHistories, element, applyTagSnapshot, syncLedgerAfterTagChange, syncLedgerAfterStyleUndo])

  const handleGlobalReset = useCallback(async () => {
    if (globalHistory.cursor <= 0) return

    // Reset styles: collect all unique elements with style changes
    const affectedSlots = new Map<string, { backendNodeId: number }>()
    for (let i = 0; i < globalHistory.cursor; i++) {
      const op = globalHistory.operations[i]
      if (op.kind === 'tag-upsert' || op.kind === 'tag-delete') continue
      const slotKey = buildStyleHistorySlotKey(op.contextKey, op.backendNodeId)
      affectedSlots.set(slotKey, { backendNodeId: op.backendNodeId })
    }

    for (const [slotKey, { backendNodeId }] of affectedSlots) {
      const persisted = persistedStyleHistories[slotKey]
      if (!persisted) continue

      const result = resetPersistedHistory(persisted)
      if (!result) continue

      const el = await window.electronAPI.inspectElementByBackendId({ backendNodeId })
      if (el) {
        await window.electronAPI.updateElementStyles({
          nodeId: el.nodeId,
          backendNodeId: el.backendNodeId,
          styles: result.resetPatch,
        })
      }
    }

    // Delete all persisted histories so useStyleBinding starts fresh
    // (new baseline = current computed styles, guaranteed empty diff)
    setPersistedStyleHistories({})

    // Reset tags: clear all tags
    tagsRef.current = []
    setTags([])

    // Clear ledger entirely
    setPageEditLedger({})

    // Refresh current element — useStyleBinding will create a fresh baseline
    if (element) {
      const refreshed = await window.electronAPI.inspectElementByBackendId({ backendNodeId: element.backendNodeId })
      if (refreshed) setElement(refreshed)
      setSelectionRevision((r) => r + 1)
    }

    setGlobalHistory({ operations: globalHistory.operations, cursor: 0 })
  }, [globalHistory, persistedStyleHistories, element])

  const canExportPrompt = exportSummaryMeta.elementCount > 0
  const exportPromptPreview = useMemo(() => {
    if (!canExportPrompt) {
      return EMPTY_EXPORT_PROMPT_PREVIEW
    }

    return buildPageExportPrompt({
      appName: APP_NAME,
      currentElement: element,
      elements: pageExportElements,
      summaryMeta: exportSummaryMeta,
      pageTitle,
      pageUrl,
      targetUrl: url,
      pageContext: previewPageContext,
    })
  }, [canExportPrompt, element, exportSummaryMeta, pageExportElements, pageTitle, pageUrl, previewPageContext, url])

  const connectToTarget = useCallback(async (rawTarget: string, successMessage: string) => {
    if (!rawTarget.trim()) return false

    let nextUrl = rawTarget.trim()
    if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://') && !nextUrl.startsWith('file://')) {
      nextUrl = `http://${nextUrl}`
    }

    pageIdentityRef.current = ''
    setPageTitle('')
    setPageUrl('')
    setPageContextSnapshot(null)
    setPersistedStyleHistories({})
    resetInspectorState()
    setIsConnecting(true)

    try {
      const loaded = await window.electronAPI.loadUrl(nextUrl)
      if (!loaded) {
        flash(t('toast.loadFailed'))
        setIsConnecting(false)
        return false
      }

      await new Promise((resolve) => window.setTimeout(resolve, nextUrl.startsWith('file://') ? 1000 : 1500))
      const attached = await window.electronAPI.attachDebugger()
      if (!attached) {
        flash(t('toast.debuggerFailed'))
        setIsConnecting(false)
        return false
      }

      setUrl(nextUrl)
      setAddressBarUrl(nextUrl)
      setConnected(true)
      setSettingsOpen(false)
      setShowOnboarding(false)
      setIsWorkbenchVisible(true)
      await window.electronAPI.setBuiltinViewInteractive(true)
      flash(successMessage)
      setIsConnecting(false)
      return true
    } catch (error) {
      console.error(error)
      flash(t('toast.connectionFailed'))
      setIsConnecting(false)
      return false
    }
  }, [flash, resetInspectorState, t])

  useEffect(() => {
    window.electronAPI.onElementSelected((selectedElement, meta) => {
      void refreshPageContextSnapshot()
      if (meta?.nudge && meta?.nudgeChange) {
        overlayNudgeChangeRef.current = meta.nudgeChange
        setOverlayNudgeTick((tick) => tick + 1)
        setElement(selectedElement)
        return
      }
      if (activeToolRef.current === 'browse') {
        setActiveTool('select')
      }
      syncCurrentElement(selectedElement)
    })

    window.electronAPI.onPropertyActivated((property) => {
      setActiveEditProperty(property)
      setActiveEditTick((tick) => tick + 1)
    })

    window.electronAPI.onContextAction((action) => {
      if (action === 'select-parent') shortcutActionsRef.current.selectParent()
      else if (action === 'select-child') shortcutActionsRef.current.selectChild()
      else if (action === 'add-tag') shortcutActionsRef.current.addTag()
    })

    window.electronAPI.onBrowserViewLoaded((info) => {
      const nextTitle = info.title || info.url
      const nextUrl = info.url || ''
      const nextIdentity = `${nextUrl}::${nextTitle}`

      if (pageIdentityRef.current && pageIdentityRef.current !== nextIdentity) {
        resetInspectorState()
      }

      pageIdentityRef.current = nextIdentity
      setPageTitle(nextTitle)
      setPageUrl(nextUrl)
      setAddressBarUrl(nextUrl || addressBarUrl)
      setUrl(nextUrl || url)
      void refreshPageContextSnapshot()
    })

    return () => window.electronAPI.removeAllListeners()
  }, [addressBarUrl, refreshPageContextSnapshot, resetInspectorState, syncCurrentElement, url])

  useEffect(() => {
    if (!connected) return

    let cancelled = false

    void (async () => {
      await window.electronAPI.startInspect()
      if (cancelled) return
      await window.electronAPI.overlay.sync({
        tool: activeToolRef.current,
        tags: tagsRef.current,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [connected])

  useEffect(() => {
    if (!connected) return
    void window.electronAPI.setBuiltinViewInteractive(!(settingsOpen || paywallOpen))
  }, [connected, paywallOpen, settingsOpen])

  useEffect(() => {
    if (!connected) return
    void window.electronAPI.overlay.sync({
      tool: activeTool,
      tags,
    })
  }, [activeTool, connected, tags])

  useEffect(() => {
    if (!connected || activeTool === 'browse') return
    void window.electronAPI.setActiveEditProperty(activeEditProperty)
  }, [activeEditProperty, activeTool, connected])

  const handleLoadUrl = useCallback((targetUrl: string) => {
    void connectToTarget(targetUrl, t('toast.connected'))
  }, [connectToTarget, t])

  const rememberRecentHtmlFile = useCallback((filePath: string) => {
    setRecentHtmlFiles((current) => (
      [filePath, ...current.filter((item) => item !== filePath)].slice(0, MAX_RECENT_HTML_FILES)
    ))
  }, [])

  const handleLoadHtmlFile = useCallback(async (providedFilePath?: string) => {
    try {
      const filePath = providedFilePath || await window.electronAPI.selectHtmlFile()
      if (!filePath) return

      const loaded = await connectToTarget(`file://${filePath}`, t('toast.htmlOpened'))
      if (loaded) {
        rememberRecentHtmlFile(filePath)
      }
    } catch (error) {
      console.error(error)
      flash(t('toast.htmlFailed'))
    }
  }, [connectToTarget, flash, rememberRecentHtmlFile, t])

  const handleRefresh = useCallback(() => {
    const target = connected ? url : (addressBarUrl || url)
    if (!target) return
    void connectToTarget(target, t('toast.pageRefreshed'))
  }, [addressBarUrl, connectToTarget, connected, t, url])

  const handleLoadFromAddressBar = useCallback(() => {
    if (!addressBarUrl.trim()) return
    handleLoadUrl(addressBarUrl)
  }, [addressBarUrl, handleLoadUrl])
  const handleAddressClipboardEvent = useCallback((event: ClipboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
  }, [])
  const handleAddressPaste = useCallback((event: ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData('text')
    if (!pastedValue) return

    event.preventDefault()
    event.stopPropagation()
    setAddressBarUrl(pastedValue)

    window.requestAnimationFrame(() => {
      const input = addressBarRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(pastedValue.length, pastedValue.length)
    })
  }, [])

  const handleCloseConnection = useCallback(async () => {
    await window.electronAPI.disconnect()
    setConnected(false)
    setIsConnecting(false)
    setSettingsOpen(false)
    setShowOnboarding(true)
    setActiveTool('select')
    setActiveEditProperty(null)
    setPageTitle('')
    setPageUrl('')
    setPageContextSnapshot(null)
    setPersistedStyleHistories({})
    setIsWorkbenchVisible(true)
    pageIdentityRef.current = ''
    resetInspectorState()
  }, [resetInspectorState])

  const handleCopyExportPrompt = useCallback(async () => {
    if (!canExportPrompt) {
      flash(t('toast.noPrompt'))
      return
    }

    const access = LicenseManager.checkFeatureAccess('page-export', licenseStatus)
    if (!access.allowed) {
      if (connected) {
        void window.electronAPI.setBuiltinViewInteractive(false)
      }
      setPaywallOpen(true)
      return
    }

    let livePageContextSnapshot: PageContextSnapshot | null = null
    try {
      livePageContextSnapshot = await window.electronAPI.getPageContextSnapshot()
      setPageContextSnapshot(livePageContextSnapshot)
    } catch (error) {
      console.warn('Failed to read page context snapshot for export prompt:', error)
    }

    const livePageContext = buildPageContextDescriptor({
      snapshot: livePageContextSnapshot,
      pageTitle,
      pageUrl,
      targetUrl: url,
    })

    const livePrompt = buildPageExportPrompt({
      appName: APP_NAME,
      currentElement: element,
      elements: pageExportElements,
      summaryMeta: exportSummaryMeta,
      pageTitle,
      pageUrl,
      targetUrl: url,
      pageContext: livePageContext,
    })

    await copyText(livePrompt, t('toast.promptCopied'))
  }, [canExportPrompt, connected, copyText, element, exportSummaryMeta, flash, licenseStatus, pageExportElements, pageTitle, pageUrl, t, url])

  const handleCopyElementCSS = useCallback(async () => {
    if (!element) return
    const css = await window.electronAPI.generateCSS(element)
    await copyText(css, 'Element CSS copied')
  }, [copyText, element])

  const handleThemeChange = useCallback((theme: AppSettings['theme']) => {
    setSettings((current) => ({ ...current, theme }))
    void window.electronAPI.settings.set('theme', theme)
  }, [])

  const handleLanguageChange = useCallback((language: AppLanguage) => {
    setSettings((current) => ({ ...current, language }))
    void window.electronAPI.settings.set('language', language)
    void window.electronAPI.menu.changeLanguage(language)
    void i18n.changeLanguage(language)
  }, [i18n])

  const handlePurchase = useCallback(async () => {
    setLicenseBusy(true)
    try {
      const result = await LicenseManager.purchase()
      if (!result.success) {
        flash(result.error || 'Purchase failed.')
        return
      }

      await refreshLicenseStatus()
      setPaywallOpen(false)
      flash('Pro unlocked')
    } finally {
      setLicenseBusy(false)
    }
  }, [flash, refreshLicenseStatus])

  const handleRestore = useCallback(async () => {
    setLicenseBusy(true)
    try {
      const result = await LicenseManager.restore()
      if (!result.success) {
        flash(result.error || 'Restore failed.')
        return
      }

      await refreshLicenseStatus()
      setPaywallOpen(false)
      flash('Purchase restored')
    } finally {
      setLicenseBusy(false)
    }
  }, [flash, refreshLicenseStatus])

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen((prev) => {
      const next = !prev
      if (connected) {
        void window.electronAPI.setBuiltinViewInteractive(!next)
      }
      return next
    })
  }, [connected])

  const handleSelectParent = useCallback(async () => {
    if (!element) return
    const parent = await window.electronAPI.selectParentElement({ backendNodeId: element.backendNodeId })
    if (parent) {
      syncCurrentElement(parent)
    }
  }, [element, syncCurrentElement])

  const handleSelectChild = useCallback(async () => {
    if (!element) return
    const child = await window.electronAPI.selectFirstChildElement({ backendNodeId: element.backendNodeId })
    if (child) {
      syncCurrentElement(child)
    }
  }, [element, syncCurrentElement])

  const handleContextMenuAddTag = useCallback(() => {
    if (!element) return
    if (!isWorkbenchVisible) {
      setIsWorkbenchVisible(true)
    }
    // Scroll to tag section after workbench opens
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const labelSection = document.querySelector('.label-section')
        if (labelSection) {
          labelSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const input = labelSection.querySelector<HTMLInputElement>('.label-input')
          if (input) input.focus()
        }
      })
    })
  }, [element, isWorkbenchVisible])

  shortcutActionsRef.current = {
    openSettings: () => setSettingsOpen(true),
    openHtmlFile: () => {
      void handleLoadHtmlFile()
    },
    reloadPage: handleRefresh,
    forceReload: handleRefresh,
    toggleToolbar: () => setIsWorkbenchVisible((visible) => !visible),
    copyPagePrompt: () => {
      void handleCopyExportPrompt()
    },
    copyElementCSS: () => {
      void handleCopyElementCSS()
    },
    focusAddressBar: () => {
      addressBarRef.current?.focus()
      addressBarRef.current?.select()
    },
    newWindow: () => {},
    escape: () => {
      setPaywallOpen(false)
      setSettingsOpen(false)
      setActiveEditProperty(null)
    },
    selectParent: () => { void handleSelectParent() },
    selectChild: () => { void handleSelectChild() },
    addTag: () => { handleContextMenuAddTag() },
  }

  useEffect(() => {
    window.electronAPI.shortcuts.onOpenSettings(() => shortcutActionsRef.current.openSettings())
    window.electronAPI.shortcuts.onOpenHtmlFile(() => shortcutActionsRef.current.openHtmlFile())
    window.electronAPI.shortcuts.onReloadPage(() => shortcutActionsRef.current.reloadPage())
    window.electronAPI.shortcuts.onForceReload(() => shortcutActionsRef.current.forceReload())
    window.electronAPI.shortcuts.onToggleToolbar(() => shortcutActionsRef.current.toggleToolbar())
    window.electronAPI.shortcuts.onCopyPagePrompt(() => shortcutActionsRef.current.copyPagePrompt())
    window.electronAPI.shortcuts.onCopyElementCSS(() => shortcutActionsRef.current.copyElementCSS())
    window.electronAPI.shortcuts.onFocusAddressBar(() => shortcutActionsRef.current.focusAddressBar())
    window.electronAPI.shortcuts.onNewWindow(() => shortcutActionsRef.current.newWindow())
    window.electronAPI.shortcuts.onEscape(() => shortcutActionsRef.current.escape())
  }, [])

  const currentTargetLabel = pageTitle || `${APP_NAME} Canvas`
  const showWorkbench = connected && isWorkbenchVisible
  const connectionState = isConnecting ? 'connecting' : connected ? 'connected' : 'disconnected'
  const connectionLabel = connectionState === 'connecting'
    ? t('topbar.connecting')
    : connectionState === 'connected'
      ? t('topbar.connected')
      : t('topbar.disconnected')

  return (
    <div className={`app-layout${connected ? ' app-layout-connected' : ''}`}>
      <div className="app-shell-header">
        <div className="titlebar">
          <div className="titlebar-side titlebar-side-left" aria-hidden="true" />

          <div className="titlebar-brand">
            <span className="titlebar-name">{APP_NAME}</span>
          </div>

          <div className="titlebar-side titlebar-side-right">
            <button
              className="titlebar-icon-button"
              onClick={handleOpenSettings}
              title={t('topbar.settings')}
              aria-label={t('topbar.settings')}
            >
              <GearIcon />
            </button>
          </div>
        </div>

        <div className="controlbar">
          <button
            className="controlbar-button"
            onClick={handleRefresh}
            title={t('topbar.refresh')}
            aria-label={t('topbar.refresh')}
            disabled={isConnecting}
          >
            <RefreshIcon />
            <span>{t('topbar.refresh')}</span>
          </button>

          <div className="address-field">
            <input
              ref={addressBarRef}
              className="address-input"
              type="text"
              value={addressBarUrl}
              inputMode="url"
              placeholder={t('topbar.urlPlaceholder')}
              aria-label={t('topbar.addressLabel')}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              draggable={false}
              onChange={(event) => setAddressBarUrl(event.target.value)}
              onCopy={handleAddressClipboardEvent}
              onCut={handleAddressClipboardEvent}
              onPaste={handleAddressPaste}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLoadFromAddressBar()
                }
              }}
            />
          </div>

          <button
            className="controlbar-button primary"
            onClick={handleLoadFromAddressBar}
            title={t('topbar.load')}
            aria-label={t('topbar.load')}
            disabled={isConnecting}
          >
            <LoadIcon />
            <span>{t('topbar.load')}</span>
          </button>

          <div className={`connection-indicator ${connectionState}`} aria-live="polite">
            <span className="connection-indicator-dot" />
            <span>{connectionLabel}</span>
          </div>

          {connected && (
            <div className="topbar-actions">
              <button
                className="btn-utility wide"
                onClick={() => setIsWorkbenchVisible((visible) => !visible)}
                title={isWorkbenchVisible ? t('topbar.hideToolbar') : t('topbar.showToolbar')}
              >
                {isWorkbenchVisible ? t('topbar.hideToolbar') : t('topbar.showToolbar')}
              </button>
              <button className="btn-utility wide ghost" onClick={() => void handleCloseConnection()} title={t('topbar.disconnect')}>
                {t('topbar.disconnect')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="content-area">
        <div className="canvas">
          {settingsOpen ? (
            <Settings
              open={settingsOpen}
              settings={settings}
              licenseStatus={licenseStatus}
              onClose={() => setSettingsOpen(false)}
              onThemeChange={handleThemeChange}
              onLanguageChange={handleLanguageChange}
              onPurchase={handlePurchase}
              onRestore={handleRestore}
            />
          ) : !connected && showOnboarding ? (
            <OnboardingWizard
              defaultUrl={DEFAULT_URL}
              onLoadUrl={handleLoadUrl}
              recentHtmlFiles={recentHtmlFiles}
              onLoadHtmlFile={(filePath) => void handleLoadHtmlFile(filePath)}
            />
          ) : (
            <div className="canvas-browserview">
              <div className="canvas-hud">
                <span className="canvas-hud-chip">Live Canvas</span>
                <span className="canvas-hud-title">{currentTargetLabel}</span>
              </div>
              <span className="loading">{pageTitle || 'Page loading…'}</span>
            </div>
          )}
        </div>

        {showWorkbench && (
          <aside ref={workbenchRef} className="right-panel">
            {!element ? (
              <div className="panel-empty panel-empty-live">
                <div className="icon">DOM</div>
                <h4>{t('panel.ready')}</h4>
                <p>{t('panel.readyDesc')}</p>
              </div>
            ) : (
              <PropertiesWorkbench
                element={element}
                activeTool={activeTool}
                tags={tags}
                activeEditProperty={activeEditProperty}
                activeEditTick={activeEditTick}
                selectionRevision={selectionRevision}
                historyScopeKey={previewPageContext.contextKey}
                persistedStyleHistory={activePersistedStyleHistory}
                overlayNudgeChange={overlayNudgeChangeRef.current}
                overlayNudgeTick={overlayNudgeTick}
                onElementChange={syncCurrentElement}
                onStyleDiffChange={handleElementStyleDiffChange}
                onPersistedStyleHistoryChange={handlePersistedStyleHistoryChange}
                onGlobalHistoryCommit={handleGlobalHistoryCommit}
                globalCanUndo={globalCanUndo}
                globalCanRedo={globalCanRedo}
                globalCanReset={globalCanReset}
                onGlobalUndo={handleGlobalUndo}
                onGlobalRedo={handleGlobalRedo}
                onGlobalReset={handleGlobalReset}
                onToolChange={setActiveTool}
                onActiveEditPropertyChange={setActiveEditProperty}
                onUpsertTag={handleUpsertTag}
                onDeleteTag={handleDeleteTag}
                exportPromptPreview={exportPromptPreview}
                exportSummaryMeta={exportSummaryMeta}
                canExportPrompt={canExportPrompt}
                onCopyExportPrompt={() => void handleCopyExportPrompt()}
              />
            )}
          </aside>
        )}
      </div>

      <div id="inspector-top-layer" className="inspector-top-layer" />
      <PaywallDialog
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchase={handlePurchase}
        onRestore={handleRestore}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
