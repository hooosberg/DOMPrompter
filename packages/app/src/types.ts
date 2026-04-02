export type InspectorMode = 'builtin' | 'external'
export type DebugMethod = 'web' | 'desktop' | 'static' | 'connect'
export type WindowPreset = 'default' | 'sidebar'
export type CanvasTool = 'select' | 'browse'
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
  /** 浮动按钮直接修改 DOM 后的同步通知 */
  nudge?: boolean
  styles?: Record<string, string>
  nudgeChange?: OverlayNudgeChange
}

export interface StyleHistoryEntry {
  undoPatch: Record<string, string>
  redoPatch: Record<string, string>
  diffKeys: string[]
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
  boxModel: {
    width: number | null
    height: number | null
  }
  styleDiff: Record<string, string>
  updatedAt: number
}

export interface ExportPromptSummaryMeta {
  elementCount: number
  modifiedCount: number
  tagCount: number
  taggedElementCount: number
}

export interface ExternalOverlayState {
  tool: CanvasTool
  tags: ElementTag[]
}

export interface PreviewCapture {
  dataUrl: string
  viewport: BoxModelRect
}

export interface DiscoveredApp {
  type: 'web' | 'electron'
  name: string
  url: string
  cdpUrl?: string
  port: number
}

export interface ProjectLaunchCommands {
  builtin: string | null
  external: string | null
}

export interface ProjectLaunchCapabilities {
  builtin: boolean
  external: boolean
}

export interface ProjectScriptInfo {
  name: string
  command: string
}

export interface ProjectInfo {
  projectDir: string
  projectName: string
  packageManager: string
  scripts: ProjectScriptInfo[]
  hasElectron: boolean
  htmlFiles: string[]
}

export interface SelectProjectDirectoryOptions {
  forceDialog?: boolean
}

export interface ProjectLaunchStatus {
  status:
    | 'idle'
    | 'project-selected'
    | 'launching'
    | 'starting-web'
    | 'starting-electron'
    | 'waiting-web'
    | 'waiting-cdp'
    | 'ready'
    | 'error'
    | 'stopped'
    | 'exited'
  projectDir?: string
  projectName?: string
  selectedMode?: InspectorMode
  builtinUrl?: string | null
  externalEndpoint?: string | null
  commands?: ProjectLaunchCommands
  capabilities?: ProjectLaunchCapabilities
  message?: string
  autoConnected?: boolean
}

export type PropertyControlType = 'token' | 'color' | 'slider' | 'option'

export interface PropertyFieldOption {
  label: string
  value: string
}

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

declare global {
  interface Window {
    electronAPI: {
      loadUrl: (url: string) => Promise<boolean>
      attachDebugger: () => Promise<boolean>
      discoverCDPUrl: (input: string) => Promise<string | null>
      connectCDP: (cdpUrl: string) => Promise<boolean>
      discoverLocalApps: () => Promise<DiscoveredApp[]>
      selectProjectDirectory: (options?: SelectProjectDirectoryOptions) => Promise<ProjectLaunchStatus | null>
      inspectProject: (projectDir: string) => Promise<ProjectInfo | null>
      selectHtmlFile: (projectDir?: string) => Promise<string | null>
      launchProjectSession: (payload?: { projectDir?: string | null; preferredMode?: InspectorMode; customCommand?: string }) => Promise<{ success: boolean; error?: string }>
      stopProjectSession: () => Promise<void>
      disconnect: () => Promise<void>
      resizeWindowToSidebar: () => Promise<boolean>
      restoreWindowSize: () => Promise<boolean>
      setPanelWidth: (width: number) => Promise<void>
      setBuiltinViewInteractive: (interactive: boolean) => Promise<boolean>
      startInspect: () => Promise<boolean>
      stopInspect: () => Promise<void>
      setActiveEditProperty: (property: ActiveEditProperty | null) => Promise<void>
      setExternalOverlayState: (payload: ExternalOverlayState) => Promise<void>
      inspectElementAtPoint: (payload: { x: number; y: number }) => Promise<InspectedElement | null>
      inspectElementStackAtPoint: (payload: { x: number; y: number }) => Promise<InspectedElement[]>
      inspectElementByBackendId: (payload: { backendNodeId: number }) => Promise<InspectedElement | null>
      capturePreview: () => Promise<PreviewCapture | null>
      updateElementStyle: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }) => Promise<InspectedElement | null>
      updateElementStyles: (payload: { nodeId: number; backendNodeId: number; styles: Record<string, string> }) => Promise<InspectedElement | null>
      updateTextContent: (payload: { nodeId: number; backendNodeId: number; value: string }) => Promise<InspectedElement | null>
      updateElementAttribute: (payload: { nodeId: number; backendNodeId: number; name: string; value: string }) => Promise<InspectedElement | null>
      onElementSelected: (cb: (el: InspectedElement, meta?: InspectorSelectionMeta) => void) => void
      onBrowserViewLoaded: (cb: (info: { url: string; title: string }) => void) => void
      onLaunchStatus: (cb: (info: ProjectLaunchStatus) => void) => void
      onAutoConnected: (cb: (info: { mode: string; endpoint: string }) => void) => void
      onPropertyActivated: (cb: (property: ActiveEditProperty) => void) => void
      onPropertyIncrement: (cb: (cssProperty: string) => void) => void
      removeAllListeners: () => void
      generateAIPrompt: (el: InspectedElement) => Promise<string>
      generateCSS: (el: InspectedElement) => Promise<string>
      generateCSSVariables: (vars: Record<string, string>) => Promise<string>
    }
  }
}

export {}
