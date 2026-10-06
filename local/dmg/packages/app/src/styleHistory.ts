import type { PersistedStyleHistoryState } from './types'
import { expandStylePatch } from './hooks/useStyleBinding'

export function buildStyleHistorySlotKey(contextKey: string, backendNodeId: number) {
  return `${contextKey}::node:${backendNodeId}`
}

export function undoPersistedHistory(state: PersistedStyleHistoryState): {
  next: PersistedStyleHistoryState
  undoPatch: Record<string, string>
  diffKeys: string[]
} | null {
  if (state.history.length === 0) return null

  const history = state.history.map((e) => ({ ...e }))
  const redo = state.redo.map((e) => ({ ...e }))
  const entry = history.pop()!
  redo.push(entry)

  return {
    next: { baselineStyles: { ...state.baselineStyles }, history, redo },
    undoPatch: expandStylePatch(entry.undoPatch),
    diffKeys: entry.diffKeys,
  }
}

export function redoPersistedHistory(state: PersistedStyleHistoryState): {
  next: PersistedStyleHistoryState
  redoPatch: Record<string, string>
  diffKeys: string[]
} | null {
  if (state.redo.length === 0) return null

  const history = state.history.map((e) => ({ ...e }))
  const redo = state.redo.map((e) => ({ ...e }))
  const entry = redo.pop()!
  history.push(entry)

  return {
    next: { baselineStyles: { ...state.baselineStyles }, history, redo },
    redoPatch: expandStylePatch(entry.redoPatch),
    diffKeys: entry.diffKeys,
  }
}

export function resetPersistedHistory(state: PersistedStyleHistoryState): {
  next: PersistedStyleHistoryState
  resetPatch: Record<string, string>
  diffKeys: string[]
} | null {
  if (state.history.length === 0) return null

  const allDiffKeys = new Set<string>()
  for (const entry of state.history) {
    for (const key of entry.diffKeys) {
      allDiffKeys.add(key)
    }
  }

  const diffKeys = Array.from(allDiffKeys)
  const resetPatch: Record<string, string> = {}
  for (const key of diffKeys) {
    resetPatch[key] = state.baselineStyles[key] ?? ''
  }

  return {
    next: { baselineStyles: { ...state.baselineStyles }, history: [], redo: [] },
    resetPatch: expandStylePatch(resetPatch),
    diffKeys,
  }
}

export function computeStyleDiffFromHistory(state: PersistedStyleHistoryState): Record<string, string> {
  const diff: Record<string, string> = {}
  for (const entry of state.history) {
    for (const key of entry.diffKeys) {
      const currentValue = entry.redoPatch[key] ?? ''
      const baselineValue = state.baselineStyles[key] ?? ''
      if (currentValue !== baselineValue) {
        diff[key] = currentValue
      } else {
        delete diff[key]
      }
    }
  }
  return diff
}
