import { describe, expect, it } from 'vitest'
import { buildPageContextDescriptor, buildPageExportPrompt, type PageExportElement } from '../exportPrompt'
import type { ExportPromptSummaryMeta, InspectedElement, PageContextSnapshot } from '../types'

function createElement(overrides: Partial<InspectedElement> = {}): InspectedElement {
  return {
    backendNodeId: 42,
    nodeId: 7,
    tagName: 'H1',
    classNames: ['hero-title'],
    id: '',
    attributes: {},
    boxModel: null,
    computedStyles: {
      color: 'rgb(30, 30, 30)',
      'font-size': '64px',
    },
    cssVariables: {},
    textContent: 'Tell AI what to change',
    textContentPreview: 'Tell AI what to change',
    outerHTMLPreview: '<h1 class="hero-title">Tell AI what to change</h1>',
    ancestorPath: [],
    descendants: [],
    ...overrides,
  }
}

function createSummaryMeta(overrides: Partial<ExportPromptSummaryMeta> = {}): ExportPromptSummaryMeta {
  return {
    elementCount: 1,
    modifiedCount: 1,
    tagCount: 1,
    taggedElementCount: 1,
    ...overrides,
  }
}

function createExportElement(overrides: Partial<PageExportElement> = {}): PageExportElement {
  return {
    backendNodeId: 42,
    selector: 'h1.hero-title',
    displayName: 'h1.hero-title',
    tagName: 'h1',
    preset: 'text',
    textPreview: 'Tell AI what to change',
    identityHints: {},
    ancestorPath: [],
    boxModel: {
      width: 640,
      height: 120,
    },
    styleDiff: {
      color: '#111111',
    },
    updatedAt: 1712222222000,
    tags: ['Make the headline feel more direct.'],
    ...overrides,
  }
}

function buildSnapshot(overrides: Partial<PageContextSnapshot> = {}): PageContextSnapshot {
  return {
    title: 'DOMPrompter',
    url: 'file:///Users/demo/test-web/pages/index.html',
    pathname: '/Users/demo/test-web/pages/index.html',
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
    visibleVariantKey: null,
    activeVariantLabel: null,
    activeVariantKey: null,
    ...overrides,
  }
}

describe('export prompt context scope', () => {
  it('uses active route for page label and ignores language signals', () => {
    const snapshot = buildSnapshot()

    expect(
      buildPageContextDescriptor({
        snapshot,
        pageTitle: snapshot.title,
        pageUrl: snapshot.url,
        targetUrl: snapshot.url,
      }),
    ).toEqual({
      contextKey: 'index.html',
      pageLabel: 'Home',
      variantLabel: null,
      scopeLabel: 'Home',
      signals: [
        'route=index.html',
        'title=DOMPrompter',
      ],
    })
  })

  it('falls back to the current file name when the page exposes no nav metadata', () => {
    const snapshot = buildSnapshot({
      title: '',
      url: 'file:///Users/demo/test-web/pages/about.html',
      pathname: '/Users/demo/test-web/pages/about.html',
      htmlLang: null,
      activeRouteLabel: null,
      activeRouteHref: null,
    })

    expect(
      buildPageContextDescriptor({
        snapshot,
        pageTitle: snapshot.title,
        pageUrl: snapshot.url,
        targetUrl: snapshot.url,
      }),
    ).toEqual({
      contextKey: 'about.html',
      pageLabel: 'About',
      variantLabel: null,
      scopeLabel: 'About',
      signals: [],
    })
  })

  it('embeds page scope into the exported prompt without language variant', () => {
    const pageContext = buildPageContextDescriptor({
      snapshot: buildSnapshot(),
      pageTitle: 'DOMPrompter',
      pageUrl: 'file:///Users/demo/test-web/pages/index.html',
      targetUrl: 'file:///Users/demo/test-web/pages/index.html',
    })

    const prompt = buildPageExportPrompt({
      appName: 'DOMPrompter',
      currentElement: createElement(),
      elements: [createExportElement()],
      summaryMeta: createSummaryMeta(),
      pageTitle: 'DOMPrompter',
      pageUrl: 'file:///Users/demo/test-web/pages/index.html',
      targetUrl: 'file:///Users/demo/test-web/pages/index.html',
      pageContext,
    })

    expect(prompt).toContain('Page: Home')
    expect(prompt).toContain('Scope: Home')
    expect(prompt).toContain('Context key: index.html')
    expect(prompt).toContain('Detection signals: route=index.html; title=DOMPrompter')
    expect(prompt).toContain('Selection anchor: h1.hero-title (backendNodeId: 42, secondary hint only)')
    expect(prompt).toContain('"pageLabel": "Home"')
    expect(prompt).toContain('"scopeLabel": "Home"')
    expect(prompt).not.toContain('Variant:')
  })
})
