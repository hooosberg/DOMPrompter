#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const appDir = path.join(repoRoot, 'packages', 'app')
const appPackage = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'))
const productName = appPackage.build?.productName || appPackage.productName
const version = appPackage.version
const distDir = path.join(repoRoot, 'release', 'mas-arm64')
const appPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(distDir, `${productName}.app`)
const pkgPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(distDir, `${productName}-${version}-arm64.pkg`)
const mainEntitlements = path.join(appDir, 'build', 'entitlements.mas.plist')
const childEntitlements = path.join(appDir, 'build', 'entitlements.mas.inherit.plist')
const provisioningProfile = path.join(appDir, 'build', 'embedded.provisionprofile')

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`)
  return execFileSync(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  }).trim()
}

function runStreaming(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  })
}

function ensureFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`)
  }
}

function parseIdentityList(output, label) {
  return output
    .split('\n')
    .map((line) => line.match(/^\s*\d+\)\s+([0-9A-F]{40})\s+"([^"]+)"$/))
    .filter(Boolean)
    .map(([, sha1, name]) => ({ sha1, name }))
    .filter((entry) => entry.name.startsWith(label))
}

function parseCertificateBlocks(output) {
  const blocks = []
  let current = null

  for (const line of output.split('\n')) {
    const sha256Match = line.match(/^SHA-256 hash:\s+([0-9A-F]+)$/)
    if (sha256Match) {
      if (current) blocks.push(current)
      current = { sha256: sha256Match[1] }
      continue
    }
    if (!current) continue

    const sha1Match = line.match(/^SHA-1 hash:\s+([0-9A-F]+)$/)
    if (sha1Match) {
      current.sha1 = sha1Match[1]
      continue
    }

    const hpkyMatch = line.match(/"hpky"<blob>=0x([0-9A-F]+)/)
    if (hpkyMatch) {
      current.hpky = hpkyMatch[1]
      continue
    }

    const labelMatch = line.match(/"labl"<blob>="(.+)"/)
    if (labelMatch) {
      current.label = labelMatch[1]
    }
  }

  if (current) blocks.push(current)
  return blocks
}

function getAppIdentity() {
  const override = process.env.MAS_APP_CERT_SHA1?.trim()
  if (override) return { sha1: override, name: 'override' }

  const output = run('security', ['find-identity', '-v', '-p', 'codesigning'])
  const identities = parseIdentityList(output, '3rd Party Mac Developer Application:')
  if (identities.length === 0) {
    throw new Error('No 3rd Party Mac Developer Application identity found.')
  }
  return identities[0]
}

function getCertificateBlocks(commonName) {
  const output = run('security', [
    'find-certificate',
    '-a',
    '-Z',
    '-c',
    commonName,
    path.join(process.env.HOME || '', 'Library', 'Keychains', 'login.keychain-db'),
  ])
  return parseCertificateBlocks(output)
}

function getInstallerIdentity(appIdentity) {
  const override = process.env.MAS_INSTALLER_CERT_SHA1?.trim()
  if (override) return override

  const installerLabel = appIdentity.name.replace('Application:', 'Installer:')
  const installerBlocks = getCertificateBlocks(installerLabel)
  if (installerBlocks.length === 0) {
    throw new Error(`No installer certificates found for ${installerLabel}.`)
  }
  if (installerBlocks.length === 1) {
    return installerBlocks[0].sha1
  }

  const appBlocks = getCertificateBlocks(appIdentity.name)
  const appHpky = appBlocks[0]?.hpky
  if (appHpky) {
    const paired = installerBlocks.filter((block) => block.hpky === appHpky)
    if (paired.length === 1) {
      return paired[0].sha1
    }
  }

  throw new Error(
    [
      `Multiple installer certificates matched ${installerLabel}.`,
      'Set MAS_INSTALLER_CERT_SHA1 to the correct SHA-1 hash before running the build.',
    ].join(' '),
  )
}

function sign(target, identity, entitlements) {
  runStreaming('/usr/bin/codesign', ['--force', '--sign', identity, '--entitlements', entitlements, target])
}

function embedProvisioningProfile() {
  ensureFile(provisioningProfile, 'Provisioning profile')
  const dest = path.join(appPath, 'Contents', 'embedded.provisionprofile')
  copyFileSync(provisioningProfile, dest)
  console.log(`Embedded provisioning profile -> ${dest}`)
}

function repairApp(identity) {
  embedProvisioningProfile()
  const frameworkRoot = path.join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework')
  const frameworkVersionRoot = path.join(frameworkRoot, 'Versions', 'A')
  const dylibs = [
    'libEGL.dylib',
    'libGLESv2.dylib',
    'libffmpeg.dylib',
    'libvk_swiftshader.dylib',
  ].map((name) => path.join(frameworkVersionRoot, 'Libraries', name))

  const nestedApps = [
    path.join(appPath, 'Contents', 'Library', 'LoginItems', `${productName} Login Helper.app`),
    path.join(appPath, 'Contents', 'Frameworks', `${productName} Helper.app`),
    path.join(appPath, 'Contents', 'Frameworks', `${productName} Helper (GPU).app`),
    path.join(appPath, 'Contents', 'Frameworks', `${productName} Helper (Plugin).app`),
    path.join(appPath, 'Contents', 'Frameworks', `${productName} Helper (Renderer).app`),
  ]

  for (const dylib of dylibs) {
    ensureFile(dylib, 'Nested dylib')
    sign(dylib, identity, childEntitlements)
  }

  sign(path.join(frameworkVersionRoot, 'Electron Framework'), identity, childEntitlements)
  sign(frameworkRoot, identity, childEntitlements)

  for (const nestedApp of nestedApps) {
    ensureFile(nestedApp, 'Nested app')
    sign(nestedApp, identity, childEntitlements)
  }

  sign(appPath, identity, mainEntitlements)
  runStreaming('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
}

function stripResourceForks() {
  // Remove ALL extended attributes from the app bundle so productbuild
  // does not serialize them as AppleDouble (._*) entries in the pkg.
  console.log('Stripping extended attributes from app bundle...')
  runStreaming('find', [appPath, '-name', '._*', '-delete'])
  // -cr clears known attrs; follow up with a brute-force pass
  runStreaming('xattr', ['-cr', appPath])
  // Remove every xattr from every file recursively
  run('find', [appPath, '-exec', 'xattr', '-c', '{}', '+'])
}

function rebuildPkg(identity) {
  rmSync(pkgPath, { force: true })
  stripResourceForks()
  // COPYFILE_DISABLE=1 prevents productbuild/ditto from packing macOS
  // resource forks (._* files) into the pkg payload.
  runStreaming('productbuild', ['--component', appPath, '/Applications', '--sign', identity, pkgPath], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  runStreaming('pkgutil', ['--check-signature', pkgPath])
}

function main() {
  ensureFile(appPath, 'MAS app')
  ensureFile(mainEntitlements, 'Main entitlements')
  ensureFile(childEntitlements, 'Child entitlements')

  const appIdentity = getAppIdentity()
  const installerIdentity = getInstallerIdentity(appIdentity)

  console.log(`Using app certificate: ${appIdentity.sha1} (${appIdentity.name})`)
  console.log(`Using installer certificate: ${installerIdentity}`)

  repairApp(appIdentity.sha1)
  rebuildPkg(installerIdentity)

  // Fix ownership so future `rm -rf release/` works without sudo
  try {
    const uid = process.getuid()
    const gid = process.getgid()
    runStreaming('chown', ['-R', `${uid}:${gid}`, distDir])
  } catch {
    console.warn('Warning: could not chown release directory — may need sudo to clean up')
  }

  // Remove the .app from the output directory so macOS Launch Services
  // does not register it as an installed copy.  When the .app sits next
  // to the .pkg, TestFlight may launch this unsigned/un-sandboxed copy
  // instead of the properly installed one, causing an instant crash.
  rmSync(appPath, { recursive: true, force: true })
  console.log(`Removed loose .app to prevent Launch Services conflict.`)

  console.log(`MAS repair complete:`)
  console.log(`- pkg: ${pkgPath}`)
}

main()
