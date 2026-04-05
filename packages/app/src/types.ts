import type { AppLanguage as SharedAppLanguage } from './shared/languages'

export type AppLanguage = SharedAppLanguage

export type InspectorMode = 'builtin'
export type CanvasTool = 'select' | 'browse'
export type AppTheme = 'light' | 'dark'

export type ActiveEditProperty =
  | 'labels'
  | 'size'
  | 'padding'
  | 'margin'
  | 'layout'
  | 'gap'
  | 'position'
  | 'border'
  | 'background'
  | 'shadow'
  | 'typography'
  | 'overflow'
  | 'image'

export type ElementPreset = 'container' | 'text' | 'image'
export type OverlayDensity = 'roomy' | 'compact' | 'tight'

export interface BoxModelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementBoxModel extends BoxModelRect {
  margin: BoxModelRect
  border: BoxModelRect
  padding: BoxModelRect
  content: BoxModelRect
}

export interface ElementHierarchyNode extends BoxModelRect {
  depth: number
  label: string
}

export interface InspectedElement {
  backendNodeId: number
  nodeId: number
  tagName: string
  classNames: string[]
  id: string
  attributes: Record<string, string>
  boxModel: ElementBoxModel | null
  computedStyles: Record<string, string>
  cssVariables: Record<string, string>
  textContent: string
  textContentPreview: string
  outerHTMLPreview: string
  ancestorPath: string[]
  descendants: ElementHierarchyNode[]
}

export interface ElementTagTarget {
  backendNodeId: number
  selector: string
  boxModel: ElementBoxModel | null
}

export interface ElementTag {
  id: string
  targets: ElementTagTarget[]
  text: string
  createdAt: number
}

export interface InspectorSelectionMeta {
  append?: boolean
  nudge?: boolean
  styles?: Record<string, string>
  nudgeChange?: OverlayNudgeChange
}

export interface StyleHistoryEntry {
  undoPatch: Record<string, string>
  redoPatch: Record<string, string>
  diffKeys: string[]
}

export interface PersistedStyleHistoryState {
  baselineStyles: Record<string, string>
  history: StyleHistoryEntry[]
  redo: StyleHistoryEntry[]
}

export interface GlobalStyleHistoryOperation {
  id: string
  backendNodeId: number
  contextKey: string
  selector: string
  createdAt: number
  kind: 'commit' | 'external' | 'reset' | 'tag-upsert' | 'tag-delete'
  tagSnapshot?: {
    before: ElementTag | null
    after: ElementTag | null
  }
}

export interface GlobalStyleHistoryState {
  operations: GlobalStyleHistoryOperation[]
  cursor: number
}

export interface HistoryActionController {
  backendNodeId: number
  canUndo: boolean
  canRedo: boolean
  canReset: boolean
  undo: () => void
  redo: () => void
  reset: () => void
}

export interface OverlayNudgeChange {
  keys: string[]
  beforeStyles: Record<string, string>
  afterStyles: Record<string, string>
}

export interface ElementCapabilityProfile {
  preset: ElementPreset
  density: OverlayDensity
  childCount: number
  supportsSize: boolean
  supportsPadding: boolean
  supportsMargin: boolean
  supportsGap: boolean
  supportsGapShortcut: boolean
  supportsLayout: boolean
  supportsTypography: boolean
  supportsMedia: boolean
  supportsPosition: boolean
  supportsPositionSection: boolean
}

export interface PageEditLedgerEntry {
  backendNodeId: number
  selector: string
  displayName: string
  tagName: string
  preset: ElementPreset
  textPreview: string
  identityHints: Record<string, string>
  ancestorPath: string[]
  boxModel: {
    width: number | null
    height: number | null
  }
  styleDiff: Record<string, string>
  updatedAt: number
}

export interface PageContextSnapshot {
  title: string
  url: string
  pathname: string
  hashRoute: string | null
  pageHeading: string | null
  htmlLang: string | null
  contentLanguage: string | null
  navigatorLanguage: string | null
  urlLanguage: string | null
  i18nLanguage: string | null
  activeRouteLabel: string | null
  activeRouteHref: string | null
  visibleVariantLabel: string | null
  visibleVariantKey: string | null
  activeVariantLabel: string | null
  activeVariantKey: string | null
}

export interface PageContextDescriptor {
  contextKey: string
  pageLabel: string
  variantLabel: string | null
  scopeLabel: string
  signals: string[]
}

export interface ExportPromptSummaryMeta {
  elementCount: number
  modifiedCount: number
  tagCount: number
  taggedElementCount: number
}

export interface PreviewCapture {
  dataUrl: string
  viewport: BoxModelRect
}

export interface PropertyFieldOption {
  label: string
  value: string
}

export type PropertyControlType = 'token' | 'color' | 'slider' | 'option'

export interface PropertyFieldConfig {
  key: string
  label: string
  control: PropertyControlType
  focusKey?: ActiveEditProperty
  helperText?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: PropertyFieldOption[]
}

export interface PropertySectionConfig {
  title: string
  hint: string
  fields: PropertyFieldConfig[]
}

export interface AppSettings {
  theme: AppTheme
  language: AppLanguage
}

export interface LicenseStatus {
  isPro: boolean
  provider: 'mas' | 'dev-stub' | 'unsupported'
  productId?: string
  lastValidatedAt?: string | null
}

export interface LicenseActionResult {
  success: boolean
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      loadUrl: (url: string) => Promise<boolean>
      attachDebugger: () => Promise<boolean>
      selectHtmlFile: (projectDir?: string) => Promise<string | null>
      disconnect: () => Promise<void>
      setPanelWidth: (width: number) => Promise<void>
      setBuiltinViewInteractive: (interactive: boolean) => Promise<boolean>
      startInspect: () => Promise<boolean>
      stopInspect: () => Promise<void>
      setActiveEditProperty: (property: ActiveEditProperty | null) => Promise<void>
      inspectElementAtPoint: (payload: { x: number; y: number }) => Promise<InspectedElement | null>
      inspectElementStackAtPoint: (payload: { x: number; y: number }) => Promise<InspectedElement[]>
      inspectElementByBackendId: (payload: { backendNodeId: number }) => Promise<InspectedElement | null>
      selectParentElement: (payload: { backendNodeId: number }) => Promise<InspectedElement | null>
      selectFirstChildElement: (payload: { backendNodeId: number }) => Promise<InspectedElement | null>
      capturePreview: () => Promise<PreviewCapture | null>
      updateElementStyle: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }) => Promise<InspectedElement | null>
      updateElementStyles: (payload: { nodeId: number; backendNodeId: number; styles: Record<string, string> }) => Promise<InspectedElement | null>
      updateTextContent: (payload: { nodeId: number; backendNodeId: number; value: string }) => Promise<InspectedElement | null>
      updateElementAttribute: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }) => Promise<InspectedElement | null>
      getPageContextSnapshot: () => Promise<PageContextSnapshot | null>
      onElementSelected: (cb: (el: InspectedElement, meta?: InspectorSelectionMeta) => void) => void
      onBrowserViewLoaded: (cb: (info: { url: string; title: string }) => void) => void
      onPropertyActivated: (cb: (property: ActiveEditProperty) => void) => void
      onPropertyIncrement: (cb: (cssProperty: string) => void) => void
      onContextAction: (cb: (action: string) => void) => void
      removeAllListeners: () => void
      generateAIPrompt: (el: InspectedElement) => Promise<string>
      generateCSS: (el: InspectedElement) => Promise<string>
      generateCSSVariables: (vars: Record<string, string>) => Promise<string>
      settings: {
        get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>
        set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
      }
      menu: {
        changeLanguage: (language: AppLanguage) => Promise<void>
      }
      overlay: {
        sync: (payload: { tool: CanvasTool; tags: ElementTag[] }) => Promise<boolean>
      }
      shortcuts: {
        onOpenSettings: (cb: () => void) => void
        onOpenHtmlFile: (cb: () => void) => void
        onReloadPage: (cb: () => void) => void
        onForceReload: (cb: () => void) => void
        onToggleToolbar: (cb: () => void) => void
        onCopyPagePrompt: (cb: () => void) => void
        onCopyElementCSS: (cb: () => void) => void
        onFocusAddressBar: (cb: () => void) => void
        onNewWindow: (cb: () => void) => void
        onEscape: (cb: () => void) => void
      }
      license: {
        getStatus: () => Promise<LicenseStatus>
        purchase: () => Promise<LicenseActionResult>
        restore: () => Promise<LicenseActionResult>
      }
      openExternal: (url: string) => Promise<void>
    }
  }
}

export {}
