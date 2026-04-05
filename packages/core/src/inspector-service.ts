import type { ICDPTransport } from './cdp/connection'
import { CDPHelper } from './cdp/connection'

const ELEMENT_PICKER_BINDING = '__viInspectorHostSelect__'

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
    ancestorPath: string[]
    descendants: ElementHierarchyNode[]
}

export interface PreviewCapture {
    dataUrl: string
    viewport: BoxModelRect
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

export interface InspectorSelectionMeta {
    append?: boolean
    /** 浮动按钮直接修改 DOM 后的同步通知，属性面板应记录变化但不重置 baseline */
    nudge?: boolean
    /** nudge 时携带的样式变化 */
    styles?: Record<string, string>
    nudgeChange?: {
        keys: string[]
        beforeStyles: Record<string, string>
        afterStyles: Record<string, string>
    }
}

export interface ExternalOverlayState {
    tool: 'select' | 'browse'
    tags: Array<{
        id: string
        targets: Array<{
            backendNodeId: number
            selector: string
            boxModel: ElementBoxModel | null
        }>
        text: string
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
    private onPropertyActivatedCallback?: (property: string) => void
    private onPropertyIncrementCallback?: (cssProperty: string) => void
    private onContextMenuCallback?: (position: { x: number; y: number; clientX: number; clientY: number }) => void

    constructor(transport: ICDPTransport) {
        this.transport = transport
        this.helper = new CDPHelper(transport)
    }

    async initialize(): Promise<void> {
        await this.helper.enableDomains()

        this.transport.on('Runtime.bindingCalled', async (params: { name: string; payload: string }) => {
            if (params.name !== ELEMENT_PICKER_BINDING) return
            try {
                const payload = JSON.parse(params.payload || '{}') as {
                    type?: 'select' | 'activate-property' | 'increment-property' | 'style-nudge' | 'contextmenu'
                    token?: string
                    backendNodeId?: number
                    nodeId?: number
                    property?: string
                    cssProperty?: string
                    styles?: Record<string, string>
                    keys?: string[]
                    beforeStyles?: Record<string, string>
                    afterStyles?: Record<string, string>
                    shiftKey?: boolean
                    x?: number
                    y?: number
                    clientX?: number
                    clientY?: number
                }

                if (payload.type === 'contextmenu') {
                    if (this.onContextMenuCallback) {
                        this.onContextMenuCallback({
                            x: payload.x || 0,
                            y: payload.y || 0,
                            clientX: payload.clientX || 0,
                            clientY: payload.clientY || 0,
                        })
                    }
                    return
                }

                // 浮动按钮点击 → 激活属性面板对应字段
                if (payload.type === 'activate-property') {
                    if (!payload.token) return
                    if (payload.property && this.onPropertyActivatedCallback) {
                        this.onPropertyActivatedCallback(payload.property)
                    }
                    return
                }

                // 浮动按钮点击 → 直接增加属性值（等价于属性面板的「增加」按钮）
                if (payload.type === 'increment-property') {
                    if (!payload.token) return
                    if (payload.cssProperty && this.onPropertyIncrementCallback) {
                        this.onPropertyIncrementCallback(payload.cssProperty)
                    }
                    return
                }

                // 浮动按钮已直接改了 DOM，通知属性面板同步记录变化
                if (payload.type === 'style-nudge' && payload.afterStyles) {
                    if (!payload.token) return
                    const selectedNode = await this.helper.getSelectedNodeReferenceFromToken(payload.token)
                    if (!selectedNode.nodeId || !selectedNode.backendNodeId) return

                    // 通过 CDP 正式写入样式（确保与 DOM inline style 一致）
                    await this.helper.setStyleProperties(selectedNode.nodeId, payload.afterStyles)
                    // 获取更新后的完整元素信息
                    const element = await this.getElementDetails(selectedNode.backendNodeId)
                    if (element && this.onElementSelectedCallback) {
                        // 通知 React 同步属性面板（不重置 baseline）
                        this.onElementSelectedCallback(element, {
                            nudge: true,
                            styles: payload.afterStyles,
                            nudgeChange: {
                                keys: payload.keys || Object.keys(payload.afterStyles),
                                beforeStyles: payload.beforeStyles || {},
                                afterStyles: payload.afterStyles,
                            },
                        })
                    }
                    return
                }

                // 只处理 select 类型（忽略其他未知类型）
                if (payload.type && payload.type !== 'select') {
                    return
                }

                let selectedNode = {
                    nodeId: payload.nodeId || null,
                    backendNodeId: payload.backendNodeId || null,
                }
                if (payload.token) {
                    const tokenSelectedNode = await this.helper.getSelectedNodeReferenceFromToken(payload.token)
                    if (tokenSelectedNode.nodeId || tokenSelectedNode.backendNodeId) {
                        selectedNode = tokenSelectedNode
                    }
                }
                if (!selectedNode.nodeId && !selectedNode.backendNodeId) return

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

    onPropertyActivated(callback: (property: string) => void): void {
        this.onPropertyActivatedCallback = callback
    }

    onPropertyIncrement(callback: (cssProperty: string) => void): void {
        this.onPropertyIncrementCallback = callback
    }

    onContextMenu(callback: (position: { x: number; y: number; clientX: number; clientY: number }) => void): void {
        this.onContextMenuCallback = callback
    }

    setLanguage(language: string): void {
        this.helper.language = language
    }

    async startInspecting(preferNativeOverlay: boolean = false): Promise<void> {
        this.inspecting = true
        await this.helper.startInspectMode(preferNativeOverlay)
    }

    async stopInspecting(): Promise<void> {
        this.inspecting = false
        await this.helper.stopInspectMode()
    }

    async getPageContextSnapshot(): Promise<PageContextSnapshot | null> {
        try {
            const evaluated = await this.helper.evaluate(`(() => {
                /* visual-inspector:page-context */
                const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
                const getText = (node) => {
                    if (!(node instanceof Element)) return '';
                    return normalize(node.getAttribute('aria-label') || node.textContent || '');
                };
                const isVisible = (node) => {
                    if (!(node instanceof Element)) return false;
                    const style = window.getComputedStyle(node);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                        return false;
                    }
                    const rect = node.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                };
                const findFirst = (selectors) => {
                    for (const selector of selectors) {
                        const match = document.querySelector(selector);
                        if (match instanceof Element) {
                            return match;
                        }
                    }
                    return null;
                };
                const findVisibleVariantNode = () => {
                    const candidates = Array.from(document.querySelectorAll('[data-lang], .language-block[lang], [data-view], [data-locale]'));
                    return candidates.find((candidate) => (
                        candidate instanceof Element
                        && isVisible(candidate)
                        && (
                            candidate.classList.contains('is-visible')
                            || candidate.classList.contains('is-active')
                            || candidate.classList.contains('active')
                            || candidate.classList.contains('selected')
                            || candidate.getAttribute('aria-hidden') === 'false'
                            || candidate.getAttribute('data-state') === 'active'
                        )
                    )) || null;
                };
                const activeRoute = findFirst([
                    'nav [aria-current="page"]',
                    'nav [aria-current="true"]',
                    'nav .is-active',
                    'nav .active',
                    'nav .current',
                    '[role="navigation"] [aria-current="page"]',
                    '[role="navigation"] .is-active',
                    '.breadcrumb [aria-current="page"]',
                    '.breadcrumb .is-active',
                ]);
                const activeVariant = findFirst([
                    '.lang-menu button.is-active',
                    '.lang-menu [aria-current="true"]',
                    '[data-lang-target].is-active',
                    '[data-lang-target].active',
                    '[role="tab"][aria-selected="true"]',
                    '[aria-selected="true"]',
                    '[data-state="active"]',
                    '.tabs .is-active',
                    '.tabs .active',
                    '.segmented-control .is-active',
                    '.segmented-control .active',
                ]);
                const visibleVariant = findVisibleVariantNode();
                const visibleVariantLabelNode = visibleVariant instanceof Element
                    ? visibleVariant.querySelector('[data-lang-label], [data-locale-label], .lang-label, .locale-label')
                    : null;

                /* --- Meta / HTTP language signals --- */
                const metaContentLang = (
                    document.querySelector('meta[http-equiv="content-language" i]')?.getAttribute('content')
                    || document.querySelector('meta[name="language" i]')?.getAttribute('content')
                    || document.querySelector('meta[property="og:locale"]')?.getAttribute('content')
                    || ''
                );

                /* --- URL-based language detection --- */
                const detectUrlLanguage = () => {
                    const langPattern = /^[a-z]{2}(-[a-z]{2,4})?$/i;
                    const pathSegments = window.location.pathname.split('/').filter(Boolean);
                    const firstSegment = pathSegments[0] || '';
                    if (langPattern.test(firstSegment)) return firstSegment.toLowerCase();
                    const params = new URLSearchParams(window.location.search);
                    for (const key of ['lang', 'locale', 'language', 'hl', 'lng']) {
                        const val = params.get(key);
                        if (val && langPattern.test(val)) return val.toLowerCase();
                    }
                    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\\/?/, '').split('?')[1] || '');
                    for (const key of ['lang', 'locale', 'language']) {
                        const val = hashParams.get(key);
                        if (val && langPattern.test(val)) return val.toLowerCase();
                    }
                    return '';
                };

                /* --- i18n framework runtime detection --- */
                const detectI18nLanguage = () => {
                    try {
                        if (window.i18next?.language) return normalize(window.i18next.language);
                        if (window.i18n?.global?.locale) {
                            const loc = window.i18n.global.locale;
                            const val = typeof loc === 'function' ? loc() : (loc?.value ?? loc);
                            if (typeof val === 'string' && val) return normalize(val);
                        }
                        if (window.__NEXT_DATA__?.locale) return normalize(window.__NEXT_DATA__.locale);
                        if (window.$nuxt?.$i18n?.locale) return normalize(window.$nuxt.$i18n.locale);
                        if (window.__NUXT__?.config?.public?.i18n?.defaultLocale) return normalize(window.__NUXT__.config.public.i18n.defaultLocale);
                        if (window.Intl?.DateTimeFormat) {
                            const dtf = new Intl.DateTimeFormat();
                            const resolved = dtf.resolvedOptions();
                            if (resolved.locale && resolved.locale !== navigator.language) return normalize(resolved.locale);
                        }
                    } catch {}
                    return '';
                };

                /* --- Page heading --- */
                const detectPageHeading = () => {
                    for (const tag of ['h1', 'h2']) {
                        const nodes = document.querySelectorAll(tag);
                        for (const node of nodes) {
                            if (node instanceof Element && isVisible(node)) {
                                const text = normalize(node.textContent);
                                if (text && text.length <= 120) return text;
                            }
                        }
                    }
                    return '';
                };

                /* --- Hash route --- */
                const hashRoute = (() => {
                    const hash = window.location.hash;
                    if (!hash || hash === '#' || hash === '#/') return '';
                    return hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
                })();

                return {
                    title: normalize(document.title),
                    url: window.location.href,
                    pathname: window.location.pathname,
                    hashRoute: hashRoute || null,
                    pageHeading: detectPageHeading() || null,
                    htmlLang: normalize(document.documentElement.lang) || null,
                    contentLanguage: normalize(metaContentLang) || null,
                    navigatorLanguage: normalize(navigator.language) || null,
                    urlLanguage: detectUrlLanguage() || null,
                    i18nLanguage: detectI18nLanguage() || null,
                    activeRouteLabel: getText(activeRoute) || null,
                    activeRouteHref: activeRoute instanceof Element ? normalize(activeRoute.getAttribute('href')) || null : null,
                    visibleVariantLabel: getText(visibleVariantLabelNode) || null,
                    visibleVariantKey: visibleVariant instanceof Element
                        ? normalize(
                            visibleVariant.getAttribute('data-lang')
                            || visibleVariant.getAttribute('lang')
                            || visibleVariant.getAttribute('data-locale')
                            || visibleVariant.getAttribute('data-view')
                          ) || null
                        : null,
                    activeVariantLabel: getText(activeVariant) || null,
                    activeVariantKey: activeVariant instanceof Element
                        ? normalize(
                            activeVariant.getAttribute('data-lang-target')
                            || activeVariant.getAttribute('data-lang')
                            || activeVariant.getAttribute('lang')
                            || activeVariant.getAttribute('data-locale')
                            || activeVariant.getAttribute('data-view')
                            || activeVariant.getAttribute('data-state')
                          ) || null
                        : null,
                };
            })()`, true)

            const value = evaluated?.result?.value
            if (!value || typeof value !== 'object') {
                return null
            }

            const str = (key: string) => typeof value[key] === 'string' && value[key] ? value[key] as string : null

            return {
                title: typeof value.title === 'string' ? value.title : '',
                url: typeof value.url === 'string' ? value.url : '',
                pathname: typeof value.pathname === 'string' ? value.pathname : '',
                hashRoute: str('hashRoute'),
                pageHeading: str('pageHeading'),
                htmlLang: str('htmlLang'),
                contentLanguage: str('contentLanguage'),
                navigatorLanguage: str('navigatorLanguage'),
                urlLanguage: str('urlLanguage'),
                i18nLanguage: str('i18nLanguage'),
                activeRouteLabel: str('activeRouteLabel'),
                activeRouteHref: str('activeRouteHref'),
                visibleVariantLabel: str('visibleVariantLabel'),
                visibleVariantKey: str('visibleVariantKey'),
                activeVariantLabel: str('activeVariantLabel'),
                activeVariantKey: str('activeVariantKey'),
            }
        } catch (err) {
            console.error('Get page context snapshot error:', err)
            return null
        }
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

    async selectParentElement(backendNodeId: number): Promise<InspectedElement | null> {
        try {
            await this.helper.getDocument()
            const nodeIds = await this.helper.pushNodesByBackendIdsToFrontend([backendNodeId])
            const nodeId = nodeIds[0]
            if (!nodeId) return null

            const objectId = await this.helper.resolveNode(nodeId)
            try {
                const result = await this.helper.callFunctionOn(
                    objectId,
                    `function() {
                        let parent = this.parentElement;
                        while (parent) {
                            if (parent.hasAttribute && parent.hasAttribute('data-vi-overlay-root')) {
                                parent = parent.parentElement;
                                continue;
                            }
                            if (parent.tagName === 'HTML' || parent.tagName === 'BODY') {
                                return null;
                            }
                            return parent;
                        }
                        return null;
                    }`,
                    [],
                )
                if (!result?.result?.objectId) return null

                const described = await this.helper.describeNodeByObjectId(result.result.objectId)
                const parentBackendNodeId = described?.node?.backendNodeId
                if (!parentBackendNodeId) return null

                return await this.getElementDetails(parentBackendNodeId)
            } finally {
                try { await this.helper.releaseObject(objectId) } catch { /* ignore */ }
            }
        } catch (err) {
            console.error('Select parent element error:', err)
            return null
        }
    }

    async selectFirstChildElement(backendNodeId: number): Promise<InspectedElement | null> {
        try {
            await this.helper.getDocument()
            const nodeIds = await this.helper.pushNodesByBackendIdsToFrontend([backendNodeId])
            const nodeId = nodeIds[0]
            if (!nodeId) return null

            const objectId = await this.helper.resolveNode(nodeId)
            try {
                const result = await this.helper.callFunctionOn(
                    objectId,
                    `function() {
                        const children = Array.from(this.children || []);
                        for (const child of children) {
                            if (!(child instanceof Element)) continue;
                            if (child.hasAttribute && child.hasAttribute('data-vi-overlay-root')) continue;
                            const rect = child.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) return child;
                        }
                        return null;
                    }`,
                    [],
                )
                if (!result?.result?.objectId) return null

                const described = await this.helper.describeNodeByObjectId(result.result.objectId)
                const childBackendNodeId = described?.node?.backendNodeId
                if (!childBackendNodeId) return null

                return await this.getElementDetails(childBackendNodeId)
            } finally {
                try { await this.helper.releaseObject(objectId) } catch { /* ignore */ }
            }
        } catch (err) {
            console.error('Select first child element error:', err)
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
            await this.helper.describeNode(backendNodeId)
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

            let ancestorPath: string[] = []
            try {
                ancestorPath = await this.helper.getAncestorPath(nodeId, 5)
            } catch {
                ancestorPath = []
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
                ancestorPath, descendants,
            }
        } catch (err) {
            console.error('Build element details error:', err)
            return null
        }
    }
}
