'use strict'

const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { createRequire } = require('node:module')
const path = require('node:path')
const test = require('node:test')
const requireFromPackage = createRequire(path.resolve(__dirname, '../package.json'))
const vitePluginWalleCOS = requireFromPackage('vite-plugin-walle-cos')
const WebpackPluginWalleCOS = requireFromPackage('vite-plugin-walle-cos/webpack')

test('CommonJS Vite entry exposes its declared helper API', () => {
  assert.equal(typeof vitePluginWalleCOS, 'function')
  assert.equal(typeof vitePluginWalleCOS.requestTemporaryCredentials, 'function')
  assert.equal(typeof vitePluginWalleCOS.createTemporaryCredentialProvider, 'function')
  assert.equal(typeof vitePluginWalleCOS.uploadToCOS, 'function')
})

test('CommonJS Vite plugin uses the shared ESM build lifecycle', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-cjs-vite-'))
  const outDir = path.join(root, 'dist')
  const originalLog = console.log
  const logs = []
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    await mkdir(outDir)
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    const plugin = vitePluginWalleCOS({
      bucket: 'test-1234567890',
      region: 'ap-beijing',
      test: true
    })
    plugin.configResolved({
      root,
      base: 'https://static.example.com/app/',
      build: { outDir: 'dist' }
    })

    await plugin.closeBundle()

    assert.ok(logs.some(line => line.includes('asset.js')))
  } finally {
    console.log = originalLog
    await rm(root, { recursive: true, force: true })
  }
})

test('CommonJS Vite watch build reports its skip only once across rebuilds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-cjs-vite-watch-'))
  const outDir = path.join(root, 'dist')
  const originalLog = console.log
  const originalWarn = console.warn
  const logs = []
  const warnings = []
  console.log = (...args) => logs.push(args.map(String).join(' '))
  console.warn = (...args) => warnings.push(args.map(String).join(' '))

  try {
    await mkdir(outDir)
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    const plugin = vitePluginWalleCOS({
      bucket: 'test-1234567890',
      region: 'ap-beijing',
      test: true
    })
    plugin.configResolved({
      root,
      base: 'https://static.example.com/app/',
      build: { outDir: 'dist', watch: true }
    })

    await plugin.closeBundle()
    await plugin.closeBundle()

    assert.equal(
      warnings.filter(line => line.includes('watch mode builds are not uploaded')).length,
      1,
      'watch skip warning should only be reported once across rebuilds'
    )
    assert.equal(logs.some(line => line.includes('asset.js')), false, 'watch builds must not upload assets')
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    await rm(root, { recursive: true, force: true })
  }
})

test('CommonJS Vite entry uses sequential closeBundle hooks with Rollup 3+', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-cjs-rollup-'))
  const viteDir = path.join(root, 'node_modules', 'vite')
  const rollupDir = path.join(root, 'node_modules', 'rollup')

  try {
    await mkdir(viteDir, { recursive: true })
    await mkdir(path.join(rollupDir, 'dist'), { recursive: true })
    await writeFile(path.join(viteDir, 'package.json'), JSON.stringify({ main: 'index.js' }))
    await writeFile(path.join(viteDir, 'index.js'), '')
    await writeFile(path.join(rollupDir, 'package.json'), JSON.stringify({ version: '3.0.0', main: 'dist/rollup.js' }))
    await writeFile(path.join(rollupDir, 'dist', 'rollup.js'), '')

    const plugin = vitePluginWalleCOS()
    plugin.configResolved({ root, base: '/', build: { outDir: 'dist' } })

    assert.equal(typeof plugin.closeBundle, 'object')
    assert.equal(plugin.closeBundle.order, 'post')
    assert.equal(plugin.closeBundle.sequential, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CommonJS Webpack entry exposes the plugin constructor', () => {
  assert.equal(typeof WebpackPluginWalleCOS, 'function')
  assert.equal(WebpackPluginWalleCOS.WebpackPluginWalleCOS, WebpackPluginWalleCOS)
})

test('ESM package entries expose their plugin defaults and named helpers', async () => {
  const viteModule = await import('vite-plugin-walle-cos')
  const webpackModule = await import('vite-plugin-walle-cos/webpack')

  assert.equal(typeof viteModule.default, 'function')
  assert.equal(typeof viteModule.requestTemporaryCredentials, 'function')
  assert.equal(typeof webpackModule.default, 'function')
})
