import { useCallback, useEffect, useRef, useState } from 'react'
import type { InspectedElement } from '../types'

interface UseStyleBindingOptions {
  element: InspectedElement | null
  selectionRevision: number
  onElementChange: (element: InspectedElement) => void
}

function expandStylePatch(stylePatch: Record<string, string>) {
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

export function useStyleBinding({ element, selectionRevision, onElementChange }: UseStyleBindingOptions) {
  const [draftStyles, setDraftStyles] = useState<Record<string, string>>({})
  const [styleDiff, setStyleDiff] = useState<Record<string, string>>({})
  const [pendingField, setPendingField] = useState<string | null>(null)
  const [historyDepth, setHistoryDepth] = useState(0)
  const [redoDepth, setRedoDepth] = useState(0)
  const baselineRef = useRef<Record<string, string>>({})
  const resetRevisionRef = useRef<number>(-1)
  const timersRef = useRef<Record<string, number>>({})
  const draftStylesRef = useRef<Record<string, string>>({})
  const historyRef = useRef<Array<{ undoPatch: Record<string, string>; redoPatch: Record<string, string>; diffKeys: string[] }>>([])
  const redoRef = useRef<Array<{ undoPatch: Record<string, string>; redoPatch: Record<string, string>; diffKeys: string[] }>>([])

  useEffect(() => {
    if (!element) {
      baselineRef.current = {}
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

    if (resetRevisionRef.current !== selectionRevision) {
      resetRevisionRef.current = selectionRevision
      baselineRef.current = element.computedStyles
      setStyleDiff({})
      historyRef.current = []
      redoRef.current = []
      setHistoryDepth(0)
      setRedoDepth(0)
    }

    setDraftStyles(element.computedStyles)
    draftStylesRef.current = element.computedStyles
  }, [element, selectionRevision])

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

  const updateStyles = useCallback((stylePatch: Record<string, string>, fieldKey = `styles:${Object.keys(stylePatch).sort().join(',')}`) => {
    if (!element) return

    const diffKeys = Object.keys(stylePatch)
    const expandedPatch = expandStylePatch(stylePatch)
    const undoPatch = diffKeys.reduce<Record<string, string>>((current, propertyName) => {
      current[propertyName] = readEffectiveStyleValue(propertyName, draftStylesRef.current)
      return current
    }, {})

    const hasRealChange = diffKeys.some((propertyName) => undoPatch[propertyName] !== stylePatch[propertyName])
    if (!hasRealChange) {
      return
    }

    historyRef.current.push({ undoPatch, redoPatch: stylePatch, diffKeys })
    redoRef.current = []
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(0)

    syncDraftAndDiff(expandedPatch, diffKeys)

    void scheduleUpdate(fieldKey, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, syncDraftAndDiff])

  const updateStyle = useCallback((propertyName: string, propertyValue: string) => {
    if (!element) return

    updateStyles({ [propertyName]: propertyValue }, `style:${propertyName}`)
  }, [element, updateStyles])

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
    const expandedPatch = expandStylePatch(historyEntry.undoPatch)
    syncDraftAndDiff(expandedPatch, historyEntry.diffKeys)

    void scheduleUpdate(`undo:${historyEntry.diffKeys.join(',')}`, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, syncDraftAndDiff])

  const redoLastStyleChange = useCallback(() => {
    if (!element) return

    const historyEntry = redoRef.current.pop()
    if (!historyEntry) return

    historyRef.current.push(historyEntry)
    setHistoryDepth(historyRef.current.length)
    setRedoDepth(redoRef.current.length)
    const expandedPatch = expandStylePatch(historyEntry.redoPatch)
    syncDraftAndDiff(expandedPatch, historyEntry.diffKeys)

    void scheduleUpdate(`redo:${historyEntry.diffKeys.join(',')}`, () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, syncDraftAndDiff])

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

    const expandedPatch = expandStylePatch(redoPatch)
    syncDraftAndDiff(expandedPatch, diffKeys)

    void scheduleUpdate('reset:all', () =>
      window.electronAPI.updateElementStyles({
        nodeId: element.nodeId,
        backendNodeId: element.backendNodeId,
        styles: expandedPatch,
      }),
    )
  }, [element, scheduleUpdate, styleDiff, syncDraftAndDiff])

  return {
    draftStyles,
    pendingField,
    styleDiff,
    canUndo: historyDepth > 0,
    canRedo: redoDepth > 0,
    canReset: Object.keys(styleDiff).length > 0,
    updateStyle,
    updateStyles,
    updateTextContent,
    updateAttribute,
    undoLastStyleChange,
    redoLastStyleChange,
    resetStyleChanges,
  }
}
