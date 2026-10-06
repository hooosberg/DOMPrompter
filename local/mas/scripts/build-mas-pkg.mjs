#!/usr/bin/env node
// Build the MAS .pkg from the signed .app using productbuild.
// electron-builder cannot auto-select the installer cert when multiple
// "3rd Party Mac Developer Installer" certs exist in the keychain.

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const appDir = path.join(repoRoot, 'packages', 'app')
const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'))
const productName = pkg.build?.productName || pkg.productName
const version = pkg.version
const distDir = path.join(repoRoot, 'release', 'mas-arm64')
const appPath = path.join(distDir, `${productName}.app`)
const pkgPath = path.join(distDir, `${productName}-${version}-arm64.pkg`)

// Use the same installer cert WitNote uses
const INSTALLER_CERT = 'C5EE5BE0EC389E19AC9A5C33EC4FAF00FE9BE8FE'

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } })
}

rmSync(pkgPath, { force: true })
run('productbuild', ['--component', appPath, '/Applications', '--sign', INSTALLER_CERT, pkgPath])
run('pkgutil', ['--check-signature', pkgPath])

// Remove loose .app to prevent Launch Services conflict with TestFlight
rmSync(appPath, { recursive: true, force: true })

console.log(`\nMAS pkg ready: ${pkgPath}`)
