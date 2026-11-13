'use strict'

const assert = require('node:assert/strict')
const { mkdtemp, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')
const WebpackPluginWalleCOS = require('../webpack.cjs')

async function runAfterEmit({
  outDir,
  mode = 'production',
  watchMode = false,
  assets = {},
  getAssets,
  publicPath = 'https://static.example.com/app/',
  omitPublicPath = false,
  pluginOptions = {}
}) {
  let afterEmit
  const compiler = {
    options: { mode, output: {} },
    watchMode,
    hooks: {
      afterEmit: {
        tapPromise(_name, handler) {
          afterEmit = handler
        }
      }
    }
  }
  const plugin = new WebpackPluginWalleCOS({
    bucket: 'test-1234567890',
    region: 'ap-beijing',
    test: true,
    ...pluginOptions
  })
  const logs = []
  const originalLog = console.log
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    plugin.apply(compiler)
    const outputOptions = { path: outDir }
    if (!omitPublicPath) {
      outputOptions.publicPath = publicPath
    }
    await afterEmit({ assets, outputOptions, ...(getAssets ? { getAssets } : {}) })
  } finally {
    console.log = originalLog
  }

  return logs
}

function uploadLines(logs) {
  return logs.filter(line => line.includes('test upload path:'))
}

function skipLines(logs) {
  return logs.filter(line => line.includes('skipping COS upload'))
}

async function withOutputDir(run) {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-webpack-plugin-'))

  try {
    await run(outDir)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

test('uploads development compilations but still skips watch compilations', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'dev.js'), 'dev')

    const developmentLogs = await runAfterEmit({
      outDir,
      mode: 'development',
      assets: { 'dev.js': {} }
    })
    const watchLogs = await runAfterEmit({
      outDir,
      watchMode: true,
      assets: { 'watch.js': {} }
    })

    assert.equal(uploadLines(developmentLogs).length, 1)
    assert.match(uploadLines(developmentLogs)[0], /dev\.js/)
    assert.deepEqual(skipLines(developmentLogs), [])

    assert.deepEqual(uploadLines(watchLogs), [])
    assert.equal(skipLines(watchLogs).length, 1)
    assert.match(skipLines(watchLogs)[0], /watch mode/)
  })
})

test('registers no upload hook when enabled is false', async () => {
  const registered = []
  const plugin = new WebpackPluginWalleCOS({
    bucket: 'test-1234567890',
    region: 'ap-beijing',
    enabled: false
  })

  plugin.apply({
    options: { mode: 'production', output: {} },
    hooks: {
      afterEmit: {
        tapPromise: () => registered.push('tapPromise'),
        tapAsync: () => registered.push('tapAsync')
      }
    }
  })

  assert.deepEqual(registered, [])
})

test('uploads when the compilation is not a development build', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'none.js'), 'none')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      mode: 'none',
      assets: { 'none.js': {} }
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /none\.js/)
  })
})

test('uses the root key prefix when Webpack publicPath is auto, empty, or missing', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'app.js'), 'app')

    for (const options of [{ publicPath: 'auto' }, { publicPath: '' }, { omitPublicPath: true }]) {
      const uploads = uploadLines(await runAfterEmit({
        outDir,
        assets: { 'app.js': {} },
        ...options
      }))

      assert.equal(uploads.length, 1)
      assert.match(uploads[0], /=> app\.js$/)
    }
  })
})

test('accepts a path-only publicPath as the object key prefix', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'app.js'), 'app')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      assets: { 'app.js': {} },
      publicPath: '/static/app/'
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /=> static\/app\/app\.js$/)
  })
})

test('preserves an explicit empty plugin base instead of falling back to publicPath', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'app.js'), 'app')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      assets: { 'app.js': {} },
      publicPath: 'https://cdn.example.com/ignored/',
      pluginOptions: { base: '' }
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /=> app\.js$/)
  })
})

test('uploads only assets from the current compilation', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'current.js'), 'current')
    await writeFile(path.join(outDir, 'stale.js'), 'stale')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      assets: { 'current.js': {} }
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /current\.js/)
    assert.ok(!uploads.some(line => line.includes('stale.js')))
  })
})

test('prefers compilation.getAssets when the Webpack 5 API is available', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'current.js'), 'current')
    await writeFile(path.join(outDir, 'stale.js'), 'stale')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      assets: { 'stale.js': {} },
      getAssets: () => [{ name: 'current.js' }]
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /current\.js/)
    assert.ok(!uploads.some(line => line.includes('stale.js')))
  })
})

test('skips COS client initialization for an empty Webpack compilation', async () => {
  await withOutputDir(async outDir => {
    const logs = await runAfterEmit({
      outDir,
      getAssets: () => [],
      pluginOptions: { test: false }
    })

    assert.deepEqual(uploadLines(logs), [])
    assert.ok(!logs.some(line => /upload start|upload complete/.test(line)))
  })
})

test('ignores selected HTML assets without reporting them as missing', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'index.html'), '<!doctype html>')
    await writeFile(path.join(outDir, 'app.js'), 'app')

    const uploads = uploadLines(await runAfterEmit({
      outDir,
      assets: { 'index.html': {}, 'app.js': {} }
    }))

    assert.equal(uploads.length, 1)
    assert.match(uploads[0], /app\.js/)
  })
})

test('fails when Webpack assets are missing from the configured output directory', async () => {
  await withOutputDir(async outDir => {
    await writeFile(path.join(outDir, 'stale.js'), 'stale')

    await assert.rejects(
      runAfterEmit({
        outDir,
        assets: { 'missing.js': {} }
      }),
      /selected upload files were not found/
    )
  })
})
