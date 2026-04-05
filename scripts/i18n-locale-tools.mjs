import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(repoRoot, 'packages/app/src/locales')

function parseArgs(argv) {
  const [command = 'check', ...rest] = argv
  const options = {}

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true'
    options[key] = value
  }

  return { command, options }
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
}

function flattenLocale(obj, prefix = '', out = new Map()) {
  if (Array.isArray(obj)) {
    out.set(prefix, JSON.stringify(obj))
    return out
  }

  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      flattenLocale(value, nextPrefix, out)
    }
    return out
  }

  out.set(prefix, obj)
  return out
}

function readLocale(locale) {
  const filePath = path.join(localesDir, `${locale}.json`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Locale file not found: ${filePath}`)
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getLocales() {
  return fs.readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort((left, right) => left.localeCompare(right))
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath) || '.'
}

function writeFile(outPath, content) {
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(repoRoot, outPath)
  ensureParentDir(resolved)
  fs.writeFileSync(resolved, content)
  return resolved
}

function buildReferenceMarkdown({ baseLocale, secondaryLocale, baseMap, secondaryMap }) {
  const keys = Array.from(baseMap.keys()).sort((left, right) => left.localeCompare(right))
  const lines = [
    '# i18n Reference Table',
    '',
    `Base locale: \`${baseLocale}\``,
    `Secondary locale: \`${secondaryLocale}\``,
    '',
    '| Key | Source | Secondary |',
    '| --- | --- | --- |',
  ]

  for (const key of keys) {
    lines.push(
      `| \`${key}\` | ${escapeCell(baseMap.get(key))} | ${escapeCell(secondaryMap.get(key) ?? '')} |`,
    )
  }

  lines.push('')
  return `${lines.join('\n')}\n`
}

function buildTargetMarkdown({ baseLocale, secondaryLocale, targetLocale, baseMap, secondaryMap, targetMap }) {
  const keys = Array.from(baseMap.keys()).sort((left, right) => left.localeCompare(right))
  const lines = [
    `# ${targetLocale} Translation Table`,
    '',
    `Base locale: \`${baseLocale}\``,
    `Secondary locale: \`${secondaryLocale}\``,
    `Target locale: \`${targetLocale}\``,
    '',
    '| Key | Status | Source | Secondary | Target |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const key of keys) {
    const baseValue = String(baseMap.get(key) ?? '')
    const secondaryValue = String(secondaryMap.get(key) ?? '')
    const targetValue = targetMap.has(key) ? String(targetMap.get(key) ?? '') : ''
    const status = !targetMap.has(key)
      ? 'missing'
      : targetValue === baseValue
        ? 'same-as-base'
        : targetValue === secondaryValue
          ? 'same-as-secondary'
          : 'translated'

    lines.push(
      `| \`${key}\` | ${status} | ${escapeCell(baseValue)} | ${escapeCell(secondaryValue)} | ${escapeCell(targetValue)} |`,
    )
  }

  lines.push('')
  return `${lines.join('\n')}\n`
}

function runCheck(options) {
  const baseLocale = options.base ?? 'en'
  const strict = options.strict === 'true'
  const baseMap = flattenLocale(readLocale(baseLocale))
  const locales = getLocales()
  let hasIssues = false

  for (const locale of locales) {
    if (locale === baseLocale) continue
    const localeMap = flattenLocale(readLocale(locale))
    const missing = Array.from(baseMap.keys()).filter((key) => !localeMap.has(key))
    const extra = Array.from(localeMap.keys()).filter((key) => !baseMap.has(key))
    const status = missing.length === 0 && extra.length === 0 ? 'OK' : 'ISSUES'
    console.log(`${status} ${locale}: missing=${missing.length}, extra=${extra.length}`)

    if (missing.length > 0) {
      hasIssues = true
      console.log(`  Missing sample: ${missing.slice(0, 8).join(', ')}`)
    }
    if (extra.length > 0) {
      hasIssues = true
      console.log(`  Extra sample: ${extra.slice(0, 8).join(', ')}`)
    }
  }

  if (strict && hasIssues) {
    process.exitCode = 1
  }
}

function runReference(options) {
  const baseLocale = options.base ?? 'zh'
  const secondaryLocale = options.secondary ?? 'en'
  const out = options.out ?? 'docs/i18n/reference.zh-en.md'
  const baseMap = flattenLocale(readLocale(baseLocale))
  const secondaryMap = flattenLocale(readLocale(secondaryLocale))
  const content = buildReferenceMarkdown({ baseLocale, secondaryLocale, baseMap, secondaryMap })
  const filePath = writeFile(out, content)
  console.log(`Wrote ${relativeToRepo(filePath)}`)
}

function runTable(options) {
  const baseLocale = options.base ?? 'zh'
  const secondaryLocale = options.secondary ?? 'en'
  const targetLocale = options.target
  const targetLocales = options.all === 'true'
    ? getLocales().filter((locale) => locale !== baseLocale)
    : targetLocale
      ? [targetLocale]
      : []

  if (targetLocales.length === 0) {
    throw new Error('Missing required option: --target <locale> or --all')
  }

  const baseMap = flattenLocale(readLocale(baseLocale))
  const secondaryMap = flattenLocale(readLocale(secondaryLocale))

  if (options.all === 'true' && options.out) {
    throw new Error('The --out option cannot be used together with --all')
  }

  for (const locale of targetLocales) {
    const out = options.out ?? `docs/i18n/${locale}.translation-table.md`
    const targetMap = flattenLocale(readLocale(locale))
    const content = buildTargetMarkdown({
      baseLocale,
      secondaryLocale,
      targetLocale: locale,
      baseMap,
      secondaryMap,
      targetMap,
    })
    const filePath = writeFile(out, content)
    console.log(`Wrote ${relativeToRepo(filePath)}`)
  }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2))

  switch (command) {
    case 'check':
      runCheck(options)
      break
    case 'reference':
      runReference(options)
      break
    case 'table':
      runTable(options)
      break
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

main()
