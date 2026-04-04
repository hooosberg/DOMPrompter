export { CDPHelper } from './cdp/connection'
export type { ICDPTransport } from './cdp/connection'

export { InspectorService } from './inspector-service'
export type { InspectedElement } from './inspector-service'

export {
    generateCSS,
    generateReactInlineStyle,
    generateCSSClass,
    generateCSSVariables,
    generateAIPrompt
} from './codeGenerator'
export type { CSSProperty, AIPromptInput } from './codeGenerator'
