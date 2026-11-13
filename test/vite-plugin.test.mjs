import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import COS from 'cos-nodejs-sdk-v5'
import vitePluginWalleCOS from '../index.js'

async function createViteRootWithRollup(version) {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-vite-rollup-'))
  const viteDir = path.join(root, 'node_modules', 'vite')
  const rollupDir = path.join(root, 'node_modules', 'rollup')
  await mkdir(viteDir, { recursive: true })
  await mkdir(path.join(rollupDir, 'dist'), { recursive: true })
  await writeFile(path.join(viteDir, 'package.json'), JSON.stringify({ main: 'index.js' }))
  await writeFile(path.join(viteDir, 'index.js'), '')
  await writeFile(path.join(rollupDir, 'package.json'), JSON.stringify({ version, main: 'dist/rollup.js' }))
  await writeFile(path.join(rollupDir, 'dist', 'rollup.js'), '')
  return root
}

test('resolves relative build output from the Vite root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-vite-root-'))
  const outDir = path.join(root, 'dist')
  const logs = []
  const originalLog = console.log
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
    const closeBundle = plugin.closeBundle
    await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())

    assert.ok(logs.some(line => line.includes('asset.js')), 'relative outDir was not scanned from config.root')
  } finally {
    console.log = originalLog
    await rm(root, { recursive: true, force: true })
  }
})

async function withDistDir(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-vite-base-'))
  const outDir = path.join(root, 'dist')

  try {
    await mkdir(outDir)
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function runCloseBundle({ root, base, options = {}, build = { outDir: 'dist' } }) {
  const logs = []
  const originalLog = console.log
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    const plugin = vitePluginWalleCOS({
      bucket: 'test-1234567890',
      region: 'ap-beijing',
      test: true,
      ...options
    })
    plugin.configResolved({ root, base, build })
    const closeBundle = plugin.closeBundle
    await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())
  } finally {
    console.log = originalLog
  }

  return logs
}

test('uses only the path portion of a path-only Vite base as the object key prefix', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({ root, base: '/assets/?version=1#latest' })

    assert.ok(
      logs.some(line => line.includes('=> assets/asset.js')),
      'path-only base should prefix the object key without a domain, query, or fragment'
    )
  })
})

test('explicit ignore patterns replace defaults instead of merging with them', async () => {
  await withDistDir(async root => {
    await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html>')

    const patternLogs = await runCloseBundle({
      root,
      base: '/',
      options: { ignore: ['**/*.js'] }
    })
    const noIgnoreLogs = await runCloseBundle({ root, base: '/', options: { ignore: [] } })

    assert.ok(patternLogs.some(line => line.includes('index.html')))
    assert.ok(!patternLogs.some(line => line.includes('asset.js')))
    assert.ok(noIgnoreLogs.some(line => line.includes('index.html')))
    assert.ok(noIgnoreLogs.some(line => line.includes('asset.js')))
  })
})

test('decodes escaped base paths for COS keys and prints encoded access URLs', async () => {
  await withDistDir(async root => {
    const pathOnlyLogs = await runCloseBundle({ root, base: '/assets%20%E8%B5%84%E6%BA%90/?version=1#latest' })
    const urlLogs = await runCloseBundle({
      root,
      base: 'https://static.example.com/app%20%E8%B5%84%E6%BA%90/'
    })

    assert.ok(pathOnlyLogs.some(line => line.includes('=> assets 资源/asset.js')))
    assert.ok(urlLogs.some(line => line.includes('=> https://static.example.com/app%20%E8%B5%84%E6%BA%90/asset.js')))
  })
})

test('preserves escaped slashes in full URL access logs', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com/app%2Fv1/'
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/app%2Fv1/asset.js')))
  })
})

test('preserves escaped slashes in raw-key access logs', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com/app%2F',
      options: { UseRawKey: true }
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/app%2Fasset.js')))
  })
})

test('preserves repeated trailing slashes in base paths', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com/assets//'
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/assets//asset.js')))
  })
})

test('matches logged URLs to normalized COS keys when base paths start with repeated slashes', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com///assets/'
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/assets/asset.js')))
  })
})

test('joins assets after a percent-encoded trailing slash without an extra separator', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com/app%2F'
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/app%2Fasset.js')))
  })
})

test('preserves an explicit separator after a percent-encoded slash in the base', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({
      root,
      base: 'https://static.example.com/app%2F/'
    })

    assert.ok(logs.some(line => line.includes('=> https://static.example.com/app%2F/asset.js')))
  })
})

test('treats a relative base as an object key prefix without an access domain', async () => {
  await withDistDir(async root => {
    const cases = [
      ['correct-center', 'correct-center/asset.js'],
      ['release:v2/', 'release:v2/asset.js'],
      ['assets/', 'assets/asset.js'],
      ['./assets', 'assets/asset.js'],
      ['/assets/', 'assets/asset.js'],
      ['///assets/', 'assets/asset.js']
    ]

    for (const [base, expectedKey] of cases) {
      const logs = await runCloseBundle({ root, base })

      assert.ok(
        logs.some(line => line.includes(`=> ${expectedKey}`)),
        `base ${base} should prefix the object key without a domain`
      )
    }
  })
})

test('treats a protocol-relative base as https for access URLs', async () => {
  await withDistDir(async root => {
    const logs = await runCloseBundle({ root, base: '//cdn.example.com/app/' })

    assert.ok(logs.some(line => line.includes('=> https://cdn.example.com/app/asset.js')))
  })
})

test('maps //host bases to the same object keys as their https equivalents', async () => {
  await withDistDir(async root => {
    const originalUploadFile = COS.prototype.uploadFile
    const originalLog = console.log
    const keys = []
    COS.prototype.uploadFile = params => {
      keys.push(params.Key)
      return Promise.resolve()
    }
    console.log = () => {}

    try {
      const cases = [
        ['//cdn.example.com/app/', 'app/asset.js'],
        ['//cdn.example.com/app', 'app/asset.js'],
        ['//cdn.example.com/', 'asset.js'],
        ['//cdn.example.com', 'asset.js'],
        ['//a.com', 'asset.js'],
        ['///assets/', 'assets/asset.js']
      ]

      for (const [base, expectedKey] of cases) {
        keys.length = 0
        const plugin = vitePluginWalleCOS({
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          SecretId: 'test-id',
          SecretKey: 'test-key'
        })
        plugin.configResolved({ root, base, build: { outDir: 'dist' } })
        const closeBundle = plugin.closeBundle
        await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())

        assert.deepEqual(keys, [expectedKey], `base ${base} should map to ${expectedKey}`)
      }
    } finally {
      COS.prototype.uploadFile = originalUploadFile
      console.log = originalLog
    }
  })
})

test('prints the COS returned location with a protocol when it has none', async () => {
  await withDistDir(async root => {
    const originalUploadFile = COS.prototype.uploadFile
    const originalLog = console.log
    const cases = [
      // COS SDK 的 Location 有时不带协议，统一补成可访问的 URL
      ['test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js', 'https://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js'],
      ['//test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js', 'https://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js'],
      // 已经带协议的保持原样，不能变成 https://https://...
      ['https://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js', 'https://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js'],
      ['http://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js', 'http://test-1234567890.cos.ap-beijing.myqcloud.com/app/asset.js']
    ]

    try {
      for (const [location, expected] of cases) {
        const logs = []
        COS.prototype.uploadFile = () => Promise.resolve({ Location: location })
        console.log = (...args) => logs.push(args.map(String).join(' '))

        const plugin = vitePluginWalleCOS({
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          SecretId: 'test-id',
          SecretKey: 'test-key'
        })
        plugin.configResolved({ root, base: 'https://static.example.com/app/', build: { outDir: 'dist' } })
        const closeBundle = plugin.closeBundle
        await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())

        assert.ok(
          logs.some(line => line.includes(`cos location: ${expected}`)),
          `Location ${location} should be logged as ${expected}`
        )
      }
    } finally {
      COS.prototype.uploadFile = originalUploadFile
      console.log = originalLog
    }
  })
})

test('keeps the upload log unchanged when the SDK returns no location', async () => {
  await withDistDir(async root => {
    const originalUploadFile = COS.prototype.uploadFile
    const originalLog = console.log
    const logs = []
    COS.prototype.uploadFile = () => Promise.resolve()
    console.log = (...args) => logs.push(args.map(String).join(' '))

    try {
      const plugin = vitePluginWalleCOS({
        bucket: 'test-1234567890',
        region: 'ap-beijing',
        SecretId: 'test-id',
        SecretKey: 'test-key'
      })
      plugin.configResolved({ root, base: 'https://static.example.com/app/', build: { outDir: 'dist' } })
      const closeBundle = plugin.closeBundle
      await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())

      assert.equal(logs.some(line => line.includes('cos location:')), false)
      assert.ok(logs.some(line => line.includes('upload complete:') && line.includes('asset.js')))
    } finally {
      COS.prototype.uploadFile = originalUploadFile
      console.log = originalLog
    }
  })
})

test('rejects empty, malformed, and non-http(s) bases', async () => {
  await withDistDir(async root => {
    await assert.rejects(runCloseBundle({ root, base: '' }), /base\/publicPath is required/)
    await assert.rejects(runCloseBundle({ root, base: '   ' }), /base\/publicPath is required/)
    await assert.rejects(runCloseBundle({ root, base: '/assets%ZZ/' }), /invalid percent encoding/)
    await assert.rejects(runCloseBundle({ root, base: 'https://' }), /not a valid URL/)
    await assert.rejects(runCloseBundle({ root, base: 'ftp://static.example.com/app/' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'file:///tmp/dist/' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'mailto:dev@example.com' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'https:static.example.com/app/' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'file:/tmp/dist/' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'data:text/html,assets' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 'javascript:void/assets' }), /must be an http\(s\) URL:/)
    await assert.rejects(runCloseBundle({ root, base: 42 }), /base\/publicPath must be a string/)
  })
})

test('skips stale disk output when Vite build.write is false', async () => {
  await withDistDir(async root => {
    const warnings = []
    const originalWarn = console.warn
    console.warn = (...args) => warnings.push(args.map(String).join(' '))

    try {
      const logs = await runCloseBundle({
        root,
        base: '/',
        build: { outDir: 'dist', write: false }
      })

      assert.deepEqual(logs, [])
      const writeFalseWarnings = warnings.filter(line => line.includes('build.write is false'))
      assert.equal(writeFalseWarnings.length, 1)
    } finally {
      console.warn = originalWarn
    }
  })
})

test('skips Vite watch builds and reports the skip only once across rebuilds', async () => {
  await withDistDir(async root => {
    const logs = []
    const warnings = []
    const originalLog = console.log
    const originalWarn = console.warn
    console.log = (...args) => logs.push(args.map(String).join(' '))
    console.warn = (...args) => warnings.push(args.map(String).join(' '))

    try {
      // Vite 2 - 5 resolve `--watch` to `true`; Vite 6 and newer resolve it to an options object.
      for (const watch of [true, {}]) {
        logs.length = 0
        warnings.length = 0
        const plugin = vitePluginWalleCOS({
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          test: true
        })
        plugin.configResolved({ root, base: '/', build: { outDir: 'dist', watch } })

        for (let rebuild = 0; rebuild < 2; rebuild++) {
          const closeBundle = plugin.closeBundle
          await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())
        }

        assert.deepEqual(logs, [], `build.watch ${JSON.stringify(watch)} must not trigger an upload`)
        const skipWarnings = warnings.filter(line => line.includes('watch mode builds are not uploaded'))
        assert.equal(skipWarnings.length, 1, 'the skip reason should be reported once, not once per rebuild')
      }
    } finally {
      console.log = originalLog
      console.warn = originalWarn
    }
  })
})

test('uploads when build.watch is absent or null', async () => {
  await withDistDir(async root => {
    for (const build of [{ outDir: 'dist' }, { outDir: 'dist', watch: null }]) {
      const logs = await runCloseBundle({ root, base: '/', build })

      assert.ok(logs.some(line => line.includes('asset.js')), `build ${JSON.stringify(build)} should still upload`)
    }
  })
})

test('uses sequential closeBundle hooks with Rollup 3 and newer', async () => {
  const root = await createViteRootWithRollup('3.0.0')
  const plugin = vitePluginWalleCOS()

  try {
    plugin.configResolved({ root, base: '/', build: { outDir: 'dist' } })
    assert.equal(typeof plugin.closeBundle, 'object')
    assert.equal(plugin.closeBundle.order, 'post')
    assert.equal(plugin.closeBundle.sequential, true)
    assert.equal(typeof plugin.closeBundle.handler, 'function')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports a missing Rollup installation once per project root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'walle-vite-no-rollup-'))
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.map(String).join(' '))

  try {
    const plugin = vitePluginWalleCOS()
    plugin.configResolved({ root, base: '/', build: { outDir: 'dist' } })
    plugin.configResolved({ root, base: '/', build: { outDir: 'dist' } })

    assert.equal(warnings.filter(line => line.includes('could not detect Rollup')).length, 1)
  } finally {
    console.warn = originalWarn
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps a function closeBundle hook for Rollup 2 compatibility', async () => {
  const root = await createViteRootWithRollup('2.77.3')
  const plugin = vitePluginWalleCOS()

  try {
    plugin.configResolved({ root, base: '/', build: { outDir: 'dist' } })
    assert.equal(typeof plugin.closeBundle, 'function')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
