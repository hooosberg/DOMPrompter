import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { createBasePropertySections, createImageSection, createTypographySection } from '../../config/propertySections'
import { useStyleBinding, type GlobalHistoryCommitInfo } from '../../hooks/useStyleBinding'
import type { ActiveEditProperty, CanvasTool, ElementCapabilityProfile, ElementTag, ExportPromptSummaryMeta, InspectedElement, OverlayNudgeChange, PersistedStyleHistoryState, PropertyFieldConfig, PropertySectionConfig } from '../../types'
import { FieldControl } from './FieldControl'

const SNAPSHOT_SECTIONS = [
  { key: 'layout', keys: ['width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { key: 'visual', keys: ['background-color', 'color', 'opacity', 'border', 'border-radius', 'box-shadow'] },
  { key: 'typography', keys: ['font-size', 'font-weight', 'font-family', 'line-height', 'text-align'] },
  { key: 'position', keys: ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'transform', 'overflow', 'object-fit'] },
]

const TOOL_ITEMS: Array<{ tool: Exclude<CanvasTool, 'browse'>; icon: string; labelKey: string }> = [
  { tool: 'select', icon: '↖', labelKey: 'workbench.toolbar.select' },
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

interface ActivePropertyTarget {
  section: 'labels' | 'quick' | 'precision' | 'assist'
  subsectionTitle?: string
  title: string
  description: string
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

function getSpacingSideLabel(side: SpacingSide, t: ReturnType<typeof useTranslation>['t']) {
  if (side === 'all') return t('properties.spacing.allSides')
  if (side === 'top') return t('properties.spacing.topSide')
  if (side === 'right') return t('properties.spacing.rightSide')
  if (side === 'bottom') return t('properties.spacing.bottomSide')
  return t('properties.spacing.leftSide')
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

function hasNonZeroSpacing(styles: Record<string, string>, prefix: 'padding' | 'margin') {
  return ['top', 'right', 'bottom', 'left']
    .some((side) => {
      const value = styles[`${prefix}-${side}`]
      return Boolean(value && value !== '0px')
    })
}

function getDirectChildCount(element: InspectedElement) {
  const directChildCount = element.descendants.filter((item) => item.depth === 1).length
  if (directChildCount > 0) return directChildCount
  return hasNestedMarkup(element) ? 1 : 0
}

function getOverlayDensity(element: InspectedElement, styles: Record<string, string>) {
  const width = element.boxModel?.width ?? parseNumericToken(styles.width || '') ?? 0
  const height = element.boxModel?.height ?? parseNumericToken(styles.height || '') ?? 0

  if (width >= 180 && height >= 120) return 'roomy'
  if (width >= 88 && height >= 56) return 'compact'
  return 'tight'
}

function buildElementCapabilityProfile(
  element: InspectedElement,
  styles: Record<string, string>,
): ElementCapabilityProfile {
  const display = styles.display || 'block'
  const position = styles.position || 'static'
  const preset = getElementPreset(element, styles)
  const textLeaf = preset === 'text' && !hasNestedMarkup(element)
  const childCount = getDirectChildCount(element)
  const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)
  const hasExplicitPadding = hasNonZeroSpacing(styles, 'padding')
  const hasExplicitMargin = hasNonZeroSpacing(styles, 'margin')
  const supportsMedia = supportsImageEditing(element)
  const supportsTypographyControls = supportsTypography(element)
  const supportsGapShortcut = preset === 'container' && childCount > 1
  const supportsPositionControls = position !== 'static'
    || Boolean(styles.top)
    || Boolean(styles.left)
    || Boolean(styles.transform)
  const supportsPositionSection = preset === 'container' || supportsPositionControls

  return {
    preset,
    density: getOverlayDensity(element, styles),
    childCount,
    supportsSize: true,
    supportsPadding: preset === 'container' || supportsMedia || hasExplicitPadding || ['button', 'input', 'textarea'].includes(element.tagName),
    supportsMargin: preset === 'container'
      || hasExplicitMargin
      || supportsPositionControls
      || (textLeaf && display !== 'inline'),
    supportsGap: isLayoutContainer && childCount > 1,
    supportsGapShortcut,
    supportsLayout: preset === 'container' || isLayoutContainer,
    supportsTypography: supportsTypographyControls,
    supportsMedia,
    supportsPosition: supportsPositionControls,
    supportsPositionSection,
  }
}

function supportsTypography(element: InspectedElement) {
  return Boolean(element.textContentPreview.trim()) || ['p', 'span', 'label', 'button', 'input', 'textarea', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.tagName)
}

function supportsImageEditing(element: InspectedElement) {
  return element.tagName === 'img'
}

function getDefaultHelperText(activeTool: CanvasTool, t: ReturnType<typeof useTranslation>['t']) {
  if (activeTool === 'browse') {
    return {
      title: t('workbench.helper.browseTitle'),
      description: t('workbench.helper.browseDesc'),
    }
  }

  return {
    title: t('workbench.helper.contextTitle'),
    description: t('workbench.helper.contextDesc'),
  }
}

function getContextualFieldHelper(
  field: PropertyFieldConfig,
  styles: Record<string, string>,
  element: InspectedElement,
  fallbackDescription: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const display = styles.display || 'block'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isCenteringContainer = isFlexContainer && (justifyContent === 'center' || alignItems === 'center')
  const childTargetName = element.classNames[0]
    ? t('workbench.helper.innerChildWithClass', { className: element.classNames[0] })
    : t('workbench.helper.innerChild')

  if (field.focusKey === 'padding' && isCenteringContainer) {
    return t('workbench.helper.paddingCentered', { field: field.label, childTargetName })
  }

  if (field.focusKey === 'margin' && isCenteringContainer) {
    return t('workbench.helper.marginCentered', { childTargetName })
  }

  if (field.focusKey === 'size' && isCenteringContainer) {
    return t('workbench.helper.sizeCentered', { justifyContent, alignItems })
  }

  if (field.focusKey === 'gap' && !isFlexContainer && !isGridContainer) {
    return t('workbench.helper.gapUnavailable')
  }

  return fallbackDescription
}

function getLayoutInsight(styles: Record<string, string>, element: InspectedElement, t: ReturnType<typeof useTranslation>['t']) {
  const display = styles.display || 'block'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'

  if (['flex', 'inline-flex'].includes(display) && (justifyContent === 'center' || alignItems === 'center')) {
    return {
      title: t('workbench.insight.layoutTitle'),
      description: t('workbench.insight.flexCentered', { justifyContent, alignItems }),
    }
  }

  if (['grid', 'inline-grid'].includes(display)) {
    return {
      title: t('workbench.insight.layoutTitle'),
      description: t('workbench.insight.grid'),
    }
  }

  if (hasNestedMarkup(element)) {
    return {
      title: t('workbench.insight.layoutTitle'),
      description: t('workbench.insight.parent'),
    }
  }

  return null
}

function getRecommendedFieldKeys(
  element: InspectedElement,
  styles: Record<string, string>,
  capabilityProfile: ElementCapabilityProfile,
) {
  const display = styles.display || 'block'
  const position = styles.position || 'static'
  const justifyContent = styles['justify-content'] || 'normal'
  const alignItems = styles['align-items'] || 'normal'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isCenteringContainer = isFlexContainer && (justifyContent === 'center' || alignItems === 'center')
  const preset = capabilityProfile.preset
  const nextKeys: string[] = []

  if (preset === 'image') {
    nextKeys.push('width', 'height', 'object-fit', 'border-radius', 'opacity')
  } else if (preset === 'text' && !hasNestedMarkup(element)) {
    nextKeys.push('font-size', 'line-height', 'font-weight', 'color', 'text-align')
  } else {
    if (capabilityProfile.supportsLayout) {
      nextKeys.push('display', 'justify-content', 'align-items')
      if (capabilityProfile.supportsGap || (!isCenteringContainer && isGridContainer)) {
        nextKeys.push('gap')
      }
    }

    nextKeys.push('width', 'height')

    if (isCenteringContainer) {
      nextKeys.push('justify-content', 'align-items')
    } else {
      if (capabilityProfile.supportsPadding) {
        nextKeys.push('padding-top', 'padding-left')
      }
    }

    nextKeys.push('background-color', 'border-radius')
  }

  if (capabilityProfile.supportsPosition || position !== 'static') {
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
  capabilityProfile: ElementCapabilityProfile,
  quickStep: number,
  t: ReturnType<typeof useTranslation>['t'],
): RecommendedAction[] {
  const display = styles.display || 'block'
  const isFlexContainer = ['flex', 'inline-flex'].includes(display)
  const isGridContainer = ['grid', 'inline-grid'].includes(display)
  const isLayoutContainer = isFlexContainer || isGridContainer
  const preset = capabilityProfile.preset
  const actions: RecommendedAction[] = []

  if (preset === 'container' && !isLayoutContainer) {
    actions.push({
      id: 'enable-flex',
      label: t('workbench.recommended.enableFlex.label'),
      description: t('workbench.recommended.enableFlex.description'),
      patch: { display: 'flex' },
      focusKey: 'layout',
    })
  }

  if (preset === 'container' && isLayoutContainer) {
    actions.push({
      id: 'align-center',
      label: t('workbench.recommended.alignCenter.label'),
      description: t('workbench.recommended.alignCenter.description'),
      patch: { 'justify-content': 'center', 'align-items': 'center' },
      focusKey: 'layout',
    })
    actions.push({
      id: 'space-between',
      label: t('workbench.recommended.spaceBetween.label'),
      description: t('workbench.recommended.spaceBetween.description'),
      patch: { 'justify-content': 'space-between' },
      focusKey: 'layout',
    })
  }

  if (preset === 'text' && !hasNestedMarkup(element)) {
    actions.push({
      id: 'center-text',
      label: t('workbench.recommended.centerText.label'),
      description: t('workbench.recommended.centerText.description'),
      patch: { 'text-align': 'center' },
      focusKey: 'typography',
    })
  }

  if (preset === 'image') {
    actions.push({
      id: 'image-cover',
      label: t('workbench.recommended.imageCover.label'),
      description: t('workbench.recommended.imageCover.description'),
      patch: { 'object-fit': 'cover' },
      focusKey: 'image',
    })
    actions.push({
      id: 'image-contain',
      label: t('workbench.recommended.imageContain.label'),
      description: t('workbench.recommended.imageContain.description'),
      patch: { 'object-fit': 'contain' },
      focusKey: 'image',
    })
  }

  if (preset === 'container' && capabilityProfile.supportsPadding) {
    const paddingTop = parseNumericToken(styles['padding-top'] || '0px') || 0
    const paddingRight = parseNumericToken(styles['padding-right'] || '0px') || 0
    const paddingBottom = parseNumericToken(styles['padding-bottom'] || '0px') || 0
    const paddingLeft = parseNumericToken(styles['padding-left'] || '0px') || 0
    const gapValue = parseNumericToken(getFieldValue('gap', styles) || '0px') || 0

    actions.push({
      id: 'increase-padding',
      label: t('workbench.recommended.increasePadding.label'),
      description: t('workbench.recommended.increasePadding.description', { quickStep }),
      patch: {
        'padding-top': formatPx(paddingTop + quickStep),
        'padding-right': formatPx(paddingRight + quickStep),
        'padding-bottom': formatPx(paddingBottom + quickStep),
        'padding-left': formatPx(paddingLeft + quickStep),
      },
      focusKey: 'padding',
    })

    if (capabilityProfile.supportsGap && isLayoutContainer) {
      actions.push({
        id: 'increase-gap',
        label: t('workbench.recommended.increaseGap.label'),
        description: t('workbench.recommended.increaseGap.description', { quickStep }),
        patch: { gap: formatPx(gapValue + quickStep) },
        focusKey: 'gap',
      })
    }
  }

  return actions.slice(0, 4)
}

function getFieldVisibility(
  field: PropertyFieldConfig,
  styles: Record<string, string>,
  capabilityProfile: ElementCapabilityProfile,
) {
  const position = styles.position || 'static'
  const hasGapValue = Boolean(styles.gap || styles['row-gap'] || styles['column-gap'])

  if (field.key === 'gap') {
    return capabilityProfile.supportsLayout && (
      capabilityProfile.supportsGap
      || capabilityProfile.supportsGapShortcut
      || hasGapValue
    )
  }

  if (['justify-content', 'align-items'].includes(field.key)) {
    return capabilityProfile.supportsLayout
  }

  if (field.key.startsWith('padding-')) {
    return capabilityProfile.supportsPadding || Boolean(styles[field.key])
  }

  if (field.key.startsWith('margin-')) {
    return capabilityProfile.supportsMargin || Boolean(styles[field.key])
  }

  if (field.key === 'position') {
    return capabilityProfile.supportsPositionSection || position !== 'static'
  }

  if (['top', 'left'].includes(field.key)) {
    return capabilityProfile.supportsPosition || position !== 'static' || Boolean(styles[field.key])
  }

  if (field.key === 'z-index') {
    return capabilityProfile.supportsPosition || position !== 'static' || (styles['z-index'] && styles['z-index'] !== 'auto')
  }

  return true
}

function getActivePropertyTarget(
  property: ActiveEditProperty,
  capabilityProfile: ElementCapabilityProfile,
  t: ReturnType<typeof useTranslation>['t'],
): ActivePropertyTarget {
  switch (property) {
    case 'labels':
      return {
        section: 'labels',
        title: t('workbench.sections.labels'),
        description: t('workbench.active.labels'),
      }
    case 'size':
      return {
        section: 'quick',
        title: t('properties.sections.size.title'),
        description: t('workbench.active.size'),
      }
    case 'padding':
      return {
        section: 'quick',
        title: t('properties.sections.padding.title'),
        description: t('workbench.active.padding'),
      }
    case 'margin':
      return {
        section: 'quick',
        title: t('properties.sections.margin.title'),
        description: t('workbench.active.margin'),
      }
    case 'layout':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.layout.title'),
        title: t('workbench.active.alignmentTitle'),
        description: t('workbench.active.layout'),
      }
    case 'gap':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.layout.title'),
        title: t('properties.fields.gap.label'),
        description: capabilityProfile.supportsGapShortcut
          ? t('workbench.active.gapShortcut')
          : t('workbench.active.gap'),
      }
    case 'position':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.position.title'),
        title: t('properties.sections.position.title'),
        description: t('workbench.active.position'),
      }
    case 'border':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.border.title'),
        title: t('properties.sections.border.title'),
        description: t('workbench.active.border'),
      }
    case 'background':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.background.title'),
        title: t('properties.sections.background.title'),
        description: t('workbench.active.background'),
      }
    case 'shadow':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.border.title'),
        title: t('properties.fields.boxShadow.label'),
        description: t('workbench.active.shadow'),
      }
    case 'typography':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.typography.title'),
        title: t('properties.sections.typography.title'),
        description: t('workbench.active.typography'),
      }
    case 'overflow':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.overflow.title'),
        title: t('properties.sections.overflow.title'),
        description: t('workbench.active.overflow'),
      }
    case 'image':
      return {
        section: 'precision',
        subsectionTitle: t('properties.sections.image.title'),
        title: t('properties.sections.image.title'),
        description: t('workbench.active.image'),
      }
  }
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
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState(String(step))

  useEffect(() => {
    setDraftValue(String(step))
  }, [step])

  return (
    <div className="quick-step-selector">
      <span className="quick-step-label">{t('workbench.quick.step')}</span>
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
  const { t } = useTranslation()
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
        <div className="control-section-title" title={t('workbench.quick.layout.hint')}>{t('workbench.quick.layout.title')}</div>
        <span className="quick-system-card-value">{displayKey.toUpperCase()}</span>
      </div>

      <div className="quick-segmented">
        {[
          { label: t('properties.options.display.block'), value: 'block' },
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
          { slot: 'top-left', label: t('workbench.direction.topLeft') },
          { slot: 'top', label: t('workbench.direction.top') },
          { slot: 'top-right', label: t('workbench.direction.topRight') },
          { slot: 'left', label: t('workbench.direction.left') },
          { slot: 'center', label: t('workbench.direction.center') },
          { slot: 'right', label: t('workbench.direction.right') },
          { slot: 'bottom-left', label: t('workbench.direction.bottomLeft') },
          { slot: 'bottom', label: t('workbench.direction.bottom') },
          { slot: 'bottom-right', label: t('workbench.direction.bottomRight') },
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
  availableTargets,
  onTargetChange,
  onSideChange,
  onAdjust,
}: {
  target: SpacingTarget
  side: SpacingSide
  step: number
  styles: Record<string, string>
  availableTargets: SpacingTarget[]
  onTargetChange: (target: SpacingTarget) => void
  onSideChange: (side: SpacingSide) => void
  onAdjust: (delta: number) => void
}) {
  const { t } = useTranslation()
  const currentSummary = side === 'all'
    ? buildSpacingSummary(styles, target)
    : styles[`${target}-${side}`] || '0px'

  const sideItems: Array<{ side: SpacingSide; label: string }> = [
    { side: 'all', label: t('properties.sides.allShort') },
    { side: 'top', label: t('properties.sides.top') },
    { side: 'right', label: t('properties.sides.right') },
    { side: 'bottom', label: t('properties.sides.bottom') },
    { side: 'left', label: t('properties.sides.left') },
  ]

  return (
    <div className="quick-system-card quick-spacing-card">
      <div className="quick-system-card-header">
        <div className="control-section-title" title={t('workbench.quick.spacing.hint')}>{t('workbench.quick.spacing.title')}</div>
        <div className="quick-system-card-meta">
          <strong className="quick-spacing-value">{currentSummary}</strong>
          <span className="quick-step-mini">{step}px</span>
        </div>
      </div>

      {availableTargets.length > 1 ? (
        <div className="quick-segmented quick-segmented-two">
          {availableTargets.map((item) => (
            <button
              key={item}
              type="button"
              className={`quick-segmented-option ${target === item ? 'active' : ''}`}
              onClick={() => onTargetChange(item)}
            >
              {item === 'padding' ? t('properties.sections.padding.title') : t('properties.sections.margin.title')}
            </button>
          ))}
        </div>
      ) : (
        <div className="quick-system-card-chip">
          {availableTargets[0] === 'padding' ? t('workbench.quick.spacing.currentPadding') : t('workbench.quick.spacing.currentMargin')}
        </div>
      )}

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
          {t('workbench.quick.decreaseWithStep', { step })}
        </button>
        <button type="button" className="quick-spacing-action primary" onClick={() => onAdjust(step)}>
          {t('workbench.quick.increaseWithStep', { step })}
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
  const { t } = useTranslation()
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
        <button type="button" className="quick-spacing-action" onClick={onDecrease}>{t('workbench.quick.decrease')}</button>
        <button type="button" className="quick-spacing-action primary" onClick={onIncrease}>{t('workbench.quick.increase')}</button>
      </div>
    </div>
  )
}

function SectionBlock({
  title,
  hint,
  compact,
  active,
  collapsible,
  open,
  onToggle,
  sectionRef,
  children,
}: {
  title: string
  hint?: string
  compact?: boolean
  active?: boolean
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
  sectionRef?: Ref<HTMLElement>
  children: ReactNode
}) {
  const { t } = useTranslation()
  const resolvedOpen = collapsible ? Boolean(open) : true

  return (
    <section
      ref={sectionRef}
      className={`control-section ${compact ? 'compact' : ''} ${active ? 'active' : ''} ${collapsible ? 'collapsible' : ''} ${resolvedOpen ? 'expanded' : 'collapsed'}`}
    >
      <div className="control-section-header">
        {collapsible ? (
          <button
            type="button"
            className="control-section-toggle"
            onClick={onToggle}
            aria-expanded={resolvedOpen}
            title={hint}
          >
            <span className="control-section-title">{title}</span>
            <span className="control-section-toggle-meta">{resolvedOpen ? t('common.collapse') : t('common.expand')}</span>
          </button>
        ) : (
          <div className="control-section-title" title={hint}>{title}</div>
        )}
      </div>
      {resolvedOpen && <div className="control-section-body">{children}</div>}
    </section>
  )
}

function SnapshotSection({
  title,
  keys,
  styles,
  compact,
  open,
  onToggle,
}: {
  title: string
  keys: string[]
  styles: Record<string, string>
  compact?: boolean
  open: boolean
  onToggle: () => void
}) {
  const rows = keys.filter((key) => {
    const value = styles[key]
    return value && value !== 'none' && value !== 'normal' && value !== '0px'
  })

  if (rows.length === 0) {
    return null
  }

  return (
    <SectionBlock
      title={title}
      compact={compact}
      collapsible
      open={open}
      onToggle={onToggle}
    >
      <div className="style-section inline-section">
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
    </SectionBlock>
  )
}

function TextContentEditor({
  value,
  onCommit,
}: {
  value: string
  onCommit: (value: string) => void
}) {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value)
    }
  }, [value, isFocused])

  return (
    <label className="control-card control-card-wide">
      <span className="control-card-label">{t('workbench.editor.textContent')}</span>
      <textarea
        className="control-textarea"
        value={draftValue}
        placeholder={t('workbench.editor.textPlaceholder')}
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
  const { t } = useTranslation()
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
        <span className="label-section-title">{t('workbench.sections.labels')}</span>
      </div>
      <div className="label-section-desc">{t('workbench.labels.description')}</div>
      {elementTags.map((tag) => (
        <div key={tag.id} className="label-item">
          <input
            type="text"
            className="label-input"
            defaultValue={tag.text}
            placeholder={t('workbench.labels.placeholder')}
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
            title={t('workbench.labels.delete')}
          >×</button>
        </div>
      ))}
      {!hasTag && (
        <div className="label-item">
          <input
            ref={inputRef}
            type="text"
            className="label-input"
            placeholder={t('workbench.labels.placeholderConfirm')}
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
  activeEditTick = 0,
  compact,
  selectionRevision,
  historyScopeKey,
  persistedStyleHistory,
  overlayNudgeChange,
  overlayNudgeTick,
  onElementChange,
  onStyleDiffChange,
  onPersistedStyleHistoryChange,
  onGlobalHistoryCommit,
  globalCanUndo,
  globalCanRedo,
  globalCanReset,
  onGlobalUndo,
  onGlobalRedo,
  onGlobalReset,
  onToolChange,
  onActiveEditPropertyChange,
  onUpsertTag,
  onDeleteTag,
  exportPromptPreview,
  exportSummaryMeta,
  canExportPrompt,
  onCopyExportPrompt,
}: {
  element: InspectedElement
  activeTool: CanvasTool
  tags: ElementTag[]
  activeEditProperty: ActiveEditProperty | null
  activeEditTick?: number
  compact?: boolean
  selectionRevision: number
  historyScopeKey?: string | null
  persistedStyleHistory?: PersistedStyleHistoryState | null
  overlayNudgeChange?: OverlayNudgeChange | null
  overlayNudgeTick?: number
  onElementChange: (element: InspectedElement) => void
  onStyleDiffChange: (element: InspectedElement, styleDiff: Record<string, string>) => void
  onPersistedStyleHistoryChange?: (history: PersistedStyleHistoryState | null) => void
  onGlobalHistoryCommit?: (info: GlobalHistoryCommitInfo) => void
  globalCanUndo?: boolean
  globalCanRedo?: boolean
  globalCanReset?: boolean
  onGlobalUndo?: () => void
  onGlobalRedo?: () => void
  onGlobalReset?: () => void
  onToolChange: (tool: CanvasTool) => void
  onActiveEditPropertyChange: (property: ActiveEditProperty | null) => void
  onUpsertTag: (element: InspectedElement, text: string, tagId?: string) => void
  onDeleteTag: (tagId: string) => void
  exportPromptPreview: string
  exportSummaryMeta: ExportPromptSummaryMeta
  canExportPrompt: boolean
  onCopyExportPrompt: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const {
    draftStyles,
    pendingField,
    updateStyle,
    updateStyles,
    updateTextContent,
    updateAttribute,
  } = useStyleBinding({
    element,
    selectionRevision,
    historyScopeKey,
    persistedStyleHistory,
    externalNudgeChange: overlayNudgeChange,
    externalNudgeTick: overlayNudgeTick,
    onElementChange,
    onStyleDiffChange,
    onPersistedStyleHistoryChange,
    onGlobalHistoryCommit,
  })
  const [helperState, setHelperState] = useState<{ title: string; description: string }>(() => getDefaultHelperText(activeTool, t))
  const [copiedSelector, setCopiedSelector] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [quickStep, setQuickStep] = useState<number>(8)
  const [quickSpacingTarget, setQuickSpacingTarget] = useState<SpacingTarget>('padding')
  const [quickSpacingSide, setQuickSpacingSide] = useState<SpacingSide>('all')
  const labelSectionRef = useRef<HTMLElement | null>(null)
  const quickSectionRef = useRef<HTMLElement | null>(null)
  const precisionSectionRef = useRef<HTMLElement | null>(null)
  const assistSectionRef = useRef<HTMLElement | null>(null)
  const precisionSubsectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const handledActiveEditTickRef = useRef(0)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    precision: false,
    assist: false,
    'css-vars': false,
  })
  const typographySection = useMemo(() => createTypographySection(t), [t])
  const imageSection = useMemo(() => createImageSection(t), [t])
  const preset = useMemo(() => getElementPreset(element, draftStyles), [element, draftStyles])
  const capabilityProfile = useMemo(
    () => buildElementCapabilityProfile(element, draftStyles),
    [draftStyles, element],
  )
  const elementDisplayName = useMemo(() => getElementDisplayName(element), [element])

  const sections = useMemo<PropertySectionConfig[]>(() => {
    const nextSections = createBasePropertySections(t)
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => getFieldVisibility(field, draftStyles, capabilityProfile)),
      }))
      .filter((section) => section.fields.length > 0)

    if (supportsTypography(element)) {
      nextSections.push(typographySection)
    }
    if (supportsImageEditing(element)) {
      nextSections.push(imageSection)
    }
    return nextSections
  }, [capabilityProfile, draftStyles, element, imageSection, t, typographySection])

  useEffect(() => {
    setHelperState(getDefaultHelperText(activeTool, t))
  }, [activeTool, element.backendNodeId, t])

  const handleFieldActiveChange = (field: PropertyFieldConfig | null) => {
    if (!field || !field.focusKey) {
      onActiveEditPropertyChange(null)
      setHelperState(getDefaultHelperText(activeTool, t))
      return
    }

    onActiveEditPropertyChange(field.focusKey)
    setHelperState({
      title: field.label,
      description: getContextualFieldHelper(
        field,
        draftStyles,
        element,
        field.helperText || getDefaultHelperText(activeTool, t).description,
        t,
      ),
    })
  }
  const activePropertyTarget = useMemo(
    () => (activeEditProperty ? getActivePropertyTarget(activeEditProperty, capabilityProfile, t) : null),
    [activeEditProperty, capabilityProfile, t],
  )
  const textPreview = useMemo(() => element.textContentPreview || '', [element.textContentPreview])
  const metricSummary = useMemo(() => {
    const width = element.boxModel ? `${Math.round(element.boxModel.width)}px` : (draftStyles.width || 'auto')
    const height = element.boxModel ? `${Math.round(element.boxModel.height)}px` : (draftStyles.height || 'auto')
    const items = [
      { label: 'W', value: width, tone: 'accent' as const },
      { label: 'H', value: height, tone: 'accent' as const },
      ...(capabilityProfile.supportsPadding
        ? [{ label: 'Padding', value: buildSpacingSummary(draftStyles, 'padding'), tone: 'neutral' as const }]
        : []),
      ...(capabilityProfile.supportsMargin
        ? [{ label: 'Margin', value: buildSpacingSummary(draftStyles, 'margin'), tone: 'warm' as const }]
        : []),
      ...(capabilityProfile.supportsGap
        ? [{ label: 'Gap', value: getFieldValue('gap', draftStyles) || '0px', tone: 'neutral' as const }]
        : []),
    ]
    return items
  }, [capabilityProfile, draftStyles, element.boxModel])
  const layoutInsight = useMemo(() => getLayoutInsight(draftStyles, element, t), [draftStyles, element, t])
  const recommendedFields = useMemo(() => {
    const fieldMap = new Map<string, PropertyFieldConfig>()
    sections.forEach((section) => {
      section.fields.forEach((field) => {
        fieldMap.set(field.key, field)
      })
    })

    return getRecommendedFieldKeys(element, draftStyles, capabilityProfile)
      .map((fieldKey) => fieldMap.get(fieldKey))
      .filter((field): field is PropertyFieldConfig => Boolean(field))
      .slice(0, compact ? 4 : 6)
  }, [capabilityProfile, compact, draftStyles, element, sections])
  const recommendedFieldKeySet = useMemo(() => new Set(recommendedFields.map((field) => field.key)), [recommendedFields])
  const recommendedActions = useMemo(
    () => getRecommendedActions(element, draftStyles, capabilityProfile, quickStep, t),
    [capabilityProfile, draftStyles, element, quickStep, t],
  )
  const availableSpacingTargets = useMemo<SpacingTarget[]>(() => {
    const targets: SpacingTarget[] = []
    if (capabilityProfile.supportsPadding) targets.push('padding')
    if (capabilityProfile.supportsMargin) targets.push('margin')
    return targets
  }, [capabilityProfile.supportsMargin, capabilityProfile.supportsPadding])
  const dedupedSections = useMemo(() => (
    sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => !recommendedFieldKeySet.has(field.key)),
      }))
      .filter((section) => {
        if (section.fields.length > 0) return true
        if (section.title === typographySection.title && supportsTypography(element)) return true
        if (section.title === imageSection.title && supportsImageEditing(element)) return true
        return false
      })
  ), [element, imageSection.title, recommendedFieldKeySet, sections, typographySection.title])
  const hasCssVariables = Object.keys(element.cssVariables).length > 0
  const isSectionExpanded = useCallback((key: string, defaultValue = false) => (
    expandedSections[key] ?? defaultValue
  ), [expandedSections])
  const toggleSection = useCallback((key: string) => {
    setExpandedSections((current) => ({
      ...current,
      [key]: !(current[key] ?? false),
    }))
  }, [])
  const ensureSectionExpanded = useCallback((key: string) => {
    setExpandedSections((current) => (
      current[key]
        ? current
        : {
            ...current,
            [key]: true,
          }
    ))
  }, [])

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

  useEffect(() => {
    if (availableSpacingTargets.length === 0) return
    if (!availableSpacingTargets.includes(quickSpacingTarget)) {
      setQuickSpacingTarget(availableSpacingTargets[0])
    }
  }, [availableSpacingTargets, quickSpacingTarget])

  useEffect(() => {
    if (!activeEditProperty || activeEditTick <= 0 || !activePropertyTarget) return
    if (handledActiveEditTickRef.current === activeEditTick) return

    handledActiveEditTickRef.current = activeEditTick

    setHelperState({
      title: activePropertyTarget.title,
      description: activePropertyTarget.description,
    })

    if (activePropertyTarget.section === 'precision') {
      ensureSectionExpanded('precision')
    }
    if (activePropertyTarget.section === 'assist') {
      ensureSectionExpanded('assist')
    }

    window.setTimeout(() => {
      const targetNode = activePropertyTarget.subsectionTitle
        ? precisionSubsectionRefs.current[activePropertyTarget.subsectionTitle]
        : activePropertyTarget.section === 'labels'
          ? labelSectionRef.current
        : activePropertyTarget.section === 'quick'
          ? quickSectionRef.current
          : activePropertyTarget.section === 'precision'
            ? precisionSectionRef.current
            : assistSectionRef.current

      if (!targetNode) return
      targetNode.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 60)
  }, [activeEditProperty, activeEditTick, activePropertyTarget, ensureSectionExpanded])

  const handleCopyElementName = async () => {
    try {
      await navigator.clipboard.writeText(elementDisplayName)
      setCopiedSelector(true)
    } catch (error) {
      console.error('Failed to copy element name:', error)
    }
  }

  const handleCopyPrompt = async () => {
    try {
      await onCopyExportPrompt()
      setCopiedPrompt(true)
    } catch (error) {
      console.error('Failed to copy export prompt:', error)
    }
  }

  const resetHelperState = () => {
    onActiveEditPropertyChange(null)
    setHelperState(getDefaultHelperText(activeTool, t))
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
      title: quickSpacingTarget === 'padding' ? t('workbench.quick.spacing.paddingActionTitle') : t('workbench.quick.spacing.marginActionTitle'),
      description: t('workbench.quick.spacing.adjusted', {
        side: getSpacingSideLabel(quickSpacingSide, t),
        direction: delta > 0 ? t('workbench.quick.increased') : t('workbench.quick.decreased'),
        value: Math.abs(delta),
      }),
    })
  }

  const handleQuickLayoutDisplay = (display: string) => {
    updateStyles({ display }, `quick-layout:display:${display}`)
    activateQuickHelper(
      t('workbench.quick.layout.modeTitle'),
      t('workbench.quick.layout.modeDescription', { display: display.toUpperCase() }),
      'layout',
    )
  }

  const handleQuickLayoutAlign = (slot: DirectionalPadSlot) => {
    const patch = buildLayoutAlignmentPatch(draftStyles, slot)
    const slotLabelMap: Record<DirectionalPadSlot, string> = {
      'top-left': t('workbench.slot.topLeft'),
      top: t('workbench.slot.top'),
      'top-right': t('workbench.slot.topRight'),
      left: t('workbench.slot.left'),
      center: t('workbench.slot.center'),
      right: t('workbench.slot.right'),
      'bottom-left': t('workbench.slot.bottomLeft'),
      bottom: t('workbench.slot.bottom'),
      'bottom-right': t('workbench.slot.bottomRight'),
    }
    updateStyles(patch, `quick-layout:align:${slot}`)
    activateQuickHelper(
      t('workbench.quick.layout.positionTitle'),
      t('workbench.quick.layout.positionDescription', { slot: slotLabelMap[slot] }),
      'layout',
    )
  }

  const quickAdjustCards = useMemo<QuickAdjustCardConfig[]>(() => {
    const nextCards: QuickAdjustCardConfig[] = []
    const widthBase = parseNumericToken(draftStyles.width || '') ?? getBoxDimension(element, 'width')
    const heightBase = parseNumericToken(draftStyles.height || '') ?? getBoxDimension(element, 'height')
    const isLayoutContainer = ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(draftStyles.display || 'block')

    if (capabilityProfile.supportsSize) {
      nextCards.push({
        id: 'quick-width',
        title: t('properties.fields.width.label'),
        value: widthBase > 0 ? formatPx(widthBase) : (draftStyles.width || 'auto'),
        description: t('workbench.quick.cards.width'),
        focusKey: 'size',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'width', -quickStep, widthBase), 'quick-adjust:width:minus'),
        onIncrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'width', quickStep, widthBase), 'quick-adjust:width:plus'),
      })

      nextCards.push({
        id: 'quick-height',
        title: t('properties.fields.height.label'),
        value: heightBase > 0 ? formatPx(heightBase) : (draftStyles.height || 'auto'),
        description: t('workbench.quick.cards.height'),
        focusKey: 'size',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'height', -quickStep, heightBase), 'quick-adjust:height:minus'),
        onIncrease: () => updateStyles(buildNudgedPxPatch(draftStyles, 'height', quickStep, heightBase), 'quick-adjust:height:plus'),
      })
    }

    if (capabilityProfile.supportsGap && isLayoutContainer) {
      const gapBase = parseNumericToken(getFieldValue('gap', draftStyles) || '0px') || 0
      nextCards.push({
        id: 'quick-gap',
        title: t('properties.fields.gap.label'),
        value: formatPx(gapBase),
        description: t('workbench.quick.cards.gap'),
        focusKey: 'gap',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles({ gap: formatPx(Math.max(0, gapBase - quickStep)) }, 'quick-adjust:gap:minus'),
        onIncrease: () => updateStyles({ gap: formatPx(gapBase + quickStep) }, 'quick-adjust:gap:plus'),
      })
    }

    if (preset !== 'text' || hasNestedMarkup(element) || capabilityProfile.supportsMedia) {
      const radiusBase = parseNumericToken(draftStyles['border-radius'] || '0px') || 0
      nextCards.push({
        id: 'quick-radius',
        title: t('properties.fields.borderRadius.label'),
        value: formatPx(radiusBase),
        description: t('workbench.quick.cards.radius'),
        focusKey: 'border',
        stepLabel: `${quickStep}px`,
        onDecrease: () => updateStyles({ 'border-radius': formatPx(Math.max(0, radiusBase - quickStep)) }, 'quick-adjust:radius:minus'),
        onIncrease: () => updateStyles({ 'border-radius': formatPx(radiusBase + quickStep) }, 'quick-adjust:radius:plus'),
      })
    }

    if (capabilityProfile.supportsMedia) {
      nextCards.push({
        id: 'quick-object-fit',
        title: t('properties.fields.objectFit.label'),
        value: draftStyles['object-fit'] || 'cover',
        description: t('workbench.quick.cards.objectFit'),
        focusKey: 'image',
        onDecrease: () => updateStyles({ 'object-fit': 'contain' }, 'quick-adjust:object-fit:contain'),
        onIncrease: () => updateStyles({ 'object-fit': 'cover' }, 'quick-adjust:object-fit:cover'),
      })
    }

    const opacityBase = parseNumericToken(draftStyles.opacity || '1') ?? 1
    nextCards.push({
      id: 'quick-opacity',
      title: t('properties.fields.opacity.label'),
      value: formatOpacity(opacityBase),
      description: t('workbench.quick.cards.opacity'),
      focusKey: 'background',
      stepLabel: '0.05',
      onDecrease: () => updateStyles({ opacity: formatOpacity(opacityBase - 0.05) }, 'quick-adjust:opacity:minus'),
      onIncrease: () => updateStyles({ opacity: formatOpacity(opacityBase + 0.05) }, 'quick-adjust:opacity:plus'),
    })

    if (preset === 'text' && !hasNestedMarkup(element) && capabilityProfile.supportsTypography) {
      const fontSizeBase = parseNumericToken(draftStyles['font-size'] || '16px') || 16
      const fontStep = Math.max(1, Math.round(quickStep / 4))
      nextCards.push({
        id: 'quick-font-size',
        title: t('properties.fields.fontSize.label'),
        value: formatPx(fontSizeBase),
        description: t('workbench.quick.cards.fontSize'),
        focusKey: 'typography',
        stepLabel: `${fontStep}px`,
        onDecrease: () => updateStyles({ 'font-size': formatPx(Math.max(0, fontSizeBase - fontStep)) }, 'quick-adjust:font-size:minus'),
        onIncrease: () => updateStyles({ 'font-size': formatPx(fontSizeBase + fontStep) }, 'quick-adjust:font-size:plus'),
      })
    }

    return nextCards.slice(0, compact ? 4 : 6)
  }, [capabilityProfile, compact, draftStyles, element, preset, quickStep, t, updateStyles])

  return (
    <div className="workbench-shell">
      <div className="workbench-scroll-content">
        <div className="workbench-sticky-header">
          <div className="panel-toolbar-row">
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
                  aria-label={t(item.labelKey)}
                  title={activeTool === 'select' ? t('workbench.toolbar.selectOff') : t('workbench.toolbar.selectOn')}
                >
                  <span className="panel-tool-icon">{item.icon}</span>
                  <span className="panel-tool-text">{activeTool === 'select' ? t('workbench.toolbar.selectActive') : t('workbench.toolbar.interactive')}</span>
                </button>
              ))}
            </div>

            <div className="panel-toolbar-trailing">
              <span className={`element-sync ${pendingField ? 'visible' : ''}`} title={pendingField || ''}>{t('workbench.toolbar.syncing')}</span>
              <div className="history-cluster">
                <button
                  type="button"
                  className="history-action"
                  onClick={() => {
                    onGlobalUndo?.()
                  }}
                  disabled={!globalCanUndo}
                >
                  <span>↶</span>
                  <span>{t('workbench.toolbar.undo')}</span>
                </button>
                <button
                  type="button"
                  className="history-action"
                  onClick={() => {
                    onGlobalRedo?.()
                  }}
                  disabled={!globalCanRedo}
                >
                  <span>↷</span>
                  <span>{t('workbench.toolbar.redo')}</span>
                </button>
                <button
                  type="button"
                  className="history-action"
                  onClick={() => {
                    onGlobalReset?.()
                  }}
                  disabled={!globalCanReset}
                >
                  <span>⟲</span>
                  <span>{t('workbench.toolbar.reset')}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="element-header">
            <div className="element-header-main">
              <span className="element-header-kicker">{preset === 'container' ? t('workbench.element.containerName') : t('workbench.element.elementName')}</span>
              <div className="element-header-actions">
                <button
                  type="button"
                  className="element-selector-button"
                  onClick={() => void handleCopyElementName()}
                  title={t('workbench.element.copyTitle', { name: elementDisplayName })}
                >
                  <span className="element-selector-name">{elementDisplayName}</span>
                  <span className="element-selector-copy">{copiedSelector ? t('common.copied') : t('common.copy')}</span>
                </button>
              </div>
              {preset !== 'container' && (
                <div className="element-meta-inline">
                  <span className={`element-preset-badge ${preset}`}>{preset}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <SectionBlock
          title={t('workbench.sections.labels')}
          hint={t('workbench.sections.labelsHint')}
          compact={compact}
          active={activePropertyTarget?.section === 'labels'}
          sectionRef={labelSectionRef}
        >
          <LabelSection
            element={element}
            tags={tags}
            onUpsertTag={onUpsertTag}
            onDeleteTag={onDeleteTag}
          />
        </SectionBlock>

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
          title={t('workbench.sections.quick')}
          hint={t('workbench.sections.quickHint')}
          compact={compact}
          active={activePropertyTarget?.section === 'quick'}
          sectionRef={quickSectionRef}
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
              onMouseEnter={() => activateQuickHelper(t('workbench.quick.layout.title'), t('workbench.quick.layout.hint'), 'layout')}
              onMouseLeave={resetHelperState}
            >
              <QuickLayoutCard
                styles={draftStyles}
                onSetDisplay={handleQuickLayoutDisplay}
                onAlign={handleQuickLayoutAlign}
              />
            </div>
          )}

          {availableSpacingTargets.length > 0 && (
            <div
              onMouseEnter={() => activateQuickHelper(t('workbench.quick.spacing.title'), t('workbench.quick.spacing.hint'), quickSpacingTarget)}
              onMouseLeave={resetHelperState}
            >
              <QuickSpacingPad
                step={quickStep}
                target={quickSpacingTarget}
                side={quickSpacingSide}
                styles={draftStyles}
                availableTargets={availableSpacingTargets}
                onTargetChange={setQuickSpacingTarget}
                onSideChange={setQuickSpacingSide}
                onAdjust={handleQuickSpacingAdjust}
              />
            </div>
          )}

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

        <SectionBlock
          title={t('workbench.sections.precision')}
          hint={t('workbench.sections.precisionHint')}
          compact={compact}
          active={activePropertyTarget?.section === 'precision'}
          collapsible
          open={isSectionExpanded('precision')}
          onToggle={() => toggleSection('precision')}
          sectionRef={precisionSectionRef}
        >
          {recommendedFields.length > 0 && (
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
          )}

          <div className="precision-section-stack">
            {dedupedSections.map((section) => (
              <div
                key={section.title}
                ref={(node) => {
                  precisionSubsectionRefs.current[section.title] = node
                }}
                className={`precision-subsection ${activePropertyTarget?.subsectionTitle === section.title ? 'active' : ''}`}
              >
                <div className="precision-subsection-title">{section.title}</div>
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

                {section.title === typographySection.title && supportsTypography(element) && (
                  <div className="control-grid precision-editor">
                    <TextContentEditor
                      value={element.textContent}
                      onCommit={updateTextContent}
                    />
                  </div>
                )}

                {section.title === imageSection.title && supportsImageEditing(element) && (
                  <div className="control-grid two-col image-attr-grid precision-editor">
                    <AttributeEditor
                      label={t('workbench.editor.imageUrl')}
                      value={element.attributes.src || ''}
                      placeholder="https://..."
                      onCommit={(nextValue) => updateAttribute('src', nextValue)}
                    />
                    <AttributeEditor
                      label={t('workbench.editor.altText')}
                      value={element.attributes.alt || ''}
                      placeholder={t('workbench.editor.altPlaceholder')}
                      onCommit={(nextValue) => updateAttribute('alt', nextValue)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title={t('workbench.sections.assist')}
          hint={t('workbench.sections.assistHint')}
          compact={compact}
          active={activePropertyTarget?.section === 'assist'}
          collapsible
          open={isSectionExpanded('assist')}
          onToggle={() => toggleSection('assist')}
          sectionRef={assistSectionRef}
        >
          {layoutInsight && (
            <div className="helper-callout layout-insight">
              <div className="helper-callout-title">{layoutInsight.title}</div>
              <div className="helper-callout-body">{layoutInsight.description}</div>
            </div>
          )}

          {textPreview && (
            <div className="text-preview-strip">{textPreview}</div>
          )}

          {element.outerHTMLPreview && (
            <div className="html-preview">
              <pre>{element.outerHTMLPreview}</pre>
            </div>
          )}
        </SectionBlock>

        {SNAPSHOT_SECTIONS.map((section) => (
          <SnapshotSection
            key={section.key}
            title={t(`workbench.snapshot.${section.key}`)}
            keys={section.keys}
            styles={draftStyles}
            compact={compact}
            open={isSectionExpanded(`snapshot:${section.key}`)}
            onToggle={() => toggleSection(`snapshot:${section.key}`)}
          />
        ))}

        {hasCssVariables && (
          <SectionBlock
            title={t('workbench.sections.cssVariables')}
            compact={compact}
            collapsible
            open={isSectionExpanded('css-vars')}
            onToggle={() => toggleSection('css-vars')}
          >
            <div className="style-section inline-section">
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
          </SectionBlock>
        )}

        {(activeEditProperty || activeTool !== 'select') && (
          <div className={`helper-callout ${activeEditProperty ? 'active' : ''}`}>
            <div className="helper-callout-title">{helperState.title}</div>
            <div className="helper-callout-body">{helperState.description}</div>
          </div>
        )}
        <SectionBlock
          title={t('workbench.export.sectionTitle')}
          hint={t('workbench.export.sectionHint')}
          compact={compact}
        >
          <div className="export-preview-card">
            <div className="export-preview-header">
              <div className="export-preview-title-group">
                <div className="export-preview-kicker">{t('workbench.export.kicker')}</div>
                <div className="export-preview-title">{t('workbench.export.title')}</div>
              </div>
              <div className="export-summary-meta">
                {t('workbench.export.summary', {
                  elementCount: exportSummaryMeta.elementCount,
                  modifiedCount: exportSummaryMeta.modifiedCount,
                  tagCount: exportSummaryMeta.tagCount,
                })}
              </div>
            </div>
            <pre className={`export-preview-body ${canExportPrompt ? '' : 'empty'}`}>{exportPromptPreview}</pre>
          </div>

          <button
            type="button"
            className="panel-export-button"
            onClick={() => void handleCopyPrompt()}
            disabled={!canExportPrompt}
            title={t('workbench.export.copyTitle')}
          >
            {copiedPrompt ? t('workbench.export.copied') : t('workbench.export.copyButton')}
          </button>
        </SectionBlock>
      </div>
    </div>
  )
}
