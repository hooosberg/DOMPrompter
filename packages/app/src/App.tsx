import { useCallback, useEffect, useRef, useState } from 'react'
import { OverlayInspector } from './components/overlay/OverlayInspector'
import { WelcomeScreen } from './components/WelcomeScreen'
import { PropertiesWorkbench } from './components/properties/PropertiesWorkbench'
import { useAdaptiveWindowPreset } from './hooks/useAdaptiveWindowPreset'
import type { ActiveEditProperty, BoxModelRect, CanvasTool, DiscoveredApp, ElementNote, ElementNoteTarget, InspectorMode, InspectedElement, ProjectLaunchStatus } from './types'
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

function buildNoteTarget(element: InspectedElement): ElementNoteTarget {
  return {
    backendNodeId: element.backendNodeId,
    selector: buildElementSelector(element),
    boxModel: element.boxModel,
  }
}

function getPrimaryNoteTarget(note: ElementNote): ElementNoteTarget | null {
  return note.targets[0] || null
}

function noteHasTarget(note: ElementNote, backendNodeId: number) {
  return note.targets.some((target) => target.backendNodeId === backendNodeId)
}

function targetListHasTarget(targets: ElementNoteTarget[], backendNodeId: number) {
  return targets.some((target) => target.backendNodeId === backendNodeId)
}

function buildStyleDiffPrompt(
  element: InspectedElement,
  styleDiff: Record<string, string>,
  notes: ElementNote[],
) {
  const selector = buildElementSelector(element)
  const lines = [
    `我通过 Visual Inspector 微调了 ${selector} 这个元素。`,
  ]

  if (Object.keys(styleDiff).length > 0) {
    lines.push(
      '请帮我把源码同步成下面这些最终样式：',
      JSON.stringify(styleDiff, null, 2),
    )
  } else {
    lines.push('当前没有记录到直接样式变更，请只根据下面的便签要求更新源码。')
  }

  if (notes.length > 0) {
    lines.push(
      '补充便签：',
      ...notes.map((note) => `- ${note.targets.map((target) => target.selector).join('、')}: ${note.text}`),
    )
  }

  lines.push('要求：只修改对应元素相关的样式或内容，保持现有结构和命名风格。')

  return lines.join('\n')
}

function buildNoteFromElement(element: InspectedElement, text: string): ElementNote {
  const target = buildNoteTarget(element)
  return {
    id: `${element.backendNodeId}-${Date.now()}`,
    targets: [target],
    text,
    boxModel: target.boxModel,
    offsetX: 0,
    offsetY: 0,
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
  const builtinPreviewRef = useRef<HTMLDivElement | null>(null)
  const builtinPreviewImageRef = useRef<HTMLImageElement | null>(null)
  const workbenchRef = useRef<HTMLElement | null>(null)
  const selectedBackendNodeRef = useRef<number | null>(null)
  const activeToolRef = useRef<CanvasTool>('select')
  const notesRef = useRef<ElementNote[]>([])
  const activeNoteIdRef = useRef<string | null>(null)
  const draftNoteTargetsRef = useRef<ElementNoteTarget[]>([])
  const draftNoteTextRef = useRef('')
  const activeEditPropertyRef = useRef<ActiveEditProperty | null>(null)
  const elementRef = useRef<InspectedElement | null>(null)
  const previewRefreshTimerRef = useRef<number | null>(null)
  const projectSessionRef = useRef<ProjectLaunchStatus>(EMPTY_PROJECT_SESSION)
  const autoConnectTokenRef = useRef<string | null>(null)
  const autoConnectAttemptsRef = useRef<Record<string, number>>({})
  const autoConnectInFlightRef = useRef<string | null>(null)
  const [mode, setMode] = useState<InspectorMode>('builtin')
  const [url, setUrl] = useState<string>(DEFAULT_URLS.builtin)
  const [connected, setConnected] = useState(false)
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [activeEditProperty, setActiveEditProperty] = useState<ActiveEditProperty | null>(null)
  const [element, setElement] = useState<InspectedElement | null>(null)
  const [notes, setNotes] = useState<ElementNote[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [draftNoteTargets, setDraftNoteTargets] = useState<ElementNoteTarget[]>([])
  const [draftNoteText, setDraftNoteText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState('')
  const [discoveredApps, setDiscoveredApps] = useState<DiscoveredApp[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewViewport, setPreviewViewport] = useState<BoxModelRect>({ x: 0, y: 0, width: 0, height: 0 })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [projectSession, setProjectSession] = useState<ProjectLaunchStatus>(EMPTY_PROJECT_SESSION)
  const [isWorkbenchVisible, setIsWorkbenchVisible] = useState(true)

  const windowPreset = useAdaptiveWindowPreset(mode, connected)
  const sidebarMode = windowPreset === 'sidebar'
  const externalWorkbenchMode = mode === 'external' && connected
  const workbenchCompact = mode === 'builtin' && sidebarMode
  const showWorkbench = connected && (mode === 'external' || isWorkbenchVisible)

  useEffect(() => {
    activeToolRef.current = activeTool
  }, [activeTool])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
  }, [activeNoteId])

  useEffect(() => {
    draftNoteTargetsRef.current = draftNoteTargets
  }, [draftNoteTargets])

  useEffect(() => {
    draftNoteTextRef.current = draftNoteText
  }, [draftNoteText])

  useEffect(() => {
    activeEditPropertyRef.current = activeEditProperty
  }, [activeEditProperty])

  useEffect(() => {
    elementRef.current = element
  }, [element])

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
    activeNoteId?: string | null
    draftNoteTargets?: ElementNoteTarget[]
    draftNoteText?: string
    notes?: ElementNote[]
    activeEditProperty?: ActiveEditProperty | null
  }) => {
    if (!connected || mode !== 'external') return

    const tool = overrides?.tool ?? activeToolRef.current
    if (tool === 'browse') return

    await window.electronAPI.setExternalOverlayState({
      tool,
      activeNoteId: overrides?.activeNoteId ?? activeNoteIdRef.current,
      draftNoteTargets: overrides?.draftNoteTargets ?? draftNoteTargetsRef.current,
      draftNoteText: overrides?.draftNoteText ?? draftNoteTextRef.current,
      notes: overrides?.notes ?? notesRef.current,
    })
    await window.electronAPI.setActiveEditProperty(
      overrides?.activeEditProperty ?? activeEditPropertyRef.current,
    )
  }, [connected, mode])

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

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const preview = await window.electronAPI.capturePreview()
      if (preview) {
        setPreviewImage(preview.dataUrl)
        setPreviewViewport(preview.viewport)
      } else {
        setPreviewImage(null)
        setPreviewViewport({ x: 0, y: 0, width: 0, height: 0 })
      }
    } catch (error) {
      console.error(error)
      setPreviewImage(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const syncCurrentElement = useCallback((selectedElement: InspectedElement) => {
    if (selectedBackendNodeRef.current !== selectedElement.backendNodeId) {
      selectedBackendNodeRef.current = selectedElement.backendNodeId
      setSelectionRevision((revision) => revision + 1)
    }
    setElement(selectedElement)
    setNotes((current) => current.map((note) => (
      noteHasTarget(note, selectedElement.backendNodeId)
        ? {
            ...note,
            boxModel: getPrimaryNoteTarget(note)?.backendNodeId === selectedElement.backendNodeId
              ? selectedElement.boxModel
              : note.boxModel,
            targets: note.targets.map((target) => (
              target.backendNodeId === selectedElement.backendNodeId
                ? {
                    ...target,
                    selector: buildElementSelector(selectedElement),
                    boxModel: selectedElement.boxModel,
                  }
                : target
            )),
          }
        : note
    )))
    setDraftNoteTargets((current) => current.map((target) => (
      target.backendNodeId === selectedElement.backendNodeId
        ? {
            ...target,
            selector: buildElementSelector(selectedElement),
            boxModel: selectedElement.boxModel,
          }
        : target
    )))
  }, [])

  const refreshSelectedElement = useCallback(async (backendNodeId: number | null) => {
    if (!backendNodeId) return

    try {
      const refreshedElement = await window.electronAPI.inspectElementByBackendId({ backendNodeId })
      if (refreshedElement) {
        syncCurrentElement(refreshedElement)
      }
    } catch (error) {
      console.error(error)
    }
  }, [syncCurrentElement])

  const handleOpenNoteComposer = useCallback((targetElement: InspectedElement, options?: { append?: boolean }) => {
    const previousSelectedBackendId = selectedBackendNodeRef.current
    const latestNotes = notesRef.current
    const latestActiveNoteId = activeNoteIdRef.current
    const latestDraftTargets = draftNoteTargetsRef.current
    const nextTarget = buildNoteTarget(targetElement)
    syncCurrentElement(targetElement)
    setActiveTool('note')
    if (options?.append) {
      const selectedNote = latestActiveNoteId
        ? latestNotes.find((note) => note.id === latestActiveNoteId) || null
        : null
      const appendNote = selectedNote

      if (appendNote) {
        activeNoteIdRef.current = appendNote.id
        draftNoteTargetsRef.current = []
        setDraftNoteTargets([])
        setActiveNoteId(appendNote.id)
        setDraftNoteText('')
      }

      if (appendNote) {
        const targetExists = noteHasTarget(appendNote, targetElement.backendNodeId)
        const canRemove = appendNote.targets.length > 1
        const nextNotes = latestNotes.map((note) => {
          if (note.id !== appendNote.id) return note

          if (targetExists) {
            return canRemove
              ? {
                  ...note,
                  targets: note.targets.filter((target) => target.backendNodeId !== targetElement.backendNodeId),
                }
              : note
          }

          return {
            ...note,
            targets: [...note.targets, nextTarget],
          }
        })

        notesRef.current = nextNotes
        setNotes(nextNotes)
        void syncExternalOverlayRuntime({
          tool: 'note',
          activeNoteId: appendNote.id,
          draftNoteTargets: [],
          draftNoteText: '',
          notes: nextNotes,
        })
        flash(
          targetExists
            ? (canRemove
                ? `已将 ${buildElementSelector(targetElement)} 移出当前标签卡`
                : '当前标签卡至少保留 1 个对象')
            : `已将 ${buildElementSelector(targetElement)} 加入当前标签卡`,
        )
        return
      }

      const baseDraftTargets = latestDraftTargets.length > 0
        ? latestDraftTargets
        : (previousSelectedBackendId && previousSelectedBackendId !== targetElement.backendNodeId && element
            ? [buildNoteTarget(element)]
            : [])
      const mergedDraftTargets = targetListHasTarget(baseDraftTargets, targetElement.backendNodeId)
        ? (baseDraftTargets.length > 1
            ? baseDraftTargets.filter((target) => target.backendNodeId !== targetElement.backendNodeId)
            : baseDraftTargets)
        : [...baseDraftTargets, nextTarget]

      draftNoteTargetsRef.current = mergedDraftTargets
      activeNoteIdRef.current = null
      draftNoteTextRef.current = ''
      setActiveNoteId(null)
      setDraftNoteTargets(mergedDraftTargets)
      setDraftNoteText('')
      void syncExternalOverlayRuntime({
        tool: 'note',
        activeNoteId: null,
        draftNoteTargets: mergedDraftTargets,
        draftNoteText: '',
        notes: latestNotes,
      })
      flash(
        targetListHasTarget(baseDraftTargets, targetElement.backendNodeId)
          ? (baseDraftTargets.length > 1
              ? `已将 ${buildElementSelector(targetElement)} 移出当前草稿`
              : '当前草稿至少保留 1 个对象')
          : `已暂存 ${mergedDraftTargets.length} 个对象，开始输入后会生成一张多选标签卡`,
      )
      return
    }

    draftNoteTargetsRef.current = [nextTarget]
    setDraftNoteTargets([nextTarget])
    activeNoteIdRef.current = null
    setActiveNoteId(null)
    draftNoteTextRef.current = ''
    setDraftNoteText('')
    void syncExternalOverlayRuntime({
      tool: 'note',
      activeNoteId: null,
      draftNoteTargets: [nextTarget],
      draftNoteText: '',
      notes: latestNotes,
    })
    flash(
      options?.append
        ? '先选中或创建一张标签卡，再按 Shift 点其它对象加入同一张卡'
        : `已选中 ${buildElementSelector(targetElement)}，在右侧输入便签内容`,
    )
  }, [element, flash, syncCurrentElement, syncExternalOverlayRuntime])

  const handleActivateNote = useCallback(async (targetNote: ElementNote, preferredBackendNodeId?: number | null) => {
    setActiveTool('note')
    draftNoteTargetsRef.current = []
    setDraftNoteTargets([])
    activeNoteIdRef.current = targetNote.id
    setActiveNoteId(targetNote.id)
    draftNoteTextRef.current = ''
    setDraftNoteText('')
    void syncExternalOverlayRuntime({
      tool: 'note',
      activeNoteId: targetNote.id,
      draftNoteTargets: [],
      draftNoteText: '',
      notes: notesRef.current,
    })
    const target = targetNote.targets.find((item) => item.backendNodeId === preferredBackendNodeId)
      || getPrimaryNoteTarget(targetNote)
    if (!target) {
      return
    }

    try {
      const refreshedElement = await window.electronAPI.inspectElementByBackendId({ backendNodeId: target.backendNodeId })
      if (refreshedElement) {
        syncCurrentElement(refreshedElement)
        if (mode === 'builtin') {
          void refreshPreview()
        }
      }
    } catch (error) {
      console.error(error)
    }
  }, [mode, refreshPreview, syncCurrentElement, syncExternalOverlayRuntime])

  const handleUpsertNote = useCallback((targetElement: InspectedElement, text: string) => {
    const trimmedText = text.trim()
    const latestNotes = notesRef.current
    const latestActiveNoteId = activeNoteIdRef.current
    const latestDraftTargets = draftNoteTargetsRef.current
    const activeNote = latestActiveNoteId
      ? latestNotes.find((note) => note.id === latestActiveNoteId) || null
      : null
    const existingNote = activeNote

    if (!trimmedText) {
      if (!existingNote) {
        return
      }

      const nextNotes = latestNotes.filter((note) => note.id !== existingNote.id)
      notesRef.current = nextNotes
      setNotes(nextNotes)
      draftNoteTargetsRef.current = []
      setDraftNoteTargets([])
      if (activeNoteIdRef.current === existingNote.id) {
        activeNoteIdRef.current = null
      }
      setActiveNoteId((current) => (current === existingNote.id ? null : current))
      draftNoteTextRef.current = ''
      setDraftNoteText('')
      void syncExternalOverlayRuntime({
        tool: 'note',
        activeNoteId: null,
        draftNoteTargets: [],
        draftNoteText: '',
        notes: nextNotes,
      })
      return
    }

    const noteTemplateTargets = latestDraftTargets.length > 0
      ? latestDraftTargets
      : [buildNoteTarget(targetElement)]
    const noteTemplate = {
      ...buildNoteFromElement(targetElement, trimmedText),
      targets: noteTemplateTargets,
      boxModel: noteTemplateTargets[0]?.boxModel || targetElement.boxModel,
    }
    const nextNote = existingNote
      ? {
          ...existingNote,
          text: trimmedText,
          boxModel: existingNote.boxModel || noteTemplate.boxModel,
          targets: noteHasTarget(existingNote, targetElement.backendNodeId)
            ? existingNote.targets
            : [...existingNote.targets, buildNoteTarget(targetElement)],
        }
      : noteTemplate

    const nextNotes = !existingNote
      ? [...latestNotes, nextNote]
      : latestNotes.map((note) => (
          note.id === existingNote.id
            ? nextNote
            : note
        ))
    notesRef.current = nextNotes
    setNotes(nextNotes)
    draftNoteTargetsRef.current = []
    setDraftNoteTargets([])
    activeNoteIdRef.current = nextNote.id
    setActiveNoteId(nextNote.id)
    draftNoteTextRef.current = ''
    setDraftNoteText('')
    void syncExternalOverlayRuntime({
      tool: 'note',
      activeNoteId: nextNote.id,
      draftNoteTargets: [],
      draftNoteText: '',
      notes: nextNotes,
    })
  }, [syncExternalOverlayRuntime])

  const handleFinalizeDraftNote = useCallback((text: string) => {
    const targetElement = elementRef.current
    const draftTargets = draftNoteTargetsRef.current
    const trimmedText = text.trim()

    if (!targetElement || draftTargets.length === 0) {
      setDraftNoteText('')
      return
    }

    if (!trimmedText) {
      setDraftNoteText('')
      return
    }

    handleUpsertNote(targetElement, trimmedText)
  }, [handleUpsertNote])

  const handleDeleteNote = useCallback((noteId: string) => {
    const nextNotes = notesRef.current.filter((note) => note.id !== noteId)
    notesRef.current = nextNotes
    setNotes(nextNotes)
    if (activeNoteIdRef.current === noteId) {
      activeNoteIdRef.current = null
    }
    setActiveNoteId((current) => (current === noteId ? null : current))
    void syncExternalOverlayRuntime({
      tool: activeToolRef.current,
      activeNoteId: activeNoteIdRef.current === noteId ? null : activeNoteIdRef.current,
      notes: nextNotes,
    })
    flash('便签已删除')
  }, [flash, syncExternalOverlayRuntime])

  const handleMoveNote = useCallback((noteId: string, deltaX: number, deltaY: number) => {
    const nextNotes = notesRef.current.map((note) => (
      note.id === noteId
        ? {
            ...note,
            offsetX: note.offsetX + deltaX,
            offsetY: note.offsetY + deltaY,
          }
        : note
    ))
    notesRef.current = nextNotes
    setNotes(nextNotes)
    void syncExternalOverlayRuntime({
      tool: activeToolRef.current,
      notes: nextNotes,
    })
  }, [syncExternalOverlayRuntime])

  const resetInspectorState = useCallback(() => {
    selectedBackendNodeRef.current = null
    setElement(null)
    setNotes([])
    setActiveNoteId(null)
    setDraftNoteTargets([])
    setDraftNoteText('')
  }, [])

  const connectToTarget = useCallback(async (
    nextMode: InspectorMode,
    rawTarget: string,
    options?: { reset?: boolean; silentSuccess?: boolean; silentError?: boolean },
  ) => {
    if (!rawTarget.trim()) return false

    if (options?.reset !== false) {
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
        await window.electronAPI.setBuiltinViewInteractive(activeToolRef.current !== 'note')
        if (activeToolRef.current === 'note') {
          await refreshPreview()
        }
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
  }, [flash, refreshPreview, resetInspectorState])

  const applyAutoConnectedState = useCallback((nextMode: InspectorMode, target: string, message?: string) => {
    const token = `${nextMode}:${target}`
    const alreadyApplied = autoConnectTokenRef.current === token
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
      if (activeToolRef.current === 'note') {
        handleOpenNoteComposer(selectedElement, { append: Boolean(meta?.append) })
        return
      }

      syncCurrentElement(selectedElement)
    })

    window.electronAPI.onOverlayAction((action) => {
      if (action.type === 'note-select') {
        const targetNote = notesRef.current.find((note) => note.id === action.noteId)
        if (targetNote) {
          void handleActivateNote(targetNote)
        }
        return
      }

      if (action.type === 'note-delete') {
        handleDeleteNote(action.noteId)
        return
      }

      if (action.type === 'note-move') {
        handleMoveNote(action.noteId, action.deltaX || 0, action.deltaY || 0)
      }
    })

    window.electronAPI.onBrowserViewLoaded((info) => {
      setPageTitle(info.title || info.url)
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
  }, [applyAutoConnectedState, connected, flash, handleActivateNote, handleDeleteNote, handleMoveNote, handleOpenNoteComposer, mode, refreshLocalApps, refreshPreview, syncCurrentElement, triggerAutoConnect])

  useEffect(() => {
    if (!connected || mode !== 'builtin') return

    const useLiveBrowserView = activeTool !== 'note'

    void (async () => {
      await window.electronAPI.setBuiltinViewInteractive(useLiveBrowserView)

      if (activeTool === 'browse') {
        await window.electronAPI.stopInspect()
        return
      }

      if (activeTool === 'select') {
        await window.electronAPI.startInspect()
        return
      }

      await window.electronAPI.stopInspect()
      await new Promise((resolve) => window.setTimeout(resolve, 60))
      await refreshPreview()
      await refreshSelectedElement(selectedBackendNodeRef.current)
    })()
  }, [activeTool, connected, mode, refreshPreview, refreshSelectedElement])

  useEffect(() => {
    if (!connected || mode !== 'external') return

    const syncExternalOverlay = async () => {
      await window.electronAPI.setExternalOverlayState({
        tool: activeToolRef.current,
        activeNoteId: activeNoteIdRef.current,
        draftNoteTargets: draftNoteTargetsRef.current,
        draftNoteText: draftNoteTextRef.current,
        notes: notesRef.current,
      })
      await window.electronAPI.setActiveEditProperty(activeEditPropertyRef.current)
    }

    void (async () => {
      if (activeTool === 'browse') {
        await window.electronAPI.stopInspect()
        return
      }

      await window.electronAPI.startInspect()
      await syncExternalOverlay()
    })()
  }, [activeTool, connected, mode])

  useEffect(() => {
    if (!connected || activeTool === 'browse') return

    void window.electronAPI.setActiveEditProperty(activeEditProperty)
  }, [activeEditProperty, activeTool, connected])

  useEffect(() => {
    if (!connected || mode !== 'external') return

    void window.electronAPI.setExternalOverlayState({
      tool: activeTool,
      activeNoteId,
      draftNoteTargets,
      draftNoteText,
      notes,
    })
  }, [activeNoteId, activeTool, connected, draftNoteTargets, draftNoteText, mode, notes])

  useEffect(() => {
    const shouldTrackPreview = connected && mode === 'builtin' && activeTool === 'note'
    if (!shouldTrackPreview) {
      if (previewRefreshTimerRef.current) {
        window.clearTimeout(previewRefreshTimerRef.current)
        previewRefreshTimerRef.current = null
      }
      return
    }

      const schedulePreviewRefresh = () => {
        if (previewRefreshTimerRef.current) {
          window.clearTimeout(previewRefreshTimerRef.current)
        }
        previewRefreshTimerRef.current = window.setTimeout(() => {
          previewRefreshTimerRef.current = null
          void (async () => {
            await refreshPreview()
            await refreshSelectedElement(selectedBackendNodeRef.current)
          })()
        }, 140)
      }

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => schedulePreviewRefresh())
      : null

    const targets = [
      builtinPreviewRef.current,
    ].filter((target): target is HTMLDivElement => Boolean(target))

    targets.forEach((target) => observer?.observe(target))
    window.addEventListener('resize', schedulePreviewRefresh)

    return () => {
      if (previewRefreshTimerRef.current) {
        window.clearTimeout(previewRefreshTimerRef.current)
        previewRefreshTimerRef.current = null
      }
      observer?.disconnect()
      window.removeEventListener('resize', schedulePreviewRefresh)
    }
  }, [activeTool, connected, mode, refreshPreview])

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
    setPageTitle('')
    setPreviewImage(null)
    setPreviewViewport({ x: 0, y: 0, width: 0, height: 0 })
    setPreviewLoading(false)
    setIsWorkbenchVisible(true)
    resetInspectorState()
  }, [resetInspectorState])

  const handleCopyAIPrompt = async (styleDiff: Record<string, string>) => {
    if (!element) return
    if (Object.keys(styleDiff).length === 0 && notes.length === 0) {
      flash('当前还没有可导出的微调改动')
      return
    }

    await copyText(buildStyleDiffPrompt(element, styleDiff, notes), '微调 Prompt 已复制')
  }

  const handleResolveElementAtPoint = useCallback(async (x: number, y: number) => {
    try {
      return await window.electronAPI.inspectElementAtPoint({ x, y })
    } catch (error) {
      console.error(error)
      return null
    }
  }, [])

  const handleResolveElementStackAtPoint = useCallback(async (x: number, y: number) => {
    try {
      return await window.electronAPI.inspectElementStackAtPoint({ x, y })
    } catch (error) {
      console.error(error)
      return []
    }
  }, [])

  const handleSelectElement = useCallback((selectedElement: InspectedElement) => {
    syncCurrentElement(selectedElement)
    if (mode === 'builtin' && activeToolRef.current === 'note') {
      void refreshPreview()
    }
  }, [mode, refreshPreview, syncCurrentElement])

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
              activeTool !== 'note' ? (
                <div className="canvas-browserview" ref={builtinCanvasRef}>
                  <div className="canvas-hud">
                    <span className="canvas-hud-chip">Live Canvas</span>
                    <span className="canvas-hud-title">{currentTargetLabel}</span>
                  </div>
                  <span className="loading">{pageTitle || '页面加载中…'}</span>
                </div>
              ) : (
                <div className="builtin-preview-stage" ref={builtinPreviewRef}>
                  {previewImage ? (
                    <img
                      ref={builtinPreviewImageRef}
                      className="builtin-preview-image"
                      src={previewImage}
                      alt={currentTargetLabel}
                    />
                  ) : (
                    <div className="builtin-preview-placeholder">
                      {previewLoading ? '预览同步中…' : '等待页面预览…'}
                    </div>
                  )}
                  <div className="canvas-hud">
                    <span className="canvas-hud-chip">Mirror Canvas</span>
                    <span className="canvas-hud-title">{currentTargetLabel}</span>
                  </div>
                  <OverlayInspector
                    activeTool={activeTool}
                    activeEditProperty={activeEditProperty}
                    element={element}
                    notes={notes}
                    activeNoteId={activeNoteId}
                    draftNoteTargets={draftNoteTargets}
                    containerRef={builtinPreviewRef}
                    imageRef={builtinPreviewImageRef}
                    viewportOffset={previewViewport}
                    showToolbar={false}
                    onToolChange={setActiveTool}
                    onResolveElementAtPoint={handleResolveElementAtPoint}
                    onResolveElementStackAtPoint={handleResolveElementStackAtPoint}
                    onOpenNoteComposer={handleOpenNoteComposer}
                    onSelectNote={handleActivateNote}
                    onDeleteNote={handleDeleteNote}
                    onMoveNote={handleMoveNote}
                    onSelectElement={handleSelectElement}
                  />
                </div>
              )
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
                notes={notes}
                activeNoteId={activeNoteId}
                draftNoteTargets={draftNoteTargets}
                draftNoteText={draftNoteText}
                activeEditProperty={activeEditProperty}
                selectionRevision={selectionRevision}
                onElementChange={(nextElement) => {
                  syncCurrentElement(nextElement)
                  if (mode === 'builtin' && activeTool === 'note') {
                    void refreshPreview()
                  }
                }}
                onToolChange={setActiveTool}
                onActiveEditPropertyChange={setActiveEditProperty}
                onUpsertNote={handleUpsertNote}
                onDraftNoteTextChange={setDraftNoteText}
                onFinalizeDraftNote={handleFinalizeDraftNote}
                onActivateNote={handleActivateNote}
                onDeleteNote={handleDeleteNote}
                onCopyAIPrompt={(styleDiff) => void handleCopyAIPrompt(styleDiff)}
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
