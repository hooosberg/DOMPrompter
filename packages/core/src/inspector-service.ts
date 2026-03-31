import type { ICDPTransport } from './cdp/connection'
import { CDPHelper } from './cdp/connection'

const ELEMENT_PICKER_BINDING = '__visualInspectorSelect'

/** 被选中元素的结构化信息 */
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

export interface PreviewCapture {
    dataUrl: string
    viewport: BoxModelRect
}

export interface InspectorSelectionMeta {
    append?: boolean
}

export interface InspectorOverlayAction {
    type: 'note-select' | 'note-delete' | 'note-move'
    noteId: string
    deltaX?: number
    deltaY?: number
}

export interface ExternalOverlayState {
    tool: 'select' | 'note' | 'browse'
    activeNoteId: string | null
    draftNoteTargets: Array<{
        backendNodeId: number
        selector: string
        boxModel: ElementBoxModel | null
    }>
    draftNoteText: string
    notes: Array<{
        id: string
        targets: Array<{
            backendNodeId: number
            selector: string
            boxModel: ElementBoxModel | null
        }>
        text: string
        boxModel: ElementBoxModel | null
        offsetX: number
        offsetY: number
        createdAt: number
    }>
}

const TRACKED_PROPERTIES = [
    'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'background-color', 'color', 'opacity',
    'border', 'border-radius',
    'font-size', 'font-weight', 'font-family', 'line-height', 'text-align',
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'flex-direction', 'justify-content', 'align-items', 'justify-items', 'gap', 'row-gap', 'column-gap',
    'object-fit',
    'box-shadow', 'transform', 'overflow',
]

function quadToRect(quad: number[] | undefined, fallbackWidth: number, fallbackHeight: number): BoxModelRect {
    if (!Array.isArray(quad) || quad.length < 8) {
        return {
            x: 0,
            y: 0,
            width: fallbackWidth,
            height: fallbackHeight,
        }
    }

    const xs = [quad[0], quad[2], quad[4], quad[6]]
    const ys = [quad[1], quad[3], quad[5], quad[7]]
    const x = Math.min(...xs)
    const y = Math.min(...ys)

    return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
    }
}

export class InspectorService {
    private helper: CDPHelper
    private transport: ICDPTransport
    private inspecting = false
    private onElementSelectedCallback?: (element: InspectedElement, meta?: InspectorSelectionMeta) => void
    private onOverlayActionCallback?: (action: InspectorOverlayAction) => void

    constructor(transport: ICDPTransport) {
        this.transport = transport
        this.helper = new CDPHelper(transport)
    }

    async initialize(): Promise<void> {
        await this.helper.enableDomains()

        this.transport.on('Runtime.bindingCalled', async (params: { name: string; payload: string }) => {
            if (params.name !== ELEMENT_PICKER_BINDING || !this.inspecting) return
            try {
                const payload = JSON.parse(params.payload || '{}') as {
                    type?: 'select' | 'resize' | 'note-select' | 'note-delete' | 'note-move'
                    token?: string
                    styles?: Record<string, string>
                    noteId?: string
                    deltaX?: number
                    deltaY?: number
                    shiftKey?: boolean
                }

                if (payload.type === 'note-select' || payload.type === 'note-delete' || payload.type === 'note-move') {
                    if (payload.noteId && this.onOverlayActionCallback) {
                        this.onOverlayActionCallback({
                            type: payload.type,
                            noteId: payload.noteId,
                            deltaX: payload.deltaX,
                            deltaY: payload.deltaY,
                        })
                    }
                    return
                }

                if (!payload.token) return

                const selectedNode = await this.helper.getSelectedNodeReferenceFromToken(payload.token)
                if (!selectedNode.nodeId || !selectedNode.backendNodeId) {
                    return
                }

                if (payload.type === 'resize' && payload.styles) {
                    await this.helper.setStyleProperties(selectedNode.nodeId, payload.styles)
                    const resizedElement = await this.getElementDetails(selectedNode.backendNodeId)
                    if (resizedElement && this.onElementSelectedCallback) {
                        this.onElementSelectedCallback(resizedElement)
                    }
                    return
                }

                let element: InspectedElement | null = null

                if (selectedNode.nodeId) {
                    element = await this.getElementDetailsByNodeId(selectedNode.nodeId)
                }

                if (!element && selectedNode.backendNodeId) {
                    element = await this.getElementDetails(selectedNode.backendNodeId)
                }

                if (!element) return

                if (this.onElementSelectedCallback) {
                    this.onElementSelectedCallback(element, { append: Boolean(payload.shiftKey) })
                }
            } catch (err) {
                console.error('Picker select error:', err)
            }
        })

        this.transport.on('Overlay.inspectNodeRequested', async (params: { backendNodeId: number }) => {
            if (!this.inspecting) return
            try {
                this.inspecting = false
                await this.helper.stopInspectMode()
                await this.helper.highlightNode(params.backendNodeId)
                const element = await this.getElementDetails(params.backendNodeId)
                if (element && this.onElementSelectedCallback) {
                    this.onElementSelectedCallback(element)
                }
            } catch (err) {
                console.error('Inspect node error:', err)
            }
        })
    }

    onElementSelected(callback: (element: InspectedElement, meta?: InspectorSelectionMeta) => void): void {
        this.onElementSelectedCallback = callback
    }

    onOverlayAction(callback: (action: InspectorOverlayAction) => void): void {
        this.onOverlayActionCallback = callback
    }

    async startInspecting(preferNativeOverlay: boolean = false): Promise<void> {
        this.inspecting = true
        await this.helper.startInspectMode(preferNativeOverlay)
    }

    async stopInspecting(): Promise<void> {
        this.inspecting = false
        await this.helper.stopInspectMode()
    }

    async setActiveEditProperty(property: string | null): Promise<void> {
        await this.helper.setActiveEditProperty(property)
    }

    async setExternalOverlayState(payload: ExternalOverlayState): Promise<void> {
        await this.helper.setExternalOverlayState(payload)
    }

    get isInspecting(): boolean {
        return this.inspecting
    }

    async getElementAtPoint(x: number, y: number): Promise<InspectedElement | null> {
        try {
            const target = await this.helper.getNodeForLocation(x, y)
            if (target.nodeId) {
                return await this.getElementDetailsByNodeId(target.nodeId)
            }
            if (target.backendNodeId) {
                return await this.getElementDetails(target.backendNodeId)
            }
            return null
        } catch (err) {
            if (!String((err as Error)?.message || '').includes('No node found at given location')) {
                console.error('Get element at point error:', err)
            }
            return null
        }
    }

    async getElementStackAtPoint(x: number, y: number): Promise<InspectedElement[]> {
        try {
            const stack = await this.helper.getNodeStackForLocation(x, y, 12)
            const elements = await Promise.all(
                stack.map(async (target) => {
                    if (target.nodeId) {
                        return await this.getElementDetailsByNodeId(target.nodeId)
                    }
                    if (target.backendNodeId) {
                        return await this.getElementDetails(target.backendNodeId)
                    }
                    return null
                })
            )

            return elements.filter((element): element is InspectedElement => {
                if (!element) return false
                const tag = element.tagName.toLowerCase()
                return tag !== 'html' && tag !== 'body'
            })
        } catch (err) {
            console.error('Get element stack at point error:', err)
            return []
        }
    }

    async updateElementStyle(nodeId: number, backendNodeId: number, propertyName: string, propertyValue: string): Promise<InspectedElement | null> {
        try {
            await this.helper.setStyleProperty(nodeId, propertyName, propertyValue)
            const element = await this.getElementDetails(backendNodeId)
            if (element && this.onElementSelectedCallback) {
                this.onElementSelectedCallback(element)
            }
            return element
        } catch (err) {
            console.error('Update element style error:', err)
            return null
        }
    }

    async updateElementStyles(nodeId: number, backendNodeId: number, stylePatch: Record<string, string>): Promise<InspectedElement | null> {
        try {
            await this.helper.setStyleProperties(nodeId, stylePatch)
            const element = await this.getElementDetails(backendNodeId)
            if (element && this.onElementSelectedCallback) {
                this.onElementSelectedCallback(element)
            }
            return element
        } catch (err) {
            console.error('Update element styles error:', err)
            return null
        }
    }

    async updateTextContent(nodeId: number, backendNodeId: number, textContent: string): Promise<InspectedElement | null> {
        try {
            await this.helper.setTextContent(nodeId, textContent)
            const element = await this.getElementDetails(backendNodeId)
            if (element && this.onElementSelectedCallback) {
                this.onElementSelectedCallback(element)
            }
            return element
        } catch (err) {
            console.error('Update text content error:', err)
            return null
        }
    }

    async updateElementAttribute(nodeId: number, backendNodeId: number, attributeName: string, attributeValue: string): Promise<InspectedElement | null> {
        try {
            await this.helper.setAttribute(nodeId, attributeName, attributeValue)
            const element = await this.getElementDetails(backendNodeId)
            if (element && this.onElementSelectedCallback) {
                this.onElementSelectedCallback(element)
            }
            return element
        } catch (err) {
            console.error('Update element attribute error:', err)
            return null
        }
    }

    async capturePreviewDataUrl(): Promise<PreviewCapture | null> {
        try {
            const result = await this.helper.captureScreenshot()
            return {
                dataUrl: `data:image/png;base64,${result.data}`,
                viewport: {
                    x: result.viewport.x,
                    y: result.viewport.y,
                    width: result.viewport.width,
                    height: result.viewport.height,
                },
            }
        } catch (err) {
            console.error('Capture preview error:', err)
            return null
        }
    }

    private async getElementDetailsByNodeId(nodeId: number): Promise<InspectedElement | null> {
        try {
            await this.helper.getDocument()
            const normalized = await this.normalizeNodeByNodeId(nodeId)
            if (!normalized) {
                return null
            }

            return await this.buildElementDetails(
                normalized.node,
                normalized.nodeId,
                normalized.backendNodeId
            )
        } catch (err) {
            console.error('Get element details by node id error:', err)
            return null
        }
    }

    async getElementDetails(backendNodeId: number): Promise<InspectedElement | null> {
        try {
            await this.helper.getDocument()
            const { node } = await this.helper.describeNode(backendNodeId)
            const nodeIds = await this.helper.pushNodesByBackendIdsToFrontend([backendNodeId])
            const nodeId = nodeIds[0]
            if (!nodeId) {
                return null
            }

            const normalized = await this.normalizeNodeByNodeId(nodeId)
            if (!normalized) {
                return null
            }

            return await this.buildElementDetails(
                normalized.node,
                normalized.nodeId,
                normalized.backendNodeId
            )
        } catch (err) {
            console.error('Get element details error:', err)
            return null
        }
    }

    private async normalizeNodeByNodeId(nodeId: number): Promise<{
        node: any
        nodeId: number
        backendNodeId: number
    } | null> {
        const describe = async (targetNodeId: number) => {
            const { node } = await this.transport.send('DOM.describeNode', { nodeId: targetNodeId, depth: 0 })
            return node
        }

        let currentNodeId = nodeId
        let currentNode = await describe(currentNodeId)

        if (!currentNode) {
            return null
        }

        if (currentNode.nodeType !== 1 && currentNode.parentId) {
            currentNodeId = currentNode.parentId
            currentNode = await describe(currentNodeId)
        }

        if (!currentNode || currentNode.nodeType !== 1 || !currentNode.backendNodeId) {
            return null
        }

        return {
            node: currentNode,
            nodeId: currentNodeId,
            backendNodeId: currentNode.backendNodeId,
        }
    }

    private async buildElementDetails(node: any, nodeId: number, backendNodeId: number): Promise<InspectedElement | null> {
        try {
            if (!nodeId) {
                return null
            }

            // Computed styles
            const { computedStyle } = await this.helper.getComputedStyleForNode(nodeId)
            const styles: Record<string, string> = {}
            for (const entry of computedStyle) {
                if (TRACKED_PROPERTIES.includes(entry.name)) {
                    styles[entry.name] = entry.value
                }
            }

            // Box model
            let boxModel = null
            try {
                const { model: m } = await this.helper.getBoxModel(backendNodeId)
                const borderRect = quadToRect(m.border, m.width, m.height)
                boxModel = {
                    x: borderRect.x,
                    y: borderRect.y,
                    width: borderRect.width,
                    height: borderRect.height,
                    margin: quadToRect(m.margin, borderRect.width, borderRect.height),
                    border: borderRect,
                    padding: quadToRect(m.padding, borderRect.width, borderRect.height),
                    content: quadToRect(m.content, m.width, m.height),
                }
            } catch { /* some elements have no box model */ }

            let descendants: ElementHierarchyNode[] = []
            if (boxModel) {
                try {
                    descendants = await this.helper.getDescendantRects(nodeId, 2, 32)
                } catch {
                    descendants = []
                }
            }

            // CSS variables
            const cssVariables: Record<string, string> = {}
            try {
                const { matchedCSSRules } = await this.helper.getMatchedStylesForNode(nodeId)
                if (matchedCSSRules) {
                    for (const ruleMatch of matchedCSSRules) {
                        for (const prop of ruleMatch.rule?.style?.cssProperties || []) {
                            if (prop.value?.includes('var(--')) {
                                for (const m of prop.value.matchAll(/var\((--[\w-]+)/g)) {
                                    const resolved = computedStyle.find((s: any) => s.name === m[1])
                                    if (resolved) cssVariables[m[1]] = resolved.value
                                }
                            }
                            if (prop.name?.startsWith('--')) {
                                cssVariables[prop.name] = prop.value
                            }
                        }
                    }
                }
            } catch { /* ignore */ }

            // Outer HTML preview
            let outerHTMLPreview = ''
            try {
                const html = await this.helper.getOuterHTML(backendNodeId)
                outerHTMLPreview = html.length > 200 ? html.substring(0, 200) + '...' : html
            } catch { /* ignore */ }

            let textContent = ''
            let textContentPreview = ''
            try {
                textContent = await this.helper.getTextContent(nodeId)
                textContentPreview = textContent.length > 200 ? textContent.substring(0, 200) + '...' : textContent
            } catch { /* ignore */ }

            // Parse attributes
            const classNames: string[] = []
            let id = ''
            const attributes: Record<string, string> = {}
            if (node.attributes) {
                for (let i = 0; i < node.attributes.length; i += 2) {
                    const name = node.attributes[i]
                    const value = node.attributes[i + 1] || ''
                    attributes[name] = value
                    if (name === 'class') {
                        classNames.push(...value.split(/\s+/).filter(Boolean))
                    }
                    if (name === 'id') {
                        id = value
                    }
                }
            }

            return {
                backendNodeId, nodeId,
                tagName: (node.nodeName || 'unknown').toLowerCase(),
                classNames, id, attributes, boxModel,
                computedStyles: styles,
                cssVariables, textContent, textContentPreview, outerHTMLPreview,
                descendants,
            }
        } catch (err) {
            console.error('Build element details error:', err)
            return null
        }
    }
}
