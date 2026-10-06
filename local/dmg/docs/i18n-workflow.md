# i18n Workflow

## Goal

Build translation work around one completed reference locale first, then let the remaining locales follow a stable comparison table instead of editing keys blindly.

## Source Of Truth

- Key structure source: `packages/app/src/locales/en.json`
- Translation reference source: `packages/app/src/locales/zh.json`
- Runtime fallback: `en`

`en` is the structural baseline because the app falls back to it at runtime.
`zh` is the translator-facing reference language because the current product copy is easiest to finish there first.

## Commands

- Check locale key consistency:

```bash
pnpm i18n:check
```

- Generate the master reference table from `zh + en`:

```bash
pnpm i18n:reference
```

- Generate a per-locale translation table:

```bash
pnpm i18n:table -- --target ja --out docs/i18n/ja.translation-table.md
pnpm i18n:table -- --target ko --out docs/i18n/ko.translation-table.md
pnpm i18n:table -- --target fr --out docs/i18n/fr.translation-table.md
```

- Generate tables for every registered locale in one pass:

```bash
pnpm i18n:tables:all
```

## Translation Steps

1. Finish or revise copy in `zh.json`.
2. Run `pnpm i18n:reference` to regenerate the comparison table.
3. Pick one target locale and generate its table with `pnpm i18n:table`.
4. Translate against the table instead of searching code manually.
5. Run `pnpm i18n:check` and `pnpm typecheck`.

## Files

- Script: `scripts/i18n-locale-tools.mjs`
- Master table: `docs/i18n/reference.zh-en.md`
- Per-locale tables: `docs/i18n/<locale>.translation-table.md`
- Language registry: `packages/app/src/shared/languages.ts`

## Notes

- Do not add new translation keys directly in non-reference locales first.
- Add or rename keys in `en.json` and `zh.json` first, then regenerate tables.
- Add newly supported languages through `packages/app/src/shared/languages.ts`, then add the matching `packages/app/src/locales/<locale>.json`.
- If a locale intentionally keeps a brand term in English, keep the key translated but leave the value as the product term on purpose.
