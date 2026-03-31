export { CDPClient, CDPHelper } from './cdp/connection'
export type { ICDPTransport } from './cdp/connection'

export { InspectorService } from './inspector-service'
export type { InspectedElement } from './inspector-service'

export { discoverLocalApps } from './app-discovery'
export type { DiscoveredApp } from './app-discovery'

export {
    generateCSS,
    generateReactInlineStyle,
    generateCSSClass,
    generateCSSVariables,
    generateAIPrompt
} from './codeGenerator'
export type { CSSProperty, AIPromptInput } from './codeGenerator'
