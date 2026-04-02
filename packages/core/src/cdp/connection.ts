import WebSocket from 'ws'

// ─── CDP 传输层抽象 ──────────────────────────────

/** CDP 命令发送 + 事件监听的统一接口 */
export interface ICDPTransport {
  send(method: string, params?: any): Promise<any>
  on(event: string, callback: (params: any) => void): void
  off(event: string, callback: (params: any) => void): void
  disconnect(): void
  readonly connected: boolean
}

export interface SelectedNodeReference {
  nodeId: number | null
  backendNodeId: number | null
}

export interface NodeLocationReference {
  nodeId: number | null
  backendNodeId: number | null
}

export interface DescendantRectReference {
  x: number
  y: number
  width: number
  height: number
  depth: number
  label: string
}

type EventCallback = (params: any) => void
const ELEMENT_PICKER_BINDING = '__viInspectorHostSelect__'
const ELEMENT_PICKER_STATE = '__visualInspectorPicker'
const ELEMENT_PICKER_RUNTIME_VERSION = '2026-04-02-tag-browse-runtime-v4'
function mergeInlineStyleText(currentText: string, patch: Record<string, string>): string {
  const styleMap = new Map<string, string>()

  currentText
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const separatorIndex = declaration.indexOf(':')
      if (separatorIndex === -1) return
      const name = declaration.slice(0, separatorIndex).trim()
      const value = declaration.slice(separatorIndex + 1).trim()
      if (!name) return
      styleMap.set(name, value)
    })

  Object.entries(patch).forEach(([name, value]) => {
    if (!value) {
      styleMap.delete(name)
    } else {
      styleMap.set(name, value)
    }
  })

  return Array.from(styleMap.entries())
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
}

function buildElementPickerScript(bindingName: string): string {
  return `(() => {
    const binding = ${JSON.stringify(bindingName)};
    const stateKey = ${JSON.stringify(ELEMENT_PICKER_STATE)};
    const runtimeVersion = ${JSON.stringify(ELEMENT_PICKER_RUNTIME_VERSION)};
    const doc = document;
    const win = window;

    if (!doc || !doc.documentElement) return false;

    if (win[stateKey] && win[stateKey].runtimeVersion !== runtimeVersion) {
      try {
        win[stateKey].disable?.();
      } catch (error) {
        // ignore stale runtime cleanup failures
      }
      try {
        delete win[stateKey];
      } catch (error) {
        win[stateKey] = null;
      }
    }

    if (!win[stateKey]) {
      const parsePx = (value) => {
        const numeric = Number.parseFloat(String(value || '0'));
        return Number.isFinite(numeric) ? numeric : 0;
      };

      const paintRect = (node, rect, visible) => {
        if (!visible || !rect || rect.width <= 0 || rect.height <= 0) {
          node.style.display = 'none';
          return;
        }

        node.style.display = 'block';
        node.style.left = rect.x + 'px';
        node.style.top = rect.y + 'px';
        node.style.width = rect.width + 'px';
        node.style.height = rect.height + 'px';
      };

      const buildSelector = (target) => {
        return target.tagName.toLowerCase()
          + (target.id ? '#' + target.id : '')
          + (target.classList?.length ? '.' + target.classList[0] : '');
      };

      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

      const isOverlayElement = (node) => (
        node instanceof Element
        && Boolean(node.closest('[data-vi-overlay-root="true"]'))
      );

      const isSelectableCandidate = (node) => {
        if (!(node instanceof Element)) return false;
        if (node === doc.documentElement || node === doc.body) return false;
        if (isOverlayElement(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      };

      const buildElementStack = (target) => {
        if (!(target instanceof Element)) return [];
        const stack = [];
        const seen = new Set();
        let current = target;
        while (current instanceof Element && current !== doc.documentElement && current !== doc.body) {
          if (isSelectableCandidate(current) && !seen.has(current)) {
            stack.push(current);
            seen.add(current);
          }
          current = current.parentElement;
        }
        return stack;
      };

      const normalizeBox = (box) => {
        if (!box) return null;
        return {
          x: Number(box.x) || 0,
          y: Number(box.y) || 0,
          width: Number(box.width) || 0,
          height: Number(box.height) || 0,
        };
      };

      const resolveTagElement = (target) => {
        if (!target) return null;
        const selector = String(target.selector || '');
        const expectedBox = normalizeBox(target.boxModel);
        if (!selector) return null;

        let candidates = [];
        try {
          candidates = Array.from(doc.querySelectorAll(selector));
        } catch (error) {
          candidates = [];
        }
        candidates = candidates.filter((node) => !(node instanceof Element && isOverlayElement(node)));
        if (!candidates.length) return null;
        if (candidates.length === 1 || !expectedBox) return candidates[0];

        let best = candidates[0];
        let bestScore = Number.POSITIVE_INFINITY;
        candidates.forEach((candidate) => {
          if (!(candidate instanceof Element)) return;
          const rect = candidate.getBoundingClientRect();
          const score = Math.abs(rect.x - expectedBox.x)
            + Math.abs(rect.y - expectedBox.y)
            + Math.abs(rect.width - expectedBox.width)
            + Math.abs(rect.height - expectedBox.height);
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        });
        return best instanceof Element ? best : null;
      };

      const dispatchEquivalentClick = (target) => {
        if (!(target instanceof Element)) return;
        const rect = target.getBoundingClientRect();
        const clientX = rect.left + Math.max(1, rect.width / 2);
        const clientY = rect.top + Math.max(1, rect.height / 2);
        target.dispatchEvent(new win.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: win,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
          detail: 1,
        }));
      };

      const measure = (target) => {
        const rect = target.getBoundingClientRect();
        const styles = win.getComputedStyle(target);
        const marginTop = parsePx(styles.marginTop);
        const marginRight = parsePx(styles.marginRight);
        const marginBottom = parsePx(styles.marginBottom);
        const marginLeft = parsePx(styles.marginLeft);
        const borderTop = parsePx(styles.borderTopWidth);
        const borderRight = parsePx(styles.borderRightWidth);
        const borderBottom = parsePx(styles.borderBottomWidth);
        const borderLeft = parsePx(styles.borderLeftWidth);
        const paddingTop = parsePx(styles.paddingTop);
        const paddingRight = parsePx(styles.paddingRight);
        const paddingBottom = parsePx(styles.paddingBottom);
        const paddingLeft = parsePx(styles.paddingLeft);

        const borderRect = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };

        const marginRect = {
          x: rect.left - marginLeft,
          y: rect.top - marginTop,
          width: rect.width + marginLeft + marginRight,
          height: rect.height + marginTop + marginBottom,
        };

        const paddingRect = {
          x: rect.left + borderLeft,
          y: rect.top + borderTop,
          width: Math.max(0, rect.width - borderLeft - borderRight),
          height: Math.max(0, rect.height - borderTop - borderBottom),
        };

        const contentRect = {
          x: paddingRect.x + paddingLeft,
          y: paddingRect.y + paddingTop,
          width: Math.max(0, paddingRect.width - paddingLeft - paddingRight),
          height: Math.max(0, paddingRect.height - paddingTop - paddingBottom),
        };

        return {
          styles,
          borderRect,
          marginRect,
          paddingRect,
          contentRect,
          fontSize: parsePx(styles.fontSize),
          lineHeight: styles.lineHeight === 'normal' ? Math.round(parsePx(styles.fontSize) * 1.35) : parsePx(styles.lineHeight),
        };
      };

      const makeGuideBand = (borderColor, fillColor, zIndex) => {
        const node = doc.createElement('div');
        node.style.cssText = [
          'position:fixed',
          'left:0',
          'top:0',
          'width:0',
          'height:0',
          'pointer-events:none',
          'border:1px dashed ' + borderColor,
          'background:' + fillColor,
          'border-radius:8px',
          'z-index:' + zIndex,
          'display:none'
        ].join(';');
        return node;
      };

      const makeGuideBadge = () => {
        const node = doc.createElement('div');
        node.style.cssText = [
          'position:fixed',
          'left:0',
          'top:0',
          'padding:3px 6px',
          'border-radius:999px',
          'font:600 10px/1 -apple-system, BlinkMacSystemFont, sans-serif',
          'color:#f8fafc',
          'pointer-events:none',
          'z-index:2147483647',
          'white-space:nowrap',
          'display:none'
        ].join(';');
        return node;
      };

      const marginBands = Array.from({ length: 4 }, () => makeGuideBand('rgba(251,146,60,0.95)', 'rgba(251,146,60,0.10)', 2147483644));
      const paddingBands = Array.from({ length: 4 }, () => makeGuideBand('rgba(16,185,129,0.92)', 'rgba(16,185,129,0.08)', 2147483645));
      const guideBadges = {
        top: makeGuideBadge(),
        right: makeGuideBadge(),
        bottom: makeGuideBadge(),
        left: makeGuideBadge(),
        center: makeGuideBadge(),
      };
      const gapBadges = Array.from({ length: 8 }, () => makeGuideBadge());

      const typographyGuide = doc.createElement('div');
      typographyGuide.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:0',
        'height:0',
        'pointer-events:none',
        'border-top:1px dashed rgba(59,130,246,0.9)',
        'z-index:2147483645',
        'display:none'
      ].join(';');

      const skeletonLayer = doc.createElement('div');
      skeletonLayer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:100vw',
        'height:100vh',
        'pointer-events:none',
        'z-index:2147483643'
      ].join(';');
      skeletonLayer.dataset.viOverlayRoot = 'true';

      const tagBadgeLayer = doc.createElement('div');
      tagBadgeLayer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:100vw',
        'height:100vh',
        'pointer-events:none',
        'z-index:2147483647'
      ].join(';');
      tagBadgeLayer.dataset.viOverlayRoot = 'true';

      const overlay = doc.createElement('div');
      overlay.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:0',
        'height:0',
        'pointer-events:none',
        'z-index:2147483646',
        'border:1.5px solid #0d99ff',
        'border-radius:10px',
        'background:transparent',
        'display:none'
      ].join(';');
      overlay.dataset.viOverlayRoot = 'true';

      const label = doc.createElement('div');
      label.style.cssText = [
        'position:absolute',
        'left:-2px',
        'top:-30px',
        'padding:5px 8px',
        'border-radius:10px',
        'background:rgba(13,24,40,0.92)',
        'border:1px solid rgba(13,153,255,0.28)',
        'box-shadow:0 10px 30px rgba(13,24,40,0.2)',
        'color:#f5f1ff',
        'font:600 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif',
        'white-space:nowrap'
      ].join(';');

      // ─── 浮动动作按钮（属性面板的遥控器）───
      // 每个按钮点击等价于属性面板的「增加」按钮，通过 useStyleBinding 记录变化
      var ACTION_BUTTON_DEFS = [
        { id: 'width',         label: 'W',  cssProperty: 'width',          group: 'size' },
        { id: 'height',        label: 'H',  cssProperty: 'height',         group: 'size' },
        { id: 'padding-top',   label: '↑',  cssProperty: 'padding-top',    group: 'padding' },
        { id: 'padding-right', label: '→',  cssProperty: 'padding-right',  group: 'padding' },
        { id: 'padding-bottom',label: '↓',  cssProperty: 'padding-bottom', group: 'padding' },
        { id: 'padding-left',  label: '←',  cssProperty: 'padding-left',   group: 'padding' },
        { id: 'margin-top',    label: '↑',  cssProperty: 'margin-top',     group: 'margin' },
        { id: 'margin-right',  label: '→',  cssProperty: 'margin-right',   group: 'margin' },
        { id: 'margin-bottom', label: '↓',  cssProperty: 'margin-bottom',  group: 'margin' },
        { id: 'margin-left',   label: '←',  cssProperty: 'margin-left',    group: 'margin' },
      ];

      const makeActionButton = (config) => {
        const isSize = config.group === 'size';
        const isMargin = config.group === 'margin';
        const bgColor = isSize ? 'rgba(59,130,246,0.88)' : isMargin ? 'rgba(251,146,60,0.88)' : 'rgba(16,185,129,0.88)';
        const bgHover = isSize ? 'rgba(59,130,246,1)' : isMargin ? 'rgba(251,146,60,1)' : 'rgba(16,185,129,1)';
        const btn = doc.createElement('div');
        btn.dataset.viAction = config.id;
        btn.dataset.viOverlayRoot = 'true';
        btn.style.cssText = [
          'position:absolute',
          'display:none',
          'width:' + (isSize ? '20px' : '16px'),
          'height:' + (isSize ? '20px' : '16px'),
          'border-radius:' + (isSize ? '4px' : '50%'),
          'background:' + bgColor,
          'color:#fff',
          'font:700 ' + (isSize ? '10px' : '8px') + '/1 -apple-system,BlinkMacSystemFont,sans-serif',
          'display:none',
          'pointer-events:auto',
          'cursor:pointer',
          'user-select:none',
          'text-align:center',
          'line-height:' + (isSize ? '20px' : '16px'),
          'transition:transform 100ms ease,background 100ms ease',
          'box-shadow:0 1px 4px rgba(0,0,0,0.2)',
        ].join(';');
        btn.textContent = config.label;
        btn.addEventListener('mouseenter', () => {
          btn.style.background = bgHover;
          btn.style.transform = 'scale(1.15)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = bgColor;
          btn.style.transform = 'scale(1)';
        });
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          event.preventDefault();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
          var target = state.current;
          if (!target || !(target instanceof Element)) return;

          // ① 直接改 DOM — 用户立即看到效果
          var STEP = 8;
          var cs = win.getComputedStyle(target);
          var cur = parseFloat(cs.getPropertyValue(config.cssProperty)) || 0;
          var next = Math.max(0, Math.round(cur + STEP));
          var nextVal = next + 'px';
          target.style.setProperty(config.cssProperty, nextVal);

          // 更新 overlay 位置
          state.update(target, true);

          // ② 通知属性面板同步记录（有 undo/redo + styleDiff）
          var token = 'vi-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          state.selections[token] = target;
          if (typeof win[binding] === 'function') {
            win[binding](JSON.stringify({
              type: 'style-nudge',
              token: token,
              styles: { [config.cssProperty]: nextVal },
            }));
          }
        }, true);
        return btn;
      };

      const actionButtons = ACTION_BUTTON_DEFS.map((config) => makeActionButton(config));
      for (const btn of actionButtons) overlay.appendChild(btn);
      overlay.appendChild(label);
      marginBands.forEach((node) => doc.documentElement.appendChild(node));
      paddingBands.forEach((node) => doc.documentElement.appendChild(node));
      Object.values(guideBadges).forEach((node) => doc.documentElement.appendChild(node));
      gapBadges.forEach((node) => doc.documentElement.appendChild(node));
      doc.documentElement.appendChild(typographyGuide);
      doc.documentElement.appendChild(skeletonLayer);
      doc.documentElement.appendChild(overlay);
      // tagBadgeLayer 必须在 overlay 之后，确保标签徽章在最顶层接收事件
      doc.documentElement.appendChild(tagBadgeLayer);

      const state = {
        runtimeVersion,
        active: false,
        locked: false,
        tool: 'select',
        activeProperty: null,
        overlayState: {
          tool: 'select',
          tags: [],
        },
        liveRectCache: {},
        liveRectDirty: true,
        rafId: 0,
        overlay,
        label,
        marginBands,
        paddingBands,
        guideBadges,
        gapBadges,
        typographyGuide,
        skeletonLayer,
        tagBadgeLayer,
        skeletonNodes: [],
        tagBadgeNodes: [],
        childRects: [],
        actionButtons,
        current: null,
        tagPreviewTarget: null,
        hoverStack: [],
        selectionCycle: null,
        selections: {},
        updateActionButtons(width, height) {
          // 容器太小时只显示 W/H，不显示 padding/margin 避免覆盖内容
          var showInner = width > 80 && height > 80;
          var showOuter = width > 50 && height > 50;
          // 按钮顺序: W, H, pt, pr, pb, pl, mt, mr, mb, ml
          var positions = [
            // W: 右边中间外侧
            { x: width + 6, y: height / 2 - 10, show: true },
            // H: 底部中间外侧
            { x: width / 2 - 10, y: height + 6, show: true },
            // padding-top: 上内侧中间
            { x: width / 2 - 8, y: 4, show: showInner },
            // padding-right: 右内侧中间
            { x: width - 20, y: height / 2 - 8, show: showInner },
            // padding-bottom: 下内侧中间
            { x: width / 2 - 8, y: height - 20, show: showInner },
            // padding-left: 左内侧中间
            { x: 4, y: height / 2 - 8, show: showInner },
            // margin-top: 上外侧中间 (避开 label 向右偏移)
            { x: width / 2 + 20, y: -22, show: showOuter },
            // margin-right: 右外侧（W 按钮下方）
            { x: width + 6, y: height / 2 + 16, show: showOuter },
            // margin-bottom: 下外侧（H 按钮右侧）
            { x: width / 2 + 16, y: height + 6, show: showOuter },
            // margin-left: 左外侧中间
            { x: -22, y: height / 2 - 8, show: showOuter },
          ];
          this.actionButtons.forEach(function(btn, i) {
            var pos = positions[i];
            if (pos) {
              btn.style.left = pos.x + 'px';
              btn.style.top = pos.y + 'px';
              btn.__viShow = pos.show;
            }
          });
        },
        setActionButtonsVisible(visible) {
          for (var i = 0; i < this.actionButtons.length; i++) {
            var btn = this.actionButtons[i];
            btn.style.display = (visible && btn.__viShow !== false) ? 'block' : 'none';
          }
        },
        shouldShowLockedOverlay() {
          return true;
        },
        renderTagPreview(target) {
          if (!(target instanceof Element)) return false;
          const metrics = measure(target);
          const { borderRect } = metrics;
          if (!borderRect.width && !borderRect.height) return false;
          paintRect(this.overlay, borderRect, true);
          this.overlay.style.borderColor = 'rgba(255,196,48,0.88)';
          this.overlay.style.borderStyle = 'dashed';
          this.overlay.style.borderWidth = '1.5px';
          this.overlay.style.background = 'transparent';
          this.label.style.display = 'none';
          this.marginBands.forEach((node) => { node.style.display = 'none'; });
          this.paddingBands.forEach((node) => { node.style.display = 'none'; });
          this.typographyGuide.style.display = 'none';
          this.hideBadges();
          this.skeletonNodes.forEach((node) => { node.style.display = 'none'; });
          this.setActionButtonsVisible(false);
          return true;
        },
        setTagPreview(target) {
          if (!(target instanceof Element)) return this.clearTagPreview(false);
          this.tagPreviewTarget = target;
          this.renderTagPreview(target);
        },
        clearTagPreview(restore = true) {
          if (!this.tagPreviewTarget) return;
          this.tagPreviewTarget = null;
          if (!restore) return;
          if (this.locked && this.current) {
            this.update(this.current, true);
          } else {
            this.hide();
          }
        },
        setTool(tool) {
          this.tool = tool || 'select';
          this.overlayState.tool = this.tool;
          if (this.tool === 'browse') {
            this.hide();
            this.renderTags();
            return;
          }
          this.sync();
          this.renderTags();
        },
        setOverlayState(payload) {
          this.overlayState = {
            tool: payload?.tool || this.tool || 'select',
            tags: Array.isArray(payload?.tags) ? payload.tags : [],
          };
          this.tool = this.overlayState.tool;
          this.liveRectDirty = true;
          this.renderTags();
          this.liveRectDirty = false;
          this.sync();
        },
        renderTags() {
          var tags = this.overlayState.tags || [];

          // 确保有足够的 badge 节点（创建时绑事件，和 action buttons 一样的机制）
          while (this.tagBadgeNodes.length < tags.length) {
            var badge = doc.createElement('div');
            badge.style.cssText = 'position:fixed;top:0;left:0;display:none;align-items:center;gap:3px;padding:2px 7px 2px 5px;border-radius:5px;background:rgba(255,196,48,0.88);color:#fff;font:600 10px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.15);opacity:0.82;transition:opacity 160ms ease,box-shadow 160ms ease';
            badge.dataset.viOverlayRoot = 'true';
            badge.dataset.viAction = 'tag';

            // hover：橙色虚线框（和 action buttons 的 mouseenter 一样的模式）
            badge.addEventListener('mouseenter', function() {
              this.style.opacity = '1';
              this.style.boxShadow = '0 2px 8px rgba(255,196,48,0.35)';
              var te = this.__viElement;
              if (!te) return;
              state.setTagPreview(te);
            });
            badge.addEventListener('mouseleave', function() {
              this.style.opacity = '0.82';
              this.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
              state.clearTagPreview(true);
            });
            // click：等价于点击对应容器（和 action buttons 完全一样的 capture 机制）
            badge.addEventListener('click', function(event) {
              event.stopPropagation();
              event.preventDefault();
              if (event.stopImmediatePropagation) event.stopImmediatePropagation();
              var te = this.__viElement;
              if (!te) return;
              state.clearTagPreview(false);
              try {
                dispatchEquivalentClick(te);
                return;
              } catch (error) {
                var stack = buildElementStack(te);
                if (stack.length) {
                  var rect = te.getBoundingClientRect();
                  state.hoverStack = stack;
                  state.selectionCycle = {
                    point: {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    },
                    stack: stack,
                  };
                }
                state.update(te, true);
                state.locked = true;
                var backendNodeId = Number(this.__viBackendNodeId) || null;
                if (backendNodeId && typeof win[binding] === 'function') {
                  win[binding](JSON.stringify({
                    type: 'select',
                    shiftKey: false,
                    backendNodeId: backendNodeId,
                  }));
                  return;
                }
                state.emitPayload(te, { type: 'select', shiftKey: false });
              }
            }, true);

            this.tagBadgeLayer.appendChild(badge);
            this.tagBadgeNodes.push(badge);
          }

          // 渲染每个标签
          for (var i = 0; i < tags.length; i++) {
            var b = this.tagBadgeNodes[i];
            var tag = tags[i];
            var tgt = Array.isArray(tag.targets) ? tag.targets[0] : null;
            // 通过 selector + boxModel 找到最贴近的真实 DOM 元素并直接存引用
            var el = resolveTagElement(tgt);
            b.__viElement = el;
            b.__viBackendNodeId = tgt && typeof tgt.backendNodeId === 'number' ? tgt.backendNodeId : null;

            // 获取元素位置
            var r = null;
            if (el) {
              var rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                r = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              }
            }
            if (!r) r = normalizeBox(tgt ? tgt.boxModel : null);
            if (!r || !r.width || !r.height) {
              b.style.display = 'none';
              continue;
            }

            // 定位：容器右上角内侧，超出视口则自适应
            var vw = win.innerWidth, vh = win.innerHeight;
            var bw = 70, bh = 16, pad = 4;
            var bx = r.x + r.width - bw - pad;
            var by = r.y + pad;
            if (bx < r.x + pad) bx = r.x + pad;
            if (bx + bw > vw - pad) bx = vw - bw - pad;
            if (bx < pad) bx = pad;
            if (by + bh > vh - pad) by = vh - bh - pad;
            if (by < pad) by = pad;

            b.style.display = 'inline-flex';
            b.style.transform = 'translate(' + bx + 'px,' + by + 'px)';
            var txt = tag.text ? (tag.text.length > 5 ? tag.text.slice(0, 5) + '\u2026' : tag.text) : '';
            b.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;pointer-events:none"><path d="M1.5 2.5A1 1 0 0 1 2.5 1.5h3.086a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 0 1.414L7.621 10.707a1 1 0 0 1-1.414 0L1.793 6.293A1 1 0 0 1 1.5 5.586V2.5Z" stroke="#fff" stroke-width="1.2"/><circle cx="4" cy="4" r=".8" fill="#fff"/></svg>' + (txt ? '<span style="overflow:hidden;text-overflow:ellipsis;color:#fff;pointer-events:none">' + txt + '</span>' : '');

            // 事件在 badge 创建时已绑定（while 循环），这里只更新 __viElement
          }

          // 隐藏多余的 badge
          for (var j = tags.length; j < this.tagBadgeNodes.length; j++) {
            this.tagBadgeNodes[j].style.display = 'none';
            this.tagBadgeNodes[j].__viElement = null;
            this.tagBadgeNodes[j].__viBackendNodeId = null;
          }
        },
        setBadgeTheme(badge, theme) {
          if (theme === 'margin') {
            badge.style.background = 'rgba(251,146,60,0.96)';
          } else if (theme === 'padding') {
            badge.style.background = 'rgba(16,185,129,0.94)';
          } else if (theme === 'typography') {
            badge.style.background = 'rgba(59,130,246,0.94)';
          } else {
            badge.style.background = 'rgba(15,23,42,0.92)';
          }
        },
        placeBadge(badge, x, y, text, theme) {
          if (!text) {
            badge.style.display = 'none';
            return;
          }
          this.setBadgeTheme(badge, theme);
          badge.textContent = text;
          badge.style.display = 'block';
          badge.style.left = x + 'px';
          badge.style.top = y + 'px';
        },
        hideBadges() {
          Object.values(this.guideBadges).forEach((badge) => {
            badge.style.display = 'none';
          });
          this.gapBadges.forEach((badge) => {
            badge.style.display = 'none';
          });
        },
        paintBands(bands, outer, inner, visible) {
          const rects = [
            { x: outer.x, y: outer.y, width: outer.width, height: inner.y - outer.y },
            { x: inner.x + inner.width, y: inner.y, width: outer.x + outer.width - (inner.x + inner.width), height: inner.height },
            { x: outer.x, y: inner.y + inner.height, width: outer.width, height: outer.y + outer.height - (inner.y + inner.height) },
            { x: outer.x, y: inner.y, width: inner.x - outer.x, height: inner.height },
          ];

          bands.forEach((band, index) => {
            const rect = rects[index];
            paintRect(band, rect, Boolean(visible && rect.width > 0 && rect.height > 0));
          });
        },
        setSkeletonCount(count) {
          while (this.skeletonNodes.length < count) {
            const node = doc.createElement('div');
            node.style.cssText = [
              'position:fixed',
              'left:0',
              'top:0',
              'width:0',
              'height:0',
              'pointer-events:none',
              'border:1px dashed rgba(139,92,246,0.55)',
              'border-radius:8px',
              'background:rgba(139,92,246,0.03)',
              'display:none'
            ].join(';');
            this.skeletonLayer.appendChild(node);
            this.skeletonNodes.push(node);
          }
        },
        updateSkeletons(target, visible, emphasized = false) {
          if (!(target instanceof Element) || !visible) {
            this.childRects = [];
            this.skeletonNodes.forEach((node) => { node.style.display = 'none'; });
            return;
          }

          const children = Array.from(target.children)
            .filter((child) => child instanceof Element)
            .filter((child) => {
              const rect = child.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });

          this.setSkeletonCount(children.length);
          this.childRects = [];
          this.skeletonNodes.forEach((node, index) => {
            const child = children[index];
            if (!child) {
              node.style.display = 'none';
              return;
            }

            const rect = child.getBoundingClientRect();
            paintRect(node, {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            }, true);
            this.childRects.push({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            });
            node.style.borderColor = emphasized ? 'rgba(139,92,246,0.75)' : 'rgba(139,92,246,0.55)';
            node.style.background = emphasized ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.03)';
          });
        },
        renderActiveAssist(metrics, selected) {
          const showMargin = selected && this.activeProperty === 'margin';
          const showPadding = selected && this.activeProperty === 'padding';
          const showTypography = selected && this.activeProperty === 'typography';
          const showGap = selected && this.activeProperty === 'gap';

          this.paintBands(this.marginBands, metrics.marginRect, metrics.borderRect, showMargin);
          this.paintBands(this.paddingBands, metrics.paddingRect, metrics.contentRect, showPadding);
          this.typographyGuide.style.display = 'none';
          this.hideBadges();

          if (showMargin) {
            const styles = metrics.styles;
            this.placeBadge(this.guideBadges.top, metrics.borderRect.x + metrics.borderRect.width / 2 - 16, metrics.marginRect.y + 4, styles.marginTop, 'margin');
            this.placeBadge(this.guideBadges.right, metrics.borderRect.x + metrics.borderRect.width + 6, metrics.borderRect.y + metrics.borderRect.height / 2 - 8, styles.marginRight, 'margin');
            this.placeBadge(this.guideBadges.bottom, metrics.borderRect.x + metrics.borderRect.width / 2 - 16, metrics.borderRect.y + metrics.borderRect.height + 6, styles.marginBottom, 'margin');
            this.placeBadge(this.guideBadges.left, metrics.marginRect.x + 4, metrics.borderRect.y + metrics.borderRect.height / 2 - 8, styles.marginLeft, 'margin');
          } else if (showPadding) {
            const styles = metrics.styles;
            this.placeBadge(this.guideBadges.top, metrics.paddingRect.x + metrics.paddingRect.width / 2 - 16, metrics.paddingRect.y + 4, styles.paddingTop, 'padding');
            this.placeBadge(this.guideBadges.right, metrics.contentRect.x + metrics.contentRect.width + 6, metrics.contentRect.y + metrics.contentRect.height / 2 - 8, styles.paddingRight, 'padding');
            this.placeBadge(this.guideBadges.bottom, metrics.paddingRect.x + metrics.paddingRect.width / 2 - 16, metrics.contentRect.y + metrics.contentRect.height + 6, styles.paddingBottom, 'padding');
            this.placeBadge(this.guideBadges.left, metrics.paddingRect.x + 4, metrics.contentRect.y + metrics.contentRect.height / 2 - 8, styles.paddingLeft, 'padding');
          } else if (showTypography) {
            const baselineY = Math.min(
              metrics.contentRect.y + metrics.contentRect.height - 2,
              metrics.contentRect.y + Math.max(metrics.fontSize, metrics.lineHeight) - Math.max(2, metrics.fontSize * 0.18)
            );

            this.typographyGuide.style.display = 'block';
            this.typographyGuide.style.left = metrics.contentRect.x + 'px';
            this.typographyGuide.style.top = baselineY + 'px';
            this.typographyGuide.style.width = metrics.contentRect.width + 'px';
            this.typographyGuide.style.height = '0px';
            this.placeBadge(this.guideBadges.center, metrics.contentRect.x + metrics.contentRect.width / 2 - 38, baselineY - 22, metrics.fontSize + 'px / ' + metrics.lineHeight + 'px', 'typography');
          } else if (showGap) {
            const childRects = this.childRects || [];
            const flexDirection = metrics.styles.flexDirection || 'row';
            const isColumnFlow = flexDirection.startsWith('column');
            const fallbackGap = metrics.styles.gap || metrics.styles.rowGap || metrics.styles.columnGap || '0px';

            if (childRects.length > 1) {
              childRects.slice(0, -1).forEach((rect, index) => {
                const nextRect = childRects[index + 1];
                const badge = this.gapBadges[index];
                if (!nextRect || !badge) return;

                const horizontalGap = Math.max(0, nextRect.x - (rect.x + rect.width));
                const verticalGap = Math.max(0, nextRect.y - (rect.y + rect.height));
                const useVertical = isColumnFlow || verticalGap > horizontalGap;
                const gapValue = useVertical ? verticalGap : horizontalGap;
                const x = useVertical
                  ? Math.max(rect.x, nextRect.x) + Math.min(rect.width, nextRect.width) / 2 - 16
                  : rect.x + rect.width + gapValue / 2 - 16;
                const y = useVertical
                  ? rect.y + rect.height + gapValue / 2 - 8
                  : Math.max(rect.y, nextRect.y) + Math.min(rect.height, nextRect.height) / 2 - 8;

                this.placeBadge(badge, x, y, (gapValue ? Math.round(gapValue) + 'px' : fallbackGap), 'typography');
              });
            } else {
              this.placeBadge(this.guideBadges.center, metrics.borderRect.x + metrics.borderRect.width / 2 - 22, metrics.borderRect.y - 24, fallbackGap, 'typography');
            }
          }
        },
        emitPayload(target, payload) {
          const token = 'vi-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          this.selections[token] = target;
          if (typeof win[binding] === 'function') {
            win[binding](JSON.stringify({ ...payload, token }));
          }
        },
        update(target, selected = false) {
          if (!(target instanceof Element)) return this.hide();
          if (selected) this.tagPreviewTarget = null;
          const metrics = measure(target);
          const { borderRect } = metrics;
          if (!borderRect.width && !borderRect.height) return this.hide();
          this.current = target;
          this.locked = selected;
          const showSelectionProxy = !(selected && !this.shouldShowLockedOverlay());
          paintRect(this.overlay, borderRect, showSelectionProxy);
          this.overlay.style.borderColor = '#0d99ff';
          this.overlay.style.borderStyle = 'solid';
          this.overlay.style.borderWidth = '1.5px';
          this.overlay.style.background = 'transparent';
          this.label.textContent = buildSelector(target) + '  ' + Math.round(borderRect.width) + ' × ' + Math.round(borderRect.height);
          this.label.style.display = showSelectionProxy ? 'block' : 'none';
          this.updateActionButtons(borderRect.width, borderRect.height);
          this.setActionButtonsVisible(selected && showSelectionProxy);
          this.renderActiveAssist(metrics, selected);
          this.updateSkeletons(target, selected, this.activeProperty === 'gap');
          this.renderTags();
        },
        hide() {
          this.tagPreviewTarget = null;
          this.current = null;
          this.locked = false;
          this.hoverStack = [];
          this.selectionCycle = null;
          this.overlay.style.display = 'none';
          this.label.style.display = 'none';
          this.marginBands.forEach((node) => { node.style.display = 'none'; });
          this.paddingBands.forEach((node) => { node.style.display = 'none'; });
          this.typographyGuide.style.display = 'none';
          this.hideBadges();
          this.skeletonNodes.forEach((node) => { node.style.display = 'none'; });
          this.setActionButtonsVisible(false);
          this.renderTags();
        },
        move(event) {
          if (!this.active) return;
          if (this.tool === 'browse') return;
          if (this.locked) return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target || target === this.overlay || this.overlay.contains(target) || this.tagBadgeLayer.contains(target)) return;
          const stack = buildElementStack(target);
          if (!stack.length) {
            this.hoverStack = [];
            this.hide();
            return;
          }
          const point = { x: event.clientX, y: event.clientY };
          const currentCycle = this.selectionCycle;
          if (currentCycle) {
            const movedDistance = Math.hypot(point.x - currentCycle.point.x, point.y - currentCycle.point.y);
            const innermostChanged = currentCycle.stack[0] !== stack[0];
            if (movedDistance > 18 || innermostChanged) {
              this.selectionCycle = null;
            }
          }
          this.hoverStack = stack;
          this.update(stack[0], false);
        },
        click(event) {
          if (!this.active) return;
          if (this.tool === 'browse') return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          // data-vi-action 的元素（action buttons 和 tag badges）自己处理 click
          if (target.dataset?.viAction) return;
          // 点到了 badge 子元素（svg/span）时，badge 自己的 capture handler 会处理
          if (this.tagBadgeLayer.contains(target)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
          const stack = buildElementStack(target);
          const candidates = stack.length > 0 ? stack : this.hoverStack;
          if (!candidates || candidates.length === 0) return;

          const point = { x: event.clientX, y: event.clientY };
          this.selectionCycle = {
            point,
            stack: candidates,
          };
          this.hoverStack = candidates;
          const currentIndex = this.current ? candidates.findIndex((candidate) => candidate === this.current) : -1;
          const nextTarget = currentIndex === -1
            ? candidates[0]
            : candidates[Math.max(0, currentIndex - 1)];
          this.update(nextTarget, true);
          this.emitPayload(nextTarget, { type: 'select', shiftKey: !!event.shiftKey });
        },
        sync() {
          state.liveRectDirty = true;
          if (!state.active) {
            state.liveRectDirty = false;
            return;
          }
          if (state.tagPreviewTarget) {
            state.renderTags();
            state.renderTagPreview(state.tagPreviewTarget);
            state.liveRectDirty = false;
            return;
          }
          if (state.current) state.update(state.current, state.locked);
          else state.renderTags();
          state.liveRectDirty = false;
        },
        setActiveProperty(property) {
          this.activeProperty = property || null;
          this.sync();
        },
        tick() {
          if (!state.active) return;
          if (state.tagPreviewTarget) {
            state.renderTags();
            state.renderTagPreview(state.tagPreviewTarget);
          } else if (state.current) {
            state.update(state.current, state.locked);
          }
          state.rafId = win.requestAnimationFrame(state.tick);
        },
        keydown(event) {
          if (state.tool === 'browse') return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const cycle = state.selectionCycle;
            if (!cycle || !state.current) return;
            const currentIndex = cycle.stack.findIndex((candidate) => candidate === state.current);
            const nextTarget = currentIndex >= 0 && currentIndex < cycle.stack.length - 1
              ? cycle.stack[currentIndex + 1]
              : null;
            if (!nextTarget) return;
            state.update(nextTarget, true);
            state.emitPayload(nextTarget, { type: 'select', shiftKey: false });
          }
        },
        enable() {
          if (this.active) {
            this.sync();
            return;
          }
          this.active = true;
          this.locked = false;
          this.hide();
          doc.addEventListener('mousemove', this.move, true);
          doc.addEventListener('click', this.click, true);
          win.addEventListener('scroll', this.sync, true);
          win.addEventListener('resize', this.sync, true);
          doc.addEventListener('keydown', this.keydown, true);
          this.rafId = win.requestAnimationFrame(this.tick);
          this.renderTags();
        },
        disable() {
          if (!this.active) {
            this.hide();
            return;
          }
          this.active = false;
          doc.removeEventListener('mousemove', this.move, true);
          doc.removeEventListener('click', this.click, true);
          win.removeEventListener('scroll', this.sync, true);
          win.removeEventListener('resize', this.sync, true);
          doc.removeEventListener('keydown', this.keydown, true);
          if (this.rafId) {
            win.cancelAnimationFrame(this.rafId);
            this.rafId = 0;
          }
          this.hide();
        },
        consume(token) {
          const target = this.selections[token] || null;
          delete this.selections[token];
          return target;
        }
      };

      state.move = state.move.bind(state);
      state.click = state.click.bind(state);
      state.setActiveProperty = state.setActiveProperty.bind(state);
      state.setTool = state.setTool.bind(state);
      state.setOverlayState = state.setOverlayState.bind(state);
      state.sync = state.sync.bind(state);
      state.tick = state.tick.bind(state);
      state.keydown = state.keydown.bind(state);

      win[stateKey] = state;
    }

    win[stateKey].enable();
    return true;
  })();`
}

// ─── WebSocket CDP 客户端（模式 B）─────────────────

export class CDPClient implements ICDPTransport {
  private ws: WebSocket | null = null
  private messageId = 0
  private pendingMessages = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private _connected = false

  get connected(): boolean {
    return this._connected
  }

  async connect(cdpUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(cdpUrl)

      this.ws.on('open', () => {
        this._connected = true
        resolve()
      })

      this.ws.on('error', (error) => {
        reject(error)
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString())
      })

      this.ws.on('close', () => {
        this._connected = false
        this.emit('disconnected', {})
      })
    })
  }

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emit(event: string, params: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const cb of listeners) {
        try { cb(params) } catch (err) { console.error(`CDP event error [${event}]:`, err) }
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data)
      if (msg.method && msg.id === undefined) {
        this.emit(msg.method, msg.params || {})
        return
      }
      if (msg.id !== undefined) {
        const pending = this.pendingMessages.get(msg.id)
        if (pending) {
          this.pendingMessages.delete(msg.id)
          msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result)
        }
      }
    } catch (err) {
      console.error('CDP parse error:', err)
    }
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP not connected')
    }
    const id = ++this.messageId
    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 10000)
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    this.eventListeners.clear()
  }
}

// ─── CDP 便捷方法（所有传输通用）──────────────────

export class CDPHelper {
  private nativeInspectMode = false

  constructor(private transport: ICDPTransport) { }

  async enableDomains(): Promise<void> {
    await Promise.all([
      this.transport.send('DOM.enable'),
      this.transport.send('CSS.enable'),
      this.transport.send('Overlay.enable'),
      this.transport.send('Page.enable'),
      this.transport.send('Runtime.enable'),
    ])
    await this.getDocument()
  }

  async startInspectMode(preferNativeOverlay: boolean = false): Promise<void> {
    await this.transport.send('Overlay.hideHighlight')
    try {
      await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.disable?.()`, true)
    } catch {
      // ignore picker cleanup errors
    }

    if (preferNativeOverlay) {
      this.nativeInspectMode = true
      await this.transport.send('Overlay.setInspectMode', {
        mode: 'searchForNode',
        highlightConfig: {
          showInfo: true,
          showStyles: false,
          showRulers: false,
          showExtensionLines: true,
          contentColor: { r: 13, g: 153, b: 255, a: 0.14 },
          paddingColor: { r: 16, g: 185, b: 129, a: 0.12 },
          borderColor: { r: 255, g: 255, b: 255, a: 0.08 },
          marginColor: { r: 251, g: 146, b: 60, a: 0.12 },
        },
      })
      return
    }

    this.nativeInspectMode = false
    await this.addBinding(ELEMENT_PICKER_BINDING)
    await this.evaluate(buildElementPickerScript(ELEMENT_PICKER_BINDING), true)
  }

  async stopInspectMode(): Promise<void> {
    try {
      await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.disable?.()`, true)
    } catch {
      // ignore picker cleanup errors
    }
    if (this.nativeInspectMode) {
      try {
        await this.transport.send('Overlay.setInspectMode', { mode: 'none' })
      } catch {
        // ignore native overlay shutdown errors
      }
      this.nativeInspectMode = false
    }
    await this.transport.send('Overlay.hideHighlight')
  }

  async setActiveEditProperty(property: string | null): Promise<void> {
    await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.setActiveProperty?.(${JSON.stringify(property)})`, true)
  }

  async setTool(tool: string | null): Promise<void> {
    await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.setTool?.(${JSON.stringify(tool)})`, true)
  }

  async setExternalOverlayState(payload: any): Promise<void> {
    const encodedPayload = JSON.stringify(payload ?? null)
    await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.setOverlayState?.(${encodedPayload})`, true)
  }

  async highlightNode(backendNodeId: number): Promise<void> {
    await this.transport.send('Overlay.highlightNode', {
      backendNodeId,
      highlightConfig: {
        showInfo: true,
        contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
        paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
        borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
        marginColor: { r: 246, g: 178, b: 107, a: 0.66 },
      }
    })
  }

  async hideHighlight(): Promise<void> {
    await this.transport.send('Overlay.hideHighlight')
  }

  async getDocument(): Promise<any> {
    return this.transport.send('DOM.getDocument', { depth: -1 })
  }

  async describeNode(backendNodeId: number): Promise<any> {
    return this.transport.send('DOM.describeNode', { backendNodeId, depth: 0 })
  }

  async describeNodeByObjectId(objectId: string): Promise<any> {
    return this.transport.send('DOM.describeNode', { objectId, depth: 0 })
  }

  async getOuterHTML(backendNodeId: number): Promise<string> {
    const r = await this.transport.send('DOM.getOuterHTML', { backendNodeId })
    return r.outerHTML
  }

  async getBoxModel(backendNodeId: number): Promise<any> {
    return this.transport.send('DOM.getBoxModel', { backendNodeId })
  }

  async getNodeForLocation(x: number, y: number): Promise<NodeLocationReference> {
    const result = await this.transport.send('DOM.getNodeForLocation', {
      x: Math.round(x),
      y: Math.round(y),
      ignorePointerEventsNone: true,
      includeUserAgentShadowDOM: true,
    })

    return {
      nodeId: typeof result.nodeId === 'number' ? result.nodeId : null,
      backendNodeId: typeof result.backendNodeId === 'number' ? result.backendNodeId : null,
    }
  }

  async getNodeStackForLocation(x: number, y: number, limit: number = 10): Promise<NodeLocationReference[]> {
    const evaluated = await this.transport.send('Runtime.evaluate', {
      expression: `document.elementsFromPoint(${Math.round(x)}, ${Math.round(y)})`,
      returnByValue: false,
      objectGroup: 'visual-inspector',
    })

    const arrayObjectId = evaluated.result?.objectId
    if (!arrayObjectId) {
      return []
    }

    try {
      const properties = await this.transport.send('Runtime.getProperties', {
        objectId: arrayObjectId,
        ownProperties: true,
      })

      const entries = (properties.result || [])
        .filter((entry: any) => /^\d+$/.test(String(entry.name)))
        .sort((a: any, b: any) => Number(a.name) - Number(b.name))
        .slice(0, limit)

      const stack: NodeLocationReference[] = []
      const seen = new Set<number>()

      for (const entry of entries) {
        const objectId = entry.value?.objectId
        if (!objectId) continue
        const described = await this.describeNodeByObjectId(objectId)
        const backendNodeId = typeof described.node?.backendNodeId === 'number' ? described.node.backendNodeId : null
        const nodeId = typeof described.node?.nodeId === 'number' ? described.node.nodeId : null
        if (!backendNodeId || seen.has(backendNodeId)) continue
        seen.add(backendNodeId)
        stack.push({ nodeId, backendNodeId })
      }

      return stack
    } finally {
      try {
        await this.releaseObject(arrayObjectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async getDescendantRects(nodeId: number, maxDepth: number = 2, maxCount: number = 32): Promise<DescendantRectReference[]> {
    const objectId = await this.resolveNode(nodeId)

    try {
      const result = await this.callFunctionOn(
        objectId,
        `function(maxDepth, maxCount) {
          const output = [];
          const queue = Array.from(this?.children || []).map((child) => ({ node: child, depth: 1 }));
          const buildLabel = (node) => {
            const tag = node.tagName.toLowerCase();
            if (node.id) return tag + '#' + node.id;
            if (node.classList?.length) return tag + '.' + node.classList[0];
            return tag;
          };

          while (queue.length && output.length < maxCount) {
            const { node, depth } = queue.shift();
            if (!(node instanceof Element)) continue;

            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              output.push({
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                depth,
                label: buildLabel(node),
              });
            }

            if (depth < maxDepth) {
              queue.push(...Array.from(node.children || []).map((child) => ({ node: child, depth: depth + 1 })));
            }
          }

          return output;
        }`,
        [maxDepth, maxCount],
      )

      return Array.isArray(result.result?.value) ? result.result.value : []
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async pushNodesByBackendIdsToFrontend(backendNodeIds: number[]): Promise<number[]> {
    try {
      const r = await this.transport.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds })
      return r.nodeIds
    } catch (error: any) {
      if (!String(error?.message || '').includes('Document needs to be requested first')) {
        throw error
      }
      await this.getDocument()
      const r = await this.transport.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds })
      return r.nodeIds
    }
  }

  async getComputedStyleForNode(nodeId: number): Promise<any> {
    return this.transport.send('CSS.getComputedStyleForNode', { nodeId })
  }

  async getMatchedStylesForNode(nodeId: number): Promise<any> {
    return this.transport.send('CSS.getMatchedStylesForNode', { nodeId })
  }

  async getInlineStylesForNode(nodeId: number): Promise<any> {
    return this.transport.send('CSS.getInlineStylesForNode', { nodeId })
  }

  async resolveNode(nodeId: number): Promise<string> {
    const result = await this.transport.send('DOM.resolveNode', { nodeId })
    const objectId = result.object?.objectId
    if (!objectId) {
      throw new Error(`Failed to resolve node: ${nodeId}`)
    }
    return objectId
  }

  async requestNode(objectId: string): Promise<number> {
    const result = await this.transport.send('DOM.requestNode', { objectId })
    return result.nodeId
  }

  async evaluate(expression: string, returnByValue: boolean = false): Promise<any> {
    return this.transport.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue,
      objectGroup: 'visual-inspector'
    })
  }

  async addBinding(name: string): Promise<void> {
    try {
      await this.transport.send('Runtime.addBinding', { name })
    } catch (error: any) {
      if (!String(error?.message || '').includes('already exists')) {
        throw error
      }
    }
  }

  async callFunctionOn(objectId: string, functionDeclaration: string, args: any[] = []): Promise<any> {
    return this.transport.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
    })
  }

  async releaseObject(objectId: string): Promise<void> {
    await this.transport.send('Runtime.releaseObject', { objectId })
  }

  private async setStylePropertyRuntime(nodeId: number, propertyName: string, propertyValue: string): Promise<void> {
    const objectId = await this.resolveNode(nodeId)
    try {
      await this.callFunctionOn(
        objectId,
        `function(propertyName, propertyValue) {
          if (!this || !this.style) return false;
          if (propertyValue == null || propertyValue === '') {
            this.style.removeProperty(propertyName);
          } else {
            this.style.setProperty(propertyName, propertyValue);
          }
          return true;
        }`,
        [propertyName, propertyValue]
      )
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async setStyleProperty(nodeId: number, propertyName: string, propertyValue: string): Promise<void> {
    await this.setStyleProperties(nodeId, { [propertyName]: propertyValue })
  }

  async setStyleProperties(nodeId: number, stylePatch: Record<string, string>): Promise<void> {
    try {
      let inlineStyles = await this.getInlineStylesForNode(nodeId)
      let inlineStyle = inlineStyles.inlineStyle

      if (!inlineStyle?.styleSheetId || !inlineStyle?.range) {
        try {
          await this.transport.send('DOM.setAttributeValue', {
            nodeId,
            name: 'style',
            value: inlineStyle?.cssText || '',
          })
        } catch {
          await this.setAttribute(nodeId, 'style', inlineStyle?.cssText || '')
        }

        inlineStyles = await this.getInlineStylesForNode(nodeId)
        inlineStyle = inlineStyles.inlineStyle
      }

      if (!inlineStyle?.styleSheetId || !inlineStyle?.range) {
        await Promise.all(
          Object.entries(stylePatch).map(([propertyName, propertyValue]) =>
            this.setStylePropertyRuntime(nodeId, propertyName, propertyValue)
          )
        )
        return
      }

      const nextCssText = mergeInlineStyleText(inlineStyle.cssText || '', {
        ...stylePatch,
      })

      await this.transport.send('CSS.setStyleTexts', {
        edits: [{
          styleSheetId: inlineStyle.styleSheetId,
          range: inlineStyle.range,
          text: nextCssText,
        }],
      })
    } catch (error) {
      console.warn('CSS.setStyleTexts failed for style patch, falling back to runtime style mutation.', error)
      await Promise.all(
        Object.entries(stylePatch).map(([propertyName, propertyValue]) =>
          this.setStylePropertyRuntime(nodeId, propertyName, propertyValue)
        )
      )
    }
  }

  async getTextContent(nodeId: number): Promise<string> {
    const objectId = await this.resolveNode(nodeId)
    try {
      const result = await this.callFunctionOn(
        objectId,
        `function() {
          return (this?.textContent || '').trim();
        }`
      )
      return String(result.result?.value || '')
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async setTextContent(nodeId: number, textContent: string): Promise<void> {
    const objectId = await this.resolveNode(nodeId)
    try {
      await this.callFunctionOn(
        objectId,
        `function(textContent) {
          if (!this) return false;
          this.textContent = textContent;
          return true;
        }`,
        [textContent]
      )
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async setAttribute(nodeId: number, attributeName: string, attributeValue: string): Promise<void> {
    const objectId = await this.resolveNode(nodeId)
    try {
      await this.callFunctionOn(
        objectId,
        `function(attributeName, attributeValue) {
          if (!this || typeof this.setAttribute !== 'function') return false;
          if (attributeValue == null || attributeValue === '') {
            this.removeAttribute(attributeName);
          } else {
            this.setAttribute(attributeName, attributeValue);
          }
          return true;
        }`,
        [attributeName, attributeValue]
      )
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }

  async captureScreenshot(): Promise<{
    data: string
    viewport: { x: number; y: number; width: number; height: number }
  }> {
    const metrics = await this.transport.send('Page.getLayoutMetrics')
    const viewport = metrics.cssVisualViewport
      || metrics.visualViewport
      || metrics.cssLayoutViewport
      || metrics.layoutViewport

    const clip = viewport
      ? {
          x: Math.max(0, viewport.pageX ?? viewport.x ?? 0),
          y: Math.max(0, viewport.pageY ?? viewport.y ?? 0),
          width: Math.max(1, viewport.clientWidth ?? viewport.width ?? 1),
          height: Math.max(1, viewport.clientHeight ?? viewport.height ?? 1),
          scale: 1,
        }
      : undefined

    const result = await this.transport.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      optimizeForSpeed: true,
      ...(clip ? { clip } : {}),
    })

    if (!result.data) {
      throw new Error('Failed to capture screenshot')
    }

    return {
      data: result.data,
      viewport: {
        x: clip?.x ?? 0,
        y: clip?.y ?? 0,
        width: clip?.width ?? 0,
        height: clip?.height ?? 0,
      },
    }
  }

  async getSelectedNodeReferenceFromToken(token: string): Promise<SelectedNodeReference> {
    const result = await this.evaluate(`window.${ELEMENT_PICKER_STATE}?.consume?.(${JSON.stringify(token)})`)
    const objectId = result.result?.objectId
    if (!objectId) {
      return { nodeId: null, backendNodeId: null }
    }

    try {
      const described = await this.describeNodeByObjectId(objectId)
      const backendNodeId = described.node?.backendNodeId || null
      let nodeId = described.node?.nodeId || null

      if ((!nodeId || nodeId === 0) && backendNodeId) {
        const pushed = await this.pushNodesByBackendIdsToFrontend([backendNodeId])
        nodeId = pushed[0] || null
      }

      return { nodeId, backendNodeId }
    } finally {
      try {
        await this.releaseObject(objectId)
      } catch {
        // ignore release errors
      }
    }
  }
}
