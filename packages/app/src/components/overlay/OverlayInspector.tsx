import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ActiveEditProperty, BoxModelRect, CanvasTool, ElementNote, ElementNoteTarget, InspectedElement } from '../../types'

interface OverlayInspectorProps {
  activeTool: CanvasTool
  activeEditProperty?: ActiveEditProperty | null
  element: InspectedElement | null
  notes: ElementNote[]
  activeNoteId?: string | null
  draftNoteTargets?: ElementNoteTarget[]
  containerRef: RefObject<HTMLDivElement | null>
  imageRef?: RefObject<HTMLImageElement | null>
  viewportOffset?: BoxModelRect
  compact?: boolean
  showToolbar?: boolean
  onToolChange: (tool: CanvasTool) => void
  onResolveElementAtPoint: (x: number, y: number) => Promise<InspectedElement | null>
  onResolveElementStackAtPoint: (x: number, y: number) => Promise<InspectedElement[]>
  onSelectElement: (element: InspectedElement) => void
  onOpenNoteComposer: (element: InspectedElement, options?: { append?: boolean }) => void
  onSelectNote: (note: ElementNote) => void
  onDeleteNote: (noteId: string) => void
  onMoveNote: (noteId: string, deltaX: number, deltaY: number) => void
}

interface SurfaceMetrics {
  offsetX: number
  offsetY: number
  renderedWidth: number
  renderedHeight: number
  scale: number
}

interface OverlayFrame {
  x: number
  y: number
  width: number
  height: number
}

interface GuideBand extends OverlayFrame {
  side: 'top' | 'right' | 'bottom' | 'left'
}

interface DescendantFrame extends OverlayFrame {
  depth: number
  label: string
}

interface GapMarker {
  orientation: 'row' | 'column'
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  text: string
}

interface OverlayPoint {
  x: number
  y: number
}

interface ConnectorBounds {
  x: number
  y: number
  width: number
  height: number
}

interface NoteConnectorLayout {
  bounds: ConnectorBounds
  anchors: OverlayPoint[]
  endpoints: OverlayPoint[]
  endpointOffsets: OverlayPoint[]
  paths: string[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildConnectorPath(start: OverlayPoint, end: OverlayPoint) {
  const deltaX = end.x - start.x
  const handle = clamp(Math.abs(deltaX) * 0.42, 22, 88)
  const direction = deltaX >= 0 ? 1 : -1
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${(start.x + handle * direction).toFixed(2)} ${start.y.toFixed(2)}, ${(end.x - handle * direction).toFixed(2)} ${end.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

function buildNoteConnectorLayout(
  chip: { x: number; y: number; width: number; height: number },
  anchors: OverlayPoint[],
): NoteConnectorLayout | null {
  if (anchors.length === 0) {
    return null
  }

  const sortedAnchors = [...anchors].sort((left, right) => left.y - right.y)
  const chipCenterX = chip.x + chip.width / 2
  const averageAnchorX = sortedAnchors.reduce((sum, anchor) => sum + anchor.x, 0) / sortedAnchors.length
  const endpointX = averageAnchorX <= chipCenterX ? chip.x : chip.x + chip.width
  const endpointTop = 18
  const endpointBottom = 18
  const availableHeight = Math.max(0, chip.height - endpointTop - endpointBottom)
  const endpointGap = sortedAnchors.length <= 1
    ? 0
    : Math.max(18, Math.min(34, availableHeight / (sortedAnchors.length - 1 || 1)))
  const endpoints = sortedAnchors.map((_, index) => ({
    x: endpointX,
    y: clamp(chip.y + endpointTop + index * endpointGap, chip.y + endpointTop, chip.y + chip.height - endpointBottom),
  }))
  const allPoints = [...sortedAnchors, ...endpoints]
  const padding = 28
  const bounds: ConnectorBounds = {
    x: Math.min(...allPoints.map((point) => point.x)) - padding,
    y: Math.min(...allPoints.map((point) => point.y)) - padding,
    width: Math.max(...allPoints.map((point) => point.x)) - Math.min(...allPoints.map((point) => point.x)) + padding * 2,
    height: Math.max(...allPoints.map((point) => point.y)) - Math.min(...allPoints.map((point) => point.y)) + padding * 2,
  }

  const toLocal = (point: OverlayPoint): OverlayPoint => ({
    x: point.x - bounds.x,
    y: point.y - bounds.y,
  })

  const localAnchors = sortedAnchors.map(toLocal)
  const localEndpoints = endpoints.map(toLocal)

  return {
    bounds,
    anchors: localAnchors,
    endpoints: localEndpoints,
    endpointOffsets: endpoints.map((point) => ({
      x: point.x - chip.x,
      y: point.y - chip.y,
    })),
    paths: localAnchors.map((anchor, index) => buildConnectorPath(anchor, localEndpoints[index])),
  }
}

function estimateNoteSize(note: ElementNote) {
  const title = getNoteDisplayName(note)
  const lines = note.text.split(/\n+/).filter(Boolean)
  const longestLine = Math.max(
    title.length,
    ...lines.map((line) => line.length),
    12,
  )
  const lineCount = Math.max(
    1,
    lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 20)), 0),
  )

  return {
    width: Math.min(240, Math.max(152, longestLine * 7.4 + 34)),
    height: Math.min(160, 54 + lineCount * 18),
  }
}

function getPrimaryNoteTarget(note: ElementNote): ElementNoteTarget | null {
  return note.targets[0] || null
}

function getNoteDisplayName(note: ElementNote) {
  const primaryTarget = getPrimaryNoteTarget(note)
  if (!primaryTarget) {
    return 'UNTITLED'
  }

  return note.targets
    .slice(0, 3)
    .map((target) => target.selector.toUpperCase())
    .join(' · ')
}

const TOOL_ITEMS: Array<{ tool: Exclude<CanvasTool, 'browse'>; icon: string; label: string }> = [
  { tool: 'select', icon: '↖', label: '选择' },
  { tool: 'note', icon: '✎', label: '便签' },
]

function computeSurfaceMetrics(
  container: HTMLDivElement | null,
  image: HTMLImageElement | null | undefined,
  viewport: BoxModelRect | undefined,
): SurfaceMetrics | null {
  if (!container) return null

  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  if (!containerWidth || !containerHeight) return null

  const viewportWidth = viewport?.width || 0
  const viewportHeight = viewport?.height || 0

  if (viewportWidth > 0 && viewportHeight > 0) {
    const scale = Math.min(containerWidth / viewportWidth, containerHeight / viewportHeight)
    const renderedWidth = viewportWidth * scale
    const renderedHeight = viewportHeight * scale

    return {
      offsetX: (containerWidth - renderedWidth) / 2,
      offsetY: (containerHeight - renderedHeight) / 2,
      renderedWidth,
      renderedHeight,
      scale,
    }
  }

  if (!image) {
    return {
      offsetX: 0,
      offsetY: 0,
      renderedWidth: containerWidth,
      renderedHeight: containerHeight,
      scale: 1,
    }
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    return null
  }

  const scale = Math.min(containerWidth / image.naturalWidth, containerHeight / image.naturalHeight)
  const renderedWidth = image.naturalWidth * scale
  const renderedHeight = image.naturalHeight * scale

  return {
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    scale,
  }
}

function toOverlayRect(rect: BoxModelRect, surface: SurfaceMetrics, viewportOffset: { x: number; y: number }): OverlayFrame {
  return {
    x: surface.offsetX + (rect.x - viewportOffset.x) * surface.scale,
    y: surface.offsetY + (rect.y - viewportOffset.y) * surface.scale,
    width: Math.max(1, rect.width * surface.scale),
    height: Math.max(1, rect.height * surface.scale),
  }
}

function toOverlayFrame(element: InspectedElement, surface: SurfaceMetrics, viewportOffset: { x: number; y: number }): OverlayFrame | null {
  if (!element.boxModel) return null
  return toOverlayRect(element.boxModel, surface, viewportOffset)
}

function buildGuideBands(outer: OverlayFrame, inner: OverlayFrame): GuideBand[] {
  return [
    { side: 'top' as const, x: outer.x, y: outer.y, width: outer.width, height: Math.max(0, inner.y - outer.y) },
    { side: 'right' as const, x: inner.x + inner.width, y: inner.y, width: Math.max(0, outer.x + outer.width - (inner.x + inner.width)), height: inner.height },
    { side: 'bottom' as const, x: outer.x, y: inner.y + inner.height, width: outer.width, height: Math.max(0, outer.y + outer.height - (inner.y + inner.height)) },
    { side: 'left' as const, x: outer.x, y: inner.y, width: Math.max(0, inner.x - outer.x), height: inner.height },
  ].filter((band) => band.width > 0 && band.height > 0)
}

function getOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}

function parseMetricToken(value: string | undefined): string {
  const trimmed = (value || '').trim()
  return trimmed || '0px'
}

function parseMetricNumber(value: string | undefined): number {
  const match = String(value || '').match(/-?\d*\.?\d+/)
  return match ? Number(match[0]) : 0
}

function buildElementLabel(element: InspectedElement): string {
  const tagName = element.tagName.toLowerCase()
  if (element.id) return `${tagName}#${element.id}`
  if (element.classNames.length > 0) return `${tagName}.${element.classNames[0]}`
  return tagName
}

function shouldIgnorePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest('.overlay-floating-toolbar')
    || target.closest('.overlay-note-chip')
    || target.closest('.overlay-context-menu')
  )
}

export function OverlayInspector({
  activeTool,
  activeEditProperty = null,
  element,
  notes,
  activeNoteId = null,
  draftNoteTargets = [],
  containerRef,
  imageRef,
  viewportOffset = { x: 0, y: 0, width: 0, height: 0 },
  compact = false,
  showToolbar = true,
  onToolChange,
  onResolveElementAtPoint,
  onResolveElementStackAtPoint,
  onSelectElement,
  onOpenNoteComposer,
  onSelectNote,
  onDeleteNote,
  onMoveNote,
}: OverlayInspectorProps) {
  const portalRoot = typeof document !== 'undefined'
    ? document.getElementById('inspector-top-layer') || document.body
    : null
  const hoverTimerRef = useRef<number | null>(null)
  const hoverLookupTokenRef = useRef(0)
  const hoverPointRef = useRef<{ x: number; y: number } | null>(null)
  const shiftPressedRef = useRef(false)
  const selectionCycleRef = useRef<{
    point: { x: number; y: number }
    stack: InspectedElement[]
  } | null>(null)
  const dragRef = useRef<{ noteId: string; startX: number; startY: number } | null>(null)
  const [surfaceMetrics, setSurfaceMetrics] = useState<SurfaceMetrics | null>(null)
  const [containerBounds, setContainerBounds] = useState<DOMRect | null>(null)
  const [hoveredElement, setHoveredElement] = useState<InspectedElement | null>(null)
  const [hoveredStack, setHoveredStack] = useState<InspectedElement[]>([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; element: InspectedElement } | null>(null)

  const refreshSurfaceMetrics = useCallback(() => {
    const container = containerRef.current
    setSurfaceMetrics(computeSurfaceMetrics(container, imageRef?.current, viewportOffset))
    setContainerBounds(container ? container.getBoundingClientRect() : null)
  }, [containerRef, imageRef, viewportOffset])

  const clearHover = useCallback(() => {
    hoverLookupTokenRef.current += 1
    hoverPointRef.current = null
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoveredElement(null)
    setHoveredStack([])
  }, [])

  useEffect(() => {
    refreshSurfaceMetrics()

    const container = containerRef.current
    const image = imageRef?.current
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshSurfaceMetrics) : null

    if (container && observer) observer.observe(container)
    if (image && observer) observer.observe(image)
    image?.addEventListener('load', refreshSurfaceMetrics)
    if (image?.complete) {
      window.requestAnimationFrame(refreshSurfaceMetrics)
    }
    window.addEventListener('resize', refreshSurfaceMetrics)

    return () => {
      observer?.disconnect()
      image?.removeEventListener('load', refreshSurfaceMetrics)
      window.removeEventListener('resize', refreshSurfaceMetrics)
    }
  }, [containerRef, imageRef, refreshSurfaceMetrics])

  useEffect(() => {
    if (activeTool === 'browse') {
      clearHover()
      selectionCycleRef.current = null
    }
  }, [activeTool, clearHover])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (activeTool === 'browse') return
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return
      }

      const cycle = selectionCycleRef.current
      if (!cycle || cycle.stack.length === 0) return

      const currentIndex = element
        ? cycle.stack.findIndex((candidate) => candidate.backendNodeId === element.backendNodeId)
        : -1
      const nextIndex = currentIndex === -1
        ? Math.min(1, cycle.stack.length - 1)
        : Math.min(cycle.stack.length - 1, currentIndex + 1)
      const nextElement = cycle.stack[nextIndex]
      if (!nextElement) return

      setHoveredStack(cycle.stack)
      setHoveredElement(nextElement)
      setContextMenu(null)
      onSelectElement(nextElement)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTool, element, onSelectElement])

  useEffect(() => () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftPressedRef.current = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftPressedRef.current = false
      }
    }

    const handleBlur = () => {
      shiftPressedRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const currentDrag = dragRef.current
      const surface = surfaceMetrics
      if (!currentDrag || !surface) return

      onMoveNote(
        currentDrag.noteId,
        (event.clientX - currentDrag.startX) / surface.scale,
        (event.clientY - currentDrag.startY) / surface.scale,
      )

      dragRef.current = {
        noteId: currentDrag.noteId,
        startX: event.clientX,
        startY: event.clientY,
      }
    }

    const handlePointerUp = () => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [onMoveNote, surfaceMetrics])

  const frame = useMemo(() => {
    if (!element || !surfaceMetrics) return null
    return toOverlayFrame(element, surfaceMetrics, viewportOffset)
  }, [element, surfaceMetrics, viewportOffset])

  const hoverFrame = useMemo(() => {
    if (!hoveredElement || !surfaceMetrics) return null
    if (hoveredElement.backendNodeId === element?.backendNodeId) return null
    return toOverlayFrame(hoveredElement, surfaceMetrics, viewportOffset)
  }, [element?.backendNodeId, hoveredElement, surfaceMetrics, viewportOffset])

  const descendantFrames = useMemo<DescendantFrame[]>(() => {
    if (!element?.descendants?.length || !surfaceMetrics) return []

    return element.descendants
      .map((descendant) => ({
        ...toOverlayRect(descendant, surfaceMetrics, viewportOffset),
        depth: descendant.depth,
        label: descendant.label,
      }))
      .filter((descendant) => descendant.width > 2 && descendant.height > 2)
      .sort((left, right) => left.depth - right.depth)
  }, [element?.descendants, surfaceMetrics, viewportOffset])

  const gapMarkers = useMemo<GapMarker[]>(() => {
    if (!frame || descendantFrames.length < 2) return []

    const shallowestDepth = Math.min(...descendantFrames.map((descendant) => descendant.depth))
    const siblings = descendantFrames
      .filter((descendant) => descendant.depth === shallowestDepth)
      .sort((left, right) => left.y - right.y || left.x - right.x)

    if (siblings.length < 2) return []

    const direction = element?.computedStyles['flex-direction']?.startsWith('row') ? 'row' : 'column'
    const markers: GapMarker[] = []

    for (let index = 0; index < siblings.length - 1; index += 1) {
      const current = siblings[index]
      const next = siblings[index + 1]

      if (direction === 'row') {
        const gap = Math.round(next.x - (current.x + current.width))
        const overlap = getOverlap(current.y, current.y + current.height, next.y, next.y + next.height)
        if (gap <= 0 || overlap < 8) continue
        const lineY = Math.max(current.y, next.y) + overlap / 2
        markers.push({
          orientation: 'row',
          x1: current.x + current.width,
          y1: lineY,
          x2: next.x,
          y2: lineY,
          labelX: current.x + current.width + gap / 2,
          labelY: lineY - 12,
          text: `${gap}px`,
        })
      } else {
        const gap = Math.round(next.y - (current.y + current.height))
        const overlap = getOverlap(current.x, current.x + current.width, next.x, next.x + next.width)
        if (gap <= 0 || overlap < 8) continue
        const lineX = Math.max(current.x, next.x) + overlap / 2
        markers.push({
          orientation: 'column',
          x1: lineX,
          y1: current.y + current.height,
          x2: lineX,
          y2: next.y,
          labelX: lineX,
          labelY: current.y + current.height + gap / 2,
          text: `${gap}px`,
        })
      }
    }

    return markers
  }, [descendantFrames, element?.computedStyles, frame])

  const activeGuide = useMemo(() => {
    if (!element?.boxModel || !surfaceMetrics || !activeEditProperty) return null

    if (activeEditProperty === 'margin') {
      const outer = toOverlayRect(element.boxModel.margin, surfaceMetrics, viewportOffset)
      const inner = toOverlayRect(element.boxModel.border, surfaceMetrics, viewportOffset)
      return {
        tone: 'margin' as const,
        bands: buildGuideBands(outer, inner),
        badges: [
          { side: 'top', text: parseMetricToken(element.computedStyles['margin-top']), x: inner.x + inner.width / 2, y: outer.y + 8 },
          { side: 'right', text: parseMetricToken(element.computedStyles['margin-right']), x: inner.x + inner.width + 10, y: inner.y + inner.height / 2 },
          { side: 'bottom', text: parseMetricToken(element.computedStyles['margin-bottom']), x: inner.x + inner.width / 2, y: inner.y + inner.height + 10 },
          { side: 'left', text: parseMetricToken(element.computedStyles['margin-left']), x: outer.x + 8, y: inner.y + inner.height / 2 },
        ],
        baseline: null,
      }
    }

    if (activeEditProperty === 'padding') {
      const outer = toOverlayRect(element.boxModel.padding, surfaceMetrics, viewportOffset)
      const inner = toOverlayRect(element.boxModel.content, surfaceMetrics, viewportOffset)
      return {
        tone: 'padding' as const,
        bands: buildGuideBands(outer, inner),
        badges: [
          { side: 'top', text: parseMetricToken(element.computedStyles['padding-top']), x: outer.x + outer.width / 2, y: outer.y + 8 },
          { side: 'right', text: parseMetricToken(element.computedStyles['padding-right']), x: inner.x + inner.width + 10, y: inner.y + inner.height / 2 },
          { side: 'bottom', text: parseMetricToken(element.computedStyles['padding-bottom']), x: outer.x + outer.width / 2, y: inner.y + inner.height + 10 },
          { side: 'left', text: parseMetricToken(element.computedStyles['padding-left']), x: outer.x + 8, y: inner.y + inner.height / 2 },
        ],
        baseline: null,
      }
    }

    if (activeEditProperty === 'typography') {
      const content = toOverlayRect(element.boxModel.content, surfaceMetrics, viewportOffset)
      const lineHeight = Number.parseFloat(element.computedStyles['line-height'] || '') || Number.parseFloat(element.computedStyles['font-size'] || '') * 1.35 || 20
      const fontSize = Number.parseFloat(element.computedStyles['font-size'] || '') || 16
      const scaledLineHeight = lineHeight * surfaceMetrics.scale
      const scaledFontSize = fontSize * surfaceMetrics.scale
      const baselineY = Math.min(
        content.y + content.height - 2,
        content.y + Math.max(scaledFontSize, scaledLineHeight) - Math.max(2, scaledFontSize * 0.18),
      )

      return {
        tone: 'typography' as const,
        bands: [],
        badges: [
          {
            side: 'center' as const,
            text: `${Math.round(fontSize)}px / ${Math.round(lineHeight)}px`,
            x: content.x + content.width / 2,
            y: baselineY - 18,
          },
        ],
        baseline: {
          x: content.x,
          y: baselineY,
          width: content.width,
        },
      }
    }

    return null
  }, [activeEditProperty, element, surfaceMetrics, viewportOffset])

  const noteFrames = useMemo(() => {
    if (!surfaceMetrics) return []

    return notes
      .map((note) => {
        const resolvedTargets = note.targets
          .map((target) => {
            const liveBox = target.backendNodeId === element?.backendNodeId
              ? element.boxModel
              : target.boxModel
            if (!liveBox) {
              return null
            }

            return {
              ...target,
              boxModel: liveBox,
              frame: toOverlayRect(liveBox, surfaceMetrics, viewportOffset),
            }
          })
          .filter((target): target is ElementNoteTarget & { boxModel: NonNullable<ElementNoteTarget['boxModel']>; frame: OverlayFrame } => Boolean(target))

        if (resolvedTargets.length === 0) return null

        const primaryTarget = resolvedTargets.find((target) => target.backendNodeId === element?.backendNodeId)
          || resolvedTargets[0]
        const noteFrame = primaryTarget.frame
        const noteSize = estimateNoteSize(note)
        const rawChipX = noteFrame.x + noteFrame.width - 6 + note.offsetX * surfaceMetrics.scale
        const rawChipY = Math.max(surfaceMetrics.offsetY + 8, noteFrame.y - 44 + note.offsetY * surfaceMetrics.scale)
        const minX = surfaceMetrics.offsetX + 10
        const minY = surfaceMetrics.offsetY + 10
        const maxX = Math.max(minX, surfaceMetrics.offsetX + surfaceMetrics.renderedWidth - noteSize.width - 10)
        const maxY = Math.max(minY, surfaceMetrics.offsetY + surfaceMetrics.renderedHeight - noteSize.height - 10)

        return {
          note,
          frame: noteFrame,
          targetFrames: resolvedTargets.map((target) => target.frame),
          chipX: clamp(rawChipX, minX, maxX),
          chipY: clamp(rawChipY, minY, maxY),
          chipWidth: noteSize.width,
          chipHeight: noteSize.height,
        }
      })
      .filter((item): item is { note: ElementNote; frame: OverlayFrame; targetFrames: OverlayFrame[]; chipX: number; chipY: number; chipWidth: number; chipHeight: number } => Boolean(item))
  }, [element?.backendNodeId, element?.boxModel, notes, surfaceMetrics, viewportOffset])

  const visibleNoteTargetFrames = useMemo(() => {
    const persistedFrames = noteFrames.flatMap((entry) => entry.targetFrames.map((targetFrame) => ({
      frame: targetFrame,
      active: entry.note.id === activeNoteId,
    })))

    if (activeNoteId || !surfaceMetrics || draftNoteTargets.length === 0) {
      return persistedFrames
    }

    const draftFrames = draftNoteTargets
      .map((target) => {
        const liveBox = target.backendNodeId === element?.backendNodeId
          ? element.boxModel
          : target.boxModel
        if (!liveBox) {
          return null
        }

        return {
          frame: toOverlayRect(liveBox, surfaceMetrics, viewportOffset),
          active: true,
        }
      })
      .filter((item): item is { frame: OverlayFrame; active: boolean } => Boolean(item))

    return [...persistedFrames, ...draftFrames]
  }, [activeNoteId, draftNoteTargets, element?.backendNodeId, element?.boxModel, noteFrames, surfaceMetrics, viewportOffset])

  const toPagePoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    const surface = surfaceMetrics
    if (!container || !surface) return null

    const rect = container.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top

    if (
      localX < surface.offsetX
      || localY < surface.offsetY
      || localX > surface.offsetX + surface.renderedWidth
      || localY > surface.offsetY + surface.renderedHeight
    ) {
      return null
    }

    return {
      x: viewportOffset.x + (localX - surface.offsetX) / surface.scale,
      y: viewportOffset.y + (localY - surface.offsetY) / surface.scale,
    }
  }, [containerRef, surfaceMetrics, viewportOffset])

  const scheduleHoverLookup = useCallback((point: { x: number; y: number }) => {
    hoverPointRef.current = point
    if (hoverTimerRef.current) return

    hoverTimerRef.current = window.setTimeout(async () => {
      hoverTimerRef.current = null
      const currentPoint = hoverPointRef.current
      if (!currentPoint || activeTool === 'browse') {
        return
      }

      const requestToken = ++hoverLookupTokenRef.current
      const stack = await onResolveElementStackAtPoint(currentPoint.x, currentPoint.y)
      if (requestToken !== hoverLookupTokenRef.current) {
        return
      }

      const hovered = stack[0] || await onResolveElementAtPoint(currentPoint.x, currentPoint.y)
      const currentCycle = selectionCycleRef.current
      if (currentCycle) {
        const movedDistance = Math.hypot(currentPoint.x - currentCycle.point.x, currentPoint.y - currentCycle.point.y)
        const innermostChanged = stack[0]?.backendNodeId !== currentCycle.stack[0]?.backendNodeId
        if (movedDistance > 18 || innermostChanged) {
          selectionCycleRef.current = null
        }
      }
      setHoveredStack(stack)
      setHoveredElement((current) => (
        current?.backendNodeId === hovered?.backendNodeId ? current : hovered
      ))
    }, 48)
  }, [activeTool, onResolveElementAtPoint, onResolveElementStackAtPoint])

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'browse') return
    if (shouldIgnorePointerTarget(event.target)) return
    const point = toPagePoint(event.clientX, event.clientY)
    if (!point) {
      clearHover()
      return
    }

    scheduleHoverLookup(point)
  }, [activeTool, clearHover, scheduleHoverLookup, toPagePoint])

  const handleMouseLeave = useCallback(() => {
    clearHover()
  }, [clearHover])

  const handleClick = useCallback(async (event: MouseEvent<HTMLDivElement>) => {
    setContextMenu(null)
    if (activeTool === 'browse') return

    const clickPoint = toPagePoint(event.clientX, event.clientY)
    const resolvedStack = clickPoint
      ? await onResolveElementStackAtPoint(clickPoint.x, clickPoint.y)
      : []
    const candidates = resolvedStack.length > 0
      ? resolvedStack
      : hoveredStack.length > 0
        ? hoveredStack
        : (hoveredElement ? [hoveredElement] : [])
    if (candidates.length === 0) return

    if (clickPoint) {
      selectionCycleRef.current = {
        point: clickPoint,
        stack: candidates,
      }
    }
    setHoveredStack(candidates)
    setHoveredElement(candidates[0] || null)

    const primary = candidates[0]
    const currentIndex = element
      ? candidates.findIndex((candidate) => candidate.backendNodeId === element.backendNodeId)
      : -1
    const nextElement = currentIndex === -1
      ? primary
      : candidates[Math.max(0, currentIndex - 1)]

    if (activeTool === 'note') {
      onOpenNoteComposer(nextElement, { append: event.shiftKey || shiftPressedRef.current })
      return
    }

    onSelectElement(nextElement)
  }, [activeTool, element, hoveredElement, hoveredStack, onOpenNoteComposer, onResolveElementStackAtPoint, onSelectElement, toPagePoint])

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'browse' || !hoveredElement) return

    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      element: hoveredElement,
    })
  }, [activeTool, hoveredElement])

  return (
    <div
      className={`overlay-inspector-layer ${compact ? 'compact' : ''} tool-${activeTool}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {showToolbar && (
        <div className={`overlay-floating-toolbar ${compact ? 'compact' : ''}`}>
          {TOOL_ITEMS.map((item) => {
            const isActive = activeTool === item.tool
            return (
              <button
                key={item.tool}
                type="button"
                className={`overlay-tool-btn ${isActive ? 'active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (item.tool === 'select') {
                    onToolChange(activeTool === 'select' ? 'browse' : 'select')
                    return
                  }
                  onToolChange(activeTool === 'note' ? 'browse' : 'note')
                }}
                title={item.label}
              >
                <span className="overlay-tool-btn-icon">{item.icon}</span>
                <span className="overlay-tool-btn-label">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {hoverFrame && activeTool !== 'browse' && (
        <div
          className={`overlay-hover-frame ${compact ? 'compact' : ''}`}
          style={{
            width: `${hoverFrame.width}px`,
            height: `${hoverFrame.height}px`,
            transform: `translate(${hoverFrame.x}px, ${hoverFrame.y}px)`,
          }}
        >
          <span className="overlay-hover-label">
            {hoveredElement ? buildElementLabel(hoveredElement) : 'hover'}
          </span>
        </div>
      )}

      {activeGuide && (
        <>
          {activeGuide.bands.map((band) => (
            <div
              key={`${activeGuide.tone}-${band.side}`}
              className={`overlay-guide-band ${activeGuide.tone}`}
              style={{
                width: `${band.width}px`,
                height: `${band.height}px`,
                transform: `translate(${band.x}px, ${band.y}px)`,
              }}
            />
          ))}
          {activeGuide.baseline && (
            <div
              className="overlay-guide-baseline"
              style={{
                width: `${activeGuide.baseline.width}px`,
                transform: `translate(${activeGuide.baseline.x}px, ${activeGuide.baseline.y}px)`,
              }}
            />
          )}
          {activeGuide.badges.map((badge) => (
            <div
              key={`${activeGuide.tone}-${badge.side}-${badge.text}`}
              className={`overlay-guide-badge ${activeGuide.tone}`}
              style={{
                transform: `translate(${badge.x}px, ${badge.y}px) translate(-50%, -50%)`,
              }}
            >
              {badge.text}
            </div>
          ))}
        </>
      )}

      {frame && descendantFrames.length > 0 && (
        <>
          {descendantFrames.map((descendant, index) => (
            <div
              key={`${descendant.label}-${descendant.depth}-${index}`}
              className={`overlay-descendant-frame depth-${Math.min(descendant.depth, 3)}`}
              style={{
                width: `${descendant.width}px`,
                height: `${descendant.height}px`,
                transform: `translate(${descendant.x}px, ${descendant.y}px)`,
              }}
            >
              {descendant.depth === 1 && descendant.width > 80 && descendant.height > 24 && (
                <span className="overlay-descendant-label">{descendant.label}</span>
              )}
            </div>
          ))}
          {(activeEditProperty === 'gap' || parseMetricNumber(element?.computedStyles.gap) > 0) && gapMarkers.map((marker, index) => (
            <div key={`gap-${index}`} className="overlay-gap-marker">
              <span
                className={`overlay-gap-line ${marker.orientation}`}
                style={{
                  width: `${Math.max(1, Math.abs(marker.x2 - marker.x1))}px`,
                  height: `${Math.max(1, Math.abs(marker.y2 - marker.y1))}px`,
                  transform: `translate(${Math.min(marker.x1, marker.x2)}px, ${Math.min(marker.y1, marker.y2)}px)`,
                }}
              />
              <span
                className="overlay-gap-badge"
                style={{
                  transform: `translate(${marker.labelX}px, ${marker.labelY}px) translate(-50%, -50%)`,
                }}
              >
                {marker.text}
              </span>
            </div>
          ))}
        </>
      )}

      {visibleNoteTargetFrames.length > 0 && activeTool === 'note' && (
        <>
          {visibleNoteTargetFrames.map((item, index) => (
            <div
              key={`active-note-frame-${index}`}
              className={`overlay-note-target-frame ${item.active ? 'active' : 'inactive'}`}
              style={{
                width: `${item.frame.width}px`,
                height: `${item.frame.height}px`,
                transform: `translate(${item.frame.x}px, ${item.frame.y}px)`,
              }}
            />
          ))}
        </>
      )}

      {frame && activeTool !== 'browse' && !(activeTool === 'note' && visibleNoteTargetFrames.length > 0) && (
        <div
          className={`overlay-target-proxy ${compact ? 'compact' : ''}`}
          style={{
            width: `${frame.width}px`,
            height: `${frame.height}px`,
            transform: `translate(${frame.x}px, ${frame.y}px)`,
          }}
        >
          <span className="overlay-target-label">{element ? buildElementLabel(element) : 'selected'}</span>
        </div>
      )}

      {containerBounds && portalRoot && createPortal(noteFrames.map(({ note, targetFrames, chipX, chipY, chipWidth, chipHeight }) => {
        const chipGlobalX = containerBounds.left + chipX
        const chipGlobalY = containerBounds.top + chipY
        const chipCenterX = chipGlobalX + chipWidth / 2
        const targetAnchors = targetFrames.map((targetFrame) => ({
          x: containerBounds.left + targetFrame.x + (
            chipCenterX >= containerBounds.left + targetFrame.x + targetFrame.width / 2
              ? targetFrame.width
              : 0
          ),
          y: containerBounds.top + targetFrame.y + targetFrame.height / 2,
        }))
        const connectorLayout = buildNoteConnectorLayout(
          { x: chipGlobalX, y: chipGlobalY, width: chipWidth, height: chipHeight },
          targetAnchors,
        )
        const noteIsActive = note.id === activeNoteId

        return (
          <Fragment key={note.id}>
            {connectorLayout && (
              <svg
                className={`overlay-note-connector-layer ${noteIsActive ? 'active' : 'inactive'}`}
                style={{
                  width: `${connectorLayout.bounds.width}px`,
                  height: `${connectorLayout.bounds.height}px`,
                  transform: `translate(${connectorLayout.bounds.x}px, ${connectorLayout.bounds.y}px)`,
                }}
                viewBox={`0 0 ${connectorLayout.bounds.width} ${connectorLayout.bounds.height}`}
                aria-hidden="true"
              >
                {connectorLayout.paths.map((path, index) => (
                  <path
                    key={`${note.id}-branch-${index}`}
                    className="overlay-note-connector-path branch"
                    d={path}
                  />
                ))}
                {connectorLayout.anchors.map((anchor, index) => (
                  <circle
                    key={`${note.id}-anchor-${index}`}
                    className="overlay-note-connector-node target"
                    cx={anchor.x}
                    cy={anchor.y}
                    r="5"
                  />
                ))}
              </svg>
            )}
            <div
              className={`overlay-note-chip ${noteIsActive ? 'active' : 'inactive'}`}
              style={{
                width: `${chipWidth}px`,
                minHeight: `${chipHeight}px`,
                transform: `translate(${chipGlobalX}px, ${chipGlobalY}px)`,
              }}
              title={note.text}
              onClick={(event) => {
                event.stopPropagation()
                setContextMenu(null)
                onSelectNote(note)
              }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement | null)?.closest('.overlay-note-chip-delete')) {
                  return
                }
                event.stopPropagation()
                dragRef.current = {
                  noteId: note.id,
                  startX: event.clientX,
                  startY: event.clientY,
                }
                setContextMenu(null)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDeleteNote(note.id)
              }}
            >
              {connectorLayout?.endpointOffsets.map((endpoint, index) => (
                <span
                  key={`${note.id}-endpoint-${index}`}
                  className="overlay-note-chip-endpoint"
                  style={{
                    transform: `translate(${endpoint.x}px, ${endpoint.y}px) translate(-50%, -50%)`,
                  }}
                />
              ))}
              <button
                type="button"
                className="overlay-note-chip-delete"
                title="删除便签"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteNote(note.id)
                }}
              >
                ×
              </button>
              <span className="overlay-note-chip-title">{getNoteDisplayName(note)}</span>
              <span className="overlay-note-chip-body">{note.text}</span>
            </div>
          </Fragment>
        )
      }), portalRoot)}

      {contextMenu && portalRoot && createPortal(
        <div
          className="overlay-context-menu"
          style={{ transform: `translate(${contextMenu.x}px, ${contextMenu.y}px)` }}
        >
          <button
            type="button"
            className="overlay-context-menu-item"
            onClick={() => {
              onOpenNoteComposer(contextMenu.element)
              setContextMenu(null)
            }}
          >
            添加便签
          </button>
        </div>,
        portalRoot,
      )}
    </div>
  )
}
