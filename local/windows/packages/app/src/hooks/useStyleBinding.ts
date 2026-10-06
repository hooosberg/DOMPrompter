import { useCallback, useEffect, useRef, useState } from 'react'
import type { InspectedElement, OverlayNudgeChange, PersistedStyleHistoryState, StyleHistoryEntry } from '../types'

export interface GlobalHistoryCommitInfo {
  backendNodeId: number
  kind: 'commit' | 'external' | 'reset'
}

interface UseStyleBindingOptions {
  element: InspectedElement | null
  selectionRevision: number
  historyScopeKey?: string | null
  persistedStyleHistory?: PersistedStyleHistoryState | null
  externalNudgeChange?: OverlayNudgeChange | null
  externalNudgeTick?: number
  onElementChange: (element: InspectedElement) => void
  onStyleDiffChange?: (element: InspectedElement, styleDiff: Record<string, string>) => void
  onPersistedStyleHistoryChange?: (history: PersistedStyleHistoryState | null) => void
  onGlobalHistoryCommit?: (info: GlobalHistoryCommitInfo) => void
}

export function expandStylePatch(stylePatch: Record<string, string>) {
  const nextPatch = { ...stylePatch }

  if (Object.prototype.hasOwnProperty.call(stylePatch, 'gap')) {
    nextPatch['row-gap'] = stylePatch.gap
    nextPatch['column-gap'] = stylePatch.gap
  }

  return nextPatch
}

function readEffectiveStyleValue(propertyName: string, styles: Record<string, string>) {
  if (propertyName === 'gap') {
    return styles.gap || styles['row-gap'] || styles['column-gap'] || ''
  }

  return styles[propertyName] || ''
}

function cloneHistoryEntries(entries: StyleHistoryEntry[]) {
  return entries.map((entry) => ({
    undoPatch: { ...entry.undoPatch },
    redoPatch: { ...entry.redoPatch },
    diffKeys: [...entry.diffKeys],
  }))
}

function buildStyleDiffFromBaseline(
  styles: Record<string, string>,
  baselineStyles: Record<string, string>,
) {
  const diff: Record<string, string> = {}
  const keys = new Set([
    ...Object.keys(styles),
    ...Object.keys(baselineStyles),
  ])

  keys.forEach((propertyName) => {
    const currentValue = readEffectiveStyleValue(propertyName, styles)
    const baselineValue = readEffectiveStyleValue(propertyName, baselineStyles)

    if (currentValue === baselineValue || (!currentValue && !baselineValue)) {
      return
    }

    diff[propertyName] = currentValue
  })

  return diff
}

function areStyleDiffRecordsEqual(
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

export function useStyleBinding({
  element,
  selectionRevision,
  historyScopeKey,
  persistedStyleHistory,
  externalNudgeChange,
  externalNudgeTick,
  onElementChange,
  onStyleDiffChange,
  onPersistedStyleHistoryChange,
  onGlobalHistoryCommit,
}: UseStyleBindingOptions) {
  const [draftStyles, setDraftStyles] = useState<Record<string, string>>({})
  const [styleDiff, setStyleDiff] = useState<Record<string, string>>({})
  const [pendingField, setPendingField] = useState<string | null>(null)
  const [historyDepth, setHistoryDepth] = useState(0)
  const [redoDepth, setRedoDepth] = useState(0)
  const baselineRef = useRef<Record<string, string>>({})
  const resetRevisionRef = useRef<number>(-1)
  const activeHistoryScopeRef = useRef<string | null>(null)
  const handledExternalTickRef = useRef<number>(0)
  const timersRef = useRef<Record<string, number>>({})
  const draftStylesRef = useRef<Record<string, string>>({})
  const historyRef = useRef<StyleHistoryEntry[]>([])
  const redoRef = useRef<StyleHistoryEntry[]>([])

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const scheduleUpdate = useCallback(async (
    fieldKey: string,
    work: () => Promise<InspectedElement | null>,
  ) => {
    window.clearTimeout(timersRef.current[fieldKey])
    setPendingField(fieldKey)

    timersRef.current[fieldKey] = window.setTimeout(async () => {
      try {
        const updated = await work()
        if (updated) {
          onElementChange(updated)
        }
      } finally {
        setPendingField((current) => (current === fieldKey ? null : current))
      }
    }, 160)
  }, [onElementChange])

  const clearHistory = useCallback(() => {
    setStyleDiff({})
    historyRef.current = []
    redoRef.current = []
    setHistoryDepth(0)
    setRedoDepth(0)
  }, [])

  const syncPersistedHistory = useCallback((baselineStyles = baselineRef.current) => {
    if (!onPersistedStyleHistoryChange) return

    onPersistedStyleHistoryChange({
      baselineStyles: { ...baselineStyles },
      history: cloneHistoryEntries(historyRef.current),
      redo: cloneHistoryEntries(redoRef.current),
    })
  }, [onPersistedStyleHistoryChange])

  const syncStyleDiffState = useCallback((nextStyleDiff: Record<string, string>) => {
    setStyleDiff((current) => (
      areStyleDiffRecordsEqual(current, nextStyleDiff)
        ? current
        : nextStyleDiff
    ))
  }, [])

  const syncDraftAndDiff = useCallback((stylePatch: Record<string, string>, diffKeys: string[]) => {
    setDraftStyles((current) => {
      const nextDraft = {
        ...current,
        ...stylePatch,
      }
      draftStylesRef.current = nextDraft
      return nextDraft
    })

    setStyleDiff((current) => {
      const next = { ...current }
      diffKeys.forEach((propertyName) => {
        const baselineValue = baselineRef.current[propertyName]
          ?? (propertyName === 'gap'
            ? baselineRef.current['row-gap'] || baselineRef.current['column-gap'] || ''
            : '')
        const propertyValue = stylePatch[propertyName] ?? ''

        if (propertyValue === baselineValue || (!propertyValue && !baselineValue)) {
          delete next[propertyName]
        } else {
          next[propertyName] = propertyValue
        }
      })

      return next
    })
  }, [])

  const pushHistoryEntry = useCallback((entry: StyleHistoryEntry) => {
    historyRef.current.push(entry)
    redoRef.current = []
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(0)
    syncPersistedHistory()
  }, [syncPersistedHistory])

  const commitPanelStyleChange = useCallback((stylePatch: Record<string, string>, fieldKey = `styles:${Object.keys(stylePatch).sort().join(',')}`) => {
    if (!element) return

    const diffKeys = Object.keys(stylePatch)
    if (diffKeys.length === 0) return

    const expandedPatch = expandStylePatch(stylePatch)
    const undoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = readEffectiveStyleValue(propertyName, draftStylesRef.current)
      return current
    }, {})

    const hasRealChange = diffKeys.some((propertyName) => undoPatch[propertyName] !== stylePatch[propertyName])
    if (!hasRealChange) return

    pushHistoryEntry({ undoPatch, redoPatch: stylePatch, diffKeys })
    onGlobalHistoryCommit?.({ backendNodeId: element.backendNodeId, kind: 'commit' })

    syncDraftAndDiff(expandedPatch, diffKeys)

    void scheduleUpdate(fieldKey, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, pushHistoryEntry, scheduleUpdate, syncDraftAndDiff, onGlobalHistoryCommit])

  const commitExternalStyleChange = useCallback((change: OverlayNudgeChange) => {
    const diffKeys = change.keys.filter(Boolean)
    if (diffKeys.length === 0) return

    const undoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = change.beforeStyles[propertyName]
        ?? readEffectiveStyleValue(propertyName, draftStylesRef.current)
      return current
    }, {})
    const redoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = change.afterStyles[propertyName] ?? ''
      return current
    }, {})

    const hasRealChange = diffKeys.some((propertyName) => undoPatch[propertyName] !== redoPatch[propertyName])
    if (!hasRealChange) return

    pushHistoryEntry({ undoPatch, redoPatch, diffKeys })
    onGlobalHistoryCommit?.({ backendNodeId: element?.backendNodeId ?? 0, kind: 'external' })
    syncDraftAndDiff(expandStylePatch(redoPatch), diffKeys)
  }, [element, pushHistoryEntry, syncDraftAndDiff, onGlobalHistoryCommit])

  useEffect(() => {
    if (!element) {
      baselineRef.current = {}
      activeHistoryScopeRef.current = null
      handledExternalTickRef.current = 0
      setDraftStyles({})
      setStyleDiff({})
      setPendingField(null)
      draftStylesRef.current = {}
      historyRef.current = []
      redoRef.current = []
      setHistoryDepth(0)
      setRedoDepth(0)
      return
    }

    const nextHistoryScope = historyScopeKey || '__local__'
    if (
      resetRevisionRef.current !== selectionRevision
      || activeHistoryScopeRef.current !== nextHistoryScope
    ) {
      resetRevisionRef.current = selectionRevision
      activeHistoryScopeRef.current = nextHistoryScope
      handledExternalTickRef.current = externalNudgeTick ?? 0

      if (persistedStyleHistory) {
        baselineRef.current = { ...persistedStyleHistory.baselineStyles }
        historyRef.current = cloneHistoryEntries(persistedStyleHistory.history)
        redoRef.current = cloneHistoryEntries(persistedStyleHistory.redo)
        setHistoryDepth(historyRef.current.length)
        setRedoDepth(redoRef.current.length)
        syncStyleDiffState(buildStyleDiffFromBaseline(element.computedStyles, baselineRef.current))
      } else {
        baselineRef.current = element.computedStyles
        clearHistory()
        syncPersistedHistory(element.computedStyles)
      }

      setDraftStyles(element.computedStyles)
      draftStylesRef.current = element.computedStyles
      return
    }

    if (
      typeof externalNudgeTick === 'number'
      && externalNudgeTick > 0
      && externalNudgeTick !== handledExternalTickRef.current
      && externalNudgeChange
    ) {
      handledExternalTickRef.current = externalNudgeTick
      commitExternalStyleChange(externalNudgeChange)
      return
    }

    setDraftStyles(element.computedStyles)
    draftStylesRef.current = element.computedStyles
    syncStyleDiffState(buildStyleDiffFromBaseline(element.computedStyles, baselineRef.current))
  }, [
    clearHistory,
    commitExternalStyleChange,
    element,
    externalNudgeChange,
    externalNudgeTick,
    historyScopeKey,
    persistedStyleHistory,
    selectionRevision,
    syncStyleDiffState,
    syncPersistedHistory,
  ])

  useEffect(() => {
    if (!element || !onStyleDiffChange) return
    onStyleDiffChange(element, styleDiff)
  }, [element, onStyleDiffChange, styleDiff])

  const updateStyle = useCallback((propertyName: string, propertyValue: string) => {
    if (!element) return

    commitPanelStyleChange({ [propertyName]: propertyValue }, `style:${propertyName}`)
  }, [commitPanelStyleChange, element])

  const updateTextContent = useCallback((textContent: string) => {
    if (!element) return

    void scheduleUpdate('textContent', () =>
      window.electronAPI.updateTextContent({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        value: textContent,
      }),
    )
  }, [element, scheduleUpdate])

  const updateAttribute = useCallback((attributeName: string, attributeValue: string) => {
    if (!element) return

    void scheduleUpdate(`attr:${attributeName}`, () =>
      window.electronAPI.updateElementAttribute({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        name: attributeName,
        value: attributeValue,
      }),
    )
  }, [element, scheduleUpdate])

  const undoLastStyleChange = useCallback(() => {
    if (!element) return

    const historyEntry = historyRef.current.pop()
    if (!historyEntry) return

    redoRef.current.push(historyEntry)
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(redoRef.current.length)
    syncPersistedHistory()
    const expandedPatch = expandStylePatch(historyEntry.undoPatch)
    syncDraftAndDiff(expandedPatch, historyEntry.diffKeys)

    void scheduleUpdate(`undo:${historyEntry.diffKeys.join(',')}`, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, syncDraftAndDiff, syncPersistedHistory])

  const redoLastStyleChange = useCallback(() => {
    if (!element) return

    const historyEntry = redoRef.current.pop()
    if (!historyEntry) return

    historyRef.current.push(historyEntry)
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(redoRef.current.length)
    syncPersistedHistory()
    const expandedPatch = expandStylePatch(historyEntry.redoPatch)
    syncDraftAndDiff(expandedPatch, historyEntry.diffKeys)

    void scheduleUpdate(`redo:${historyEntry.diffKeys.join(',')}`, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, syncDraftAndDiff, syncPersistedHistory])

  const resetStyleChanges = useCallback(() => {
    if (!element) return

    const diffKeys = Object.keys(styleDiff)
    if (diffKeys.length === 0) return

    const undoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = readEffectiveStyleValue(propertyName, draftStylesRef.current)
      return current
    }, {})
    const redoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = baselineRef.current[propertyName]
        ?? (propertyName === 'gap'
          ? baselineRef.current['row-gap'] || baselineRef.current['column-gap'] || ''
          : '')
      return current
    }, {})

    historyRef.current.push({ undoPatch, redoPatch, diffKeys })
    redoRef.current = []
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(0)
    syncPersistedHistory()
    onGlobalHistoryCommit?.({ backendNodeId: element.backendNodeId, kind: 'reset' })

    const expandedPatch = expandStylePatch(redoPatch)
    syncDraftAndDiff(expandedPatch, diffKeys)

    void scheduleUpdate('reset:all', () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, styleDiff, syncDraftAndDiff, syncPersistedHistory, onGlobalHistoryCommit])

  return {
    draftStyles,
    pendingField,
    styleDiff,
    canUndo: historyDepth > 0,
    canRedo: redoDepth > 0,
    canReset: Object.keys(styleDiff).length > 0,
    commitPanelStyleChange,
    commitExternalStyleChange,
    updateStyle,
    updateStyles: commitPanelStyleChange,
    updateTextContent,
    updateAttribute,
    undoLastStyleChange,
    redoLastStyleChange,
    resetStyleChanges,
  }
}
