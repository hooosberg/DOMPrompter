export interface DiscoveredApp {
  type: 'web' | 'electron'
  name: string
  url: string
  cdpUrl?: string
  port: number
}

export async function discoverLocalApps(): Promise<DiscoveredApp[]> {
  const apps: DiscoveredApp[] = []
  const pickInspectablePageTarget = (targets: any[]): string | null => {
    const pageTarget = targets.find((target) => {
      if (target.type !== 'page') return false
      if (!target.webSocketDebuggerUrl) return false
      const targetUrl = String(target.url || '')
      return !targetUrl.startsWith('devtools://')
    })

    return pageTarget?.webSocketDebuggerUrl || null
  }

  // Common development server ports
  const ports = [3000, 3001, 4173, 4200, 5173, 5174, 5175, 5176, 8080, 8081, 9222, 9223, 9229]

  for (const port of ports) {
    try {
      // Check if HTTP server is running
      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(1000)
      })

      if (response.ok) {
        apps.push({
          type: 'web',
          name: `localhost:${port}`,
          url: `http://localhost:${port}`,
          port
        })
      }
    } catch (error) {
      // Port not available or timeout
    }

    // Check for CDP endpoints
    try {
      let browserInfo: any = null

      try {
        const cdpResponse = await fetch(`http://localhost:${port}/json/version`, {
          signal: AbortSignal.timeout(1000)
        })

        if (cdpResponse.ok) {
          browserInfo = await cdpResponse.json() as any
        }
      } catch {
        browserInfo = null
      }

      const listResponse = await fetch(`http://localhost:${port}/json/list`, {
        signal: AbortSignal.timeout(1000)
      })

      if (listResponse.ok) {
        const targets = await listResponse.json() as any[]
        const wsUrl = pickInspectablePageTarget(targets)

        if (wsUrl) {
          const firstTarget = targets.find((target) => target.webSocketDebuggerUrl === wsUrl)
          apps.push({
            type: browserInfo?.['User-Agent']?.includes('Electron') ? 'electron' : 'web',
            name: firstTarget?.title || browserInfo?.['Browser'] || `localhost:${port}`,
            url: `http://localhost:${port}`,
            cdpUrl: wsUrl,
            port
          })
          continue
        }
      }

      if (browserInfo?.webSocketDebuggerUrl) {
        apps.push({
          type: browserInfo['User-Agent']?.includes('Electron') ? 'electron' : 'web',
          name: browserInfo['Browser'] || `localhost:${port}`,
          url: `http://localhost:${port}`,
          cdpUrl: browserInfo.webSocketDebuggerUrl,
          port
        })
      }
    } catch (error) {
      // CDP not available
    }
  }

  // 去重：同一端口如果同时有纯 web 和 CDP 条目，优先保留 CDP 条目
  const deduped = new Map<number, DiscoveredApp>()
  for (const app of apps) {
    const existing = deduped.get(app.port)
    if (!existing || (app.cdpUrl && !existing.cdpUrl)) {
      deduped.set(app.port, app)
    }
  }

  return Array.from(deduped.values())
}
