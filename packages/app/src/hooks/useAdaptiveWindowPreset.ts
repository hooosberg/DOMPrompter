import { useEffect, useRef } from 'react'
import type { InspectorMode, WindowPreset } from '../types'

export function useAdaptiveWindowPreset(mode: InspectorMode, connected: boolean): WindowPreset {
  const preset: WindowPreset = connected && mode === 'external' ? 'sidebar' : 'default'
  const lastPresetRef = useRef<WindowPreset | null>(null)

  useEffect(() => {
    if (lastPresetRef.current === preset) {
      return
    }

    lastPresetRef.current = preset
    if (preset === 'sidebar') {
      void window.electronAPI.resizeWindowToSidebar()
      return
    }

    void window.electronAPI.restoreWindowSize()
  }, [preset])

  return preset
}
