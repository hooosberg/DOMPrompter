import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStyleBinding } from '../hooks/useStyleBinding'
import { buildStyleHistorySlotKey } from '../styleHistory'
import type { InspectedElement, PersistedStyleHistoryState } from '../types'
import { installElectronApiMock } from './electron-api.mock'

function createElement(overrides: Partial<InspectedElement> = {}): InspectedElement {
  return {
    backendNodeId: 151,
    nodeId: 88,
    tagName: 'DIV',
    classNames: ['hero-card'],
    id: '',
    attributes: {},
    boxModel: null,
    computedStyles: {
      height: '40px',
      display: 'block',
    },
    cssVariables: {},
    textContent: '',
    textContentPreview: '',
    outerHTMLPreview: '<div class="hero-card"></div>',
    ancestorPath: [],
    descendants: [],
    ...overrides,
  }
}

function HookHarness({
  element,
  selectionRevision,
  historyScopeKey,
}: {
  element: InspectedElement | null
  selectionRevision: number
  historyScopeKey: string
}) {
  const [store, setStore] = useState<Record<string, PersistedStyleHistoryState>>({})
  const slotKey = element
    ? buildStyleHistorySlotKey(historyScopeKey, element.backendNodeId)
    : null

  const {
    canUndo,
    canRedo,
    canReset,
    updateStyle,
    undoLastStyleChange,
  } = useStyleBinding({
    element,
    selectionRevision,
    historyScopeKey,
    persistedStyleHistory: slotKey ? store[slotKey] || null : null,
    onPersistedStyleHistoryChange: (history) => {
      if (!slotKey || !history) return
      setStore((current) => ({
        ...current,
        [slotKey]: history,
      }))
    },
    onElementChange: () => {},
    onStyleDiffChange: () => {},
  })

  return (
    <div>
      <button type="button" onClick={() => updateStyle('height', '55px')}>change-height</button>
      <button type="button" onClick={() => undoLastStyleChange()}>undo</button>
      <div data-testid="canUndo">{String(canUndo)}</div>
      <div data-testid="canRedo">{String(canRedo)}</div>
      <div data-testid="canReset">{String(canReset)}</div>
    </div>
  )
}

describe('useStyleBinding persisted history', () => {
  beforeEach(() => {
    installElectronApiMock()
  })

  it('restores the same element history when returning to the same context', async () => {
    const { rerender } = render(
      <HookHarness
        element={createElement()}
        selectionRevision={1}
        historyScopeKey="index.html::zh"
      />,
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'change-height' }))
    })

    expect(screen.getByTestId('canUndo')).toHaveTextContent('true')

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180))
    })

    act(() => {
      rerender(
        <HookHarness
          element={null}
          selectionRevision={2}
          historyScopeKey="index.html::zh"
        />,
      )
    })

    act(() => {
      rerender(
        <HookHarness
          element={createElement({
            computedStyles: {
              height: '55px',
              display: 'block',
            },
          })}
          selectionRevision={3}
          historyScopeKey="index.html::zh"
        />,
      )
    })

    expect(screen.getByTestId('canUndo')).toHaveTextContent('true')
    expect(screen.getByTestId('canReset')).toHaveTextContent('true')

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'undo' }))
    })

    expect(screen.getByTestId('canRedo')).toHaveTextContent('true')
  })

  it('keeps histories isolated between different page contexts', async () => {
    const { rerender } = render(
      <HookHarness
        element={createElement()}
        selectionRevision={1}
        historyScopeKey="index.html::zh"
      />,
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'change-height' }))
    })

    expect(screen.getByTestId('canUndo')).toHaveTextContent('true')

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180))
    })

    act(() => {
      rerender(
        <HookHarness
          element={createElement()}
          selectionRevision={2}
          historyScopeKey="index.html::en"
        />,
      )
    })

    expect(screen.getByTestId('canUndo')).toHaveTextContent('false')
    expect(screen.getByTestId('canRedo')).toHaveTextContent('false')

    act(() => {
      rerender(
        <HookHarness
          element={createElement({
            computedStyles: {
              height: '55px',
              display: 'block',
            },
          })}
          selectionRevision={3}
          historyScopeKey="index.html::zh"
        />,
      )
    })

    expect(screen.getByTestId('canUndo')).toHaveTextContent('true')
  })
})
