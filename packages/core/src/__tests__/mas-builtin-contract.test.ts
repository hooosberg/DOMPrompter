import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const coreRoot = resolve(__dirname, '..')

function readCoreFile(relativePath: string) {
  return readFileSync(resolve(coreRoot, relativePath), 'utf8')
}

describe('core builtin-only MAS contract', () => {
  it('index exports no longer expose CDPClient or discovery helpers', () => {
    const indexSource = readCoreFile('index.ts')

    expect(indexSource).not.toContain('CDPClient')
    expect(indexSource).not.toContain('discoverLocalApps')
    expect(indexSource).toContain("export type { ICDPTransport } from './cdp/connection'")
    expect(indexSource).toContain("export { InspectorService } from './inspector-service'")
  })

  it('connection transport keeps helper interfaces but removes websocket CDP client', () => {
    const connectionSource = readCoreFile('cdp/connection.ts')

    expect(connectionSource).not.toContain('export class CDPClient')
    expect(connectionSource).toContain('export interface ICDPTransport')
    expect(connectionSource).toContain('export class CDPHelper')
  })

  it('legacy discovery module is removed from the core package', () => {
    expect(existsSync(resolve(coreRoot, 'app-discovery.ts'))).toBe(false)
  })
})
