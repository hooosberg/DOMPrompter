import type { PropertySectionConfig } from '../types'

export const BASE_PROPERTY_SECTIONS: PropertySectionConfig[] = [
  {
    title: '尺寸',
    hint: '先确定容器本身的宽高，再继续微调内部结构。',
    fields: [
      { key: 'width', label: '宽度', control: 'token', focusKey: 'size', helperText: '调整容器的最终宽度，常用于卡片、面板和图片等固定尺寸区域。', placeholder: '320px / auto' },
      { key: 'height', label: '高度', control: 'token', focusKey: 'size', helperText: '调整容器的最终高度，适合微调标题区、卡片或图片框的垂直占位。', placeholder: '200px / auto' },
    ],
  },
  {
    title: '内边距',
    hint: 'Auto Layout 最常调整的是四边 padding。',
    fields: [
      { key: 'padding-top', label: '上', control: 'token', focusKey: 'padding', helperText: '调整内容与容器边框之间的上侧留白，最适合微调标题区和卡片的呼吸感。', placeholder: '16px' },
      { key: 'padding-right', label: '右', control: 'token', focusKey: 'padding', helperText: '调整内容与容器右边缘之间的距离，适用于侧边栏、按钮和卡片。', placeholder: '16px' },
      { key: 'padding-bottom', label: '下', control: 'token', focusKey: 'padding', helperText: '调整内容与底边之间的距离，常用于让卡片底部更稳。', placeholder: '16px' },
      { key: 'padding-left', label: '左', control: 'token', focusKey: 'padding', helperText: '调整内容与容器左边缘之间的距离，适合微调列表、卡片和按钮。', placeholder: '16px' },
    ],
  },
  {
    title: '外边距',
    hint: '容器与容器之间的呼吸感主要来自 margin。',
    fields: [
      { key: 'margin-top', label: '上', control: 'token', focusKey: 'margin', helperText: '调整当前元素与上一个元素之间的外部距离，适合拉开段落和模块。', placeholder: '24px' },
      { key: 'margin-right', label: '右', control: 'token', focusKey: 'margin', helperText: '调整当前元素右侧与邻近元素的外部间距。', placeholder: '0px' },
      { key: 'margin-bottom', label: '下', control: 'token', focusKey: 'margin', helperText: '调整当前元素与下一个元素之间的垂直间距。', placeholder: '24px' },
      { key: 'margin-left', label: '左', control: 'token', focusKey: 'margin', helperText: '调整当前元素左侧与邻近元素的外部间距。', placeholder: '0px' },
    ],
  },
  {
    title: '布局',
    hint: '通过 display、gap 和对齐，快速观察容器结构变化。',
    fields: [
      { key: 'display', label: '显示方式', control: 'option', focusKey: 'layout', helperText: '切换容器的布局模式。设为 Flex 或 Grid 后，主轴对齐、交叉轴和 Gap 等能力才真正生效。', options: [{ label: '块', value: 'block' }, { label: 'Flex', value: 'flex' }, { label: 'Grid', value: 'grid' }] },
      { key: 'gap', label: '间距', control: 'token', focusKey: 'gap', helperText: '调整容器内子元素之间的空隙大小。仅在 Flex 或 Grid 布局下生效。', placeholder: '16px' },
      { key: 'justify-content', label: '主轴对齐', control: 'option', focusKey: 'layout', helperText: '控制子元素沿主轴的分布方式，常用于水平按钮组和纵向卡片列表。', options: [{ label: '起点', value: 'flex-start' }, { label: '居中', value: 'center' }, { label: '终点', value: 'flex-end' }, { label: '两端', value: 'space-between' }] },
      { key: 'align-items', label: '交叉轴', control: 'option', focusKey: 'layout', helperText: '控制子元素沿交叉轴的对齐方式，常用于垂直居中和卡片对齐。', options: [{ label: '拉伸', value: 'stretch' }, { label: '起点', value: 'flex-start' }, { label: '居中', value: 'center' }, { label: '终点', value: 'flex-end' }] },
    ],
  },
  {
    title: '定位',
    hint: '优先保持布局稳定，微调时以定位和层级为主。',
    fields: [
      { key: 'position', label: '定位模式', control: 'option', focusKey: 'position', helperText: '将元素切换到相对、绝对或固定定位。绝对定位会脱离常规文档流。', options: [{ label: '静态', value: 'static' }, { label: '相对', value: 'relative' }, { label: '绝对', value: 'absolute' }, { label: '固定', value: 'fixed' }] },
      { key: 'top', label: '顶部偏移', control: 'token', focusKey: 'position', helperText: '在定位元素上微调顶部偏移，适合做细小位置修正。', placeholder: '12px' },
      { key: 'left', label: '左侧偏移', control: 'token', focusKey: 'position', helperText: '在定位元素上微调左侧偏移，适合做细小位置修正。', placeholder: '12px' },
      { key: 'z-index', label: '层级', control: 'token', focusKey: 'position', helperText: '控制元素的覆盖层级，适合浮层、弹窗和装饰性元素。', placeholder: '10' },
      { key: 'transform', label: '变换', control: 'token', focusKey: 'position', helperText: '通过 translate 等变换做不破坏文档流的细微位移。', placeholder: 'translate(10px, 5px)' },
    ],
  },
  {
    title: '边框与圆角',
    hint: '轮廓、圆角和投影决定容器的界面感。',
    fields: [
      { key: 'border', label: '边框', control: 'token', focusKey: 'border', helperText: '控制边线的粗细、颜色和样式，适合微调卡片、输入框和按钮。', placeholder: '1px solid rgba(255,255,255,.12)' },
      { key: 'border-radius', label: '圆角', control: 'slider', focusKey: 'border', helperText: '调整圆角大小，常用于卡片、面板和按钮的界面气质。', min: 0, max: 64, step: 1, unit: 'px' },
      { key: 'box-shadow', label: '投影', control: 'token', focusKey: 'shadow', helperText: '通过阴影塑造浮层感和卡片层级，让元素更有立体感。', placeholder: '0 10px 30px rgba(0,0,0,.18)' },
    ],
  },
  {
    title: '背景',
    hint: '背景色和透明度适合快速推敲层级感。',
    fields: [
      { key: 'background-color', label: '背景色', control: 'color', focusKey: 'background', helperText: '直接调整容器背景的综合色彩，适合快速推敲视觉层级和语义。' },
      { key: 'opacity', label: '透明度', control: 'slider', focusKey: 'background', helperText: '降低不透明度可以快速做禁用态、蒙层和柔化效果。', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '滚动与裁切',
    hint: '处理容器裁切、滚动和图片类内容时常用。',
    fields: [
      { key: 'overflow', label: '裁切', control: 'option', focusKey: 'overflow', helperText: '控制超出容器的内容是继续显示、隐藏还是允许滚动。', options: [{ label: '可见', value: 'visible' }, { label: '隐藏', value: 'hidden' }, { label: '滚动', value: 'auto' }] },
    ],
  },
]

export const TYPOGRAPHY_SECTION: PropertySectionConfig = {
  title: '文字',
  hint: '围绕字号、行高、字重和对齐做微调。',
  fields: [
    { key: 'font-size', label: '字号', control: 'slider', focusKey: 'typography', helperText: '调整文字本身的尺寸，适合标题、副标题和正文的层级微调。', min: 8, max: 96, step: 1, unit: 'px' },
    { key: 'line-height', label: '行高', control: 'token', focusKey: 'typography', helperText: '调整文本行与行之间的垂直距离，用来修正文案的松紧度和可读性。', placeholder: '1.5 / 24px' },
    { key: 'font-weight', label: '字重', control: 'token', focusKey: 'typography', helperText: '改变文字的轻重感，适合强调标题或弱化说明文本。', placeholder: '400 / 600' },
    { key: 'font-family', label: '字体', control: 'token', focusKey: 'typography', helperText: '切换字体族，快速观察整块文案的气质变化。', placeholder: 'Georgia, serif' },
    { key: 'color', label: '文字颜色', control: 'color', focusKey: 'typography', helperText: '直接调整文字颜色，适合强调层级、品牌色和弱化说明文字。' },
    { key: 'text-align', label: '对齐', control: 'option', focusKey: 'typography', helperText: '改变整段文本的排版方向，适合标题块和段落内容。', options: [{ label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' }] },
  ],
}

export const IMAGE_SECTION: PropertySectionConfig = {
  title: '图片',
  hint: '图片优先调整填充方式、圆角和尺寸。',
  fields: [
    { key: 'object-fit', label: '填充方式', control: 'option', focusKey: 'image', helperText: '控制图片在容器内是裁切、完整显示还是强行拉伸。', options: [{ label: '裁切', value: 'cover' }, { label: '包含', value: 'contain' }, { label: '拉伸', value: 'fill' }] },
    { key: 'width', label: '宽度', control: 'token', focusKey: 'size', helperText: '调整图片或媒体框的最终宽度。', placeholder: '320px / auto' },
    { key: 'height', label: '高度', control: 'token', focusKey: 'size', helperText: '调整图片或媒体框的最终高度。', placeholder: '240px / auto' },
    { key: 'border-radius', label: '圆角', control: 'slider', focusKey: 'border', helperText: '让图片边缘更柔和，常用于卡片封面和头像。', min: 0, max: 64, step: 1, unit: 'px' },
  ],
}
