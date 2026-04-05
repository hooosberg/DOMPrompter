import type { TFunction } from 'i18next'
import type { PropertySectionConfig } from '../types'

export function createBasePropertySections(t: TFunction): PropertySectionConfig[] {
  return [
    {
      title: t('properties.sections.size.title'),
      hint: t('properties.sections.size.hint'),
      fields: [
        { key: 'width', label: t('properties.fields.width.label'), control: 'token', focusKey: 'size', helperText: t('properties.fields.width.helperText'), placeholder: t('properties.fields.width.placeholder') },
        { key: 'height', label: t('properties.fields.height.label'), control: 'token', focusKey: 'size', helperText: t('properties.fields.height.helperText'), placeholder: t('properties.fields.height.placeholder') },
      ],
    },
    {
      title: t('properties.sections.padding.title'),
      hint: t('properties.sections.padding.hint'),
      fields: [
        { key: 'padding-top', label: t('properties.sides.top'), control: 'token', focusKey: 'padding', helperText: t('properties.fields.paddingTop.helperText'), placeholder: t('properties.fields.paddingTop.placeholder') },
        { key: 'padding-right', label: t('properties.sides.right'), control: 'token', focusKey: 'padding', helperText: t('properties.fields.paddingRight.helperText'), placeholder: t('properties.fields.paddingRight.placeholder') },
        { key: 'padding-bottom', label: t('properties.sides.bottom'), control: 'token', focusKey: 'padding', helperText: t('properties.fields.paddingBottom.helperText'), placeholder: t('properties.fields.paddingBottom.placeholder') },
        { key: 'padding-left', label: t('properties.sides.left'), control: 'token', focusKey: 'padding', helperText: t('properties.fields.paddingLeft.helperText'), placeholder: t('properties.fields.paddingLeft.placeholder') },
      ],
    },
    {
      title: t('properties.sections.margin.title'),
      hint: t('properties.sections.margin.hint'),
      fields: [
        { key: 'margin-top', label: t('properties.sides.top'), control: 'token', focusKey: 'margin', helperText: t('properties.fields.marginTop.helperText'), placeholder: t('properties.fields.marginTop.placeholder') },
        { key: 'margin-right', label: t('properties.sides.right'), control: 'token', focusKey: 'margin', helperText: t('properties.fields.marginRight.helperText'), placeholder: t('properties.fields.marginRight.placeholder') },
        { key: 'margin-bottom', label: t('properties.sides.bottom'), control: 'token', focusKey: 'margin', helperText: t('properties.fields.marginBottom.helperText'), placeholder: t('properties.fields.marginBottom.placeholder') },
        { key: 'margin-left', label: t('properties.sides.left'), control: 'token', focusKey: 'margin', helperText: t('properties.fields.marginLeft.helperText'), placeholder: t('properties.fields.marginLeft.placeholder') },
      ],
    },
    {
      title: t('properties.sections.layout.title'),
      hint: t('properties.sections.layout.hint'),
      fields: [
        {
          key: 'display',
          label: t('properties.fields.display.label'),
          control: 'option',
          focusKey: 'layout',
          helperText: t('properties.fields.display.helperText'),
          options: [
            { label: t('properties.options.display.block'), value: 'block' },
            { label: 'Flex', value: 'flex' },
            { label: 'Grid', value: 'grid' },
          ],
        },
        { key: 'gap', label: t('properties.fields.gap.label'), control: 'token', focusKey: 'gap', helperText: t('properties.fields.gap.helperText'), placeholder: t('properties.fields.gap.placeholder') },
        {
          key: 'justify-content',
          label: t('properties.fields.justifyContent.label'),
          control: 'option',
          focusKey: 'layout',
          helperText: t('properties.fields.justifyContent.helperText'),
          options: [
            { label: t('properties.options.align.start'), value: 'flex-start' },
            { label: t('properties.options.align.center'), value: 'center' },
            { label: t('properties.options.align.end'), value: 'flex-end' },
            { label: t('properties.options.align.spaceBetween'), value: 'space-between' },
          ],
        },
        {
          key: 'align-items',
          label: t('properties.fields.alignItems.label'),
          control: 'option',
          focusKey: 'layout',
          helperText: t('properties.fields.alignItems.helperText'),
          options: [
            { label: t('properties.options.align.stretch'), value: 'stretch' },
            { label: t('properties.options.align.start'), value: 'flex-start' },
            { label: t('properties.options.align.center'), value: 'center' },
            { label: t('properties.options.align.end'), value: 'flex-end' },
          ],
        },
      ],
    },
    {
      title: t('properties.sections.position.title'),
      hint: t('properties.sections.position.hint'),
      fields: [
        {
          key: 'position',
          label: t('properties.fields.position.label'),
          control: 'option',
          focusKey: 'position',
          helperText: t('properties.fields.position.helperText'),
          options: [
            { label: t('properties.options.position.static'), value: 'static' },
            { label: t('properties.options.position.relative'), value: 'relative' },
            { label: t('properties.options.position.absolute'), value: 'absolute' },
            { label: t('properties.options.position.fixed'), value: 'fixed' },
          ],
        },
        { key: 'top', label: t('properties.fields.top.label'), control: 'token', focusKey: 'position', helperText: t('properties.fields.top.helperText'), placeholder: t('properties.fields.top.placeholder') },
        { key: 'left', label: t('properties.fields.left.label'), control: 'token', focusKey: 'position', helperText: t('properties.fields.left.helperText'), placeholder: t('properties.fields.left.placeholder') },
        { key: 'z-index', label: t('properties.fields.zIndex.label'), control: 'token', focusKey: 'position', helperText: t('properties.fields.zIndex.helperText'), placeholder: t('properties.fields.zIndex.placeholder') },
        { key: 'transform', label: t('properties.fields.transform.label'), control: 'token', focusKey: 'position', helperText: t('properties.fields.transform.helperText'), placeholder: t('properties.fields.transform.placeholder') },
      ],
    },
    {
      title: t('properties.sections.border.title'),
      hint: t('properties.sections.border.hint'),
      fields: [
        { key: 'border', label: t('properties.fields.border.label'), control: 'token', focusKey: 'border', helperText: t('properties.fields.border.helperText'), placeholder: t('properties.fields.border.placeholder') },
        { key: 'border-radius', label: t('properties.fields.borderRadius.label'), control: 'slider', focusKey: 'border', helperText: t('properties.fields.borderRadius.helperText'), min: 0, max: 64, step: 1, unit: 'px' },
        { key: 'box-shadow', label: t('properties.fields.boxShadow.label'), control: 'token', focusKey: 'shadow', helperText: t('properties.fields.boxShadow.helperText'), placeholder: t('properties.fields.boxShadow.placeholder') },
      ],
    },
    {
      title: t('properties.sections.background.title'),
      hint: t('properties.sections.background.hint'),
      fields: [
        { key: 'background-color', label: t('properties.fields.backgroundColor.label'), control: 'color', focusKey: 'background', helperText: t('properties.fields.backgroundColor.helperText') },
        { key: 'opacity', label: t('properties.fields.opacity.label'), control: 'slider', focusKey: 'background', helperText: t('properties.fields.opacity.helperText'), min: 0, max: 1, step: 0.01 },
      ],
    },
    {
      title: t('properties.sections.overflow.title'),
      hint: t('properties.sections.overflow.hint'),
      fields: [
        {
          key: 'overflow',
          label: t('properties.fields.overflow.label'),
          control: 'option',
          focusKey: 'overflow',
          helperText: t('properties.fields.overflow.helperText'),
          options: [
            { label: t('properties.options.overflow.visible'), value: 'visible' },
            { label: t('properties.options.overflow.hidden'), value: 'hidden' },
            { label: t('properties.options.overflow.auto'), value: 'auto' },
          ],
        },
      ],
    },
  ]
}

export function createTypographySection(t: TFunction): PropertySectionConfig {
  return {
    title: t('properties.sections.typography.title'),
    hint: t('properties.sections.typography.hint'),
    fields: [
      { key: 'font-size', label: t('properties.fields.fontSize.label'), control: 'slider', focusKey: 'typography', helperText: t('properties.fields.fontSize.helperText'), min: 8, max: 96, step: 1, unit: 'px' },
      { key: 'line-height', label: t('properties.fields.lineHeight.label'), control: 'token', focusKey: 'typography', helperText: t('properties.fields.lineHeight.helperText'), placeholder: t('properties.fields.lineHeight.placeholder') },
      { key: 'font-weight', label: t('properties.fields.fontWeight.label'), control: 'token', focusKey: 'typography', helperText: t('properties.fields.fontWeight.helperText'), placeholder: t('properties.fields.fontWeight.placeholder') },
      { key: 'font-family', label: t('properties.fields.fontFamily.label'), control: 'token', focusKey: 'typography', helperText: t('properties.fields.fontFamily.helperText'), placeholder: t('properties.fields.fontFamily.placeholder') },
      { key: 'color', label: t('properties.fields.color.label'), control: 'color', focusKey: 'typography', helperText: t('properties.fields.color.helperText') },
      {
        key: 'text-align',
        label: t('properties.fields.textAlign.label'),
        control: 'option',
        focusKey: 'typography',
        helperText: t('properties.fields.textAlign.helperText'),
        options: [
          { label: t('properties.options.textAlign.left'), value: 'left' },
          { label: t('properties.options.textAlign.center'), value: 'center' },
          { label: t('properties.options.textAlign.right'), value: 'right' },
        ],
      },
    ],
  }
}

export function createImageSection(t: TFunction): PropertySectionConfig {
  return {
    title: t('properties.sections.image.title'),
    hint: t('properties.sections.image.hint'),
    fields: [
      {
        key: 'object-fit',
        label: t('properties.fields.objectFit.label'),
        control: 'option',
        focusKey: 'image',
        helperText: t('properties.fields.objectFit.helperText'),
        options: [
          { label: t('properties.options.objectFit.cover'), value: 'cover' },
          { label: t('properties.options.objectFit.contain'), value: 'contain' },
          { label: t('properties.options.objectFit.fill'), value: 'fill' },
        ],
      },
      { key: 'width', label: t('properties.fields.width.label'), control: 'token', focusKey: 'size', helperText: t('properties.fields.imageWidth.helperText'), placeholder: t('properties.fields.imageWidth.placeholder') },
      { key: 'height', label: t('properties.fields.height.label'), control: 'token', focusKey: 'size', helperText: t('properties.fields.imageHeight.helperText'), placeholder: t('properties.fields.imageHeight.placeholder') },
      { key: 'border-radius', label: t('properties.fields.borderRadius.label'), control: 'slider', focusKey: 'border', helperText: t('properties.fields.imageBorderRadius.helperText'), min: 0, max: 64, step: 1, unit: 'px' },
    ],
  }
}
