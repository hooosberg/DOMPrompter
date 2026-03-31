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
const ELEMENT_PICKER_BINDING = '__visualInspectorSelect'
const ELEMENT_PICKER_STATE = '__visualInspectorPicker'
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
    const doc = document;
    const win = window;

    if (!doc || !doc.documentElement) return false;

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

      const buildNoteTitle = (note) => {
        const targets = Array.isArray(note?.targets) ? note.targets : [];
        if (!targets.length) return 'UNTITLED';
        return targets.slice(0, 3).map((target) => String(target.selector || 'untitled').toUpperCase()).join(' · ');
      };

      const estimateNoteSize = (note) => {
        const title = buildNoteTitle(note);
        const lines = String(note?.text || '').split(/\\n+/).filter(Boolean);
        const longestLine = Math.max(title.length, ...lines.map((line) => line.length), 12);
        const lineCount = Math.max(1, lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 20)), 0));
        return {
          width: Math.min(260, Math.max(176, longestLine * 7.2 + 34)),
          height: Math.min(172, 58 + lineCount * 18),
        };
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

      const buildConnectorPath = (start, end) => {
        const deltaX = end.x - start.x;
        const handle = clamp(Math.abs(deltaX) * 0.42, 22, 88);
        const direction = deltaX >= 0 ? 1 : -1;
        return 'M ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2)
          + ' C ' + (start.x + handle * direction).toFixed(2) + ' ' + start.y.toFixed(2)
          + ', ' + (end.x - handle * direction).toFixed(2) + ' ' + end.y.toFixed(2)
          + ', ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2);
      };

      const makeNoteFrame = () => {
        const node = doc.createElement('div');
        node.style.cssText = [
          'position:fixed',
          'left:0',
          'top:0',
          'width:0',
          'height:0',
          'border-radius:18px',
          'pointer-events:none',
          'display:none',
          'z-index:2147483644'
        ].join(';');
        return node;
      };

      const makeNoteCard = () => {
        const node = doc.createElement('div');
        node.style.cssText = [
          'position:fixed',
          'left:0',
          'top:0',
          'display:none',
          'flex-direction:column',
          'gap:6px',
          'max-width:260px',
          'padding:12px 13px 11px',
          'border-radius:16px',
          'background:linear-gradient(180deg,#ffd96a 0 24px,#fff3b8 24px 100%)',
          'border:1px solid #c99619',
          'box-shadow:0 22px 44px rgba(77,52,6,0.24),0 10px 18px rgba(15,23,42,0.14),inset 0 1px 0 rgba(255,255,255,0.68)',
          'pointer-events:auto',
          'cursor:pointer',
          'opacity:1',
          'isolation:isolate',
          'z-index:2147483647',
          'mix-blend-mode:normal',
          'backdrop-filter:none',
          '-webkit-backdrop-filter:none',
          'transform-origin:top left',
          'transition:opacity 160ms ease,box-shadow 160ms ease,border-color 160ms ease,transform 160ms ease'
        ].join(';');

        const title = doc.createElement('span');
        title.style.cssText = [
          'font-size:11px',
          'text-transform:uppercase',
          'letter-spacing:0.08em',
          'color:#7b4d00',
          'font-weight:700',
          'text-shadow:0 1px 0 rgba(255,248,214,0.55)',
          'padding-right:18px',
          'display:block'
        ].join(';');

        const body = doc.createElement('span');
        body.style.cssText = [
          'font-size:12px',
          'line-height:1.6',
          'color:#3e2b07',
          'word-break:break-word',
          'text-shadow:0 1px 0 rgba(255,248,214,0.3)',
          'display:block'
        ].join(';');

        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.style.cssText = [
          'position:absolute',
          'top:8px',
          'right:8px',
          'width:18px',
          'height:18px',
          'background:transparent',
          'border:none',
          'color:#7b4d00',
          'font-size:14px',
          'line-height:1',
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'cursor:pointer'
        ].join(';');
        remove.dataset.viNoteDelete = 'true';

        const endpoints = doc.createElement('div');
        endpoints.style.cssText = [
          'position:absolute',
          'left:0',
          'top:0',
          'width:100%',
          'height:100%',
          'pointer-events:none'
        ].join(';');

        node.appendChild(endpoints);
        node.appendChild(remove);
        node.appendChild(title);
        node.appendChild(body);

        node.__viTitle = title;
        node.__viBody = body;
        node.__viDelete = remove;
        node.__viEndpoints = endpoints;
        return node;
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

      const noteFrameLayer = doc.createElement('div');
      noteFrameLayer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:100vw',
        'height:100vh',
        'pointer-events:none',
        'z-index:2147483642'
      ].join(';');
      noteFrameLayer.dataset.viOverlayRoot = 'true';

      const noteConnectorLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      noteConnectorLayer.setAttribute('width', '100%');
      noteConnectorLayer.setAttribute('height', '100%');
      noteConnectorLayer.setAttribute('viewBox', '0 0 ' + win.innerWidth + ' ' + win.innerHeight);
      noteConnectorLayer.setAttribute('data-vi-overlay-root', 'true');
      noteConnectorLayer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:100vw',
        'height:100vh',
        'pointer-events:none',
        'z-index:2147483645',
        'overflow:visible'
      ].join(';');

      const noteCardLayer = doc.createElement('div');
      noteCardLayer.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:100vw',
        'height:100vh',
        'pointer-events:none',
        'z-index:2147483647'
      ].join(';');
      noteCardLayer.dataset.viOverlayRoot = 'true';

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

      const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      const HANDLE_CURSORS = {
        nw: 'nwse-resize',
        n: 'ns-resize',
        ne: 'nesw-resize',
        e: 'ew-resize',
        se: 'nwse-resize',
        s: 'ns-resize',
        sw: 'nesw-resize',
        w: 'ew-resize',
      };

      const makeHandle = (dir) => {
        const handle = doc.createElement('div');
        handle.dataset.viHandle = dir;
        handle.style.cssText = [
          'position:absolute',
          'width:8px',
          'height:8px',
          'border-radius:999px',
          'background:#fff',
          'border:1.5px solid #0d99ff',
          'box-shadow:0 2px 6px rgba(13,24,40,0.1)',
          'display:none',
          'pointer-events:auto',
          'cursor:' + HANDLE_CURSORS[dir]
        ].join(';');
        return handle;
      };

      const handles = HANDLE_DIRS.map((dir) => makeHandle(dir));
      for (const handle of handles) overlay.appendChild(handle);
      overlay.appendChild(label);
      marginBands.forEach((node) => doc.documentElement.appendChild(node));
      paddingBands.forEach((node) => doc.documentElement.appendChild(node));
      Object.values(guideBadges).forEach((node) => doc.documentElement.appendChild(node));
      gapBadges.forEach((node) => doc.documentElement.appendChild(node));
      doc.documentElement.appendChild(typographyGuide);
      doc.documentElement.appendChild(noteFrameLayer);
      doc.documentElement.appendChild(noteConnectorLayer);
      doc.documentElement.appendChild(noteCardLayer);
      doc.documentElement.appendChild(skeletonLayer);
      doc.documentElement.appendChild(overlay);

      const state = {
        active: false,
        locked: false,
        tool: 'select',
        activeProperty: null,
        overlayState: {
          tool: 'select',
          activeNoteId: null,
          draftNoteTargets: [],
          draftNoteText: '',
          notes: [],
        },
        rafId: 0,
        commitTimer: 0,
        overlay,
        label,
        marginBands,
        paddingBands,
        guideBadges,
        gapBadges,
        typographyGuide,
        skeletonLayer,
        noteFrameLayer,
        noteConnectorLayer,
        noteCardLayer,
        skeletonNodes: [],
        noteFrameNodes: [],
        noteCardNodes: [],
        childRects: [],
        handles,
        current: null,
        hoverStack: [],
        selectionCycle: null,
        selections: {},
        resizing: null,
        noteDragging: null,
        updateHandles(width, height) {
          const positions = [
            ['-5px', '-5px'],
            [width / 2 - 4 + 'px', '-5px'],
            [width - 3 + 'px', '-5px'],
            [width - 3 + 'px', height / 2 - 4 + 'px'],
            [width - 3 + 'px', height - 3 + 'px'],
            [width / 2 - 4 + 'px', height - 3 + 'px'],
            ['-5px', height - 3 + 'px'],
            ['-5px', height / 2 - 4 + 'px']
          ];
          this.handles.forEach((handle, index) => {
            handle.style.left = positions[index][0];
            handle.style.top = positions[index][1];
          });
        },
        setHandlesVisible(visible) {
          for (const handle of this.handles) {
            handle.style.display = visible ? 'block' : 'none';
          }
        },
        setNoteFrameCount(count) {
          while (this.noteFrameNodes.length < count) {
            const node = makeNoteFrame();
            this.noteFrameLayer.appendChild(node);
            this.noteFrameNodes.push(node);
          }
        },
        setNoteCardCount(count) {
          while (this.noteCardNodes.length < count) {
            const card = makeNoteCard();
            card.addEventListener('click', (event) => {
              event.stopPropagation();
              const noteId = card.dataset.viNoteId;
              if (!noteId) return;
              if ((event.target instanceof Element) && event.target.closest('[data-vi-note-delete]')) {
                if (typeof win[binding] === 'function') {
                  win[binding](JSON.stringify({ type: 'note-delete', noteId }));
                }
                return;
              }
              if (typeof win[binding] === 'function') {
                win[binding](JSON.stringify({ type: 'note-select', noteId }));
              }
            }, true);
            card.addEventListener('pointerdown', (event) => {
              if ((event.target instanceof Element) && event.target.closest('[data-vi-note-delete]')) return;
              const noteId = card.dataset.viNoteId;
              if (!noteId) return;
              this.noteDragging = { noteId, startX: event.clientX, startY: event.clientY };
              event.stopPropagation();
            }, true);
            this.noteCardLayer.appendChild(card);
            this.noteCardNodes.push(card);
          }
        },
        setNoteFrameStyle(node, active) {
          node.style.border = '1.5px solid ' + (active ? 'rgba(255,196,48,0.82)' : 'rgba(255,196,48,0.34)');
          node.style.background = active ? 'rgba(255,232,138,0.11)' : 'rgba(255,232,138,0.035)';
          node.style.boxShadow = active
            ? 'inset 0 0 0 1px rgba(255,245,199,0.24),0 0 0 1px rgba(255,196,48,0.22),0 8px 24px rgba(255,196,48,0.08)'
            : 'none';
        },
        shouldShowLockedOverlay() {
          if (this.tool !== 'note') return true;
          const hasFrames = (this.overlayState.notes || []).length > 0 || (this.overlayState.draftNoteTargets || []).length > 0;
          return !hasFrames;
        },
        setTool(tool) {
          this.tool = tool || 'select';
          this.overlayState.tool = this.tool;
          if (this.tool === 'browse') {
            this.hide();
            this.renderNotes();
            return;
          }
          this.sync();
          this.renderNotes();
        },
        setOverlayState(payload) {
          this.overlayState = {
            tool: payload?.tool || this.tool || 'select',
            activeNoteId: payload?.activeNoteId || null,
            draftNoteTargets: Array.isArray(payload?.draftNoteTargets) ? payload.draftNoteTargets : [],
            draftNoteText: String(payload?.draftNoteText || ''),
            notes: Array.isArray(payload?.notes) ? payload.notes : [],
          };
          this.tool = this.overlayState.tool;
          this.renderNotes();
          this.sync();
        },
        renderNotes() {
          const showNotes = this.tool === 'note';
          this.noteConnectorLayer.setAttribute('viewBox', '0 0 ' + win.innerWidth + ' ' + win.innerHeight);
          while (this.noteConnectorLayer.firstChild) {
            this.noteConnectorLayer.removeChild(this.noteConnectorLayer.firstChild);
          }

          if (!showNotes) {
            this.noteFrameNodes.forEach((node) => { node.style.display = 'none'; });
            this.noteCardNodes.forEach((node) => { node.style.display = 'none'; });
            return;
          }

          const persistedFrames = [];
          (this.overlayState.notes || []).forEach((note) => {
            (note.targets || []).forEach((target) => {
              const box = normalizeBox(target.boxModel);
              if (!box || !box.width || !box.height) return;
              persistedFrames.push({
                rect: box,
                active: note.id === this.overlayState.activeNoteId,
              });
            });
          });

          const draftFrames = !this.overlayState.activeNoteId
            ? (this.overlayState.draftNoteTargets || []).map((target) => {
                const box = normalizeBox(target.boxModel);
                if (!box || !box.width || !box.height) return null;
                return { rect: box, active: true };
              }).filter(Boolean)
            : [];

          const visibleFrames = persistedFrames.concat(draftFrames);
          this.setNoteFrameCount(visibleFrames.length);
          this.noteFrameNodes.forEach((node, index) => {
            const frame = visibleFrames[index];
            if (!frame) {
              node.style.display = 'none';
              return;
            }
            paintRect(node, frame.rect, true);
            this.setNoteFrameStyle(node, frame.active);
          });

          const notes = [...(this.overlayState.notes || [])];
          if (!this.overlayState.activeNoteId && (this.overlayState.draftNoteTargets || []).length > 0) {
            notes.unshift({
              id: '__draft__',
              text: this.overlayState.draftNoteText || '',
              targets: this.overlayState.draftNoteTargets,
              offsetX: 0,
              offsetY: 0,
            });
          }
          this.setNoteCardCount(notes.length);
          this.noteCardNodes.forEach((node, index) => {
            const note = notes[index];
            if (!note) {
              node.style.display = 'none';
              return;
            }

            const isDraftNote = note.id === '__draft__';
            const noteIsActive = isDraftNote ? !this.overlayState.activeNoteId : note.id === this.overlayState.activeNoteId;

            const targetRects = (note.targets || [])
              .map((target) => normalizeBox(target.boxModel))
              .filter((box) => box && box.width > 0 && box.height > 0);

            if (!targetRects.length) {
              node.style.display = 'none';
              return;
            }

            const primaryRect = targetRects[0];
            const size = estimateNoteSize(note);
            const rawX = primaryRect.x + primaryRect.width + 36 + (Number(note.offsetX) || 0);
            const rawY = primaryRect.y - 18 + (Number(note.offsetY) || 0);
            const chipX = clamp(rawX, 12, Math.max(12, win.innerWidth - size.width - 12));
            const chipY = clamp(rawY, 12, Math.max(12, win.innerHeight - size.height - 12));
            const endpointCount = targetRects.length;
            const endpointGap = endpointCount <= 1
              ? 0
              : Math.max(18, Math.min(34, Math.max(0, size.height - 36) / Math.max(1, endpointCount - 1)));
            const chipCenterX = chipX + size.width / 2;
            const averageTargetCenterX = targetRects.reduce((sum, rect) => sum + rect.x + rect.width / 2, 0) / targetRects.length;
            const endpointX = averageTargetCenterX <= chipCenterX ? 0 : size.width;
            const endpoints = targetRects.map((_, targetIndex) => ({
              x: endpointX,
              y: clamp(18 + targetIndex * endpointGap, 18, size.height - 18),
            }));

            node.dataset.viNoteId = isDraftNote ? '' : note.id;
            node.style.display = 'inline-flex';
            node.style.left = chipX + 'px';
            node.style.top = chipY + 'px';
            node.style.width = size.width + 'px';
            node.style.minHeight = size.height + 'px';
            node.style.pointerEvents = isDraftNote ? 'none' : 'auto';
            node.style.opacity = noteIsActive ? '1' : '0.56';
            node.style.borderColor = noteIsActive ? '#9d6a0b' : '#c99619';
            node.style.boxShadow = noteIsActive
              ? '0 24px 52px rgba(77,52,6,0.28),0 10px 20px rgba(15,23,42,0.16),0 0 0 1px rgba(157,106,11,0.22)'
              : '0 14px 28px rgba(77,52,6,0.14),0 6px 12px rgba(15,23,42,0.08),inset 0 1px 0 rgba(255,255,255,0.52)';
            node.__viTitle.textContent = buildNoteTitle(note);
            node.__viBody.textContent = String(note.text || (isDraftNote ? '开始输入后会创建一张标签卡。' : ''));
            node.__viDelete.style.display = isDraftNote ? 'none' : 'inline-flex';

            while (node.__viEndpoints.firstChild) {
              node.__viEndpoints.removeChild(node.__viEndpoints.firstChild);
            }

            endpoints.forEach((endpoint) => {
              const dot = doc.createElement('span');
              dot.style.cssText = [
                'position:absolute',
                'left:0',
                'top:0',
                'width:12px',
                'height:12px',
                'border-radius:999px',
                'background:#ffd86d',
                'border:2px solid #9d6a0b',
                'box-shadow:0 0 0 3px rgba(255,239,176,0.22),0 2px 6px rgba(77,52,6,0.16)',
                'transform:translate(' + endpoint.x + 'px,' + endpoint.y + 'px) translate(-50%,-50%)'
              ].join(';');
              node.__viEndpoints.appendChild(dot);
            });

            targetRects.forEach((rect, targetIndex) => {
              const targetCenterX = rect.x + rect.width / 2;
              const anchorX = chipCenterX >= targetCenterX ? rect.x + rect.width : rect.x;
              const anchor = {
                x: anchorX,
                y: rect.y + rect.height / 2,
              };
              const endpoint = {
                x: chipX + endpoints[targetIndex].x,
                y: chipY + endpoints[targetIndex].y,
              };
              const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
              path.setAttribute('d', buildConnectorPath(anchor, endpoint));
              path.setAttribute('fill', 'none');
              path.setAttribute('stroke', '#b5760d');
              path.setAttribute('stroke-width', '2.5');
              path.setAttribute('stroke-linecap', 'round');
              path.setAttribute('stroke-linejoin', 'round');
              path.style.opacity = noteIsActive ? '0.98' : '0.34';
              this.noteConnectorLayer.appendChild(path);

              const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('cx', String(anchor.x));
              circle.setAttribute('cy', String(anchor.y));
              circle.setAttribute('r', '5');
              circle.setAttribute('fill', '#ffd86d');
              circle.setAttribute('stroke', '#9d6a0b');
              circle.setAttribute('stroke-width', '1.5');
              circle.style.opacity = noteIsActive ? '0.98' : '0.34';
              this.noteConnectorLayer.appendChild(circle);
            });
          });
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
        scheduleResizeCommit(target, styles) {
          win.clearTimeout(this.commitTimer);
          this.commitTimer = win.setTimeout(() => {
            this.emitPayload(target, { type: 'resize', styles });
          }, 50);
        },
        update(target, selected = false) {
          if (!(target instanceof Element)) return this.hide();
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
          this.updateHandles(borderRect.width, borderRect.height);
          this.setHandlesVisible(selected && showSelectionProxy);
          this.renderActiveAssist(metrics, selected);
          this.updateSkeletons(target, selected, this.activeProperty === 'gap');
          this.renderNotes();
        },
        hide() {
          this.current = null;
          this.locked = false;
          this.hoverStack = [];
          this.selectionCycle = null;
          this.resizing = null;
          this.overlay.style.display = 'none';
          this.label.style.display = 'none';
          this.marginBands.forEach((node) => { node.style.display = 'none'; });
          this.paddingBands.forEach((node) => { node.style.display = 'none'; });
          this.typographyGuide.style.display = 'none';
          this.hideBadges();
          this.skeletonNodes.forEach((node) => { node.style.display = 'none'; });
          this.setHandlesVisible(false);
          this.renderNotes();
        },
        move(event) {
          if (!this.active) return;
          if (this.locked) return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target || target === this.overlay || this.overlay.contains(target) || this.noteCardLayer.contains(target)) return;
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
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          if (target.dataset?.viHandle || this.noteCardLayer.contains(target)) return;
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
          if (state.active && state.current) state.update(state.current, state.locked);
          state.renderNotes();
        },
        setActiveProperty(property) {
          this.activeProperty = property || null;
          this.sync();
        },
        pointerdown(event) {
          const handle = event.target instanceof Element ? event.target.closest('[data-vi-handle]') : null;
          if (!handle || !state.locked || !(state.current instanceof Element)) return;

          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }

          const dir = handle.getAttribute('data-vi-handle');
          const rect = state.current.getBoundingClientRect();
          state.resizing = {
            target: state.current,
            dir,
            startX: event.clientX,
            startY: event.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
          };

          doc.addEventListener('pointermove', state.pointermove, true);
          doc.addEventListener('pointerup', state.pointerup, true);
        },
        pointermove(event) {
          if (!state.resizing) return;

          const { target, dir, startX, startY, startWidth, startHeight } = state.resizing;
          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          let nextWidth = startWidth;
          let nextHeight = startHeight;

          if (dir.includes('e')) nextWidth = startWidth + deltaX;
          if (dir.includes('w')) nextWidth = startWidth - deltaX;
          if (dir.includes('s')) nextHeight = startHeight + deltaY;
          if (dir.includes('n')) nextHeight = startHeight - deltaY;

          nextWidth = Math.max(12, Math.round(nextWidth));
          nextHeight = Math.max(12, Math.round(nextHeight));

          target.style.setProperty('width', nextWidth + 'px');
          target.style.setProperty('height', nextHeight + 'px');

          state.update(target, true);
          state.scheduleResizeCommit(target, {
            width: nextWidth + 'px',
            height: nextHeight + 'px',
          });
        },
        pointerup() {
          if (!state.resizing) return;
          state.resizing = null;
          doc.removeEventListener('pointermove', state.pointermove, true);
          doc.removeEventListener('pointerup', state.pointerup, true);
        },
        notePointerMove(event) {
          if (!state.noteDragging) return;
          const deltaX = event.clientX - state.noteDragging.startX;
          const deltaY = event.clientY - state.noteDragging.startY;
          if (typeof win[binding] === 'function') {
            win[binding](JSON.stringify({
              type: 'note-move',
              noteId: state.noteDragging.noteId,
              deltaX,
              deltaY,
            }));
          }
          state.noteDragging = {
            noteId: state.noteDragging.noteId,
            startX: event.clientX,
            startY: event.clientY,
          };
        },
        notePointerUp() {
          state.noteDragging = null;
        },
        tick() {
          if (!state.active) return;
          if (state.current) state.update(state.current, state.locked);
          state.rafId = win.requestAnimationFrame(state.tick);
        },
        keydown(event) {
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
          doc.addEventListener('pointerdown', this.pointerdown, true);
          doc.addEventListener('pointermove', this.notePointerMove, true);
          doc.addEventListener('pointerup', this.notePointerUp, true);
          win.addEventListener('scroll', this.sync, true);
          win.addEventListener('resize', this.sync, true);
          doc.addEventListener('keydown', this.keydown, true);
          this.rafId = win.requestAnimationFrame(this.tick);
          this.renderNotes();
        },
        disable() {
          if (!this.active) {
            this.hide();
            return;
          }
          this.active = false;
          doc.removeEventListener('mousemove', this.move, true);
          doc.removeEventListener('click', this.click, true);
          doc.removeEventListener('pointerdown', this.pointerdown, true);
          doc.removeEventListener('pointermove', this.pointermove, true);
          doc.removeEventListener('pointerup', this.pointerup, true);
          doc.removeEventListener('pointermove', this.notePointerMove, true);
          doc.removeEventListener('pointerup', this.notePointerUp, true);
          win.removeEventListener('scroll', this.sync, true);
          win.removeEventListener('resize', this.sync, true);
          doc.removeEventListener('keydown', this.keydown, true);
          win.clearTimeout(this.commitTimer);
          this.commitTimer = 0;
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
      state.pointerdown = state.pointerdown.bind(state);
      state.pointermove = state.pointermove.bind(state);
      state.pointerup = state.pointerup.bind(state);
      state.notePointerMove = state.notePointerMove.bind(state);
      state.notePointerUp = state.notePointerUp.bind(state);
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
