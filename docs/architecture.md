# Visual Inspector - Architecture & Core Design

## Overview

Visual Inspector is an Electron-based development tool for visually inspecting and fine-tuning CSS/DOM properties of Chrome-based applications (web pages and Electron apps). It connects to target applications via Chrome DevTools Protocol (CDP) and provides a real-time property editing interface.

## Monorepo Structure

```
visual-inspector/
├── packages/
│   ├── core/           # CDP client, InspectorService, app discovery, code generation
│   │   └── src/
│   │       ├── cdp/connection.ts      # CDPClient, CDPHelper, ICDPTransport interface
│   │       ├── inspector-service.ts   # DOM inspection, element selection, overlay, style editing
│   │       ├── app-discovery.ts       # Local dev server and Electron app discovery
│   │       └── codeGenerator.ts       # CSS/AI prompt generation from inspected elements
│   └── app/            # Electron application (main + renderer)
│       ├── electron/
│       │   ├── main.ts               # Main process: window management, IPC handlers, project launch
│       │   └── preload.ts            # IPC bridge (contextBridge → electronAPI)
│       └── src/
│           ├── App.tsx               # Root React component, state management, UI orchestration
│           ├── App.css               # All layout and component styles
│           ├── types.ts              # Shared TypeScript type definitions
│           ├── components/
│           │   ├── WelcomeScreen.tsx          # Project selection and launch entry point
│           │   ├── overlay/OverlayInspector.tsx  # Canvas overlay for element selection & notes
│           │   └── properties/
│           │       ├── PropertiesWorkbench.tsx    # Right panel: CSS property editor
│           │       └── FieldControl.tsx           # Individual property input widget
│           └── hooks/
│               ├── useAdaptiveWindowPreset.ts    # Auto-switch window size by mode
│               └── useStyleBinding.ts            # Bind element styles to property controls
├── pnpm-workspace.yaml
└── package.json
```

## Two Debugging Modes

### Mode A: Builtin (Web)

For inspecting web pages running in a local dev server.

**Flow:**
1. User selects project directory
2. Main process detects `dev` / `start` script in `package.json`
3. Spawns `npm/pnpm/yarn run dev` as child process
4. Waits for dev server URL (parses stdout or polls common ports)
5. Loads URL into Electron BrowserView (embedded browser)
6. Attaches debugger via Electron's built-in `webContents.debugger` API
7. Wraps it as `ICDPTransport` (ElectronDebuggerTransport adapter)
8. Passes to `InspectorService` for DOM inspection

**UI Layout:**
- Left: Live page preview (BrowserView) or mirror canvas with overlay
- Right: Properties panel (320px)
- Window: Normal size (1200x800)

### Mode B: External (Desktop / Electron)

For inspecting Electron desktop applications via remote CDP.

**Flow:**
1. User selects project directory
2. Main process detects `electron:dev` / `electron:inspect` script
3. Spawns target Electron app with `--remote-debugging-port=9222` injected via:
   - `ELECTRON_EXTRA_LAUNCH_ARGS` environment variable
   - `VI_REMOTE_DEBUGGING_PORT` environment variable
4. Discovers CDP endpoint by:
   - Parsing `DevTools listening on ws://...` from process stdout
   - Polling `http://127.0.0.1:9222/json/list` for page targets
   - Racing both strategies (`waitForCDPWithOutputRace`)
5. Resolves browser-level target to page-level target (`resolvePageTargetUrl`)
6. Connects via WebSocket (`CDPClient`) and initializes `InspectorService`

**UI Layout:**
- Canvas is hidden (target app IS the canvas)
- Window auto-resizes to floating sidebar (380px, always-on-top)
- Only the properties panel is visible
- Inspector overlay is injected into the target app via CDP

## Core Components

### CDPClient (`packages/core/src/cdp/connection.ts`)

Low-level Chrome DevTools Protocol client over WebSocket.

- `connect(wsUrl)` - Establish WebSocket connection
- `send(method, params)` - Send CDP command, return promise
- `on(event, callback)` - Listen for CDP events
- `disconnect()` - Close connection

### ICDPTransport (Interface)

Abstract transport layer that both `CDPClient` (WebSocket) and `ElectronDebuggerTransport` (Electron debugger API) implement. This allows `InspectorService` to work with both modes transparently.

```typescript
interface ICDPTransport {
  send(method: string, params?: any): Promise<any>
  on(event: string, callback: Function): void
  disconnect(): void
}
```

### InspectorService (`packages/core/src/inspector-service.ts`)

High-level inspection API built on top of `ICDPTransport`.

Key capabilities:
- `initialize()` - Enable DOM, CSS, Overlay, Runtime, Page domains
- `startInspecting()` / `stopInspecting()` - Toggle element picker
- `getElementAtPoint(x, y)` - Inspect element at coordinates
- `getElementStackAtPoint(x, y)` - Get element hierarchy at point
- `updateElementStyle(nodeId, name, value)` - Live CSS editing
- `capturePreview()` - Screenshot via CDP
- `setExternalOverlayState(state)` - Sync overlay to external app
- Events: `onElementSelected`, `onOverlayAction`

Returns `InspectedElement` with:
- Tag name, classes, ID, attributes
- Box model (margin, border, padding, content rects)
- Computed styles + CSS variables
- Text content preview
- Descendant hierarchy

### ElectronDebuggerTransport (`packages/app/electron/main.ts`)

Adapter that wraps Electron's `webContents.debugger` API as `ICDPTransport`. Used in builtin mode so `InspectorService` can treat both modes identically.

### Project Launch System (`packages/app/electron/main.ts`)

Handles the full lifecycle of launching and connecting to target projects.

**Key functions:**
- `detectProjectCommands(dir)` - Read `package.json` scripts, detect package manager
- `resolveProjectElectronLaunch(dir)` - Find Electron binary and main entry for direct launch
- `buildChildProcessEnv(overrides)` - Clean env for child processes
- `waitForCDP(host, port, timeout)` - Poll `/json/list` for page targets
- `waitForCDPFromOutput(process, host, port, timeout)` - Parse CDP URL from process stdout
- `waitForCDPWithOutputRace(...)` - Race both strategies
- `resolvePageTargetUrl(cdpUrl)` - Convert browser-level target to page target
- `connectExternalInspector(cdpUrl)` - Connect CDP with retry logic

**Status lifecycle:**
```
idle → project-selected → launching → starting-web/starting-electron
  → waiting-web/waiting-cdp → ready → (auto-connect) → connected
  → error/stopped/exited
```

## IPC Communication

All renderer ↔ main process communication goes through Electron IPC, exposed via `preload.ts` as `window.electronAPI`.

**Categories:**
- **Builtin mode:** `loadUrl`, `attachDebugger`, `capturePreview`, `setBuiltinViewInteractive`
- **External mode:** `discoverCDPUrl`, `connectCDP`, `startInspect`, `stopInspect`
- **Project launch:** `selectProjectDirectory`, `launchProjectSession`, `stopProjectSession`
- **Element inspection:** `inspectElementAtPoint`, `inspectElementStackAtPoint`, `inspectElementByBackendId`
- **Style editing:** `updateElementStyle`, `updateElementStyles`, `updateTextContent`, `updateElementAttribute`
- **Overlay sync:** `setActiveEditProperty`, `setExternalOverlayState`
- **Window management:** `resizeWindowToSidebar`, `restoreWindowSize`
- **Code generation:** `generateAIPrompt`, `generateCSS`, `generateCSSVariables`
- **Events (main → renderer):** `element-selected`, `overlay-action`, `browser-view-loaded`, `launch-status`, `auto-connected`

## UI Architecture (Renderer)

### App.tsx - State Management

Core state (25+ hooks):
- `mode`: `'builtin' | 'external'` - Current debugging mode
- `connected`: Whether inspector is active
- `element`: Currently inspected `InspectedElement`
- `activeTool`: `'select' | 'note' | 'browse'` - Current interaction mode
- `projectSession`: `ProjectLaunchStatus` - Launch lifecycle state
- `notes`: `ElementNote[]` - User annotations on elements
- `activeEditProperty`: Which CSS property is being highlighted

### WelcomeScreen

Displayed when not connected. Handles:
1. Project directory selection
2. Auto-detection of capabilities (web/desktop/both)
3. Mode selection (auto if only one capability, chooser if both)
4. Launch button → triggers `launchProjectSession` IPC

### Window Adaptive Behavior

`useAdaptiveWindowPreset` hook watches `(mode, connected)`:
- `external + connected` → sidebar preset (380px, always-on-top, floating)
- Otherwise → default preset (1200x800, normal window)

Triggers `resizeWindowToSidebar()` or `restoreWindowSize()` IPC calls.

## Critical Design Decisions & Lessons Learned

### 1. Environment Variable Isolation for Child Processes

**Problem:** When Visual Inspector is launched via `pnpm → vite → vite-plugin-electron`, the process inherits `npm_*` environment variables. Child processes spawned to run target projects inherit these, causing `pnpm` in child processes to misidentify the workspace and run the wrong scripts.

**Solution:** `buildChildProcessEnv()` filters ALL `npm_*` and `INIT_CWD` environment variables before spawning child processes.

```typescript
function buildChildProcessEnv(overrides = {}) {
  const filtered = Object.entries(process.env).filter(([key]) => {
    const k = key.toLowerCase()
    if (k.startsWith('npm_')) return false
    if (k === 'init_cwd') return false
    return true
  })
  return { ...Object.fromEntries(filtered), ...overrides }
}
```

**Rule:** Never pass `process.env` directly to child process spawn. Always filter package manager variables.

### 2. CDP Target Resolution: Browser vs Page Targets

**Problem:** Electron outputs `DevTools listening on ws://127.0.0.1:9222/devtools/browser/UUID`. This is a **browser-level** CDP target that does NOT support DOM-related commands (`DOM.enable`, `CSS.enable`, etc.). Connecting to it causes `'DOM.enable' wasn't found` errors.

**Solution:** Always resolve browser targets to page targets before connecting:
1. Extract host:port from browser URL
2. Fetch `http://{host}:{port}/json/list`
3. Find first target with `type === 'page'` (excluding `devtools://` URLs)
4. Use its `webSocketDebuggerUrl`

**Rule:** Never connect CDP directly to a `/devtools/browser/` URL. Always resolve to a page target first.

### 3. CDP Connection Retry for First Launch

**Problem:** On first launch, the target Electron app may not have its page target ready when the CDP URL is first discovered. `resolvePageTargetUrl` can time out and fall back to the browser URL, causing connection failure. Additionally, single-instance Electron apps may kill the first process and restart, invalidating the initial CDP URL.

**Solution:** `connectExternalInspector()` has retry logic (3 attempts with increasing delay: 1s, 2s). Each retry re-resolves the page target URL. Additionally, after process exit, re-probe the port for 8 seconds to catch process restarts.

**Rule:** CDP connections to freshly-launched apps must have retry logic. Page targets may not be available immediately.

### 4. Competitive CDP Discovery Strategy

**Problem:** Different Electron apps expose their CDP endpoint differently - some log it to stdout, some only open the port silently.

**Solution:** Race two strategies in parallel (`waitForCDPWithOutputRace`):
1. **Output parsing:** Regex match `DevTools listening on ws://...` from process stdout/stderr
2. **Port polling:** HTTP polling on `/json/list` every 300-500ms

First non-null result wins. This ensures fastest possible detection regardless of target app behavior.

### 5. Transport Adapter Pattern

**Problem:** Builtin mode uses Electron's `webContents.debugger` API (request-response style), while external mode uses WebSocket CDP. `InspectorService` needs to work with both.

**Solution:** Define `ICDPTransport` interface. Implement `CDPClient` (WebSocket) and `ElectronDebuggerTransport` (Electron debugger adapter). `InspectorService` only depends on `ICDPTransport`, making it transport-agnostic.

### 6. Window Management for External Mode

**Problem:** In external mode, the inspector should float alongside the target app without covering it entirely.

**Solution:** Auto-resize to sidebar preset (380px wide, always-on-top) when external mode connects. Save previous window bounds for restoration. CSS hides the canvas area and expands the properties panel to full width.

## Port Conventions

| Port | Purpose |
|------|---------|
| 15173 | Visual Inspector's own Vite dev server |
| 9222 | Default CDP remote debugging port for target Electron apps |
| 5173/5174 | Common Vite dev server ports for target web apps |

## Technology Stack

- **Runtime:** Electron 28.x (Chromium-based)
- **Frontend:** React 18 + TypeScript
- **Build:** Vite 5 + vite-plugin-electron
- **Package Manager:** pnpm (workspace monorepo)
- **Protocol:** Chrome DevTools Protocol (CDP) over WebSocket / Electron debugger API
- **Core Dependencies:** `ws` (WebSocket client for CDP)
