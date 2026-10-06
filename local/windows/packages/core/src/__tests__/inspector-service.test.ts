import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InspectorService } from '../inspector-service'
import type { ICDPTransport } from '../cdp/connection'

/**
 * Mock CDP Transport — 模拟 CDP 通信层
 *
 * 核心设计：通过 eventHandlers 保存注册的事件回调，
 * 测试时可以手动触发 Runtime.bindingCalled 来模拟 picker 脚本的消息。
 */
function createMockTransport() {
  const eventHandlers: Record<string, Array<(params: any) => void>> = {}
  const sentCommands: Array<{ method: string; params: any }> = []
  let pageContextValue: Record<string, any> | null = null

  const transport: ICDPTransport = {
    send: vi.fn(async (method: string, params?: any) => {
      sentCommands.push({ method, params })

      // 模拟 DOM.getDocument
      if (method === 'DOM.getDocument') {
        return { root: { nodeId: 1 } }
      }
      // 模拟 Runtime.addBinding
      if (method === 'Runtime.addBinding') {
        return {}
      }
      // 模拟 enableDomains 相关调用
      if (method.endsWith('.enable')) {
        return {}
      }
      // 模拟 DOM.describeNode
      if (method === 'DOM.describeNode') {
        return {
          node: {
            nodeType: 1,
            nodeName: 'DIV',
            backendNodeId: params?.backendNodeId || 100,
            attributes: ['class', 'test-element'],
          }
        }
      }
      // 模拟 DOM.pushNodesByBackendIdsToFrontend
      if (method === 'DOM.pushNodesByBackendIdsToFrontend') {
        return { nodeIds: [10] }
      }
      // 模拟 CSS.getComputedStyleForNode
      if (method === 'CSS.getComputedStyleForNode') {
        return {
          computedStyle: [
            { name: 'width', value: '200px' },
            { name: 'height', value: '100px' },
          ]
        }
      }
      // 模拟 DOM.getBoxModel
      if (method === 'DOM.getBoxModel') {
        return {
          model: {
            width: 200,
            height: 100,
            content: [10, 10, 210, 10, 210, 110, 10, 110],
            padding: [10, 10, 210, 10, 210, 110, 10, 110],
            border: [10, 10, 210, 10, 210, 110, 10, 110],
            margin: [0, 0, 220, 0, 220, 120, 0, 120],
          }
        }
      }
      // 模拟 Runtime.evaluate (picker token consume → 返回 DOM 对象引用)
      if (method === 'Runtime.evaluate') {
        if (
          params?.returnByValue
          && String(params?.expression || '').includes('visual-inspector:page-context')
        ) {
          return {
            result: {
              type: 'object',
              value: pageContextValue || {
                title: 'DOMPrompter',
                url: 'file:///demo/index.html',
                pathname: '/demo/index.html',
                hashRoute: null,
                pageHeading: null,
                htmlLang: 'en',
                contentLanguage: null,
                navigatorLanguage: null,
                urlLanguage: null,
                i18nLanguage: null,
                activeRouteLabel: 'Home',
                activeRouteHref: './index.html',
                visibleVariantLabel: null,
                visibleVariantKey: 'en',
                activeVariantLabel: 'English',
                activeVariantKey: 'en',
              },
            }
          }
        }
        return {
          result: {
            type: 'object',
            objectId: 'mock-object-id-1',
          }
        }
      }
      // 模拟 DOM.describeNode via objectId
      if (method === 'DOM.describeNode' && params?.objectId) {
        return {
          node: {
            nodeType: 1,
            nodeName: 'DIV',
            nodeId: 10,
            backendNodeId: 100,
            attributes: ['class', 'test-element'],
          }
        }
      }
      // 模拟 Runtime.releaseObject
      if (method === 'Runtime.releaseObject') {
        return {}
      }
      // 模拟 DOM.getOuterHTML
      if (method === 'DOM.getOuterHTML') {
        return { outerHTML: '<div class="test-element">Hello</div>' }
      }
      // 模拟 CSS.getMatchedStylesForNode
      if (method === 'CSS.getMatchedStylesForNode') {
        return { matchedCSSRules: [] }
      }
      // 模拟 inline style 读写
      if (method === 'CSS.getInlineStylesForNode') {
        return {
          inlineStyle: {
            styleSheetId: 'mock-style-sheet',
            range: {
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            },
            cssText: 'width: 200px;',
          }
        }
      }
      // 模拟 DOM.querySelectorAll (for getDescendantRects)
      if (method === 'DOM.querySelectorAll') {
        return { nodeIds: [] }
      }

      return {}
    }),
    on: vi.fn((event: string, callback: (params: any) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = []
      }
      eventHandlers[event].push(callback)
    }),
    off: vi.fn(),
    disconnect: vi.fn(),
    get connected() { return true },
  }

  return {
    transport,
    sentCommands,
    /** 模拟 picker 脚本通过 CDP Binding 发送消息 */
    emitBindingCall(payload: Record<string, any>) {
      const handlers = eventHandlers['Runtime.bindingCalled'] || []
      for (const handler of handlers) {
        handler({
          name: '__viInspectorHostSelect__',
          payload: JSON.stringify(payload),
        })
      }
    },
    setPageContextValue(nextValue: Record<string, any>) {
      pageContextValue = nextValue
    },
  }
}

describe('InspectorService', () => {
  let mock: ReturnType<typeof createMockTransport>
  let service: InspectorService

  beforeEach(async () => {
    mock = createMockTransport()
    service = new InspectorService(mock.transport)
    await service.initialize()
  })

  describe('activate-property 事件（激活属性面板高亮）', () => {
    it('收到 activate-property 事件时应触发 onPropertyActivated 回调', async () => {
      const callback = vi.fn()
      service.onPropertyActivated(callback)

      mock.emitBindingCall({
        type: 'activate-property',
        property: 'size',
        token: 'vi-test-token-1',
      })

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('size')
      })
    })

    it('activate-property 不应触发 onElementSelected 回调', async () => {
      const selectedCallback = vi.fn()
      const activateCallback = vi.fn()
      service.onElementSelected(selectedCallback)
      service.onPropertyActivated(activateCallback)

      mock.emitBindingCall({
        type: 'activate-property',
        property: 'padding',
        token: 'vi-test-token-2',
      })

      await vi.waitFor(() => {
        expect(activateCallback).toHaveBeenCalledWith('padding')
      })
      expect(selectedCallback).not.toHaveBeenCalled()
    })
  })

  describe('increment-property 事件（浮动按钮 → 增加属性值）', () => {
    it('收到 increment-property 事件时应触发 onPropertyIncrement 回调', async () => {
      const callback = vi.fn()
      service.onPropertyIncrement(callback)

      mock.emitBindingCall({
        type: 'increment-property',
        cssProperty: 'width',
        token: 'vi-test-inc-1',
      })

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('width')
      })
    })

    it('increment-property 不应触发 onElementSelected', async () => {
      const selectedCallback = vi.fn()
      const incrementCallback = vi.fn()
      service.onElementSelected(selectedCallback)
      service.onPropertyIncrement(incrementCallback)

      mock.emitBindingCall({
        type: 'increment-property',
        cssProperty: 'padding-top',
        token: 'vi-test-inc-2',
      })

      await vi.waitFor(() => {
        expect(incrementCallback).toHaveBeenCalledWith('padding-top')
      })
      expect(selectedCallback).not.toHaveBeenCalled()
    })

    it('increment-property 不应直接修改 DOM 样式', async () => {
      const callback = vi.fn()
      service.onPropertyIncrement(callback)

      mock.emitBindingCall({
        type: 'increment-property',
        cssProperty: 'margin-left',
        token: 'vi-test-inc-3',
      })

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled()
      })

      const styleCommands = mock.sentCommands.filter(
        cmd => cmd.method === 'CSS.setStyleTexts'
      )
      expect(styleCommands).toHaveLength(0)
    })

    it('没有 cssProperty 字段时应忽略', async () => {
      const callback = vi.fn()
      service.onPropertyIncrement(callback)

      mock.emitBindingCall({
        type: 'increment-property',
        token: 'vi-test-inc-no-prop',
      })

      await new Promise(r => setTimeout(r, 50))
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('page context snapshot', () => {
    it('reads the current page scope from the inspected document on demand', async () => {
      mock.setPageContextValue({
        title: 'DOMPrompter',
        url: 'file:///demo/pages/index.html',
        pathname: '/demo/pages/index.html',
        hashRoute: null,
        pageHeading: null,
        htmlLang: 'en',
        contentLanguage: null,
        navigatorLanguage: null,
        urlLanguage: null,
        i18nLanguage: null,
        activeRouteLabel: '首页',
        activeRouteHref: './index.html',
        visibleVariantLabel: null,
        visibleVariantKey: 'en',
        activeVariantLabel: 'English',
        activeVariantKey: 'en',
      })

      await expect(service.getPageContextSnapshot()).resolves.toEqual({
        title: 'DOMPrompter',
        url: 'file:///demo/pages/index.html',
        pathname: '/demo/pages/index.html',
        hashRoute: null,
        pageHeading: null,
        htmlLang: 'en',
        contentLanguage: null,
        navigatorLanguage: null,
        urlLanguage: null,
        i18nLanguage: null,
        activeRouteLabel: '首页',
        activeRouteHref: './index.html',
        visibleVariantLabel: null,
        visibleVariantKey: 'en',
        activeVariantLabel: 'English',
        activeVariantKey: 'en',
      })
    })
  })

  describe('style-nudge 事件（浮动按钮历史同步）', () => {
    it('应携带 before/after 样式历史并回传给 renderer', async () => {
      const selectedCallback = vi.fn()
      service.onElementSelected(selectedCallback)

      mock.emitBindingCall({
        type: 'style-nudge',
        token: 'vi-test-nudge-1',
        keys: ['margin-left'],
        beforeStyles: { 'margin-left': '0px' },
        afterStyles: { 'margin-left': '8px' },
      })

      await vi.waitFor(() => {
        expect(selectedCallback).toHaveBeenCalled()
      })

      expect(mock.sentCommands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'CSS.setStyleTexts',
          }),
        ]),
      )

      expect(selectedCallback).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          nudge: true,
          styles: { 'margin-left': '8px' },
          nudgeChange: {
            keys: ['margin-left'],
            beforeStyles: { 'margin-left': '0px' },
            afterStyles: { 'margin-left': '8px' },
          },
        }),
      )
    })
  })

  describe('select 事件（原有行为不变）', () => {
    it('select 事件应触发 onElementSelected 回调', async () => {
      const callback = vi.fn()
      service.onElementSelected(callback)

      mock.emitBindingCall({
        type: 'select',
        shiftKey: false,
        token: 'vi-test-select-1',
      })

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled()
      })

      const element = callback.mock.calls[0][0]
      expect(element).toHaveProperty('backendNodeId')
      expect(element).toHaveProperty('computedStyles')
    })

    it('select 事件在 token 不可用时应回退到 backendNodeId', async () => {
      const callback = vi.fn()
      service.onElementSelected(callback)

      mock.emitBindingCall({
        type: 'select',
        shiftKey: false,
        backendNodeId: 321,
      })

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled()
      })

      expect(mock.sentCommands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'DOM.describeNode',
            params: expect.objectContaining({ backendNodeId: 321 }),
          }),
        ]),
      )
    })
  })

  describe('resize 事件应被移除', () => {
    it('resize 事件不再修改样式，而是被忽略', async () => {
      const selectedCallback = vi.fn()
      const activateCallback = vi.fn()
      service.onElementSelected(selectedCallback)
      service.onPropertyActivated(activateCallback)

      mock.emitBindingCall({
        type: 'resize',
        styles: { width: '300px', height: '200px' },
        token: 'vi-test-resize-1',
      })

      await new Promise(r => setTimeout(r, 50))
      // resize 事件不应该触发任何回调
      expect(selectedCallback).not.toHaveBeenCalled()
      expect(activateCallback).not.toHaveBeenCalled()

      // 也不应该调用 setStyleProperties
      const styleCommands = mock.sentCommands.filter(
        cmd => cmd.method === 'CSS.setStyleTexts'
      )
      expect(styleCommands).toHaveLength(0)
    })
  })
})
