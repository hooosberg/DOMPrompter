import { useEffect, useRef, useState, type FocusEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PropertyFieldConfig } from '../../types'

function parseNumeric(value: string): number | null {
  const match = value.match(/-?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

function expandShortHex(value: string): string {
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
}

function rgbToHex(value: string): string | null {
  const match = value.match(/rgba?\(([^)]+)\)/i)
  if (!match) return null
  const parts = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()))
  if (parts.some(Number.isNaN)) return null
  return `#${parts.map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, '0')).join('')}`
}

function normalizeColorInputValue(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if (/^#[0-9a-f]{3}$/.test(normalized)) return expandShortHex(normalized)
  return rgbToHex(normalized)
}

function formatSliderValue(field: PropertyFieldConfig, value: number): string {
  if (field.unit) {
    return `${Math.round(value)}${field.unit}`
  }

  if (field.step && field.step < 1) {
    return String(Number(value.toFixed(2)))
  }

  return String(Math.round(value))
}

function nudgeNumericToken(field: PropertyFieldConfig, rawValue: string, stepAmount: number): string | null {
  const trimmed = rawValue.trim()

  if (!trimmed) {
    const initialValue = stepAmount > 0 ? stepAmount : 0
    return field.unit ? `${initialValue}${field.unit}` : String(initialValue)
  }

  const match = trimmed.match(/-?\d*\.?\d+/)
  if (!match) return null

  const numericPortion = match[0]
  const numericValue = Number(numericPortion)
  if (!Number.isFinite(numericValue)) return null

  const fractionLength = Math.max(
    numericPortion.includes('.') ? numericPortion.split('.')[1].length : 0,
    Math.abs(stepAmount) < 1 ? 2 : 0,
  )

  const nextValue = Number((numericValue + stepAmount).toFixed(fractionLength))
  const nextToken = `${nextValue}`

  return `${trimmed.slice(0, match.index)}${nextToken}${trimmed.slice((match.index || 0) + numericPortion.length)}`
}

function stepNumericToken(field: PropertyFieldConfig, rawValue: string, direction: 1 | -1, accelerated: boolean): string | null {
  const step = (field.step || 1) * (accelerated ? 10 : 1)
  return nudgeNumericToken(field, rawValue, step * direction)
}

interface FieldControlProps {
  field: PropertyFieldConfig
  value: string
  compact?: boolean
  onCommit: (value: string) => void
  onFieldActiveChange?: (field: PropertyFieldConfig | null) => void
}

export function FieldControl({ field, value, compact = false, onCommit, onFieldActiveChange }: FieldControlProps) {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const scrubStateRef = useRef<{ startX: number; startValue: string } | null>(null)

  const activateField = () => {
    onFieldActiveChange?.(field)
  }

  const deactivateField = () => {
    onFieldActiveChange?.(null)
  }

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value)
    }
  }, [value, isFocused])

  useEffect(() => {
    if (!isScrubbing) return

    const handleMouseMove = (event: MouseEvent) => {
      const state = scrubStateRef.current
      if (!state) return

      const pixelsPerStep = event.shiftKey ? 2 : 4
      const deltaSteps = Math.round((event.clientX - state.startX) / pixelsPerStep)
      const stepAmount = deltaSteps * (field.step || 1)
      const nextValue = nudgeNumericToken(field, state.startValue, stepAmount)
      if (nextValue === null) return

      setDraftValue(nextValue)
      onCommit(nextValue.trim())
    }

    const handleMouseUp = () => {
      scrubStateRef.current = null
      setIsScrubbing(false)
      setIsFocused(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [field, isScrubbing, onCommit])

  const handleContainerFocus = () => {
    setIsFocused(true)
    activateField()
  }

  const handleContainerBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setIsFocused(false)
    deactivateField()
  }

  const handleScrubStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    activateField()
    setIsFocused(true)
    scrubStateRef.current = {
      startX: event.clientX,
      startValue: draftValue || value || '',
    }
    setIsScrubbing(true)
  }

  if (field.control === 'slider') {
    const numericValue = parseNumeric(value)
    if (numericValue === null) {
      return null
    }

    return (
      <label
        className={`control-card ${compact ? 'compact' : ''}`}
        onMouseEnter={activateField}
        onMouseLeave={deactivateField}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
      >
        <span className="control-card-label">{field.label}</span>
        <div className="control-card-main">
          <input
            className="control-range"
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={numericValue}
            onChange={(event) => onCommit(formatSliderValue(field, Number(event.target.value)))}
          />
          <span className="control-card-value">{value}</span>
        </div>
      </label>
    )
  }

  if (field.control === 'option' && field.options?.length) {
    return (
      <div
        className={`control-card ${compact ? 'compact' : ''}`}
        onMouseEnter={activateField}
        onMouseLeave={deactivateField}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
      >
        <span className="control-card-label">{field.label}</span>
        <div className="option-pill-group">
          {field.options.map((option) => (
            <button
              key={`${field.key}-${option.value}`}
              className={`option-pill ${value === option.value ? 'active' : ''}`}
              onClick={() => onCommit(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.control === 'color') {
    const colorValue = normalizeColorInputValue(value)

    return (
      <label
        className={`control-card ${compact ? 'compact' : ''}`}
        onMouseEnter={activateField}
        onMouseLeave={deactivateField}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
      >
        <span className="control-card-label">{field.label}</span>
        <div className="control-color-row">
          {colorValue ? (
            <input
              className="control-color-input"
              type="color"
              value={colorValue}
              onChange={(event) => {
                setDraftValue(event.target.value)
                onCommit(event.target.value)
              }}
            />
          ) : (
            <span className="control-color-fallback" />
          )}
          <input
            className="control-text-input"
            value={draftValue}
            placeholder={field.placeholder || '#RRGGBB / rgba(0,0,0,.3)'}
            onChange={(event) => {
              const nextValue = event.target.value
              setDraftValue(nextValue)
              onCommit(nextValue.trim())
            }}
            onBlur={() => onCommit(draftValue.trim())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onCommit(draftValue.trim())
              }
            }}
          />
        </div>
      </label>
    )
  }

  return (
    <div
      className={`control-card token-control ${compact ? 'compact' : ''}`}
      onMouseEnter={activateField}
      onMouseLeave={deactivateField}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <button
        type="button"
        className={`control-card-label scrub-handle ${isScrubbing ? 'active' : ''}`}
        onMouseDown={handleScrubStart}
        title={t('workbench.field.scrubTitle', { label: field.label })}
      >
        {field.label}
      </button>
      <input
        className="control-text-input"
        value={draftValue}
        placeholder={field.placeholder}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftValue(nextValue)
          onCommit(nextValue.trim())
        }}
        onBlur={() => onCommit(draftValue.trim())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const steppedValue = stepNumericToken(field, draftValue, event.key === 'ArrowUp' ? 1 : -1, event.shiftKey)
            if (steppedValue !== null) {
              event.preventDefault()
              setDraftValue(steppedValue)
              onCommit(steppedValue.trim())
            }
            return
          }

          if (event.key === 'Enter') {
            onCommit(draftValue.trim())
          }
        }}
      />
    </div>
  )
}
