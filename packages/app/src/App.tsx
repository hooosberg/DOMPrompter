import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { PropertiesWorkbench } from './components/properties/PropertiesWorkbench'
import { useAdaptiveWindowPreset } from './hooks/useAdaptiveWindowPreset'
import type { ActiveEditProperty, CanvasTool, DiscoveredApp, ElementPreset, ElementTag, ElementTagTarget, ExportPromptSummaryMeta, InspectorMode, InspectedElement, OverlayNudgeChange, PageEditLedgerEntry, ProjectLaunchStatus } from './types'
import './App.css'

const DEFAULT_WORKBENCH_WIDTH = 320

const DEFAULT_URLS = {
  builtin: 'http://localhost:5174',
  external: '127.0.0.1:9222',
} as const

const EMPTY_PROJECT_SESSION: ProjectLaunchStatus = {
  status: 'idle',
  projectDir: '',
  projectName: '',
  builtinUrl: null,
  externalEndpoint: null,
  commands: {
    builtin: null,
    external: null,
  },
  capabilities: {
    builtin: false,
    external: false,
  },
  message: '',
}

const EMPTY_EXPORT_PROMPT_PREVIEW = '当前页面还没有记录到结构化微调或标签意图。先在画布或属性面板里修改对象，底部会自动汇总为可直接交给 AI 编程工具执行的页面级提示词。'

function getRelevantApps(apps: DiscoveredApp[], mode: InspectorMode) {
  return apps.filter((app) => {
    if (mode === 'builtin') {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      return app.type === 'web' && !app.cdpUrl && app.url !== currentOrigin
    }
    return Boolean(app.cdpUrl)
  })
}

function scoreBuiltinApp(app: DiscoveredApp): number {
  const priorities = [5174, 5175, 5173, 5176, 3000, 3001, 4173, 4200, 8080, 8081]
  const index = priorities.indexOf(app.port)
  return index === -1 ? priorities.length + app.port : index
}

function scoreExternalApp(app: DiscoveredApp): number {
  const priorities = [9222, 9223, 9229]
  const index = priorities.indexOf(app.port)
  return index === -1 ? priorities.length + app.port : index
}

function pickSuggestedTarget(mode: InspectorMode, apps: DiscoveredApp[]) {
  const relevant = getRelevantApps(apps, mode)
  const sorter = mode === 'builtin' ? scoreBuiltinApp : scoreExternalApp
  return [...relevant].sort((a, b) => sorter(a) - sorter(b))[0] || null
}

function getTargetValue(mode: InspectorMode, app: DiscoveredApp) {
  return mode === 'builtin' ? app.url : `127.0.0.1:${app.port}`
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

function areStyleDiffsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key] === right[key])
}

interface PageExportElement extends PageEditLedgerEntry {
  tags: string[]
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

function buildPageExportPrompt(args: {
  currentElement: InspectedElement | null
  elements: PageExportElement[]
  summaryMeta: ExportPromptSummaryMeta
  mode: InspectorMode
  projectSession: ProjectLaunchStatus
  pageTitle: string
  pageUrl: string
  targetUrl: string
}) {
  const {
    currentElement,
    elements,
    summaryMeta,
    mode,
    projectSession,
    pageTitle,
    pageUrl,
    targetUrl,
  } = args
  const exportedAt = new Date().toISOString()
  const currentSelection = currentElement
    ? {
        backendNodeId: currentElement.backendNodeId,
        selector: buildElementSelector(currentElement),
      }
    : null
  const payload = {
    source: 'visual-inspector',
    signalGuide: {
      objectIdentity: '对象身份。每个元素都通过 selector、preset、tagName 和 backendNodeId 标识，AI 应先定位对象，再执行后续修改。',
      styleChanges: '结构化微调。来自可视化编辑器记录的最终属性变化，通常是宽高、间距、颜色、对齐等具体最终值。',
      intentTags: '标签意图。来自用户直接写给 AI 的自然语言说明，用来表达结构、语义、视觉目标或无法只靠数值描述的要求。',
      mergeRule: '当 styleChanges 和 intentTags 同时存在时，先满足 styleChanges 的最终值，再用 intentTags 补充实现方式和更高层目标。',
    },
    page: {
      title: pageTitle || projectSession.projectName || '未命名页面',
      url: pageUrl || targetUrl || '未知',
      mode,
      projectName: projectSession.projectName || '未命名项目',
      exportedAt,
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

  const lines = [
    '这是 Visual Inspector 导出的页面级微调任务。请直接修改源码，让页面达到下面描述的最终状态。',
    '',
    '页面信息：',
    `- 项目名称：${payload.page.projectName}`,
    `- 运行模式：${mode === 'builtin' ? 'builtin（网页调试）' : 'external（桌面调试）'}`,
    `- 页面标题：${payload.page.title}`,
    `- 页面地址：${payload.page.url}`,
    `- 导出时间：${exportedAt}`,
    `- 当前选中元素：${currentSelection ? `${currentSelection.selector} (backendNodeId: ${currentSelection.backendNodeId})` : '未选中'}`,
    '',
    '执行要求：',
    '- 只修改与下列元素相关的代码、样式或文案。',
    '- 以最终状态为准，不要保留中间调试步骤。',
    '- 尽量保留现有 DOM 结构、组件拆分、类名和命名风格。',
    '- 如果某元素同时存在结构化微调和标签意图，请优先满足结构化微调里的最终值，再让实现结果符合标签意图。',
    '- 不要输出解释，直接实施修改。',
    '',
    '信号说明：',
    '- 对象身份：每个元素都通过 selector、preset、tagName 和 backendNodeId 标识。请先定位对象，再执行后续修改。',
    '- 结构化微调（styleChanges）：这是 Inspector 记录到的具体最终变化，表示这个对象最后应该改成什么值。',
    '- 标签意图（intentTags）：这是用户直接写给 AI 的自然语言要求，表示这个对象为什么要改、整体效果想达到什么状态。',
    '- 执行时请把两者合并理解：结构化微调负责“改成什么数值”，标签意图负责“补充目标和约束”。',
    '',
    '修改摘要：',
    `- 受影响元素：${summaryMeta.elementCount}`,
    `- 直接样式变更元素：${summaryMeta.modifiedCount}`,
    `- 含标签元素：${summaryMeta.taggedElementCount}`,
    `- 标签组数：${summaryMeta.tagCount}`,
    '',
    '元素级最终状态：',
    ...elements.flatMap((entry, index) => {
      const itemLines = [`${index + 1}. ${entry.selector} (${entry.preset} / <${entry.tagName}>)`]
      if (Object.keys(entry.styleDiff).length > 0) {
        itemLines.push(`   - 结构化微调 styleChanges: ${JSON.stringify(entry.styleDiff)}`)
      }
      if (entry.tags.length > 0) {
        itemLines.push(`   - 标签意图 intentTags: ${entry.tags.join('；')}`)
      }
      return itemLines
    }),
    '',
    '下面附上结构化 JSON，便于程序化读取：',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ]

  return lines.join('\n')
}

function buildTagFromElement(element: InspectedElement, text: string): ElementTag {
  return {
    id: `${element.backendNodeId}-${Date.now()}`,
    targets: [buildTagTarget(element)],
    text,
    createdAt: Date.now(),
  }
}

function pickProjectSessionTarget(mode: InspectorMode, session: ProjectLaunchStatus) {
  if (mode === 'builtin') {
    return session.builtinUrl || session.externalEndpoint || ''
  }
  return session.externalEndpoint || session.builtinUrl || ''
}

function parseNumeric(value: string): number | null {
  const match = value.match(/-?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

export default function App() {
  const builtinCanvasRef = useRef<HTMLDivElement | null>(null)
  const workbenchRef = useRef<HTMLElement | null>(null)
  const selectedBackendNodeRef = useRef<number | null>(null)
  const activeToolRef = useRef<CanvasTool>('select')
  const tagsRef = useRef<ElementTag[]>([])
  const activeEditPropertyRef = useRef<ActiveEditProperty | null>(null)
  const projectSessionRef = useRef<ProjectLaunchStatus>(EMPTY_PROJECT_SESSION)
  const autoConnectTokenRef = useRef<string | null>(null)
  const autoConnectAttemptsRef = useRef<Record<string, number>>({})
  const autoConnectInFlightRef = useRef<string | null>(null)
  const pageIdentityRef = useRef('')
  const [mode, setMode] = useState<InspectorMode>('builtin')
  const [url, setUrl] = useState<string>(DEFAULT_URLS.builtin)
  const [connected, setConnected] = useState(false)
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [activeEditProperty, setActiveEditProperty] = useState<ActiveEditProperty | null>(null)
  const [element, setElement] = useState<InspectedElement | null>(null)
  const [tags, setTags] = useState<ElementTag[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [discoveredApps, setDiscoveredApps] = useState<DiscoveredApp[]>([])
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [projectSession, setProjectSession] = useState<ProjectLaunchStatus>(EMPTY_PROJECT_SESSION)
  const [isWorkbenchVisible, setIsWorkbenchVisible] = useState(true)
  const [overlayNudgeTick, setOverlayNudgeTick] = useState(0)
  const [activeEditTick, setActiveEditTick] = useState(0)
  const [pageEditLedger, setPageEditLedger] = useState<Record<number, PageEditLedgerEntry>>({})
  const overlayNudgeChangeRef = useRef<OverlayNudgeChange | null>(null)

  const windowPreset = useAdaptiveWindowPreset(mode, connected)
  const sidebarMode = windowPreset === 'sidebar'
  const externalWorkbenchMode = mode === 'external' && connected
  const workbenchCompact = mode === 'builtin' && sidebarMode
  const showWorkbench = connected && (mode === 'external' || isWorkbenchVisible)

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  useEffect(() => {
    tagsRef.current = tags
  }, [tags])

  useEffect(() => {
    activeEditPropertyRef.current = activeEditProperty
  }, [activeEditProperty])

  useEffect(() => {
    projectSessionRef.current = projectSession
  }, [projectSession])

  useEffect(() => {
    if (!connected || mode === 'external') {
      setIsWorkbenchVisible(true)
    }
  }, [connected, mode])

  useEffect(() => {
    if (!connected || mode !== 'builtin') {
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
  }, [connected, isWorkbenchVisible, mode])

  const syncExternalOverlayRuntime = useCallback(async (overrides?: {
    tool?: CanvasTool
    tags?: ElementTag[]
    activeEditProperty?: ActiveEditProperty | null
  }) => {
    if (!connected) return

    const tool = overrides?.tool ?? activeToolRef.current

    await window.electronAPI.setExternalOverlayState({
      tool,
      tags: overrides?.tags ?? tagsRef.current,
    })
    if (tool === 'browse') return
    await window.electronAPI.setActiveEditProperty(
      overrides?.activeEditProperty ?? activeEditPropertyRef.current,
    )
  }, [connected])

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }, [])

  const copyText = useCallback(async (text: string, successMessage: string) => {
    await navigator.clipboard.writeText(text)
    flash(successMessage)
  }, [flash])

  const refreshLocalApps = useCallback(async (preferredMode: InspectorMode = mode) => {
    try {
      const apps = await window.electronAPI.discoverLocalApps()
      setDiscoveredApps(apps)

      if (!connected) {
        const suggested = pickSuggestedTarget(preferredMode, apps)
        if (suggested) {
          setUrl(getTargetValue(preferredMode, suggested))
        }
      }
    } catch (error) {
      console.error(error)
      flash('本地目标扫描失败')
    }
  }, [connected, flash, mode])

  const updatePageEditLedger = useCallback((
    updater: (current: Record<number, PageEditLedgerEntry>) => Record<number, PageEditLedgerEntry>,
  ) => {
    setPageEditLedger((current) => updater(current))
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
      void syncExternalOverlayRuntime({
        tool: activeToolRef.current,
        tags: nextTags,
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
    void syncExternalOverlayRuntime({
      tool: activeToolRef.current,
      tags: nextTags,
    })
  }, [syncExternalOverlayRuntime, updatePageEditLedger])

  const handleDeleteTag = useCallback((tagId: string) => {
    const removedTag = tagsRef.current.find((tag) => tag.id === tagId) || null
    const nextTags = tagsRef.current.filter((tag) => tag.id !== tagId)
    tagsRef.current = nextTags
    setTags(nextTags)
    updatePageEditLedger((current) => {
      if (!removedTag) return current

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
    void syncExternalOverlayRuntime({
      tool: activeToolRef.current,
      tags: nextTags,
    })
    flash('标签已删除')
  }, [flash, syncExternalOverlayRuntime, updatePageEditLedger])

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
  const canExportPrompt = exportSummaryMeta.elementCount > 0
  const exportPromptPreview = useMemo(() => {
    if (!canExportPrompt) {
      return EMPTY_EXPORT_PROMPT_PREVIEW
    }

    return buildPageExportPrompt({
      currentElement: element,
      elements: pageExportElements,
      summaryMeta: exportSummaryMeta,
      mode,
      projectSession,
      pageTitle,
      pageUrl,
      targetUrl: url,
    })
  }, [canExportPrompt, element, exportSummaryMeta, mode, pageExportElements, pageTitle, pageUrl, projectSession, url])

  const connectToTarget = useCallback(async (
    nextMode: InspectorMode,
    rawTarget: string,
    options?: { reset?: boolean; silentSuccess?: boolean; silentError?: boolean },
  ) => {
    if (!rawTarget.trim()) return false

    if (options?.reset !== false) {
      pageIdentityRef.current = ''
      setPageTitle('')
      setPageUrl('')
      resetInspectorState()
    }

    try {
      if (nextMode === 'builtin') {
        let nextUrl = rawTarget.trim()
        if (!nextUrl.startsWith('http')) {
          nextUrl = `http://${nextUrl}`
        }

        const loaded = await window.electronAPI.loadUrl(nextUrl)
        if (!loaded) {
          if (!options?.silentError) {
            flash('页面加载失败')
          }
          return false
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500))
        const attached = await window.electronAPI.attachDebugger()
        if (!attached) {
          if (!options?.silentError) {
            flash('调试器附加失败')
          }
          return false
        }

        setConnected(true)
        setMode('builtin')
        setUrl(nextUrl)
        await window.electronAPI.setBuiltinViewInteractive(true)
        if (!options?.silentSuccess) {
          flash('已连接内置浏览器')
        }
      } else {
        const cdpUrl = await window.electronAPI.discoverCDPUrl(rawTarget.trim())
        if (!cdpUrl) {
          if (!options?.silentError) {
            flash('无法发现 CDP 端点，请确认目标已打开调试端口')
          }
          return false
        }

        const ok = await window.electronAPI.connectCDP(cdpUrl)
        if (!ok) {
          if (!options?.silentError) {
            flash('连接桌面目标失败')
          }
          return false
        }

        setConnected(true)
        setMode('external')
        setUrl(rawTarget.trim())
        if (!options?.silentSuccess) {
          flash('已连接桌面目标')
        }
      }
      return true
    } catch (error) {
      console.error(error)
      if (!options?.silentError) {
        flash('连接过程发生错误')
      }
      return false
    } finally {
    }
  }, [flash, resetInspectorState])

  const applyAutoConnectedState = useCallback((nextMode: InspectorMode, target: string, message?: string) => {
    const token = `${nextMode}:${target}`
    const alreadyApplied = autoConnectTokenRef.current === token
    pageIdentityRef.current = ''
    setPageTitle('')
    setPageUrl('')
    resetInspectorState()
    setConnected(true)
    setMode(nextMode)
    setUrl(target)
    autoConnectTokenRef.current = token
    autoConnectAttemptsRef.current[token] = 2
    autoConnectInFlightRef.current = null
    if (message && !alreadyApplied) {
      flash(message)
    }
  }, [flash, resetInspectorState])

  const triggerAutoConnect = useCallback(async (nextMode: InspectorMode, target: string) => {
    const token = `${nextMode}:${target}`
    if (autoConnectTokenRef.current === token || autoConnectInFlightRef.current === token) {
      return
    }

    const previousAttempts = autoConnectAttemptsRef.current[token] || 0
    if (previousAttempts >= 2) {
      return
    }

    autoConnectInFlightRef.current = token
    setMode(nextMode)
    setUrl(target)

    let ok = false
    for (let attempt = previousAttempts; attempt < 2 && !ok; attempt += 1) {
      autoConnectAttemptsRef.current[token] = attempt + 1
      ok = await connectToTarget(nextMode, target, {
        reset: attempt === 0,
        silentSuccess: true,
        silentError: attempt === 0,
      })

      if (!ok && attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 600))
      }
    }

    autoConnectInFlightRef.current = null
    if (ok) {
      autoConnectTokenRef.current = token
    }
  }, [connectToTarget])

  useEffect(() => {
    window.electronAPI.onElementSelected((selectedElement, meta) => {
      // 浮动按钮的 nudge：DOM 已改，只需让属性面板记录变化
      if (meta?.nudge && meta?.nudgeChange) {
        overlayNudgeChangeRef.current = meta.nudgeChange
        setOverlayNudgeTick((t) => t + 1)
        // 同时更新 element 状态（不重置 baseline）
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
    })

    window.electronAPI.onLaunchStatus((info) => {
      setProjectSession((current) => ({
        ...current,
        ...info,
        selectedMode: info.status === 'project-selected'
          ? current.selectedMode || mode
          : (info.selectedMode ?? current.selectedMode),
        commands: info.commands || current.commands,
        capabilities: info.capabilities || current.capabilities,
        builtinUrl: info.builtinUrl ?? current.builtinUrl ?? null,
        externalEndpoint: info.externalEndpoint ?? current.externalEndpoint ?? null,
      }))

      const sessionLike = {
        ...projectSessionRef.current,
        ...info,
        selectedMode: info.status === 'project-selected'
          ? projectSessionRef.current.selectedMode || mode
          : (info.selectedMode ?? projectSessionRef.current.selectedMode),
        commands: info.commands || projectSessionRef.current.commands,
        capabilities: info.capabilities || projectSessionRef.current.capabilities,
        builtinUrl: info.builtinUrl ?? projectSessionRef.current.builtinUrl ?? null,
        externalEndpoint: info.externalEndpoint ?? projectSessionRef.current.externalEndpoint ?? null,
      } satisfies ProjectLaunchStatus

      if (info.status === 'project-selected') {
        const suggestedTarget = pickProjectSessionTarget(sessionLike.selectedMode || mode, sessionLike)
        if (suggestedTarget) {
          setUrl(suggestedTarget)
        }
        return
      }

      if (info.status === 'error' && info.message) {
        autoConnectInFlightRef.current = null
        flash(info.message)
        return
      }

      if (info.status !== 'ready' || connected) return

      const targetMode = sessionLike.selectedMode
        || (mode === 'external'
          ? (sessionLike.externalEndpoint ? 'external' : sessionLike.builtinUrl ? 'builtin' : null)
          : (sessionLike.builtinUrl ? 'builtin' : sessionLike.externalEndpoint ? 'external' : null))

      const target = targetMode ? pickProjectSessionTarget(targetMode, sessionLike) : ''
      if (!targetMode || !target) return

      if (info.autoConnected) {
        applyAutoConnectedState(targetMode, target, info.message || '已自动连接目标应用')
        return
      }

      void triggerAutoConnect(targetMode, target)
    })

    // 处理主进程已自动完成的 CDP 连接
    window.electronAPI.onAutoConnected((info) => {
      console.log('[App] auto-connected from main process:', info)
      applyAutoConnectedState(info.mode as InspectorMode, info.endpoint, '已自动连接目标应用')
    })

    void refreshLocalApps()
    return () => window.electronAPI.removeAllListeners()
  }, [applyAutoConnectedState, connected, flash, mode, refreshLocalApps, syncCurrentElement, triggerAutoConnect])

  useEffect(() => {
    if (!connected) return

    void (async () => {
      if (mode === 'builtin') {
        await window.electronAPI.setBuiltinViewInteractive(true)
      }

      await window.electronAPI.startInspect()
      await syncExternalOverlayRuntime({ tool: activeToolRef.current })
    })()
  }, [activeTool, connected, mode, syncExternalOverlayRuntime])

  useEffect(() => {
    if (!connected || activeTool === 'browse') return

    void window.electronAPI.setActiveEditProperty(activeEditProperty)
  }, [activeEditProperty, activeTool, connected])

  useEffect(() => {
    if (!connected) return

    void window.electronAPI.setExternalOverlayState({
      tool: activeTool,
      tags,
    })
  }, [activeTool, connected, tags])

  const handleSelectProject = useCallback(async () => {
    try {
      const info = await window.electronAPI.selectProjectDirectory({ forceDialog: true })
      if (!info) return
      setProjectSession((current) => ({
        ...current,
        ...info,
        selectedMode: mode,
        commands: info.commands || current.commands,
        capabilities: info.capabilities || current.capabilities,
      }))

      const suggestedTarget = pickProjectSessionTarget(mode, info)
      if (suggestedTarget) {
        setUrl(suggestedTarget)
      }
    } catch (error) {
      console.error(error)
      flash('选择项目目录失败')
    }
  }, [flash, mode])

  const handleLaunchProject = useCallback(async (launchMode?: InspectorMode, customCommand?: string) => {
    const targetMode = launchMode || mode
    if (launchMode) setMode(launchMode)
    autoConnectTokenRef.current = null
    autoConnectAttemptsRef.current = {}
    autoConnectInFlightRef.current = null
    try {
      const result = await window.electronAPI.launchProjectSession({
        projectDir: projectSessionRef.current.projectDir || null,
        preferredMode: targetMode,
        customCommand,
      })
      if (!result.success && result.error && result.error !== 'cancelled') {
        flash(result.error)
      }
    } catch (error) {
      console.error(error)
      flash('项目启动失败')
    }
  }, [flash, mode])

  const handleLoadStaticHtml = useCallback(async (filePath: string) => {
    pageIdentityRef.current = ''
    setPageTitle('')
    setPageUrl('')
    resetInspectorState()
    try {
      const fileUrl = `file://${filePath}`
      const loaded = await window.electronAPI.loadUrl(fileUrl)
      if (!loaded) {
        flash('页面加载失败')
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
      const attached = await window.electronAPI.attachDebugger()
      if (!attached) {
        flash('调试器附加失败')
        return
      }
      setConnected(true)
      setMode('builtin')
      setUrl(fileUrl)
      flash('已打开静态 HTML')
    } catch (error) {
      console.error(error)
      flash('加载静态 HTML 失败')
    }
  }, [flash, resetInspectorState])

  const handleConnectRunning = useCallback(async (endpoint: string) => {
    pageIdentityRef.current = ''
    setPageTitle('')
    setPageUrl('')
    resetInspectorState()
    try {
      const cdpUrl = await window.electronAPI.discoverCDPUrl(endpoint)
      if (!cdpUrl) {
        flash('无法发现 CDP 端点，请确认目标已打开调试端口')
        return
      }
      const ok = await window.electronAPI.connectCDP(cdpUrl)
      if (!ok) {
        flash('连接目标失败')
        return
      }
      setConnected(true)
      setMode('external')
      setUrl(endpoint)
      flash('已连接目标')
    } catch (error) {
      console.error(error)
      flash('连接过程发生错误')
    }
  }, [flash, resetInspectorState])

  const handleStopProject = useCallback(async () => {
    await window.electronAPI.stopProjectSession()
    autoConnectTokenRef.current = null
    autoConnectAttemptsRef.current = {}
    autoConnectInFlightRef.current = null
  }, [])

  const handleCloseConnection = useCallback(async () => {
    await window.electronAPI.stopProjectSession()
    await window.electronAPI.disconnect()
    autoConnectTokenRef.current = null
    autoConnectAttemptsRef.current = {}
    autoConnectInFlightRef.current = null
    setConnected(false)
    setActiveTool('select')
    setActiveEditProperty(null)
    pageIdentityRef.current = ''
    setPageTitle('')
    setPageUrl('')
    setIsWorkbenchVisible(true)
    resetInspectorState()
  }, [resetInspectorState])

  const handleCopyExportPrompt = useCallback(async () => {
    if (!canExportPrompt) {
      flash('当前还没有可导出的微调改动')
      return
    }

    await copyText(exportPromptPreview, '页面级修改提示词已复制')
  }, [canExportPrompt, copyText, exportPromptPreview, flash])

  const relevantApps = getRelevantApps(discoveredApps, mode)
  const currentTargetLabel = mode === 'builtin'
    ? (pageTitle || projectSession.projectName || '网页目标')
    : (projectSession.projectName || relevantApps.find((app) => app.port === parseNumeric(url) || `127.0.0.1:${app.port}` === url)?.name || '桌面目标')
  const sessionLaunchBusy = projectSession.status === 'launching'
    || projectSession.status === 'starting-web'
    || projectSession.status === 'starting-electron'
    || projectSession.status === 'waiting-web'
    || projectSession.status === 'waiting-cdp'

  return (
    <div className={`app-layout ${sidebarMode ? 'compact-mode' : ''}`}>
      <div className={`topbar ${!connected ? 'topbar-minimal' : ''}`}>
        <div className="topbar-spacer" />

        {connected ? (
          <>
            <div className="project-session-pill">
              <span className="project-session-kicker">{mode === 'builtin' ? '网页调试' : '桌面调试'}</span>
              <strong>{projectSession.projectName || '目标项目'}</strong>
            </div>
            <div className="topbar-actions">
              <span className="topbar-status-pill">已连接</span>
              {mode === 'builtin' && (
                <button
                  className="btn-utility wide"
                  onClick={() => setIsWorkbenchVisible((visible) => !visible)}
                  title={isWorkbenchVisible ? '隐藏右侧属性工具栏' : '显示右侧属性工具栏'}
                >
                  {isWorkbenchVisible ? '隐藏工具栏' : '显示工具栏'}
                </button>
              )}
              <button className="btn-utility wide ghost" onClick={() => void handleCloseConnection()} title="关闭连接">
                关闭连接
              </button>
            </div>
          </>
        ) : (
          <div className="topbar-title">Visual Inspector</div>
        )}
      </div>

      <div className={`content-area ${sidebarMode ? 'sidebar-mode' : ''} ${externalWorkbenchMode ? 'external-workbench-only' : ''}`}>
        {!externalWorkbenchMode && (
          <div className="canvas">
            {!connected ? (
              <WelcomeScreen
                projectSession={projectSession}
                onSelectProject={() => void handleSelectProject()}
                onLaunch={(launchMode, customCommand) => void handleLaunchProject(launchMode, customCommand)}
                onLoadStaticHtml={(filePath) => void handleLoadStaticHtml(filePath)}
                onConnectRunning={(endpoint) => void handleConnectRunning(endpoint)}
                onStop={() => void handleStopProject()}
                launchBusy={sessionLaunchBusy}
              />
            ) : mode === 'builtin' ? (
              <div className="canvas-browserview" ref={builtinCanvasRef}>
                <div className="canvas-hud">
                  <span className="canvas-hud-chip">Live Canvas</span>
                  <span className="canvas-hud-title">{currentTargetLabel}</span>
                </div>
                <span className="loading">{pageTitle || '页面加载中…'}</span>
              </div>
            ) : (
              <div className="workspace-hero">
                <div className="workspace-card workspace-card-external">
                  <div className="workspace-kicker">External Workspace</div>
                  <h3>{currentTargetLabel}</h3>
                  <p>请直接在目标桌面应用里操作和选元素。这个模式下 Inspector 只保留右侧工作台，不再镜像一份桌面界面。</p>
                </div>
              </div>
            )}
          </div>
        )}

        {showWorkbench && (
          <aside
            ref={workbenchRef}
            className={`right-panel ${sidebarMode ? 'sidebar-panel' : ''} ${externalWorkbenchMode ? 'external-right-panel' : ''}`}
          >
            {!element ? (
              <div className={`panel-empty ${connected ? 'panel-empty-live' : ''}`}>
                <div className="icon">{connected ? '🧭' : '📐'}</div>
                <h4>{connected ? '准备选择元素' : '等待连接目标'}</h4>
                <p>
                  {connected
                    ? (mode === 'external'
                        ? '请直接在桌面目标窗口里移动鼠标并点击元素。右侧工具台会跟随当前选中对象。'
                        : '移动鼠标悬停目标元素，看到淡蓝 Hover 框后点击锁定。锁定后可以直接拖拽、缩放，并实时联动右侧属性。')
                    : '连接后右侧会显示中文化的尺寸、定位、背景、透明度和阴影参数。'}
                </p>
              </div>
            ) : (
              <PropertiesWorkbench
                element={element}
                compact={workbenchCompact}
                activeTool={activeTool}
                tags={tags}
                activeEditProperty={activeEditProperty}
                activeEditTick={activeEditTick}
                selectionRevision={selectionRevision}
                overlayNudgeChange={overlayNudgeChangeRef.current}
                overlayNudgeTick={overlayNudgeTick}
                onElementChange={syncCurrentElement}
                onStyleDiffChange={handleElementStyleDiffChange}
                onToolChange={setActiveTool}
                onActiveEditPropertyChange={setActiveEditProperty}
                onUpsertTag={handleUpsertTag}
                onDeleteTag={handleDeleteTag}
                exportPromptPreview={exportPromptPreview}
                exportSummaryMeta={exportSummaryMeta}
                canExportPrompt={canExportPrompt}
                onCopyExportPrompt={() => handleCopyExportPrompt()}
              />
            )}
          </aside>
        )}
      </div>

      <div id="inspector-top-layer" className="inspector-top-layer" />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
