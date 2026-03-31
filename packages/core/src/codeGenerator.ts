export interface CSSProperty {
  name: string
  value: string
}

export function generateCSS(properties: CSSProperty[]): string {
  let css = ''
  for (const prop of properties) {
    css += `  ${prop.name}: ${prop.value};\n`
  }
  return css
}

export function generateReactInlineStyle(properties: CSSProperty[]): string {
  const styleObj: Record<string, string> = {}
  for (const prop of properties) {
    const camelProp = prop.name.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
    styleObj[camelProp] = prop.value
  }
  return `style={${JSON.stringify(styleObj, null, 2)}}`
}

export function generateCSSClass(selector: string, properties: CSSProperty[]): string {
  let css = `${selector} {\n`
  for (const prop of properties) {
    css += `  ${prop.name}: ${prop.value};\n`
  }
  css += '}'
  return css
}

export function generateCSSVariables(variables: Record<string, string>): string {
  let css = ':root {\n'
  for (const [name, value] of Object.entries(variables)) {
    css += `  ${name}: ${value};\n`
  }
  css += '}'
  return css
}

export interface AIPromptInput {
  tagName: string
  classNames: string[]
  id: string
  computedStyles: Record<string, string>
  cssVariables: Record<string, string>
  outerHTMLPreview: string
  /** 用户指定的修改（可选） */
  changes?: Array<{ property: string; from: string; to: string }>
}

/**
 * 生成结构化的 AI Prompt（Markdown 格式），可直接粘贴进 Claude / Cursor
 */
export function generateAIPrompt(input: AIPromptInput): string {
  const { tagName, classNames, id, computedStyles, cssVariables, changes, outerHTMLPreview } = input

  const lines: string[] = []
  lines.push('我正在微调界面，请帮我更新代码。')
  lines.push('')

  // 元素特征
  let selector = `<${tagName}`
  if (id) selector += ` id="${id}"`
  if (classNames.length > 0) selector += ` class="${classNames.join(' ')}"`
  selector += '>'
  lines.push(`**目标元素**：\`${selector}\``)
  lines.push('')

  // HTML 预览
  if (outerHTMLPreview) {
    lines.push('**HTML 片段**：')
    lines.push('```html')
    lines.push(outerHTMLPreview)
    lines.push('```')
    lines.push('')
  }

  // 需要修改的属性
  if (changes && changes.length > 0) {
    lines.push('**需要进行的修改**：')
    for (const change of changes) {
      lines.push(`- \`${change.property}\`: ${change.from} → ${change.to}`)
    }
    lines.push('')
  }

  // 当前关键样式
  const importantStyles = Object.entries(computedStyles).filter(([_, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')
  if (importantStyles.length > 0) {
    lines.push('**当前关键样式**：')
    lines.push('```css')
    for (const [prop, value] of importantStyles) {
      lines.push(`  ${prop}: ${value};`)
    }
    lines.push('```')
    lines.push('')
  }

  // CSS 变量
  if (Object.keys(cssVariables).length > 0) {
    lines.push('**相关 CSS 变量**（修改时需同步更新）：')
    lines.push('```css')
    for (const [name, value] of Object.entries(cssVariables)) {
      lines.push(`  ${name}: ${value};`)
    }
    lines.push('```')
  }

  return lines.join('\n')
}
