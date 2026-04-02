import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BASE_PROPERTY_SECTIONS, IMAGE_SECTION, TYPOGRAPHY_SECTION } from '../../config/propertySections'
import { useStyleBinding } from '../../hooks/useStyleBinding'
import type { ActiveEditProperty, CanvasTool, ElementTag, ElementTagTarget, InspectedElement, PropertyFieldConfig, PropertySectionConfig } from '../../types'
import { FieldControl } from './FieldControl'

const SNAPSHOT_SECTIONS = [
  { title: '布局快照', keys: ['width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { title: '视觉快照', keys: ['background-color', 'color', 'opacity', 'border', 'border-radius', 'box-shadow'] },
  { title: '排版快照', keys: ['font-size', 'font-weight', 'font-family', 'line-height', 'text-align'] },
  { title: '定位快照', keys: ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'transform', 'overflow', 'object-fit'] },
]

const TOOL_ITEMS: Array<{ tool: Exclude<CanvasTool, 'browse'>; icon: string; label: string }> = [
  { tool: 'select', icon: '↖', label: '选择' },
]

interface RecommendedAction {
  id: string
  label: string
  description: string
  patch: Record<string, string>
  focusKey?: ActiveEditProperty
}

type SpacingTarget = 'padding' | 'margin'
type SpacingSide = 'all' | 'top' | 'right' | 'bottom' | 'left'
type DirectionalPadSlot =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

interface QuickAdjustCardConfig {
  id: string
  title: string
  value: string
  description: string
  focusKey: ActiveEditProperty
  onDecrease: () => void
  onIncrease: () => void
  stepLabel?: string
}

const QUICK_STEP_OPTIONS = [4, 8, 16, 24] as const
const DIRECTIONAL_PAD_LAYOUT: Array<DirectionalPadSlot> = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
]

function isColorValue(value: string) {
  return /^(rgb|rgba|#|hsl)/.test(value)
}

function hasNestedMarkup(element: InspectedElement) {
  const tags = element.outerHTMLPreview.match(/<([a-z0-9-]+)/gi) || []
  return tags.length > 1
}

function parseNumericToken(value: string) {
  const match = value.match(/-?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

function formatPx(value: number) {
  return `${Math.max(0, Math.round(value))}px`
}

function formatUnitValue(value: number, digits = 0) {
  if (digits <= 0) {
    return String(Math.max(0, Math.round(value)))
  }

  return String(Number(Math.max(0, value).toFixed(digits)))
}

function formatOpacity(value: number) {
  return formatUnitValue(Math.min(1, Math.max(0, value)), 2)
}

function getBoxDimension(element: InspectedElement, axis: 'width' | 'height') {
  if (!element.boxModel) return 0
  return axis === 'width' ? element.boxModel.width : element.boxModel.height
}

function buildSpacingAdjustmentPatch(
  styles: Record<string, string>,
  target: SpacingTarget,
  side: SpacingSide,
  delta: number,
) {
  const sides: Exclude<SpacingSide, 'all'>[] = side === 'all'
    ? ['top', 'right', 'bottom', 'left']
    : [side]

  const patch: Record<string, string> = {}

  sides.forEach((item) => {
    const propertyName = `${target}-${item}`
    const currentValue = parseNumericToken(styles[propertyName] || '0px') || 0
    patch[propertyName] = formatPx(currentValue + delta)
  })

  return patch
}

function buildNudgedPxPatch(
  styles: Record<string, string>,
  propertyName: string,
  delta: number,
  fallbackValue = 0,
) {
  const currentValue = parseNumericToken(styles[propertyName] || '')
  return {
    [propertyName]: formatPx((currentValue ?? fallbackValue) + delta),
  }
}

function getActiveLayoutSlot(styles: Record<string, string>): DirectionalPadSlot | null {
  const display = styles.display || 'block'
  const flexDirection = styles['flex-direction'] || 'row'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)

  if (!isFlexContainer && !isGridContainer) {
    return null
  }

  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'
  const horizontal = (() => {
    if (isGridContainer) {
      const justifyItems = styles['justify-items'] || 'normal'
      if (justifyItems === 'start') return 'left'
      if (justifyItems === 'end') return 'right'
      return 'center'
    }

    const isColumnFlow = flexDirection.startsWith('column')
    const source = isColumnFlow ? alignItems : justifyContent
    if (source === 'flex-start') return 'left'
    if (source === 'flex-end') return 'right'
    return 'center'
  })()
  const vertical = (() => {
    if (isGridContainer) {
      if (alignItems === 'start') return 'top'
      if (alignItems === 'end') return 'bottom'
      return 'center'
    }

    const isColumnFlow = flexDirection.startsWith('column')
    const source = isColumnFlow ? justifyContent : alignItems
    if (source === 'flex-start') return 'top'
    if (source === 'flex-end') return 'bottom'
    return 'center'
  })()

  if (vertical === 'top' && horizontal === 'left') return 'top-left'
  if (vertical === 'top' && horizontal === 'center') return 'top'
  if (vertical === 'top' && horizontal === 'right') return 'top-right'
  if (vertical === 'center' && horizontal === 'left') return 'left'
  if (vertical === 'center' && horizontal === 'center') return 'center'
  if (vertical === 'center' && horizontal === 'right') return 'right'
  if (vertical === 'bottom' && horizontal === 'left') return 'bottom-left'
  if (vertical === 'bottom' && horizontal === 'center') return 'bottom'
  if (vertical === 'bottom' && horizontal === 'right') return 'bottom-right'
  return null
}

function buildLayoutAlignmentPatch(
  styles: Record<string, string>,
  slot: DirectionalPadSlot,
) {
  const display = styles.display || 'block'
  const flexDirection = styles['flex-direction'] || 'row'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const [vertical, horizontal] = (() => {
    switch (slot) {
      case 'top-left': return ['top', 'left'] as const
      case 'top': return ['top', 'center'] as const
      case 'top-right': return ['top', 'right'] as const
      case 'left': return ['center', 'left'] as const
      case 'center': return ['center', 'center'] as const
      case 'right': return ['center', 'right'] as const
      case 'bottom-left': return ['bottom', 'left'] as const
      case 'bottom': return ['bottom', 'center'] as const
      case 'bottom-right': return ['bottom', 'right'] as const
    }
  })()
  const alignMap = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
    left: 'flex-start',
    right: 'flex-end',
  } as const
  const gridAlignMap = {
    top: 'start',
    center: 'center',
    bottom: 'end',
    left: 'start',
    right: 'end',
  } as const

  if (isGridContainer) {
    return {
      'justify-items': gridAlignMap[horizontal],
      'align-items': gridAlignMap[vertical],
    }
  }

  const isColumnFlow = flexDirection.startsWith('column')
  const nextPatch: Record<string, string> = {}
  if (!isFlexContainer) {
    nextPatch.display = 'flex'
  }

  nextPatch[isColumnFlow ? 'justify-content' : 'align-items'] = alignMap[vertical]
  nextPatch[isColumnFlow ? 'align-items' : 'justify-content'] = alignMap[horizontal]

  return nextPatch
}

function getSpacingSideLabel(side: SpacingSide) {
  if (side === 'all') return '四边'
  if (side === 'top') return '上边'
  if (side === 'right') return '右边'
  if (side === 'bottom') return '下边'
  return '左边'
}

function getFieldValue(fieldKey: string, styles: Record<string, string>) {
  if (fieldKey === 'gap') {
    const directGap = styles.gap
    if (directGap && directGap !== 'normal') return directGap

    const rowGap = styles['row-gap']
    const columnGap = styles['column-gap']
    if (rowGap && rowGap !== 'normal') {
      if (!columnGap || columnGap === 'normal' || columnGap === rowGap) {
        return rowGap
      }
      return `${rowGap} ${columnGap}`
    }

    if (columnGap && columnGap !== 'normal') {
      return columnGap
    }

    return ''
  }

  return styles[fieldKey] || ''
}

function getElementPreset(element: InspectedElement, styles?: Record<string, string>) {
  const display = styles?.display || ''
  const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)

  if (element.tagName === 'img') return 'image'
  if (isLayoutContainer || hasNestedMarkup(element)) return 'container'
  if (element.textContentPreview && !['img', 'svg'].includes(element.tagName)) return 'text'
  return 'container'
}

function getElementDisplayName(element: InspectedElement) {
  const tagName = element.tagName.toLowerCase()

  if (element.id) {
    return `#${element.id}`
  }

  if (element.classNames.length > 0) {
    return `${tagName}.${element.classNames[0]}`
  }

  return tagName
}

function getPrimaryTagTarget(tag: ElementTag): ElementTagTarget | null {
  return tag.targets[0] || null
}

function tagHasTarget(tag: ElementTag, backendNodeId: number) {
  return tag.targets.some((target) => target.backendNodeId === backendNodeId)
}

function getTagDisplayName(tag: ElementTag) {
  const primaryTarget = getPrimaryTagTarget(tag)
  if (!primaryTarget) {
    return '未命名标签'
  }

  return tag.targets
    .slice(0, 3)
    .map((target) => target.selector)
    .join(' · ')
}

function supportsTypography(element: InspectedElement) {
  return Boolean(element.textContentPreview.trim()) || ['p', 'span', 'label', 'button', 'input', 'textarea', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.tagName)
}

function supportsImageEditing(element: InspectedElement) {
  return element.tagName === 'img'
}

function getDefaultHelperText(activeTool: CanvasTool) {
  if (activeTool === 'browse') {
    return {
      title: '真实交互',
      description: '当前已关闭元素拾取。你可以直接点击和操作真实页面，让弹窗、菜单和下拉面板自然展开。',
    }
  }

  return {
    title: '上下文微调',
    description: '把鼠标移到任意参数卡片上，画布会高亮对应的 Margin、Padding 或排版区域，帮助你像看建筑图纸一样理解结构。',
  }
}

function getContextualFieldHelper(
  field: PropertyFieldConfig,
  styles: Record<string, string>,
  element: InspectedElement,
  fallbackDescription: string,
) {
  const display = styles.display || 'block'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isCenteringContainer = isFlexContainer && (justifyContent === 'center' || alignItems === 'center')
  const childTargetName = element.classNames[0]
    ? `${element.classNames[0]} 内部的子元素`
    : '内部子元素'

  if (field.focusKey === 'padding' && isCenteringContainer) {
    return `当前节点是一个 Flex 居中容器。修改 ${field.label} 会改变容器内盒尺寸，但子内容仍会保持居中，所以视觉上不像直接把内容往下推。若你的目标是移动中间这块内容，请优先调整“布局”里的主轴对齐，或者继续选中 ${childTargetName} 去调 margin / padding。`
  }

  if (field.focusKey === 'margin' && isCenteringContainer) {
    return `当前节点通过 Flex 居中排版。外层 margin 主要影响这个容器与外部兄弟节点的距离，不会像内部偏移那样直接推动中间内容。想微调中间文案块，优先改布局对齐，或者选中 ${childTargetName} 再调 margin。`
  }

  if (field.focusKey === 'size' && isCenteringContainer) {
    return `当前节点是一个 Flex 居中容器。调整宽高会改变容器包围盒，但内部内容仍会按主轴 ${justifyContent}、交叉轴 ${alignItems} 继续居中。若你想让内容靠上、靠左或贴边，优先修改“布局”里的主轴/交叉轴。`
  }

  if (field.focusKey === 'gap' && !isFlexContainer && !isGridContainer) {
    return '当前节点不是 Flex 或 Grid 容器，Gap 即使写入样式也不会产生你期待的子元素间距效果。先把“显示方式”切到 Flex / Grid，或选中真正承载子元素布局的父容器。'
  }

  return fallbackDescription
}

function getLayoutInsight(styles: Record<string, string>, element: InspectedElement) {
  const display = styles.display || 'block'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'

  if (['flex', 'inline-flex'].includes(display) && (justifyContent === 'center' || alignItems === 'center')) {
    return {
      title: '布局洞察',
      description: `当前选中的是一个 Flex 居中容器（主轴 ${justifyContent}，交叉轴 ${alignItems}）。这类节点改 padding / 宽高时，内容通常仍会保持居中；如果你的目标是移动中间内容位置，优先改“布局”里的对齐，或者继续选中内部子元素。`,
    }
  }

  if (['grid', 'inline-grid'].includes(display)) {
    return {
      title: '布局洞察',
      description: '当前节点是 Grid 容器。优先关注 gap、padding 和宽高；如果某个子块位置不对，通常需要选中子元素本身，而不是只改外层容器。',
    }
  }

  if (hasNestedMarkup(element)) {
    return {
      title: '布局洞察',
      description: '当前节点是父容器。改它的 padding / width / height 会影响内部结构，但不一定直接改变子内容的相对站位；如果你想微调具体文案块或图片块，继续点选内部子元素会更直接。',
    }
  }

  return null
}

function getRecommendedFieldKeys(
  element: InspectedElement,
  styles: Record<string, string>,
) {
  const display = styles.display || 'block'
  const position = styles.position || 'static'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isLayoutContainer = isFlexContainer || isGridContainer
  const isCenteringContainer = isFlexContainer && (justifyContent === 'center' || alignItems === 'center')
  const preset = getElementPreset(element, styles)
  const nextKeys: string[] = []

  if (preset === 'image') {
    nextKeys.push('width', 'height', 'object-fit', 'border-radius', 'opacity')
  } else if (preset === 'text' && !hasNestedMarkup(element)) {
    nextKeys.push('font-size', 'line-height', 'font-weight', 'color', 'text-align')
  } else {
    if (isLayoutContainer) {
      nextKeys.push('display', 'justify-content', 'align-items')
      if (!isCenteringContainer || styles.gap !== '0px') {
        nextKeys.push('gap')
      }
    }

    nextKeys.push('width', 'height')

    if (isCenteringContainer) {
      nextKeys.push('justify-content', 'align-items')
    } else {
      nextKeys.push('padding-top', 'padding-left')
    }

    nextKeys.push('background-color', 'border-radius')
  }

  if (position !== 'static') {
    nextKeys.push('top', 'left', 'z-index')
  }

  if (styles['box-shadow'] && styles['box-shadow'] !== 'none') {
    nextKeys.push('box-shadow')
  }

  if (styles.overflow && styles.overflow !== 'visible') {
    nextKeys.push('overflow')
  }

  return Array.from(new Set(nextKeys))
}

function getRecommendedActions(
  element: InspectedElement,
  styles: Record<string, string>,
  quickStep: number,
): RecommendedAction[] {
  const display = styles.display || 'block'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isLayoutContainer = isFlexContainer || isGridContainer
  const preset = getElementPreset(element, styles)
  const actions: RecommendedAction[] = []

  if (preset === 'container' && !isLayoutContainer) {
    actions.push({
      id: 'enable-flex',
      label: '启用 Flex',
      description: '先把容器切到 Flex，再继续做对齐和间距微调。',
      patch: { display: 'flex' },
      focusKey: 'layout',
    })
  }

  if (preset === 'container' && isLayoutContainer) {
    actions.push({
      id: 'align-center',
      label: '让内容居中',
      description: '把主轴和交叉轴都切回居中，快速恢复标准居中态。',
      patch: { 'justify-content': 'center', 'align-items': 'center' },
      focusKey: 'layout',
    })
    actions.push({
      id: 'space-between',
      label: '两端排布',
      description: '把主轴分布切到两端，适合标题条、按钮条和工具栏。',
      patch: { 'justify-content': 'space-between' },
      focusKey: 'layout',
    })
  }

  if (preset === 'text' && !hasNestedMarkup(element)) {
    actions.push({
      id: 'center-text',
      label: '文字居中',
      description: '把文本对齐方式切到居中，适合标题和短文案块。',
      patch: { 'text-align': 'center' },
      focusKey: 'typography',
    })
  }

  if (preset === 'image') {
    actions.push({
      id: 'image-cover',
      label: '填满容器',
      description: '将 object-fit 切到 cover，让图片优先铺满容器。',
      patch: { 'object-fit': 'cover' },
      focusKey: 'image',
    })
    actions.push({
      id: 'image-contain',
      label: '完整显示',
      description: '将 object-fit 切到 contain，让图片完整地留在容器里。',
      patch: { 'object-fit': 'contain' },
      focusKey: 'image',
    })
  }

  if (preset === 'container') {
    const paddingTop = parseNumericToken(styles['padding-top'] || '0px') || 0
    const paddingRight = parseNumericToken(styles['padding-right'] || '0px') || 0
    const paddingBottom = parseNumericToken(styles['padding-bottom'] || '0px') || 0
    const paddingLeft = parseNumericToken(styles['padding-left'] || '0px') || 0
    const gapValue = parseNumericToken(getFieldValue('gap', styles) || '0px') || 0

    actions.push({
      id: 'increase-padding',
      label: '增加内边距',
      description: `四边同时增加 ${quickStep}px 留白，快速拉开内容呼吸感。`,
      patch: {
        'padding-top': formatPx(paddingTop + quickStep),
        'padding-right': formatPx(paddingRight + quickStep),
        'padding-bottom': formatPx(paddingBottom + quickStep),
        'padding-left': formatPx(paddingLeft + quickStep),
      },
      focusKey: 'padding',
    })

    if (isLayoutContainer) {
      actions.push({
        id: 'increase-gap',
        label: '增加间距',
        description: `把容器内子元素之间的 gap 增加 ${quickStep}px。`,
        patch: { gap: formatPx(gapValue + quickStep) },
        focusKey: 'gap',
      })
    }
  }

  return actions.slice(0, 4)
}

function getFieldVisibility(field: PropertyFieldConfig, styles: Record<string, string>) {
  const display = styles.display || 'block'
  const position = styles.position || 'static'
  const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)

  if (['gap', 'justify-content', 'align-items'].includes(field.key)) {
    return isLayoutContainer
  }

  if (['top', 'left'].includes(field.key)) {
    return position !== 'static' || Boolean(styles[field.key])
  }

  if (field.key === 'z-index') {
    return position !== 'static' || (styles['z-index'] && styles['z-index'] !== 'auto')
  }

  return true
}

function buildSpacingSummary(styles: Record<string, string>, prefix: 'padding' | 'margin') {
  const values = [
    styles[`${prefix}-top`] || '0px',
    styles[`${prefix}-right`] || '0px',
    styles[`${prefix}-bottom`] || '0px',
    styles[`${prefix}-left`] || '0px',
  ]

  return values.every((value) => value === values[0])
    ? values[0]
    : values.join(' / ')
}

function MetricBadge({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'accent' | 'warm'
}) {
  return (
    <div className={`metric-badge ${tone}`}>
      <span className="metric-badge-label">{label}</span>
      <strong className="metric-badge-value">{value}</strong>
    </div>
  )
}

function LayoutModeIcon({ mode }: { mode: 'block' | 'flex' | 'grid' }) {
  return (
    <span className={`mini-layout-icon ${mode}`} aria-hidden="true">
      {mode === 'block' && <span className="mini-layout-icon-block" />}
      {mode === 'flex' && (
        <>
          <span />
          <span />
          <span />
        </>
      )}
      {mode === 'grid' && (
        <>
          <span />
          <span />
          <span />
          <span />
        </>
      )}
    </span>
  )
}

function DirectionalPadGlyph({ slot }: { slot: DirectionalPadSlot }) {
  return (
    <span className={`directional-pad-glyph ${slot}`} aria-hidden="true">
      <span className="directional-pad-dot" />
    </span>
  )
}

function QuickStepSelector({
  step,
  onChange,
}: {
  step: number
  onChange: (step: number) => void
}) {
  const [draftValue, setDraftValue] = useState(String(step))

  useEffect(() => {
    setDraftValue(String(step))
  }, [step])

  return (
    <div className="quick-step-selector">
      <span className="quick-step-label">步进</span>
      <div className="quick-step-editor">
        <input
          className="quick-step-input"
          value={draftValue}
          inputMode="numeric"
          onChange={(event) => {
            const nextValue = event.target.value.replace(/[^\d]/g, '')
            setDraftValue(nextValue)
            const parsed = Number(nextValue)
            if (Number.isFinite(parsed) && parsed > 0) {
              onChange(parsed)
            }
          }}
          onBlur={() => {
            const parsed = Number(draftValue)
            if (!Number.isFinite(parsed) || parsed <= 0) {
              setDraftValue(String(step))
              return
            }
            onChange(parsed)
          }}
        />
        <span className="quick-step-unit">px</span>
      </div>
      <div className="quick-step-options">
        {QUICK_STEP_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            className={`quick-step-option ${step === item ? 'active' : ''}`}
            onClick={() => onChange(item)}
          >
            {item}px
          </button>
        ))}
      </div>
    </div>
  )
}

function DirectionalPad({
  items,
  activeSlot,
  onSelect,
}: {
  items: Array<{ slot: DirectionalPadSlot; label: string }>
  activeSlot: DirectionalPadSlot | null
  onSelect: (slot: DirectionalPadSlot) => void
}) {
  const itemMap = new Map(items.map((item) => [item.slot, item]))

  return (
    <div className="directional-pad">
      {DIRECTIONAL_PAD_LAYOUT.map((slot, index) => {
        const item = itemMap.get(slot)
        if (!item) {
          return <span key={`pad-empty-${slot}-${index}`} className="directional-pad-spacer" />
        }

        return (
          <button
            key={item.slot}
            type="button"
            className={`directional-pad-button ${activeSlot === item.slot ? 'active' : ''}`}
            onClick={() => onSelect(item.slot)}
            aria-label={item.label}
            title={item.label}
          >
            <DirectionalPadGlyph slot={item.slot} />
          </button>
        )
      })}
    </div>
  )
}

function QuickLayoutCard({
  styles,
  onSetDisplay,
  onAlign,
}: {
  styles: Record<string, string>
  onSetDisplay: (display: string) => void
  onAlign: (slot: DirectionalPadSlot) => void
}) {
  const display = styles.display || 'block'
  const displayKey = ['flex', 'inline-flex'].includes(display)
    ? 'flex'
    : ['grid', 'inline-grid'].includes(display)
      ? 'grid'
      : 'block'
  const activeSlot = getActiveLayoutSlot(styles)

  return (
    <div className="quick-system-card">
      <div className="quick-system-card-header">
        <div className="control-section-title" title="先切换块 / Flex / Grid，再用九宫格把内容快速推到不同位置。">布局快捷卡</div>
        <span className="quick-system-card-value">{displayKey.toUpperCase()}</span>
      </div>

      <div className="quick-segmented">
        {[
          { label: '块', value: 'block' },
          { label: 'Flex', value: 'flex' },
          { label: 'Grid', value: 'grid' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`quick-segmented-option ${displayKey === item.value ? 'active' : ''}`}
            onClick={() => onSetDisplay(item.value)}
            aria-label={item.label}
            title={item.label}
          >
            <LayoutModeIcon mode={item.value as 'block' | 'flex' | 'grid'} />
          </button>
        ))}
      </div>

      <DirectionalPad
        activeSlot={activeSlot}
        onSelect={onAlign}
        items={[
          { slot: 'top-left', label: '左上' },
          { slot: 'top', label: '上' },
          { slot: 'top-right', label: '右上' },
          { slot: 'left', label: '左' },
          { slot: 'center', label: '中' },
          { slot: 'right', label: '右' },
          { slot: 'bottom-left', label: '左下' },
          { slot: 'bottom', label: '下' },
          { slot: 'bottom-right', label: '右下' },
        ]}
      />
    </div>
  )
}

function QuickSpacingPad({
  target,
  side,
  step,
  styles,
  onTargetChange,
  onSideChange,
  onAdjust,
}: {
  target: SpacingTarget
  side: SpacingSide
  step: number
  styles: Record<string, string>
  onTargetChange: (target: SpacingTarget) => void
  onSideChange: (side: SpacingSide) => void
  onAdjust: (delta: number) => void
}) {
  const currentSummary = side === 'all'
    ? buildSpacingSummary(styles, target)
    : styles[`${target}-${side}`] || '0px'

  const sideItems: Array<{ side: SpacingSide; label: string }> = [
    { side: 'all', label: '全' },
    { side: 'top', label: '上' },
    { side: 'right', label: '右' },
    { side: 'bottom', label: '下' },
    { side: 'left', label: '左' },
  ]

  return (
    <div className="quick-system-card quick-spacing-card">
      <div className="quick-system-card-header">
        <div className="control-section-title" title="先选内边距或外边距，再点方向。中心表示四边一起调整。">边距快捷调节</div>
        <div className="quick-system-card-meta">
          <strong className="quick-spacing-value">{currentSummary}</strong>
          <span className="quick-step-mini">{step}px</span>
        </div>
      </div>

      <div className="quick-segmented quick-segmented-two">
        <button
          type="button"
          className={`quick-segmented-option ${target === 'padding' ? 'active' : ''}`}
          onClick={() => onTargetChange('padding')}
        >
          内边距
        </button>
        <button
          type="button"
          className={`quick-segmented-option ${target === 'margin' ? 'active' : ''}`}
          onClick={() => onTargetChange('margin')}
        >
          外边距
        </button>
      </div>

      <DirectionalPad
        activeSlot={side === 'all' ? 'center' : side}
        onSelect={(slot) => {
          if (slot === 'center') {
            onSideChange('all')
            return
          }

          if (slot === 'top' || slot === 'right' || slot === 'bottom' || slot === 'left') {
            onSideChange(slot)
          }
        }}
        items={sideItems.map((item) => ({
          slot: item.side === 'all' ? 'center' : item.side,
          label: item.label,
        }))}
      />

      <div className="quick-spacing-actions">
        <button type="button" className="quick-spacing-action" onClick={() => onAdjust(-step)}>
          减少 {step}px
        </button>
        <button type="button" className="quick-spacing-action primary" onClick={() => onAdjust(step)}>
          增加 {step}px
        </button>
      </div>
    </div>
  )
}

function QuickAdjustCard({
  title,
  value,
  description,
  stepLabel,
  onDecrease,
  onIncrease,
}: QuickAdjustCardConfig) {
  return (
    <div className="quick-system-card quick-adjust-card">
      <div className="quick-system-card-header">
        <div className="control-section-title" title={description}>{title}</div>
        <div className="quick-system-card-meta">
          <strong className="quick-system-card-value">{value}</strong>
          {stepLabel && <span className="quick-step-mini">{stepLabel}</span>}
        </div>
      </div>

      <div className="quick-adjust-actions">
        <button type="button" className="quick-spacing-action" onClick={onDecrease}>减少</button>
        <button type="button" className="quick-spacing-action primary" onClick={onIncrease}>增加</button>
      </div>
    </div>
  )
}

function SectionBlock({
  title,
  hint,
  compact,
  children,
}: {
  title: string
  hint?: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section className={`control-section ${compact ? 'compact' : ''}`}>
      <div className="control-section-header">
        <div className="control-section-title" title={hint}>{title}</div>
      </div>
      <div className="control-section-body">{children}</div>
    </section>
  )
}

function SnapshotSection({
  title,
  keys,
  styles,
}: {
  title: string
  keys: string[]
  styles: Record<string, string>
}) {
  const rows = keys.filter((key) => {
    const value = styles[key]
    return value && value !== 'none' && value !== 'normal' && value !== '0px'
  })

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="style-section">
      <div className="section-title">{title}</div>
      {rows.map((key) => (
        <div key={key} className="style-row">
          <span className="style-name">{key}</span>
          {isColorValue(styles[key]) ? (
            <span className="style-value color-preview">
              <span className="color-swatch" style={{ background: styles[key] }} />
              {styles[key]}
            </span>
          ) : (
            <span className="style-value">{styles[key]}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function TextContentEditor({
  value,
  onCommit,
}: {
  value: string
  onCommit: (value: string) => void
}) {
  const [draftValue, setDraftValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value)
    }
  }, [value, isFocused])

  return (
    <label className="control-card control-card-wide">
      <span className="control-card-label">文案内容</span>
      <textarea
        className="control-textarea"
        value={draftValue}
        placeholder="输入新的文案"
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftValue(nextValue)
          onCommit(nextValue)
        }}
        onBlur={() => {
          setIsFocused(false)
          onCommit(draftValue)
        }}
      />
    </label>
  )
}

function AttributeEditor({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const [draftValue, setDraftValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value)
    }
  }, [value, isFocused])

  return (
    <label className="control-card">
      <span className="control-card-label">{label}</span>
      <input
        className="control-text-input"
        value={draftValue}
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftValue(nextValue)
          onCommit(nextValue.trim())
        }}
        onBlur={() => {
          setIsFocused(false)
          onCommit(draftValue.trim())
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onCommit(draftValue.trim())
          }
        }}
      />
    </label>
  )
}

function LabelSection({
  element,
  tags,
  onUpsertTag,
  onDeleteTag,
}: {
  element: InspectedElement
  tags: ElementTag[]
  onUpsertTag: (element: InspectedElement, text: string, tagId?: string) => void
  onDeleteTag: (tagId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const elementTags = tags.filter((tag) =>
    tag.targets.some((target) => target.backendNodeId === element.backendNodeId),
  )

  const hasTag = elementTags.length > 0

  const handleConfirmAdd = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) {
      onUpsertTag(element, trimmed)
    }
  }

  return (
    <div className="label-section">
      <div className="label-section-header">
        <span className="label-section-icon">🏷</span>
        <span className="label-section-title">标签</span>
      </div>
      <div className="label-section-desc">为当前容器添加修改意见，导出时 AI 将据此生成对应的样式调整建议。</div>
      {elementTags.map((tag) => (
        <div key={tag.id} className="label-item">
          <input
            type="text"
            className="label-input"
            defaultValue={tag.text}
            placeholder="输入修改意见…"
            onBlur={(e) => {
              const val = e.target.value.trim()
              if (val) {
                onUpsertTag(element, val, tag.id)
              } else {
                onDeleteTag(tag.id)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <button
            type="button"
            className="label-delete-btn"
            onClick={() => onDeleteTag(tag.id)}
            title="删除标签"
          >×</button>
        </div>
      ))}
      {!hasTag && (
        <div className="label-item">
          <input
            ref={inputRef}
            type="text"
            className="label-input"
            placeholder="输入修改意见，回车确认…"
            onBlur={(e) => handleConfirmAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirmAdd((e.target as HTMLInputElement).value)
                ;(e.target as HTMLInputElement).value = ''
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

export function PropertiesWorkbench({
  element,
  activeTool,
  tags,
  activeEditProperty,
  compact,
  selectionRevision,
  overlayNudgeStyles,
  overlayNudgeTick,
  onElementChange,
  onToolChange,
  onActiveEditPropertyChange,
  onUpsertTag,
  onDeleteTag,
  onCopyAIPrompt,
}: {
  element: InspectedElement
  activeTool: CanvasTool
  tags: ElementTag[]
  activeEditProperty: ActiveEditProperty | null
  compact?: boolean
  selectionRevision: number
  overlayNudgeStyles?: Record<string, string> | null
  overlayNudgeTick?: number
  onElementChange: (element: InspectedElement) => void
  onToolChange: (tool: CanvasTool) => void
  onActiveEditPropertyChange: (property: ActiveEditProperty | null) => void
  onUpsertTag: (element: InspectedElement, text: string, tagId?: string) => void
  onDeleteTag: (tagId: string) => void
  onCopyAIPrompt: (styleDiff: Record<string, string>) => void
}) {
  const {
    draftStyles,
    pendingField,
    styleDiff,
    canUndo,
    canRedo,
    canReset,
    updateStyle,
    updateStyles,
    updateTextContent,
    updateAttribute,
    undoLastStyleChange,
    redoLastStyleChange,
    resetStyleChanges,
  } = useStyleBinding({
    element,
    selectionRevision,
    onElementChange,
  })
  const [helperState, setHelperState] = useState<{ title: string; description: string }>(() => getDefaultHelperText(activeTool))
  const [copiedSelector, setCopiedSelector] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [quickStep, setQuickStep] = useState<number>(8)
  const [quickSpacingTarget, setQuickSpacingTarget] = useState<SpacingTarget>('padding')
  const [quickSpacingSide, setQuickSpacingSide] = useState<SpacingSide>('all')
  const preset = useMemo(() => getElementPreset(element, draftStyles), [element, draftStyles])
  const elementDisplayName = useMemo(() => getElementDisplayName(element), [element])

  // 浮动按钮已直接改了 DOM，这里同步记录到 useStyleBinding（有 undo/redo + styleDiff）
  useEffect(() => {
    if (!overlayNudgeTick || !overlayNudgeStyles) return
    const keys = Object.keys(overlayNudgeStyles)
    if (keys.length === 0) return
    updateStyles(overlayNudgeStyles, `overlay-nudge:${keys.join(',')}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayNudgeTick])

  const sections = useMemo<PropertySectionConfig[]>(() => {
    const nextSections = BASE_PROPERTY_SECTIONS
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => getFieldVisibility(field, draftStyles)),
      }))
      .filter((section) => section.fields.length > 0)

    if (supportsTypography(element)) {
      nextSections.push(TYPOGRAPHY_SECTION)
    }
    if (supportsImageEditing(element)) {
      nextSections.push(IMAGE_SECTION)
    }
    return nextSections
  }, [draftStyles, element])

  useEffect(() => {
    setHelperState(getDefaultHelperText(activeTool))
  }, [activeTool, element.backendNodeId])

  const handleFieldActiveChange = (field: PropertyFieldConfig | null) => {
    if (!field || !field.focusKey) {
      onActiveEditPropertyChange(null)
      setHelperState(getDefaultHelperText(activeTool))
      return
    }

    onActiveEditPropertyChange(field.focusKey)
    setHelperState({
      title: field.label,
      description: getContextualFieldHelper(
        field,
        draftStyles,
        element,
        field.helperText || getDefaultHelperText(activeTool).description,
      ),
    })
  }

  const diffCount = Object.keys(styleDiff).length
  const canExport = diffCount > 0 || tags.length > 0
  const textPreview = useMemo(() => element.textContentPreview || '', [element.textContentPreview])
  const currentElementTags = useMemo(
    () => tags.filter((tag) => tagHasTarget(tag, element.backendNodeId)),
    [element.backendNodeId, tags],
  )
  const metricSummary = useMemo(() => {
    const width = element.boxModel ? `${Math.round(element.boxModel.width)}px` : (draftStyles.width || 'auto')
    const height = element.boxModel ? `${Math.round(element.boxModel.height)}px` : (draftStyles.height || 'auto')

    return [
      { label: 'W', value: width, tone: 'accent' as const },
      { label: 'H', value: height, tone: 'accent' as const },
      { label: 'Padding', value: buildSpacingSummary(draftStyles, 'padding'), tone: 'neutral' as const },
      { label: 'Margin', value: buildSpacingSummary(draftStyles, 'margin'), tone: 'warm' as const },
      { label: 'Gap', value: getFieldValue('gap', draftStyles) || '0px', tone: 'neutral' as const },
    ]
  }, [draftStyles, element.boxModel])
  const layoutInsight = useMemo(() => getLayoutInsight(draftStyles, element), [draftStyles, element])
  const recommendedFields = useMemo(() => {
    const fieldMap = new Map<string, PropertyFieldConfig>()
    sections.forEach((section) => {
      section.fields.forEach((field) => {
        fieldMap.set(field.key, field)
      })
    })

    return getRecommendedFieldKeys(element, draftStyles)
      .map((fieldKey) => fieldMap.get(fieldKey))
      .filter((field): field is PropertyFieldConfig => Boolean(field))
      .slice(0, compact ? 4 : 6)
  }, [compact, draftStyles, element, sections])
  const recommendedFieldKeySet = useMemo(() => new Set(recommendedFields.map((field) => field.key)), [recommendedFields])
  const recommendedActions = useMemo(() => getRecommendedActions(element, draftStyles, quickStep), [draftStyles, element, quickStep])
  const dedupedSections = useMemo(() => (
    sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => !recommendedFieldKeySet.has(field.key)),
      }))
      .filter((section) => {
        if (section.fields.length > 0) return true
        if (section.title === TYPOGRAPHY_SECTION.title && supportsTypography(element)) return true
        if (section.title === IMAGE_SECTION.title && supportsImageEditing(element)) return true
        return false
      })
  ), [element, recommendedFieldKeySet, sections])

  useEffect(() => {
    if (!copiedSelector) return

    const timer = window.setTimeout(() => setCopiedSelector(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copiedSelector])

  useEffect(() => {
    if (!copiedPrompt) return

    const timer = window.setTimeout(() => setCopiedPrompt(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copiedPrompt])

  const handleCopyElementName = async () => {
    try {
      await navigator.clipboard.writeText(elementDisplayName)
      setCopiedSelector(true)
    } catch (error) {
      console.error('Failed to copy element name:', error)
    }
  }

  const handleCopyPrompt = () => {
    onCopyAIPrompt(styleDiff)
    setCopiedPrompt(true)
  }

  const resetHelperState = () => {
    onActiveEditPropertyChange(null)
    setHelperState(getDefaultHelperText(activeTool))
  }

  const activateQuickHelper = (
    title: string,
    description: string,
    focusKey: ActiveEditProperty,
  ) => {
    onActiveEditPropertyChange(focusKey)
    setHelperState({ title, description })
  }

  const handleApplyRecommendedAction = (action: RecommendedAction) => {
    updateStyles(action.patch, `action:${action.id}`)
    onActiveEditPropertyChange(action.focusKey || null)
    setHelperState({
      title: action.label,
      description: action.description,
    })
  }

  const handleQuickSpacingAdjust = (delta: number) => {
    const patch = buildSpacingAdjustmentPatch(draftStyles, quickSpacingTarget, quickSpacingSide, delta)
    updateStyles(patch, `quick-spacing:${quickSpacingTarget}:${quickSpacingSide}:${delta > 0 ? 'plus' : 'minus'}`)
    onActiveEditPropertyChange(quickSpacingTarget)
    setHelperState({
      title: `${quickSpacingTarget === 'padding' ? '内边距' : '外边距'}快捷操作`,
      description: `${getSpacingSideLabel(quickSpacingSide)}已${delta > 0 ? '增加' : '减少'} ${Math.abs(delta)}px。你也可以继续在下方参数区做更精细的单值微调。`,
    })
  }

  const handleQuickLayoutDisplay = (display: string) => {
    updateStyles({ display }, `quick-layout:display:${display}`)
    activateQuickHelper(
      '布局模式',
      `显示方式已切到 ${display.toUpperCase()}。继续用方向盘可以把内容快速推到上、下、左、右或中心。`,
      'layout',
    )
  }

  const handleQuickLayoutAlign = (slot: DirectionalPadSlot) => {
    const patch = buildLayoutAlignmentPatch(draftStyles, slot)
    const slotLabelMap: Record<DirectionalPadSlot, string> = {
      'top-left': '左上角',
      top: '上方',
      'top-right': '右上角',
      left: '左侧',
      center: '中心',
      right: '右侧',
      'bottom-left': '左下角',
      bottom: '下方',
      'bottom-right': '右下角',
    }
    updateStyles(patch, `quick-layout:align:${slot}`)
    activateQuickHelper(
      '内容站位',
      `已把容器内容切到${slotLabelMap[slot]}。`,
      'layout',
    )
  }

  const quickAdjustCards = useMemo<QuickAdjustCardConfig[]>(() => {
    const nextCards: QuickAdjustCardConfig[] = []
    const widthBase = parseNumericToken(draftStyles.width || '') ?? getBoxDimension(element, 'width')
    const heightBase = parseNumericToken(draftStyles.height || '') ?? getBoxDimension(element, 'height')
    const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(draftStyles.display || 'block')

    nextCards.push({
      id: 'quick-width',
      title: '宽度',
      value: widthBase > 0 ? formatPx(widthBase) : (draftStyles.width || 'auto'),
      description: '卡片、面板和图像框最常先调宽度。',
      focusKey: 'size',
      stepLabel: `${quickStep}px`,
      onDecrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'width', -quickStep, widthBase), 'quick-adjust:width:minus'),
      onIncrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'width', quickStep, widthBase), 'quick-adjust:width:plus'),
    })

    nextCards.push({
      id: 'quick-height',
      title: '高度',
      value: heightBase > 0 ? formatPx(heightBase) : (draftStyles.height || 'auto'),
      description: '适合快速拉高标题区、卡片或图片区。',
      focusKey: 'size',
      stepLabel: `${quickStep}px`,
      onDecrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'height', -quickStep, heightBase), 'quick-adjust:height:minus'),
      onIncrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'height', quickStep, heightBase), 'quick-adjust:height:plus'),
    })

    if (isLayoutContainer) {
      const gapBase = parseNumericToken(getFieldValue('gap', draftStyles) || '0px') || 0
      nextCards.push({
        id: 'quick-gap',
        title: '间距',
        value: formatPx(gapBase),
        description: '直接增减容器里子元素之间的空隙。',
        focusKey: 'gap',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles({ gap: formatPx(Math.max(0, gapBase - quickStep)) }, 'quick-adjust:gap:minus'),
        onIncrease: () => updateStyles({ gap: formatPx(gapBase + quickStep) }, 'quick-adjust:gap:plus'),
      })
    }

    if (preset !== 'text' || hasNestedMarkup(element)) {
      const radiusBase = parseNumericToken(draftStyles['border-radius'] || '0px') || 0
      nextCards.push({
        id: 'quick-radius',
        title: '圆角',
        value: formatPx(radiusBase),
        description: '让卡片、面板和图片边缘更柔和。',
        focusKey: 'border',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles({ 'border-radius': formatPx(Math.max(0, radiusBase - quickStep)) }, 'quick-adjust:radius:minus'),
        onIncrease: () => updateStyles({ 'border-radius': formatPx(radiusBase + quickStep) }, 'quick-adjust:radius:plus'),
      })
    }

    const opacityBase = parseNumericToken(draftStyles.opacity || '1') ?? 1
    nextCards.push({
      id: 'quick-opacity',
      title: '透明度',
      value: formatOpacity(opacityBase),
      description: '适合做弱化态、叠层和柔和感。',
      focusKey: 'background',
      stepLabel: '0.05',
      onDecrease: () => updateStyles({ opacity: formatOpacity(opacityBase - 0.05) }, 'quick-adjust:opacity:minus'),
      onIncrease: () => updateStyles({ opacity: formatOpacity(opacityBase + 0.05) }, 'quick-adjust:opacity:plus'),
    })

    if (preset === 'text' && !hasNestedMarkup(element)) {
      const fontSizeBase = parseNumericToken(draftStyles['font-size'] || '16px') || 16
      const fontStep = Math.max(1, Math.round(quickStep / 4))
      nextCards.push({
        id: 'quick-font-size',
        title: '字号',
        value: formatPx(fontSizeBase),
        description: '标题和正文最常用的快速层级控制。',
        focusKey: 'typography',
        stepLabel: `${fontStep}px`,
        onDecrease: () => updateStyles({ 'font-size': formatPx(Math.max(0, fontSizeBase - fontStep)) }, 'quick-adjust:font-size:minus'),
        onIncrease: () => updateStyles({ 'font-size': formatPx(fontSizeBase + fontStep) }, 'quick-adjust:font-size:plus'),
      })
    }

    return nextCards.slice(0, compact ? 4 : 6)
  }, [compact, draftStyles, element, preset, quickStep, updateStyles])

  return (
    <>
      <div className="workbench-sticky-header">
        <div className={`panel-toolbelt ${compact ? 'compact' : ''}`}>
          {TOOL_ITEMS.map((item) => (
            <button
              key={item.tool}
              type="button"
              className={`panel-tool-btn ${activeTool === item.tool ? 'active' : ''}`}
              onClick={() => {
                if (item.tool === 'select') {
                  onToolChange(activeTool === 'select' ? 'browse' : 'select')
                }
              }}
              aria-label={item.label}
              title={activeTool === 'select' ? '关闭元素选择，恢复真实点击' : '开启元素选择'}
            >
              <span className="panel-tool-icon">{item.icon}</span>
            </button>
          ))}
          <button
            type="button"
            className="panel-tool-btn utility"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-label="恢复工具"
            title="撤销、前进与重置"
          >
            <span className="panel-tool-icon">↺</span>
          </button>
        </div>

        {historyOpen && (
          <div className="history-popover">
            <button
              type="button"
              className="history-action"
              onClick={() => {
                undoLastStyleChange()
              }}
              disabled={!canUndo}
            >
              <span>↶</span>
              <span>撤销</span>
            </button>
            <button
              type="button"
              className="history-action"
              onClick={() => {
                redoLastStyleChange()
              }}
              disabled={!canRedo}
            >
              <span>↷</span>
              <span>前进</span>
            </button>
            <button
              type="button"
              className="history-action"
              onClick={() => {
                resetStyleChanges()
              }}
              disabled={!canReset}
            >
              <span>⟲</span>
              <span>重置</span>
            </button>
          </div>
        )}

        <div className="element-header">
          <div className="element-header-main">
            <span className="element-header-kicker">{preset === 'container' ? '容器名称' : '元素名称'}</span>
            <div className="element-header-actions">
              <button
                type="button"
                className="element-selector-button"
                onClick={() => void handleCopyElementName()}
                title={`点击复制 ${elementDisplayName}`}
              >
                <span className="element-selector-name">{elementDisplayName}</span>
                <span className="element-selector-copy">{copiedSelector ? '已复制' : '复制'}</span>
              </button>
              <button
                type="button"
                className="element-ai-copy-button"
                onClick={handleCopyPrompt}
                disabled={!canExport}
                title="复制当前微调和标签给 AI"
              >
                {copiedPrompt ? '已复制' : '复制给 AI'}
              </button>
            </div>
          </div>
          <div className="element-meta">
            <span className={`element-preset-badge ${preset}`}>{preset}</span>
            <span className={`element-sync ${pendingField ? 'visible' : ''}`} title={pendingField || ''}>同步中</span>
          </div>
        </div>
      </div>
      <>
        {element && <LabelSection
          element={element}
          tags={tags}
          onUpsertTag={onUpsertTag}
          onDeleteTag={onDeleteTag}
        />}

        <div className="boxmodel-metrics">
          {metricSummary.map((item) => (
            <MetricBadge
              key={item.label}
              label={item.label}
              value={item.value}
              tone={item.tone}
            />
          ))}
        </div>

        <SectionBlock
          title="快捷操作"
          hint="先用语义化动作和方向卡把对象推到接近目标，再到后面的原始参数区做精修。"
          compact={compact}
        >
          <div className="quick-actions-topbar">
            <QuickStepSelector step={quickStep} onChange={setQuickStep} />
          </div>

          {recommendedActions.length > 0 && (
            <div className="recommended-actions">
              {recommendedActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="recommended-action-button"
                  onClick={() => handleApplyRecommendedAction(action)}
                  title={action.description}
                >
                  <span className="recommended-action-title">{action.label}</span>
                </button>
              ))}
            </div>
          )}

          {preset === 'container' && (
            <div
              onMouseEnter={() => activateQuickHelper('布局快捷卡', '先切块 / Flex / Grid，再用方向盘把内容推到上、下、左、右或居中。', 'layout')}
              onMouseLeave={resetHelperState}
            >
              <QuickLayoutCard
                styles={draftStyles}
                onSetDisplay={handleQuickLayoutDisplay}
                onAlign={handleQuickLayoutAlign}
              />
            </div>
          )}

          <div
            onMouseEnter={() => activateQuickHelper('边距快捷调节', '先选内边距或外边距，再点方向。中心表示四边一起调整。', quickSpacingTarget)}
            onMouseLeave={resetHelperState}
          >
            <QuickSpacingPad
              step={quickStep}
              target={quickSpacingTarget}
              side={quickSpacingSide}
              styles={draftStyles}
              onTargetChange={setQuickSpacingTarget}
              onSideChange={setQuickSpacingSide}
              onAdjust={handleQuickSpacingAdjust}
            />
          </div>

          {quickAdjustCards.length > 0 && (
            <div className="quick-adjust-grid">
              {quickAdjustCards.map((card) => (
                <div
                  key={card.id}
                  onMouseEnter={() => activateQuickHelper(card.title, card.description, card.focusKey)}
                  onMouseLeave={resetHelperState}
                >
                  <QuickAdjustCard {...card} />
                </div>
              ))}
            </div>
          )}
        </SectionBlock>

          {layoutInsight && (
            <div className="helper-callout layout-insight">
              <div className="helper-callout-title">{layoutInsight.title}</div>
              <div className="helper-callout-body">{layoutInsight.description}</div>
            </div>
          )}

          {textPreview && (
            <div className="text-preview-strip">{textPreview}</div>
          )}

          {currentElementTags.length > 0 && (
            <SectionBlock
              title="标签"
              hint="这些标签会跟当前微调一起导出给 AI。"
              compact={compact}
            >
              <div className="tag-list">
                {currentElementTags.map((tag) => (
                  <div key={tag.id} className="tag-card">
                    <div className="tag-card-title">{getTagDisplayName(tag)}</div>
                    <div className="tag-card-body">{tag.text}</div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {element.outerHTMLPreview && (
            <div className="html-preview">
              <pre>{element.outerHTMLPreview}</pre>
            </div>
          )}

          {dedupedSections.map((section) => (
            <SectionBlock key={section.title} title={section.title} hint={section.hint} compact={compact}>
              {section.fields.length > 0 && (
                <div className="control-grid two-col">
                  {section.fields.map((field) => (
                    <FieldControl
                      key={`${section.title}-${field.key}`}
                      field={field}
                      value={getFieldValue(field.key, draftStyles)}
                      compact={compact}
                      onFieldActiveChange={handleFieldActiveChange}
                      onCommit={(nextValue) => updateStyle(field.key, nextValue)}
                    />
                  ))}
                </div>
              )}

              {section.title === TYPOGRAPHY_SECTION.title && supportsTypography(element) && (
                <div className="control-grid">
                  <TextContentEditor
                    value={element.textContent}
                    onCommit={updateTextContent}
                  />
                </div>
              )}

              {section.title === IMAGE_SECTION.title && supportsImageEditing(element) && (
                <div className="control-grid two-col image-attr-grid">
                  <AttributeEditor
                    label="图片地址"
                    value={element.attributes.src || ''}
                    placeholder="https://..."
                    onCommit={(nextValue) => updateAttribute('src', nextValue)}
                  />
                  <AttributeEditor
                    label="替代文本"
                    value={element.attributes.alt || ''}
                    placeholder="image description"
                    onCommit={(nextValue) => updateAttribute('alt', nextValue)}
                  />
                </div>
              )}
            </SectionBlock>
          ))}

          {recommendedFields.length > 0 && (
            <SectionBlock
              title="精细参数"
              hint="当快捷操作已经把对象推进到差不多的位置，再用这些常用参数做最后的精修。"
              compact={compact}
            >
              <div className="control-grid two-col recommended-grid">
                {recommendedFields.map((field) => (
                  <FieldControl
                    key={`recommended-${field.key}`}
                    field={field}
                    value={getFieldValue(field.key, draftStyles)}
                    compact={compact}
                    onFieldActiveChange={handleFieldActiveChange}
                    onCommit={(nextValue) => updateStyle(field.key, nextValue)}
                  />
                ))}
              </div>
            </SectionBlock>
          )}
      </>

      {SNAPSHOT_SECTIONS.map((section) => (
        <SnapshotSection
          key={section.title}
          title={section.title}
          keys={section.keys}
          styles={draftStyles}
        />
      ))}

      {Object.keys(element.cssVariables).length > 0 && (
        <div className="style-section">
          <div className="section-title">CSS 变量</div>
          {Object.entries(element.cssVariables).map(([name, value]) => (
            <div key={name} className="style-row">
              <span className="var-name">{name}</span>
              {isColorValue(value) ? (
                <span className="var-value color-preview">
                  <span className="color-swatch" style={{ background: value }} />
                  {value}
                </span>
              ) : (
                <span className="var-value">{value}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {(activeEditProperty || activeTool !== 'select') && (
        <div className={`helper-callout ${activeEditProperty ? 'active' : ''}`}>
          <div className="helper-callout-title">{helperState.title}</div>
          <div className="helper-callout-body">{helperState.description}</div>
        </div>
      )}
    </>
  )
}
